use crate::db::AppState;
use crate::models::*;
use crate::runner::{self, RunnerRequest};
use rusqlite::params;
use std::path::PathBuf;
use std::sync::Arc;

#[tauri::command]
pub async fn run_script_test(
    state: tauri::State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
    script_id: String,
    profile_id: String,
    cli_args: String,
    manager: String,
    profile_snapshot: ProfileSnapshot,
) -> Result<TestRun, String> {
    let db_path_owned = {
        let lock = state.db_path.lock().map_err(|e| e.to_string())?;
        lock.clone()
    };

    let script = crate::scripts::repository::get_script(&db_path_owned, &script_id)?;
    {
        let conn = crate::db::open_db(&db_path_owned).map_err(|e| e.to_string())?;
        crate::db::upsert_profile_cache(&conn, &profile_snapshot).map_err(|e| e.to_string())?;
    }

    let (runtime_path, api_url) = {
        let conn = crate::db::open_db(&db_path_owned).map_err(|e| e.to_string())?;
        let runtime_path = crate::runtime_manager::runtime_exe_path_string();
        let api_url = match manager.as_str() {
            "gpm" => crate::db::get_setting(&conn, "gpmlogin_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:19995".to_string()),
            "gpmglobal" => crate::db::get_setting(&conn, "gpmglobal_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:9495".to_string()),
            "donut" => crate::db::get_setting(&conn, "donutbrowser_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:10108".to_string()),
            _ => return Err(format!("Unsupported manager: {manager}")),
        };
        (runtime_path, api_url)
    };

    let now = now_iso();
    let run_id = new_id();
    let log_path = crate::run_logs::prepare_log_path(&script.script_path, &profile_id, &run_id, &now)?;

    let test_run = TestRun {
        id: run_id.clone(),
        script_id: script_id.clone(),
        profile_id: profile_id.clone(),
        status: "queued".to_string(),
        started_at: now.clone(),
        finished_at: None,
        exit_code: None,
        pid: None,
        log_path: Some(log_path.clone()),
        error_message: None,
        cli_args: cli_args.clone(),
        manager: manager.clone(),
        batch_id: None,
        profile_name: profile_snapshot.profile_name.clone(),
        group_name: profile_snapshot.group_name.clone(),
        created_at: now.clone(),
        updated_at: now.clone(),
    };

    crate::test_runs::repository::insert_test_run(&db_path_owned, &test_run)?;

    let request = RunnerRequest {
        script_path: script.script_path.clone(),
        profile_id: profile_id.clone(),
        cli_args: cli_args.clone(),
        runtime_path: runtime_path.clone(),
        log_path: Some(log_path.clone()),
        manager: manager.clone(),
        api_url: api_url.clone(),
    };

    let db_path_clone = db_path_owned.clone();
    let run_id_clone = run_id.clone();
    let run_id_for_registry = run_id.clone();
    let registry = Arc::clone(&state.process_registry);
    let semaphore = Arc::clone(&state.run_semaphore);

    tokio::spawn(async move {
        let _permit = semaphore.acquire().await.unwrap();

        if crate::test_runs::repository::get_test_run_status(&db_path_clone, &run_id_clone)
            .map(|s| s == "stopped")
            .unwrap_or(false)
        {
            return;
        }
        let _ = crate::test_runs::repository::update_test_run_status(
            &db_path_clone,
            &run_id_clone,
            "running",
        );

        let result = match runner::spawn_runtime(&request) {
            Ok(spawned) => {
                // Register PID immediately before waiting
                if let Some(pid) = spawned.pid {
                    if let Ok(mut reg) = registry.lock() {
                        reg.insert(run_id_for_registry.clone(), pid);
                    }
                    let _ = crate::test_runs::repository::update_test_run_pid(
                        &db_path_clone,
                        &run_id_clone,
                        Some(pid),
                    );
                }
                runner::wait_runtime(spawned, run_id_clone.clone(), app_handle).await
            }
            Err(outcome) => outcome,
        };

        let finished_at = crate::models::now_iso();
        if crate::test_runs::repository::get_test_run_status(&db_path_clone, &run_id_clone)
            .map(|s| s == "stopped")
            .unwrap_or(false)
        {
            if let Ok(mut reg) = registry.lock() {
                reg.remove(&run_id_for_registry);
            }
            return;
        }
        let status_str = if result.exit_code == Some(0) { "success" } else { "failed" };

        let _ = crate::test_runs::repository::update_test_run(
            &db_path_clone,
            &run_id_clone,
            status_str,
            &finished_at,
            result.exit_code,
            result.error_message.as_deref(),
            result.log_path.as_deref(),
        );

        if let Ok(mut reg) = registry.lock() {
            reg.remove(&run_id_for_registry);
        }
    });

    Ok(test_run)
}

