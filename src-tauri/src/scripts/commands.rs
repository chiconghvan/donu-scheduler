use crate::db::AppState;
use crate::models::{Script, ScriptInput};
use std::sync::Arc;

#[tauri::command]
pub fn list_scripts(state: tauri::State<'_, Arc<AppState>>) -> Result<Vec<Script>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::scripts::repository::list_scripts(&db_path)
}

#[tauri::command]
pub fn get_script(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<Script, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::scripts::repository::get_script(&db_path, &id)
}

#[tauri::command]
pub fn create_script(
    state: tauri::State<'_, Arc<AppState>>,
    input: ScriptInput,
) -> Result<Script, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::scripts::repository::create_script(&db_path, &input)
}

#[tauri::command]
pub fn update_script(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    input: ScriptInput,
) -> Result<Script, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::scripts::repository::update_script(&db_path, &id, &input)
}

#[tauri::command]
pub fn delete_script(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<(), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::scripts::repository::delete_script(&db_path, &id)
}

#[tauri::command]
pub fn open_file_dialog(filter_name: String, filter_extensions: Vec<String>) -> Result<Option<String>, String> {
    let filter = rfd::FileDialog::new()
        .add_filter(&filter_name, &filter_extensions);
    
    match filter.pick_file() {
        Some(path) => Ok(Some(path.to_string_lossy().to_string())),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {e}"))
}
