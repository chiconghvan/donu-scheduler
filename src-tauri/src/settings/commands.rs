use crate::db::AppState;
use crate::models::Settings;
use std::sync::Arc;

#[tauri::command]
pub fn get_settings(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Settings, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::settings::repository::get_settings(&db_path)
}

#[tauri::command]
pub fn update_settings(
    state: tauri::State<'_, Arc<AppState>>,
    settings: Settings,
) -> Result<(), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    crate::settings::repository::update_settings(&db_path, &settings)?;
    crate::run_logs::cleanup_old_logs(&db_path)?;
    Ok(())
}
