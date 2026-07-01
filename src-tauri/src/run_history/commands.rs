use crate::db::AppState;
use crate::models::RunHistoryItem;
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
