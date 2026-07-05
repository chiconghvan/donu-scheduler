use crate::db::AppState;
use crate::models::RunHistoryItem;
use crate::run_logs::LogEntry;
use std::sync::Arc;

#[tauri::command]
pub fn list_run_history(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<RunHistoryItem>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::run_history::repository::list_run_history(&db_path)
}

#[tauri::command]
pub fn get_run_history_log(
    state: tauri::State<'_, Arc<AppState>>,
    kind: String,
    run_id: String,
) -> Result<String, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::run_history::repository::get_run_history_log(&db_path, &kind, &run_id)
}

#[tauri::command]
pub fn get_run_log_tail(
    state: tauri::State<'_, Arc<AppState>>,
    kind: String,
    run_id: String,
    after_seq: Option<u64>,
    max_lines: Option<usize>,
) -> Result<Vec<LogEntry>, String> {
    if let Some(entries) =
        crate::run_logs::get_live_tail(&state.log_registry, &run_id, after_seq, max_lines)?
    {
        return Ok(entries);
    }

    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let log_path = crate::run_history::repository::get_log_path(&db_path, &kind, &run_id)?;
    crate::run_logs::tail_log_file(&run_id, &log_path, after_seq, max_lines)
}
