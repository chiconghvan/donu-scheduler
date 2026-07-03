use crate::models::{JobDefinition, JobProfileRef, JobProfileState, JobRun, ScheduleConfig};
use crate::runner;
use crate::runner::RunnerRequest;
use chrono::{Duration, NaiveDateTime, NaiveTime};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub async fn scheduler_tick(
    db_path: PathBuf,
    process_registry: Arc<Mutex<HashMap<String, u32>>>,
    log_registry: Arc<Mutex<crate::run_logs::LogRegistry>>,
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
        if let Err(e) = process_job(&db_path, &job, &process_registry, &log_registry, &app_handle).await {
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
    log_registry: &Arc<Mutex<crate::run_logs::LogRegistry>>,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let profiles: Vec<JobProfileRef> = serde_json::from_str(&job.profile_ids_json)
        .map_err(|e| format!("Invalid profile_ids_json: {e}"))?;

    let schedule = if job.schedule_json.trim().is_empty() {
        return Ok(());
    } else {
        crate::models::ScheduleConfig::parse(&job.schedule_json)?
    };

    let random_cfg = if job.random_json.trim().is_empty() {
        crate::models::RandomConfig {
            min_gap_minutes: 10.0,
            max_gap_minutes: 45.0,
        }
    } else {
        crate::models::RandomConfig::parse(&job.random_json)?
    };

    let now = chrono::Local::now().naive_local();
    if !schedule.is_active_today() {
        return Ok(());
    }

    for profile in &profiles {
        let today = crate::models::today_iso();
        let latest_state = crate::jobs::repository::get_latest_job_profile_state(
            db_path,
            &job.id,
            &profile.id,
        )?;
        let state = crate::jobs::repository::upsert_job_profile_state(
            db_path,
            &job.id,
            &profile.id,
            &today,
            schedule.target_count(),
        )?;

        if state.status == "done" || state.status == "expired" {
            continue;
        }

        if state.status == "running" && state.current_run_id.is_some() {
            continue;
        }

        let next_run = match next_run_for_state(&schedule, &random_cfg, &state, latest_state.as_ref(), now)? {
            Some(next_run) => next_run,
            None => {
                if let Some(status) = terminal_status_for_state(&schedule, &state, now) {
                    crate::jobs::repository::update_job_profile_state(
                        db_path,
                        &state.id,
                        state.run_count,
                        state.success_count,
                        state.failed_count,
                        status,
                        None,
                        &state.last_run_at.clone().unwrap_or_default(),
                        None,
                    )?;
                }
                continue;
            }
        };

        if now < next_run {
            let next_run_str = next_run.format("%Y-%m-%dT%H:%M:%S").to_string();
            if state.next_run_at.as_deref() != Some(next_run_str.as_str()) {
                crate::jobs::repository::update_job_profile_state(
                    db_path,
                    &state.id,
                    state.run_count,
                    state.success_count,
                    state.failed_count,
                    "pending",
                    Some(&next_run_str),
                    &state.last_run_at.clone().unwrap_or_default(),
                    None,
                )?;
            }
            continue;
        }

        // Create a fake run
        let run_id = crate::models::new_id();
        let now_str = crate::models::now_iso();
        let script_path = job.script_path_for_run(db_path).unwrap_or_default();
        let log_path = crate::run_logs::prepare_log_path(&script_path, &profile.id, &run_id, &now_str)?;
        let profile_name = profile.name.clone().unwrap_or_else(|| profile.id.clone());
        let group_name = profile.group_name.clone();

        let run = JobRun {
            id: run_id.clone(),
            job_id: Some(job.id.clone()),
            profile_id: profile.id.clone(),
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
        let current_failed_count = state.failed_count;

        let script_path = job.script_path_for_run(&db_path_clone).unwrap_or_default();
        let job_cli_args = job.cli_args.clone();
        let job_schedule_json = job.schedule_json.clone();

        // Runtime is managed in app data; only API URL remains configurable.
        let (runtime_path, default_api_url) = {
            if let Ok(conn) = crate::db::open_db(&db_path_clone) {
                let setting_key = match profile.manager.as_str() {
                    "gpm" => "gpmlogin_api_base_url",
                    "gpmglobal" => "gpmglobal_api_base_url",
                    _ => "donutbrowser_api_base_url",
                };
                let api = crate::db::get_setting(&conn, setting_key)
                    .unwrap_or_else(|_| default_api_url_for_manager(&profile.manager));
                (crate::runtime_manager::runtime_exe_path_string(), api)
            } else {
                (
                    crate::runtime_manager::runtime_exe_path_string(),
                    default_api_url_for_manager(&profile.manager),
                )
            }
        };

        let request = RunnerRequest {
            script_path,
            profile_id: profile.id.clone(),
            cli_args: job_cli_args.clone(),
            runtime_path,
            log_path: Some(log_path.clone()),
            manager: profile.manager.clone(),
            api_url: default_api_url,
        };

        let run_id_for_registry = run_id.clone();
        let registry_clone = Arc::clone(process_registry);
        let log_registry = Arc::clone(log_registry);
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
                    runner::wait_runtime(spawned, run_id_clone.clone(), app_handle_clone, log_registry).await
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
            let new_success_count = current_success_count + if result.success { 1 } else { 0 };
            let new_failed_count = current_failed_count + if result.success { 0 } else { 1 };
            let (new_status, new_next_run) = next_after_completion(
                &job_schedule_json,
                new_run_count,
                new_success_count,
                &finished_at,
            );

            let _ = crate::jobs::repository::update_job_profile_state(
                &db_path_clone,
                &state_id,
                new_run_count,
                new_success_count,
                new_failed_count,
                &new_status,
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

fn parse_dt(value: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S").ok()
}

fn format_dt(value: NaiveDateTime) -> String {
    value.format("%Y-%m-%dT%H:%M:%S").to_string()
}

fn next_run_for_state(
    schedule: &ScheduleConfig,
    random_cfg: &crate::models::RandomConfig,
    state: &JobProfileState,
    latest_state: Option<&JobProfileState>,
    now: NaiveDateTime,
) -> Result<Option<NaiveDateTime>, String> {
    match schedule.schedule_type.as_str() {
        "window_count" => next_window_count(schedule, random_cfg, state, now),
        "fixed_interval" => next_fixed_interval(schedule, state, latest_state, now),
        "daily_times" => next_daily_times(schedule, state, now),
        other => Err(format!("Unsupported schedule type: {other}")),
    }
}

fn next_window_count(
    schedule: &ScheduleConfig,
    random_cfg: &crate::models::RandomConfig,
    state: &JobProfileState,
    now: NaiveDateTime,
) -> Result<Option<NaiveDateTime>, String> {
    let target = schedule.runs_per_profile.unwrap_or(0);
    if state.success_count >= target {
        return Ok(None);
    }

    let start = schedule.window_start_today().ok_or("Invalid schedule start_time")?;
    let end = schedule.window_end_today().ok_or("Invalid schedule end_time")?;
    if now < start {
        return Ok(Some(start));
    }
    if now > end {
        return Ok(None);
    }
    if let Some(next_run_at) = state.next_run_at.as_deref().and_then(parse_dt) {
        return Ok(Some(next_run_at));
    }
    if state.last_run_at.is_none() {
        return Ok(Some(now));
    }

    Ok(crate::models::compute_next_run(
        target,
        state.success_count,
        now,
        end,
        random_cfg,
    ))
}

fn next_fixed_interval(
    schedule: &ScheduleConfig,
    state: &JobProfileState,
    latest_state: Option<&JobProfileState>,
    now: NaiveDateTime,
) -> Result<Option<NaiveDateTime>, String> {
    if let Some(next_run_at) = state.next_run_at.as_deref().and_then(parse_dt) {
        return Ok(Some(next_run_at));
    }

    let interval = Duration::minutes(schedule.interval_minutes.unwrap_or(0));
    let latest = latest_state.unwrap_or(state);
    if let Some(last_run_at) = latest.last_run_at.as_deref().and_then(parse_dt) {
        return Ok(Some(last_run_at + interval));
    }

    Ok(Some(now))
}

fn next_daily_times(
    schedule: &ScheduleConfig,
    state: &JobProfileState,
    now: NaiveDateTime,
) -> Result<Option<NaiveDateTime>, String> {
    if let Some(next_run_at) = state.next_run_at.as_deref().and_then(parse_dt) {
        return Ok(Some(next_run_at));
    }

    let mut times = schedule.times.clone().unwrap_or_default();
    times.sort();
    if state.run_count >= times.len() as i32 {
        return Ok(None);
    }
    let time = NaiveTime::parse_from_str(&times[state.run_count as usize], "%H:%M")
        .map_err(|_| "Invalid daily time".to_string())?;
    Ok(Some(now.date().and_time(time)))
}

fn next_after_completion(
    schedule_json: &str,
    run_count: i32,
    success_count: i32,
    finished_at: &str,
) -> (String, Option<String>) {
    let finished = parse_dt(finished_at).unwrap_or_else(|| chrono::Local::now().naive_local());
    let schedule = match ScheduleConfig::parse(schedule_json) {
        Ok(schedule) => schedule,
        Err(_) => return ("pending".to_string(), None),
    };

    match schedule.schedule_type.as_str() {
        "window_count" => {
            let target = schedule.runs_per_profile.unwrap_or(0);
            if success_count >= target {
                ("done".to_string(), None)
            } else if let Some(end) = schedule.window_end_today() {
                if finished > end {
                    ("expired".to_string(), None)
                } else {
                    ("pending".to_string(), None)
                }
            } else {
                ("pending".to_string(), None)
            }
        }
        "fixed_interval" => {
            let next = finished + Duration::minutes(schedule.interval_minutes.unwrap_or(0));
            ("pending".to_string(), Some(format_dt(next)))
        }
        "daily_times" => {
            if run_count >= schedule.target_count() {
                ("done".to_string(), None)
            } else {
                ("pending".to_string(), None)
            }
        }
        _ => ("pending".to_string(), None),
    }
}

fn terminal_status_for_state(
    schedule: &ScheduleConfig,
    state: &JobProfileState,
    now: NaiveDateTime,
) -> Option<&'static str> {
    match schedule.schedule_type.as_str() {
        "window_count" => {
            if state.success_count >= schedule.runs_per_profile.unwrap_or(0) {
                Some("done")
            } else if schedule.window_end_today().map(|end| now > end).unwrap_or(false) {
                Some("expired")
            } else {
                None
            }
        }
        "daily_times" => {
            if state.run_count >= schedule.target_count() {
                Some("done")
            } else {
                None
            }
        }
        _ => None,
    }
}

fn default_api_url_for_manager(manager: &str) -> String {
    match manager {
        "gpm" => "http://127.0.0.1:19995".to_string(),
        "gpmglobal" => "http://127.0.0.1:9495".to_string(),
        _ => "http://127.0.0.1:10108".to_string(),
    }
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
