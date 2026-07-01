use crate::models::{JobDefinition, JobRun};
use crate::runner;
use crate::runner::RunnerRequest;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub async fn scheduler_tick(
    db_path: PathBuf,
    process_registry: Arc<Mutex<HashMap<String, u32>>>,
    app_handle: tauri::AppHandle,
) {
    // Reconcile stale "running" states: verify PID is still alive
    if let Err(e) = reconcile_running_states(&db_path) {
        eprintln!("[scheduler] Error reconciling running states: {e}");
    }

    let jobs = match crate::jobs::repository::list_enabled_jobs(&db_path) {
        Ok(j) => j,
        Err(_) => return,
    };

    for job in jobs {
        if let Err(e) = process_job(&db_path, &job, &process_registry, &app_handle).await {
            eprintln!("[scheduler] Error processing job {}: {e}", job.id);
        }
    }
}

fn reconcile_running_states(db_path: &PathBuf) -> Result<(), String> {
    let running_states = crate::jobs::repository::get_all_running_profile_states(db_path)?;

    for state in running_states {
        let run_id = match &state.current_run_id {
            Some(rid) => rid.clone(),
            None => {
                // No run_id, shouldn't be "running" - fix it
                let _ = crate::jobs::repository::update_job_profile_state(
                    db_path,
                    &state.id,
                    state.run_count,
                    state.success_count,
                    state.failed_count,
                    "pending",
                    state.next_run_at.as_deref(),
                    &state.last_run_at.clone().unwrap_or_default(),
                    None,
                );
                continue;
            }
        };

        // Look up PID from job_runs
        let pid = crate::jobs::repository::get_job_run_pid(db_path, &run_id)?;

        let alive = match pid {
            Some(p) => crate::runner::is_process_alive(p),
            None => false, // No PID stored = process never ran or fake runner
        };

        if !alive {
            let now = crate::models::now_iso();
            // Mark run as failed
            let _ = crate::jobs::repository::update_job_run(
                db_path,
                &run_id,
                "failed",
                &now,
                None,
                Some("Process no longer alive"),
            );
            // Reset profile state to pending
            let _ = crate::jobs::repository::update_job_profile_state(
                db_path,
                &state.id,
                state.run_count,
                state.success_count,
                state.failed_count,
                "pending",
                state.next_run_at.as_deref(),
                &state.last_run_at.clone().unwrap_or_default(),
                None,
            );
            eprintln!(
                "[scheduler] Reconciled stale running state {} (run={}, pid={:?})",
                state.id, run_id, pid
            );
        }
    }

    Ok(())
}

