use crate::db::open_db;
use crate::models::{new_id, now_iso, Script, ScriptInput};
use rusqlite::params;
use std::path::PathBuf;

pub fn list_scripts(db_path: &PathBuf) -> Result<Vec<Script>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, script_path, default_args, default_inputs_json, created_at, updated_at FROM scripts ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Script {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                script_path: row.get(3)?,
                default_args: row.get(4)?,
                default_inputs_json: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_script(db_path: &PathBuf, id: &str) -> Result<Script, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, name, description, script_path, default_args, default_inputs_json, created_at, updated_at FROM scripts WHERE id = ?1",
        params![id],
        |row| {
            Ok(Script {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                script_path: row.get(3)?,
                default_args: row.get(4)?,
                default_inputs_json: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

pub fn create_script(db_path: &PathBuf, input: &ScriptInput) -> Result<Script, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let id = new_id();
    let now = now_iso();

    conn.execute(
        "INSERT INTO scripts (id, name, description, script_path, default_args, default_inputs_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, input.name, input.description, input.script_path, input.default_args, input.default_inputs_json, now, now],
    )
    .map_err(|e| e.to_string())?;

    get_script(db_path, &id)
}

pub fn update_script(db_path: &PathBuf, id: &str, input: &ScriptInput) -> Result<Script, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let now = now_iso();

    let affected = conn
        .execute(
            "UPDATE scripts SET name=?1, description=?2, script_path=?3, default_args=?4, default_inputs_json=?5, updated_at=?6 WHERE id=?7",
            params![input.name, input.description, input.script_path, input.default_args, input.default_inputs_json, now, id],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Script not found: {id}"));
    }

    get_script(db_path, id)
}

pub fn delete_script(db_path: &PathBuf, id: &str) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM scripts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Script not found: {id}"));
    }
    Ok(())
}
