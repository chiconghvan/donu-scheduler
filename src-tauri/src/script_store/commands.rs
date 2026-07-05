use crate::models::{ScriptStoreCatalog, ScriptStoreInstallResult, ScriptStoreUpdateApplied};
use tauri::Emitter;

#[tauri::command]
pub fn script_store_has_token() -> Result<bool, String> {
    Ok(crate::script_store::repository::has_token())
}

#[tauri::command]
pub fn script_store_save_token(token: String) -> Result<(), String> {
    crate::script_store::repository::save_token(&token)
}

#[tauri::command]
pub fn script_store_list() -> Result<ScriptStoreCatalog, String> {
    let token = crate::script_store::repository::read_token()?;
    crate::script_store::repository::list_store_catalog(&token)
}

#[tauri::command]
pub fn script_store_install(script_id: String) -> Result<ScriptStoreInstallResult, String> {
    let token = crate::script_store::repository::read_token()?;
    crate::script_store::repository::install_or_stage_script(&token, &script_id)
}

#[tauri::command]
pub fn script_store_update(script_id: String) -> Result<ScriptStoreInstallResult, String> {
    let token = crate::script_store::repository::read_token()?;
    crate::script_store::repository::stage_script_update(&token, &script_id)
}

#[tauri::command]
pub fn script_store_apply_pending_updates(
    app_handle: tauri::AppHandle,
) -> Result<Vec<ScriptStoreUpdateApplied>, String> {
    let applied = crate::script_store::repository::apply_pending_updates()?;
    for item in &applied {
        let _ = app_handle.emit(
            "script-store-update-success",
            crate::models::ScriptStoreUpdateSuccessPayload {
                script_id: item.script_id.clone(),
                name: item.script_name.clone(),
                version: item.version.clone(),
            },
        );
    }
    Ok(applied)
}
