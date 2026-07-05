use crate::db::AppState;
use crate::models::{RunningProcess, RunningTask};
use rusqlite::params;
use std::path::PathBuf;
use std::sync::Arc;

#[tauri::command]
pub fn list_running_tasks(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<RunningTask>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?.clone();
    let mut tasks = Vec::new();
    tasks.extend(list_test_single_tasks(&db_path)?);
    tasks.extend(list_test_batch_tasks(&db_path)?);
    tasks.extend(list_job_tasks(&db_path)?);
    tasks.sort_by(|a, b| b.started_at.cmp(&a.started_at));
    Ok(tasks)
}

#[tauri::command]
pub async fn stop_running_task(
    state: tauri::State<'_, Arc<AppState>>,
    kind: String,
    task_id: String,
    mode: Option<String>,
) -> Result<(), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?.clone();
    let app_state = Arc::clone(&state);
    match kind.as_str() {
        "test_single" => stop_test_runs(&db_path, &app_state, vec![task_id]).await,
        "test_batch" => {
            let ids = query_test_batch_run_ids(&db_path, &task_id)?;
            stop_test_runs(&db_path, &app_state, ids).await
        }
        "job" => {
            if mode.as_deref() == Some("stop_job") {
                stop_job_runs_for_job(&db_path, &app_state, &task_id).await?;
                crate::jobs::repository::set_job_enabled(&db_path, &task_id, 0)?;
                mark_job_states_stopped(&db_path, &task_id)?;
                Ok(())
            } else {
                stop_job_runs_for_job(&db_path, &app_state, &task_id).await
            }
        }
        _ => Err(format!("Unsupported running task kind: {kind}")),
    }
}

#[tauri::command]
pub async fn stop_running_process(
    state: tauri::State<'_, Arc<AppState>>,
    kind: String,
    run_id: String,
) -> Result<(), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?.clone();
    let app_state = Arc::clone(&state);
    match kind.as_str() {
        "test_single" | "test_batch" => stop_test_runs(&db_path, &app_state, vec![run_id]).await,
        "job" => stop_job_run(&db_path, &app_state, &run_id).await,
        _ => Err(format!("Unsupported running process kind: {kind}")),
    }
}

fn list_test_single_tasks(db_path: &PathBuf) -> Result<Vec<RunningTask>, String> {
    let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT tr.id, tr.script_id, s.name, tr.profile_id, tr.profile_name, tr.manager, tr.pid, tr.status, tr.started_at, tr.finished_at, tr.exit_code, tr.error_message
         FROM test_runs tr LEFT JOIN scripts s ON s.id = tr.script_id
         WHERE tr.batch_id IS NULL AND tr.status IN ('running','queued')
         ORDER BY tr.created_at DESC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let status: String = row.get(7)?;
            let child = RunningProcess {
                id: id.clone(),
                run_id: Some(id.clone()),
                profile_id: row.get(3)?,
                profile_name: profile_label(row.get(4)?, row.get(3)?),
                manager: row.get(5)?,
                pid: row.get(6)?,
                status: status.clone(),
                started_at: row.get(8)?,
                finished_at: row.get(9)?,
                next_run_at: None,
                exit_code: row.get(10)?,
                error_message: row.get(11)?,
            };
            Ok(RunningTask {
                id: id.clone(),
                kind: "test_single".to_string(),
                title: "Manual Run".to_string(),
                script_id: row.get(1)?,
                script_name: row.get(2)?,
                job_id: None,
                job_name: None,
                manager: row.get(5)?,
                status,
                profile_count: 1,
                running_count: 0,
                queued_count: 0,
                scheduled_count: 0,
                started_at: row.get(8)?,
                next_run_at: None,
                children: vec![child],
            })
        })
        .map_err(|e| e.to_string())?;
    let mut tasks = Vec::new();
    for row in rows {
        let mut task = row.map_err(|e| e.to_string())?;
        count_task(&mut task);
        tasks.push(task);
    }
    Ok(tasks)
}

