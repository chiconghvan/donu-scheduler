use crate::db::AppState;
use crate::models::*;
use std::path::PathBuf;
use std::sync::Arc;

#[tauri::command]
pub fn list_jobs(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<JobDefinition>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::jobs::repository::list_jobs(&db_path)
}

#[tauri::command]
pub fn get_job(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<JobDefinition, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::jobs::repository::get_job(&db_path, &id)
}

#[tauri::command]
pub fn create_job(
    state: tauri::State<'_, Arc<AppState>>,
    input: JobInput,
) -> Result<JobDefinition, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::jobs::repository::create_job(&db_path, &input)
}

#[tauri::command]
pub fn update_job(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    input: JobInput,
) -> Result<JobDefinition, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::jobs::repository::update_job(&db_path, &id, &input)
}

#[tauri::command]
pub fn delete_job(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::jobs::repository::delete_job(&db_path, &id)
}

#[tauri::command]
pub fn set_job_enabled(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    enabled: i32,
) -> Result<(), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::jobs::repository::set_job_enabled(&db_path, &id, enabled)
}

#[tauri::command]
pub fn get_today_job_states(
    state: tauri::State<'_, Arc<AppState>>,
    job_id: String,
) -> Result<Vec<JobProfileState>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::jobs::repository::get_today_job_states(&db_path, &job_id)
}

#[tauri::command]
pub fn list_job_runs(
    state: tauri::State<'_, Arc<AppState>>,
    job_id: String,
) -> Result<Vec<JobRun>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::jobs::repository::list_job_runs(&db_path, &job_id)
}

#[tauri::command]
pub async fn stop_job_run(
    state: tauri::State<'_, Arc<AppState>>,
    run_id: String,
) -> Result<(), String> {
    let db_path = {
        let lock = state.db_path.lock().map_err(|e| e.to_string())?;
        lock.clone()
    };

    let profile_id = crate::jobs::repository::get_job_run_profile(&db_path, &run_id)?;

    // Try in-memory registry first, then fall back to DB
    let pid = {
        let registry = state.process_registry.lock().map_err(|e| e.to_string())?;
        registry.get(&run_id).copied()
    };

    let pid = if let Some(p) = pid {
        Some(p)
    } else {
        crate::jobs::repository::get_job_run_pid(&db_path, &run_id).map_err(|e| e.to_string())?
    };

    let pid = pid.ok_or_else(|| format!("No running process found for run {run_id}"))?;

    if !crate::runner::is_process_alive(pid) {
        return Err(format!("Process {pid} for run {run_id} is no longer alive"));
    }

    kill_process_by_pid(pid)?;
    let close_result = close_profile(&db_path, "donut", &profile_id).await;

    if let Ok(mut registry) = state.process_registry.lock() {
        registry.remove(&run_id);
    }

    let finished_at = now_iso();
    let _ = crate::jobs::repository::update_job_run(
        &db_path,
        &run_id,
        "stopped",
        &finished_at,
        None,
        Some("Stopped by user"),
    );

    // Update profile state: set current_run_id to None and status back to pending
    let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    let state_id: Option<String> = conn
        .query_row(
            "SELECT id FROM job_profile_states WHERE current_run_id = ?1",
            [&run_id],
            |row| row.get(0),
        )
        .ok();

    if let Some(state_id) = state_id {
        let _ = crate::jobs::repository::update_job_profile_state(
            &db_path,
            &state_id,
            0,
            0,
            0,
            "pending",
            None,
            &finished_at,
            None,
        );
    }

    close_result?;
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