async fn process_job(
    db_path: &PathBuf,
    job: &JobDefinition,
    process_registry: &Arc<Mutex<HashMap<String, u32>>>,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let profile_ids: Vec<String> = serde_json::from_str(&job.profile_ids_json)
        .map_err(|e| format!("Invalid profile_ids_json: {e}"))?;

    let schedule = if job.schedule_json.trim().is_empty() {
        return Ok(());
    } else {
        crate::models::ScheduleConfig::parse(&job.schedule_json)?
    };

    let random_cfg = if job.random_json.trim().is_empty() {
        crate::models::RandomConfig {
            min_gap_minutes: 5.0,
            max_delay_factor: 1.5,
        }
    } else {
        crate::models::RandomConfig::parse(&job.random_json)?
    };

    let today = crate::models::today_iso();
    let now = chrono::Local::now().naive_local();
    let day_of_week = chrono::Local::now().format("%u").to_string().parse::<u32>().unwrap_or(1);

    if !schedule.is_active_day(day_of_week) {
        return Ok(());
    }

    let _window_start = schedule.window_start_today().ok_or("Invalid schedule start_time")?;
    let window_end = schedule.window_end_today().ok_or("Invalid schedule end_time")?;

    for profile_id in &profile_ids {
        // Get or create state for this profile today
        let state = crate::jobs::repository::upsert_job_profile_state(
            db_path,
            &job.id,
            profile_id,
            &today,
            schedule.posts_per_profile,
        )?;

        // Check if done
        if state.status == "done" || state.status == "expired" {
            continue;
        }

        // Check if currently running
        if state.status == "running" && state.current_run_id.is_some() {
            continue;
        }

        // Check if enough posts
        if state.run_count >= schedule.posts_per_profile {
            crate::jobs::repository::update_job_profile_state(
                db_path,
                &state.id,
                state.run_count,
                state.success_count,
                state.failed_count,
                "done",
                state.next_run_at.as_deref(),
                &state.last_run_at.clone().unwrap_or_default(),
                None,
            )?;
            continue;
        }

        // Check if window expired
        if now >= window_end {
            crate::jobs::repository::update_job_profile_state(
                db_path,
                &state.id,
                state.run_count,
                state.success_count,
                state.failed_count,
                "expired",
                state.next_run_at.as_deref(),
                &state.last_run_at.clone().unwrap_or_default(),
                None,
            )?;
            continue;
        }

        // Compute next_run_at if not set
        let next_run = if let Some(ref nr) = state.next_run_at {
            chrono::NaiveDateTime::parse_from_str(nr, "%Y-%m-%dT%H:%M:%S").ok()
        } else {
            let nr = crate::models::compute_next_run(
                schedule.posts_per_profile,
                state.run_count,
                now,
                window_end,
                &random_cfg,
            );
            if let Some(nr) = &nr {
                crate::jobs::repository::update_job_profile_state(
                    db_path,
                    &state.id,
                    state.run_count,
                    state.success_count,
                    state.failed_count,
                    "pending",
                    Some(&nr.format("%Y-%m-%dT%H:%M:%S").to_string()),
                    &state.last_run_at.clone().unwrap_or_default(),
                    None,
                )?;
            }
            nr
        };

        let next_run = match next_run {
            Some(nr) => nr,
            None => continue,
        };

        // Check if it's time to run
        if now < next_run {
            continue;
        }

        // Create a fake run
        let run_id = crate::models::new_id();
        let now_str = crate::models::now_iso();
        let script_path = job.script_path_for_run(db_path).unwrap_or_default();
        let log_path = crate::run_logs::prepare_log_path(&script_path, &profile_id, &run_id, &now_str)?;
        let (profile_name, group_name) = crate::db::open_db(db_path)
            .ok()
            .and_then(|conn| crate::db::get_cached_profile(&conn, profile_id, "donut").ok().flatten())
            .unwrap_or_else(|| (profile_id.clone(), None));

        let run = JobRun {
            id: run_id.clone(),
            job_id: Some(job.id.clone()),
            profile_id: profile_id.clone(),
            script_id: job.script_id.clone(),
            status: "running".to_string(),
            started_at: now_str.clone(),
            finished_at: None,
            exit_code: None,
            pid: None,
            log_path: Some(log_path.clone()),
            error_message: None,
            profile_name,
            group_name,
            created_at: now_str.clone(),
        };

        crate::jobs::repository::insert_job_run(db_path, &run)?;

        // Update state to running
        crate::jobs::repository::update_job_profile_state(
            db_path,
            &state.id,
            state.run_count,
            state.success_count,
            state.failed_count,
            "running",
            Some(&next_run.format("%Y-%m-%dT%H:%M:%S").to_string()),
            &now_str,
            Some(&run_id),
        )?;

        // Run execution asynchronously
        let db_path_clone = db_path.clone();
        let state_id = state.id.clone();
        let run_id_clone = run_id.clone();
        let current_run_count = state.run_count;
        let current_success_count = state.success_count;
        let target = schedule.posts_per_profile;

        let script_path = job.script_path_for_run(&db_path_clone).unwrap_or_default();
        let job_cli_args = job.cli_args.clone();
        let job_schedule_json = job.schedule_json.clone();
        let job_random_json = job.random_json.clone();

        // Read runtime settings
        let (runtime_path, default_api_url) = {
            if let Ok(conn) = crate::db::open_db(&db_path_clone) {
                let rt = crate::db::get_setting(&conn, "runtime_path").unwrap_or_default();
                let api = crate::db::get_setting(&conn, "donutbrowser_api_base_url")
                    .unwrap_or_else(|_| "http://127.0.0.1:10108".to_string());
                (rt, api)
            } else {
                (String::new(), "http://127.0.0.1:10108".to_string())
            }
        };

        let request = RunnerRequest {
            script_path,
            profile_id: profile_id.clone(),
            cli_args: job_cli_args.clone(),
            runtime_path,
            log_path: Some(log_path.clone()),
            manager: "donut".to_string(),
            api_url: default_api_url,
        };

        let run_id_for_registry = run_id.clone();
        let registry_clone = Arc::clone(process_registry);
        let app_handle_clone = app_handle.clone();

        tokio::spawn(async move {
            let result = match runner::spawn_runtime(&request) {
                Ok(spawned) => {
                    // Register PID in in-memory registry immediately
                    if let Some(pid) = spawned.pid {
                        if let Ok(mut reg) = registry_clone.lock() {
                            reg.insert(run_id_for_registry.clone(), pid);
                        }
                        // Store PID in database
                        let _ = crate::jobs::repository::update_job_run_pid(
                            &db_path_clone,
                            &run_id_clone,
                            Some(pid),
                        );
                    }
                    runner::wait_runtime(spawned, run_id_clone.clone(), app_handle_clone).await
                }
                Err(outcome) => outcome,
            };

            let finished_at = crate::models::now_iso();
            if crate::jobs::repository::get_job_run_status(&db_path_clone, &run_id_clone)
                .map(|s| s == "stopped")
                .unwrap_or(false)
            {
                if let Ok(mut reg) = registry_clone.lock() {
                    reg.remove(&run_id_for_registry);
                }
                return;
            }
            let status_str = if result.exit_code == Some(0) { "success" } else { "failed" };

            let _ = crate::jobs::repository::update_job_run(
                &db_path_clone,
                &run_id_clone,
                status_str,
                &finished_at,
                result.exit_code,
                result.error_message.as_deref(),
            );

            let new_run_count = current_run_count + 1;
            let new_success_count = if result.success {
                current_success_count + 1
            } else {
                current_success_count
            };
            let new_status = if new_run_count >= target {
                "done"
            } else {
                "pending"
            };

            // Compute next run for remaining posts
            let new_next_run = if new_run_count < target {
                let now_naive = chrono::Local::now().naive_local();

                if let (Ok(sched), Ok(rand_cfg)) = (
                    crate::models::ScheduleConfig::parse(&job_schedule_json),
                    crate::models::RandomConfig::parse(&job_random_json),
                ) {
                    if let Some(window_end) = sched.window_end_today() {
                        crate::models::compute_next_run(
                            target,
                            new_run_count,
                            now_naive,
                            window_end,
                            &rand_cfg,
                        )
                        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };

            let _ = crate::jobs::repository::update_job_profile_state(
                &db_path_clone,
                &state_id,
                new_run_count,
                new_success_count,
                current_run_count + 1 - new_success_count,
                new_status,
                new_next_run.as_deref(),
                &finished_at,
                None,
            );

            // Remove from registry after completion
            if let Ok(mut reg) = registry_clone.lock() {
                reg.remove(&run_id_for_registry);
            }
        });
    }

    Ok(())
}

impl JobDefinition {
    pub fn script_path_for_run(&self, db_path: &PathBuf) -> Option<String> {
        let conn = crate::db::open_db(db_path).ok()?;
        conn.query_row(
            "SELECT script_path FROM scripts WHERE id = ?1",
            rusqlite::params![self.script_id],
            |row| row.get::<_, String>(0),
        )
        .ok()
    }
}