fn list_test_batch_tasks(db_path: &PathBuf) -> Result<Vec<RunningTask>, String> {
    let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT tr.id, tr.batch_id, tr.script_id, s.name, tr.profile_id, tr.profile_name, tr.manager, tr.pid, tr.status, tr.started_at, tr.finished_at, tr.exit_code, tr.error_message
         FROM test_runs tr LEFT JOIN scripts s ON s.id = tr.script_id
         WHERE tr.batch_id IS NOT NULL AND tr.status IN ('running','queued')
         ORDER BY tr.created_at DESC",
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(9)?,
                RunningProcess {
                    id: row.get(0)?,
                    run_id: Some(row.get(0)?),
                    profile_id: row.get(4)?,
                    profile_name: profile_label(row.get(5)?, row.get(4)?),
                    manager: row.get(6)?,
                    pid: row.get(7)?,
                    status: row.get(8)?,
                    started_at: row.get(9)?,
                    finished_at: row.get(10)?,
                    next_run_at: None,
                    exit_code: row.get(11)?,
                    error_message: row.get(12)?,
                },
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut tasks: Vec<RunningTask> = Vec::new();
    for row in rows {
        let (batch_id, script_id, script_name, manager, started_at, child) =
            row.map_err(|e| e.to_string())?;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == batch_id) {
            task.children.push(child);
        } else {
            tasks.push(RunningTask {
                id: batch_id.clone(),
                kind: "test_batch".to_string(),
                title: "Batch Test Run".to_string(),
                script_id: Some(script_id),
                script_name,
                job_id: None,
                job_name: None,
                manager,
                status: "queued".to_string(),
                profile_count: 0,
                running_count: 0,
                queued_count: 0,
                scheduled_count: 0,
                started_at,
                next_run_at: None,
                children: vec![child],
            });
        }
    }
    for task in &mut tasks {
        count_task(task);
    }
    Ok(tasks)
}

fn list_job_tasks(db_path: &PathBuf) -> Result<Vec<RunningTask>, String> {
    let today = crate::models::today_iso();
    let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT j.id, j.name, j.script_id, s.name, st.id, st.profile_id, COALESCE(pc.profile_name, st.profile_id), st.status, st.next_run_at, st.current_run_id, jr.pid, jr.started_at, jr.finished_at, jr.exit_code, jr.error_message
         FROM job_profile_states st
         JOIN jobs j ON j.id = st.job_id
         LEFT JOIN scripts s ON s.id = j.script_id
         LEFT JOIN job_runs jr ON jr.id = st.current_run_id
         LEFT JOIN profile_cache pc ON pc.profile_id = st.profile_id AND pc.manager = 'donut'
         WHERE j.enabled = 1 AND st.date = ?1 AND st.status IN ('running','pending','scheduled')
         ORDER BY j.created_at DESC, st.profile_id",
    ).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![today], |row| {
            let state_status: String = row.get(7)?;
            let next_run_at: Option<String> = row.get(8)?;
            let status = if state_status == "pending" && next_run_at.is_some() {
                "scheduled".to_string()
            } else {
                state_status
            };
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                RunningProcess {
                    id: row.get(4)?,
                    run_id: row.get(9)?,
                    profile_id: row.get(5)?,
                    profile_name: row.get(6)?,
                    manager: Some("donut".to_string()),
                    pid: row.get(10)?,
                    status,
                    started_at: row.get(11)?,
                    finished_at: row.get(12)?,
                    next_run_at,
                    exit_code: row.get(13)?,
                    error_message: row.get(14)?,
                },
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut tasks: Vec<RunningTask> = Vec::new();
    for row in rows {
        let (job_id, job_name, script_id, script_name, child) = row.map_err(|e| e.to_string())?;
        if let Some(task) = tasks.iter_mut().find(|t| t.id == job_id) {
            task.children.push(child);
        } else {
            tasks.push(RunningTask {
                id: job_id.clone(),
                kind: "job".to_string(),
                title: job_name.clone(),
                script_id: Some(script_id),
                script_name,
                job_id: Some(job_id),
                job_name: Some(job_name),
                manager: Some("donut".to_string()),
                status: "scheduled".to_string(),
                profile_count: 0,
                running_count: 0,
                queued_count: 0,
                scheduled_count: 0,
                started_at: None,
                next_run_at: None,
                children: vec![child],
            });
        }
    }
    for task in &mut tasks {
        count_task(task);
    }
    Ok(tasks)
}

fn count_task(task: &mut RunningTask) {
    task.profile_count = task.children.len() as i32;
    task.running_count = task
        .children
        .iter()
        .filter(|c| c.status == "running")
        .count() as i32;
    task.queued_count = task
        .children
        .iter()
        .filter(|c| c.status == "queued")
        .count() as i32;
    task.scheduled_count = task
        .children
        .iter()
        .filter(|c| c.status == "scheduled" || c.status == "pending")
        .count() as i32;
    task.status = if task.running_count > 0 {
        "running".to_string()
    } else if task.queued_count > 0 {
        "queued".to_string()
    } else {
        "scheduled".to_string()
    };
    task.next_run_at = task
        .children
        .iter()
        .filter_map(|c| c.next_run_at.clone())
        .min();
}

fn profile_label(name: String, fallback: String) -> String {
    if name.trim().is_empty() {
        fallback
    } else {
        name
    }
}

fn query_test_batch_run_ids(db_path: &PathBuf, batch_id: &str) -> Result<Vec<String>, String> {
    let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id FROM test_runs WHERE batch_id = ?1 AND status IN ('running','queued')")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![batch_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())
}