#[tauri::command]
pub async fn run_batch_test(
    state: tauri::State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
    script_id: String,
    profile_ids: Vec<String>,
    cli_args: String,
    manager: String,
    profile_snapshots: Vec<ProfileSnapshot>,
) -> Result<Vec<TestRun>, String> {
    if profile_ids.is_empty() {
        return Err("No profiles selected".to_string());
    }

    let db_path_owned = {
        let lock = state.db_path.lock().map_err(|e| e.to_string())?;
        lock.clone()
    };

    let script = crate::scripts::repository::get_script(&db_path_owned, &script_id)?;
    {
        let conn = crate::db::open_db(&db_path_owned).map_err(|e| e.to_string())?;
        for snapshot in &profile_snapshots {
            crate::db::upsert_profile_cache(&conn, snapshot).map_err(|e| e.to_string())?;
        }
    }

    let (runtime_path, api_url) = {
        let conn = crate::db::open_db(&db_path_owned).map_err(|e| e.to_string())?;
        let runtime_path = crate::runtime_manager::runtime_exe_path_string();
        let api_url = match manager.as_str() {
            "gpm" => crate::db::get_setting(&conn, "gpmlogin_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:19995".to_string()),
            "gpmglobal" => crate::db::get_setting(&conn, "gpmglobal_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:9495".to_string()),
            "donut" => crate::db::get_setting(&conn, "donutbrowser_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:10108".to_string()),
            _ => return Err(format!("Unsupported manager: {manager}")),
        };
        (runtime_path, api_url)
    };

    let batch_id = new_id();
    let now = now_iso();
    let mut runs = Vec::new();

    for profile_id in &profile_ids {
        let snapshot = profile_snapshots
            .iter()
            .find(|p| p.profile_id == *profile_id)
            .cloned()
            .unwrap_or(ProfileSnapshot {
                profile_id: profile_id.clone(),
                profile_name: profile_id.clone(),
                manager: manager.clone(),
                group_name: None,
            });
        let run_id = new_id();
        let log_path = crate::run_logs::prepare_log_path(&script.script_path, profile_id, &run_id, &now)?;

        let test_run = TestRun {
            id: run_id.clone(),
            script_id: script_id.clone(),
            profile_id: profile_id.clone(),
            status: "queued".to_string(),
            started_at: now.clone(),
            finished_at: None,
            exit_code: None,
            pid: None,
            log_path: Some(log_path.clone()),
            error_message: None,
            cli_args: cli_args.clone(),
            manager: manager.clone(),
            batch_id: Some(batch_id.clone()),
            profile_name: snapshot.profile_name,
            group_name: snapshot.group_name,
            created_at: now.clone(),
            updated_at: now.clone(),
        };

        crate::test_runs::repository::insert_test_run(&db_path_owned, &test_run)?;

        let request = RunnerRequest {
            script_path: script.script_path.clone(),
            profile_id: profile_id.clone(),
            cli_args: cli_args.clone(),
            runtime_path: runtime_path.clone(),
            log_path: Some(log_path.clone()),
            manager: manager.clone(),
            api_url: api_url.clone(),
        };

        let db_path_clone = db_path_owned.clone();
        let run_id_clone = run_id.clone();
        let run_id_for_registry = run_id.clone();
        let registry = Arc::clone(&state.process_registry);
        let semaphore = Arc::clone(&state.run_semaphore);
        let app_handle_clone = app_handle.clone();

        tokio::spawn(async move {
            let _permit = semaphore.acquire().await.unwrap();

            if crate::test_runs::repository::get_test_run_status(&db_path_clone, &run_id_clone)
                .map(|s| s == "stopped")
                .unwrap_or(false)
            {
                return;
            }
            let _ = crate::test_runs::repository::update_test_run_status(
                &db_path_clone,
                &run_id_clone,
                "running",
            );

            let result = match runner::spawn_runtime(&request) {
                Ok(spawned) => {
                    // Register PID immediately before waiting
                    if let Some(pid) = spawned.pid {
                        if let Ok(mut reg) = registry.lock() {
                            reg.insert(run_id_for_registry.clone(), pid);
                        }
                        let _ = crate::test_runs::repository::update_test_run_pid(
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
            if crate::test_runs::repository::get_test_run_status(&db_path_clone, &run_id_clone)
                .map(|s| s == "stopped")
                .unwrap_or(false)
            {
                if let Ok(mut reg) = registry.lock() {
                    reg.remove(&run_id_for_registry);
                }
                return;
            }
            let status_str = if result.exit_code == Some(0) { "success" } else { "failed" };

        let _ = crate::test_runs::repository::update_test_run(
            &db_path_clone,
            &run_id_clone,
            status_str,
            &finished_at,
            result.exit_code,
            result.error_message.as_deref(),
            result.log_path.as_deref(),
        );

            if let Ok(mut reg) = registry.lock() {
                reg.remove(&run_id_for_registry);
            }
        });

        runs.push(test_run);
    }

    Ok(runs)
}

#[tauri::command]
pub fn list_test_runs(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<TestRun>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::test_runs::repository::list_test_runs(&db_path)
}

#[tauri::command]
pub fn get_test_run_log(
    state: tauri::State<'_, Arc<AppState>>,
    run_id: String,
) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::test_runs::repository::get_test_run_log(&db_path, &run_id)
}

#[tauri::command]
pub async fn stop_test_run(
    state: tauri::State<'_, Arc<AppState>>,
    run_id: String,
) -> Result<(), String> {
    let db_path = {
        let lock = state.db_path.lock().map_err(|e| e.to_string())?;
        lock.clone()
    };

    let (profile_id, manager) =
        crate::test_runs::repository::get_test_run_profile(&db_path, &run_id)?;

    // Try in-memory registry first, then fall back to DB
    let pid = {
        let registry = state.process_registry.lock().map_err(|e| e.to_string())?;
        registry.get(&run_id).copied()
    };

    let pid = if let Some(p) = pid {
        Some(p)
    } else {
        crate::test_runs::repository::get_test_run_pid(&db_path, &run_id)
            .map_err(|e| e.to_string())?
    };

    let current_status = crate::test_runs::repository::get_test_run_status(&db_path, &run_id)?;
    if pid.is_none() && current_status == "queued" {
        let finished_at = now_iso();
        let _ = crate::test_runs::repository::update_test_run(
            &db_path,
            &run_id,
            "stopped",
            &finished_at,
            None,
            Some("Stopped by user"),
            None,
        );
        return Ok(());
    }

    let pid = pid.ok_or_else(|| format!("No running process found for run {run_id}"))?;

    if !crate::runner::is_process_alive(pid) {
        return Err(format!("Process {pid} for run {run_id} is no longer alive"));
    }

    kill_process_by_pid(pid)?;
    let close_result = close_profile(&db_path, &manager, &profile_id).await;

    if let Ok(mut registry) = state.process_registry.lock() {
        registry.remove(&run_id);
    }

    let finished_at = now_iso();
    let _ = crate::test_runs::repository::update_test_run(
        &db_path,
        &run_id,
        "stopped",
        &finished_at,
        None,
        Some("Stopped by user"),
        None,
    );

    close_result?;
    Ok(())
}

#[tauri::command]
pub async fn stop_batch_test_run(
    state: tauri::State<'_, Arc<AppState>>,
    batch_id: String,
) -> Result<(), String> {
    let db_path = {
        let lock = state.db_path.lock().map_err(|e| e.to_string())?;
        lock.clone()
    };

    // Find all running test runs with this batch_id
    let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    let runs: Vec<(String, String, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, profile_id, manager FROM test_runs WHERE batch_id = ?1 AND status IN ('running', 'queued')")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![batch_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let finished_at = now_iso();
    for (run_id, profile_id, manager) in &runs {
        // Try registry first, then DB
        let pid = {
            let registry = state.process_registry.lock().map_err(|e| e.to_string())?;
            registry.get(run_id).copied()
        };

        let pid = if let Some(p) = pid {
            Some(p)
        } else {
            crate::test_runs::repository::get_test_run_pid(&db_path, run_id)
                .map_err(|e| e.to_string())?
        };

        if let Some(pid) = pid {
            if crate::runner::is_process_alive(pid) {
                let _ = kill_process_by_pid(pid);
            }
        }

        let _ = close_profile(&db_path, manager, profile_id).await;

        if let Ok(mut registry) = state.process_registry.lock() {
            registry.remove(run_id);
        }

        let _ = crate::test_runs::repository::update_test_run(
            &db_path,
            run_id,
            "stopped",
            &finished_at,
            None,
            Some("Stopped by user"),
            None,
        );
    }

    Ok(())
}

async fn close_profile(db_path: &PathBuf, manager: &str, profile_id: &str) -> Result<(), String> {
    let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
    match manager {
        "gpm" => {
            let base_url = crate::db::get_setting(&conn, "gpmlogin_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:19995".to_string());
            crate::profile_manager::gpmlogin_client::GpmLoginClient::new(base_url)
                .close_profile(profile_id)
                .await
        }
        "gpmglobal" => {
            let base_url = crate::db::get_setting(&conn, "gpmglobal_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:9495".to_string());
            crate::profile_manager::gpmglobal_client::GpmGlobalClient::new(base_url)
                .close_profile(profile_id)
                .await
        }
        "donut" => {
            let base_url = crate::db::get_setting(&conn, "donutbrowser_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:10108".to_string());
            crate::profile_manager::donutbrowser_client::DonutBrowserClient::new(base_url)
                .close_profile(profile_id)
                .await
        }
        _ => Err(format!("Unsupported manager: {manager}")),
    }
}

fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| format!("Failed to kill process {pid}: {e}"))?;
        Ok(())
    }
    #[cfg(target_os = "linux")]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        Ok(())
    }
    #[cfg(target_os = "macos")]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        Ok(())
    }
}
