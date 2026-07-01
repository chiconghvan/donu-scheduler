use crate::db::AppState;
use std::sync::Arc;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct InputCache {
    pub script_id: String,
    pub cli_args: String,
    pub default_inputs_json: String,
}

#[tauri::command]
pub fn get_input_cache(
    state: tauri::State<'_, Arc<AppState>>,
    script_id: String,
) -> Result<InputCache, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    let row = conn
        .query_row(
            "SELECT script_id, cli_args, default_inputs_json FROM input_cache WHERE script_id = ?1",
            [&script_id],
            |row| {
                Ok(InputCache {
                    script_id: row.get(0)?,
                    cli_args: row.get(1)?,
                    default_inputs_json: row.get(2)?,
                })
            },
        )
        .ok();
    Ok(row.unwrap_or(InputCache {
        script_id,
        cli_args: String::new(),
        default_inputs_json: "[]".to_string(),
    }))
}

#[tauri::command]
pub fn save_input_cache(
    state: tauri::State<'_, Arc<AppState>>,
    script_id: String,
    cli_args: String,
    default_inputs_json: String,
) -> Result<(), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO input_cache (script_id, cli_args, default_inputs_json) VALUES (?1, ?2, ?3)",
        [&script_id, &cli_args, &default_inputs_json],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