async fn stop_test_runs(
    db_path: &PathBuf,
    state: &Arc<AppState>,
    run_ids: Vec<String>,
) -> Result<(), String> {
    let finished_at = crate::models::now_iso();
    for run_id in run_ids {
        let (profile_id, manager) =
            crate::test_runs::repository::get_test_run_profile(db_path, &run_id)?;
        if let Some(pid) = get_pid(&state, db_path, &run_id, true)? {
            if crate::runner::is_process_alive(pid) {
                let _ = kill_process_by_pid(pid);
            }
        }
        let _ = close_profile(db_path, &manager, &profile_id).await;
        if let Ok(mut registry) = state.process_registry.lock() {
            registry.remove(&run_id);
        }
        let _ = crate::test_runs::repository::update_test_run(
            db_path,
            &run_id,
            "stopped",
            &finished_at,
            None,
            Some("Stopped by user"),
            None,
        );
    }
    Ok(())
}

async fn stop_job_runs_for_job(
    db_path: &PathBuf,
    state: &Arc<AppState>,
    job_id: &str,
) -> Result<(), String> {
    let run_ids = {
        let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
        let mut stmt = conn.prepare("SELECT current_run_id FROM job_profile_states WHERE job_id = ?1 AND status = 'running' AND current_run_id IS NOT NULL").map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![job_id], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<String>, _>>()
            .map_err(|e| e.to_string())?
    };
    for run_id in run_ids {
        stop_job_run(db_path, state, &run_id).await?;
    }
    Ok(())
}

async fn stop_job_run(
    db_path: &PathBuf,
    state: &Arc<AppState>,
    run_id: &str,
) -> Result<(), String> {
    let profile_id = crate::jobs::repository::get_job_run_profile(db_path, run_id)?;
    if let Some(pid) = get_pid(state, db_path, run_id, false)? {
        if crate::runner::is_process_alive(pid) {
            let _ = kill_process_by_pid(pid);
        }
    }
    let _ = close_profile(db_path, "donut", &profile_id).await;
    if let Ok(mut registry) = state.process_registry.lock() {
        registry.remove(run_id);
    }
    let finished_at = crate::models::now_iso();
    let _ = crate::jobs::repository::update_job_run(
        db_path,
        run_id,
        "stopped",
        &finished_at,
        None,
        Some("Stopped by user"),
    );
    let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
    let state_id: Option<String> = conn
        .query_row(
            "SELECT id FROM job_profile_states WHERE current_run_id = ?1",
            [run_id],
            |row| row.get(0),
        )
        .ok();
    if let Some(state_id) = state_id {
        let _ = conn.execute("UPDATE job_profile_states SET status='pending', current_run_id=NULL, updated_at=?1 WHERE id=?2", params![finished_at, state_id]);
    }
    Ok(())
}

fn mark_job_states_stopped(db_path: &PathBuf, job_id: &str) -> Result<(), String> {
    let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
    conn.execute("UPDATE job_profile_states SET status='stopped', current_run_id=NULL, updated_at=?1 WHERE job_id=?2 AND date=?3 AND status IN ('running','pending','scheduled')", params![crate::models::now_iso(), job_id, crate::models::today_iso()]).map_err(|e| e.to_string())?;
    Ok(())
}

fn get_pid(
    state: &Arc<AppState>,
    db_path: &PathBuf,
    run_id: &str,
    test: bool,
) -> Result<Option<u32>, String> {
    let pid = state
        .process_registry
        .lock()
        .map_err(|e| e.to_string())?
        .get(run_id)
        .copied();
    if pid.is_some() {
        return Ok(pid);
    }
    if test {
        crate::test_runs::repository::get_test_run_pid(db_path, run_id)
    } else {
        crate::jobs::repository::get_job_run_pid(db_path, run_id)
    }
}

async fn close_profile(db_path: &PathBuf, manager: &str, profile_id: &str) -> Result<(), String> {
    let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
    match manager {
        "gpm" => {
            crate::profile_manager::gpmlogin_client::GpmLoginClient::new(
                crate::db::get_setting(&conn, "gpmlogin_api_base_url")
                    .unwrap_or_else(|_| "http://127.0.0.1:19995".to_string()),
            )
            .close_profile(profile_id)
            .await
        }
        "gpmglobal" => {
            crate::profile_manager::gpmglobal_client::GpmGlobalClient::new(
                crate::db::get_setting(&conn, "gpmglobal_api_base_url")
                    .unwrap_or_else(|_| "http://127.0.0.1:9495".to_string()),
            )
            .close_profile(profile_id)
            .await
        }
        "donut" => {
            crate::profile_manager::donutbrowser_client::DonutBrowserClient::new(
                crate::db::get_setting(&conn, "donutbrowser_api_base_url")
                    .unwrap_or_else(|_| "http://127.0.0.1:10108".to_string()),
            )
            .close_profile(profile_id)
            .await
        }
        _ => Err(format!("Unsupported manager: {manager}")),
    }
}

fn kill_process_by_pid(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to kill process {pid}: {e}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
        Ok(())
    }
}
