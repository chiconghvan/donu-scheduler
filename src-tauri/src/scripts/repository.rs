use crate::db::open_db;
use crate::models::{new_id, now_iso, Script, ScriptInput};
use rusqlite::params;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub fn list_scripts(db_path: &PathBuf) -> Result<Vec<Script>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut result = Vec::new();
    {
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

        for row in rows {
            result.push(row.map_err(|e| e.to_string())?);
        }
    }

    for script in result.iter_mut() {
        let refreshed = refresh_script_defaults_if_needed(&conn, script)?;
        *script = refreshed;
    }
    Ok(result)
}

pub fn get_script(db_path: &PathBuf, id: &str) -> Result<Script, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let script = conn.query_row(
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
    .map_err(|e| e.to_string())?;
    refresh_script_defaults_if_needed(&conn, &script)
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

fn refresh_script_defaults_if_needed(conn: &rusqlite::Connection, script: &Script) -> Result<Script, String> {
    let refreshed = read_default_inputs_from_path(&script.script_path).unwrap_or_else(|_| script.default_inputs_json.clone());
    if refreshed != script.default_inputs_json {
        let now = now_iso();
        conn.execute(
            "UPDATE scripts SET default_inputs_json=?1, updated_at=?2 WHERE id=?3",
            params![refreshed, now, script.id],
        )
        .map_err(|e| e.to_string())?;

        return Ok(Script {
            default_inputs_json: refreshed,
            updated_at: now,
            ..script.clone()
        });
    }

    Ok(script.clone())
}

fn read_default_inputs_from_path(path: &str) -> Result<String, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let cleaned = content.trim_start_matches('\u{feff}');
    let root: Value = serde_json::from_str(cleaned).map_err(|e| e.to_string())?;
    let mut inputs = Vec::<Value>::new();

    fn collect(nodes: &[Value], results: &mut Vec<Value>) {
        for node in nodes {
            if let Some(obj) = node.as_object() {
                if obj.get("type").and_then(|v| v.as_i64()) == Some(1) {
                    if let Some(raw_input) = obj.get("raw_input").and_then(|v| v.as_str()) {
                        if let Ok(raw) = serde_json::from_str::<Vec<Value>>(raw_input) {
                            let allow = raw.iter().any(|item| {
                                item.get("Key").and_then(|v| v.as_str()) == Some("ALLOW_USER_INPUT")
                                    && item.get("Value").and_then(|v| v.as_str()) == Some("True")
                            });
                            if allow {
                                let get_val = |key: &str| {
                                    raw.iter()
                                        .find(|item| item.get("Key").and_then(|v| v.as_str()) == Some(key))
                                        .and_then(|item| item.get("Value"))
                                        .and_then(|v| v.as_str())
                                        .unwrap_or("")
                                };
                                results.push(serde_json::json!({
                                    "name": obj.get("output_variable_name").and_then(|v| v.as_str()).unwrap_or(""),
                                    "comment": obj.get("comment").and_then(|v| v.as_str()).unwrap_or(""),
                                    "value": get_val("VALUE"),
                                    "inputType": match get_val("USER_INPUT_TYPE") {
                                        "" => "Text",
                                        value => value,
                                    },
                                    "comboboxData": get_val("COMBOBOX_DATA"),
                                }));
                            }
                        }
                    }
                }
                for key in ["nodes", "then_nodes", "else_nodes"] {
                    if let Some(children) = obj.get(key).and_then(|v| v.as_array()) {
                        collect(children, results);
                    }
                }
            }
        }
    }

    match root {
        Value::Array(nodes) => collect(&nodes, &mut inputs),
        Value::Object(obj) => {
            for section in ["before_init", "main_logic"] {
                if let Some(nodes) = obj
                    .get(section)
                    .and_then(|v| v.get("nodes"))
                    .and_then(|v| v.as_array())
                {
                    collect(nodes, &mut inputs);
                }
            }
        }
        _ => {}
    }

    serde_json::to_string(&inputs).map_err(|e| e.to_string())
}
