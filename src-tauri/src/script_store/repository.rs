use crate::db::open_db;
use crate::models::{
    now_iso, Script, ScriptInput, ScriptStoreCatalog, ScriptStoreCatalogItem,
    ScriptStoreInstallResult, ScriptStoreMetadata, ScriptStoreScript, ScriptStoreUpdateApplied,
};
use crate::script_store::types::GithubRelease;
use crate::script_store::types::ScriptInstallRecord;
use rusqlite::params;
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

const STORE_OWNER: &str = "chiconghvan";
const STORE_REPO: &str = "script-store";

pub fn app_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("DonuScheduler")
}

pub fn token_path() -> PathBuf {
    app_dir().join("script-store-token")
}

pub fn scripts_dir() -> PathBuf {
    app_dir().join("scripts")
}

pub fn script_dir(script_id: &str) -> PathBuf {
    scripts_dir().join(script_id)
}

pub fn installed_script_path(script_id: &str, entry: &str) -> PathBuf {
    script_dir(script_id).join(entry)
}

pub fn pending_script_path(script_id: &str, version: &str, entry: &str) -> PathBuf {
    script_dir(script_id).join(format!(".pending-{}-{}", sanitize_filename(version), entry))
}

fn sanitize_filename(value: &str) -> String {
    value
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

pub fn has_token() -> bool {
    token_path().exists()
}

pub fn save_token(token: &str) -> Result<(), String> {
    fs::create_dir_all(app_dir()).map_err(|e| e.to_string())?;
    fs::write(token_path(), token.trim()).map_err(|e| e.to_string())
}

pub fn read_token() -> Result<String, String> {
    fs::read_to_string(token_path())
        .map(|s| s.trim().to_string())
        .map_err(|e| format!("GitHub token not found: {e}"))
}

pub fn read_manifest_from_release(token: &str) -> Result<ScriptStoreMetadata, String> {
    let release = fetch_latest_release(token)?;
    let metadata_asset = release
        .assets
        .iter()
        .find(|asset| asset.name == "metadata.json")
        .ok_or_else(|| "metadata.json asset not found".to_string())?;

    let metadata_bytes = download_release_asset(token, metadata_asset.id)?;
    let manifest: ScriptStoreMetadata = serde_json::from_slice(&metadata_bytes)
        .map_err(|e| format!("Invalid metadata.json: {e}"))?;
    Ok(manifest)
}

fn client(token: &str) -> Result<reqwest::blocking::Client, String> {
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert(
        reqwest::header::ACCEPT,
        reqwest::header::HeaderValue::from_static("application/vnd.github+json"),
    );
    headers.insert(
        reqwest::header::HeaderName::from_static("x-github-api-version"),
        reqwest::header::HeaderValue::from_static("2022-11-28"),
    );
    if let Ok(value) = reqwest::header::HeaderValue::from_str(&format!("Bearer {token}")) {
        headers.insert(reqwest::header::AUTHORIZATION, value);
    }

    reqwest::blocking::Client::builder()
        .user_agent("DonuScheduler")
        .default_headers(headers)
        .build()
        .map_err(|e| e.to_string())
}

fn fetch_latest_release(token: &str) -> Result<GithubRelease, String> {
    let client = client(token)?;
    let url = format!("https://api.github.com/repos/{STORE_OWNER}/{STORE_REPO}/releases/latest");
    let response = client
        .get(url)
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    response.json::<GithubRelease>().map_err(|e| e.to_string())
}

fn download_release_asset(token: &str, asset_id: u64) -> Result<Vec<u8>, String> {
    let client = client(token)?;
    let url = format!(
        "https://api.github.com/repos/{STORE_OWNER}/{STORE_REPO}/releases/assets/{asset_id}"
    );
    let response = client
        .get(url)
        .header(reqwest::header::ACCEPT, "application/octet-stream")
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    response
        .bytes()
        .map(|b| b.to_vec())
        .map_err(|e| e.to_string())
}

pub fn list_store_catalog(token: &str) -> Result<ScriptStoreCatalog, String> {
    let manifest = read_manifest_from_release(token)?;
    let installs = list_installs()?;

    let mut items = Vec::new();
    for script in manifest.scripts {
        let install = installs.get(&script.id);
        let installed = install.is_some();
        let pending_update = install
            .map(|row| {
                row.pending_version.as_deref().is_some() || row.pending_path.as_deref().is_some()
            })
            .unwrap_or(false);
        let update_available = install
            .map(|row| {
                row.version != script.version
                    || !row.sha256.eq_ignore_ascii_case(&script.sha256)
                    || row
                        .pending_version
                        .as_deref()
                        .map(|v| v != script.version)
                        .unwrap_or(false)
            })
            .unwrap_or(false);
        items.push(ScriptStoreCatalogItem {
            id: script.id,
            name: script.name,
            description: script.description,
            version: script.version,
            runtime: script.runtime,
            entry: script.entry.clone(),
            path: script.path,
            sha256: script.sha256,
            min_app_version: script.min_app_version,
            deprecated: script.deprecated,
            updated_at: script.updated_at,
            installed,
            installed_version: install.map(|row| row.version.clone()),
            installed_sha256: install.map(|row| row.sha256.clone()),
            update_available,
            pending_update,
            source_tag: install.map(|row| row.source_tag.clone()),
            asset_name: install.map(|row| row.asset_name.clone()),
        });
    }

    Ok(ScriptStoreCatalog {
        store_version: manifest.store_version,
        scripts: items,
    })
}

fn list_installs() -> Result<HashMap<String, ScriptInstallRecord>, String> {
    let db_path = app_dir().join("donu_scheduler.sqlite");
    let conn = open_db(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT store_script_id, script_db_id, name, version, sha256, runtime, source_owner, source_repo, source_tag, asset_name, installed_path, pending_path, pending_version, pending_sha256, pending_source_tag, pending_asset_name, installed_at, updated_at FROM script_store_installs")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ScriptInstallRecord {
                store_script_id: row.get(0)?,
                script_db_id: row.get(1)?,
                name: row.get(2)?,
                version: row.get(3)?,
                sha256: row.get(4)?,
                runtime: row.get(5)?,
                source_owner: row.get(6)?,
                source_repo: row.get(7)?,
                source_tag: row.get(8)?,
                asset_name: row.get(9)?,
                installed_path: row.get(10)?,
                pending_path: row.get(11)?,
                pending_version: row.get(12)?,
                pending_sha256: row.get(13)?,
                pending_source_tag: row.get(14)?,
                pending_asset_name: row.get(15)?,
                installed_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let mut map = HashMap::new();
    for row in rows {
        let row = row.map_err(|e| e.to_string())?;
        map.insert(row.store_script_id.clone(), row);
    }
    Ok(map)
}

fn sha256_hex(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

fn resolve_script_asset(script: &ScriptStoreScript) -> String {
    if !script.entry.trim().is_empty() {
        script.entry.clone()
    } else {
        Path::new(&script.path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&script.path)
            .to_string()
    }
}

fn ensure_script_row(
    db_path: &PathBuf,
    script: &ScriptStoreScript,
    installed_path: &str,
    default_inputs_json: &str,
) -> Result<Script, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT script_db_id FROM script_store_installs WHERE store_script_id = ?1",
            params![script.id],
            |row| row.get(0),
        )
        .ok();

    let input = ScriptInput {
        name: script.name.clone(),
        description: script.description.clone(),
        script_path: installed_path.to_string(),
        default_args: String::new(),
        default_inputs_json: default_inputs_json.to_string(),
    };

    if let Some(script_db_id) = existing_id {
        crate::scripts::repository::update_script(db_path, &script_db_id, &input)
    } else {
        crate::scripts::repository::create_script(db_path, &input)
    }
}

pub fn install_or_stage_script(
    token: &str,
    script_id: &str,
) -> Result<ScriptStoreInstallResult, String> {
    let release = fetch_latest_release(token)?;
    let manifest = read_manifest_from_release(token)?;
    let script = manifest
        .scripts
        .into_iter()
        .find(|item| item.id == script_id)
        .ok_or_else(|| format!("Script not found in store: {script_id}"))?;
    let asset_name = resolve_script_asset(&script);
    let asset = release
        .assets
        .into_iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| format!("Asset not found for script: {}", script.name))?;
    let bytes = download_release_asset(token, asset.id)?;
    let actual_sha = sha256_hex(&bytes);
    if !actual_sha.eq_ignore_ascii_case(&script.sha256) {
        return Err(format!("Integrity check failed for {}", script.name));
    }

    let db_path = app_dir().join("donu_scheduler.sqlite");
    let install_path = installed_script_path(&script.id, &asset_name);
    let parent = install_path
        .parent()
        .ok_or_else(|| "Invalid install path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    fs::write(&install_path, bytes).map_err(|e| e.to_string())?;

    let default_inputs_json =
        extract_default_inputs_json(&install_path).unwrap_or_else(|_| "[]".to_string());
    let script_row = ensure_script_row(
        &db_path,
        &script,
        &install_path.to_string_lossy(),
        &default_inputs_json,
    )?;

    upsert_install_record(
        &db_path,
        &script,
        &script_row.id,
        &install_path.to_string_lossy(),
        None,
        None,
        None,
        Some(&release.tag_name),
        Some(&asset_name),
    )?;

    Ok(ScriptStoreInstallResult {
        script_id: script.id,
        script_name: script_row.name,
        version: script.version,
        path: install_path.to_string_lossy().to_string(),
    })
}

pub fn stage_script_update(
    token: &str,
    script_id: &str,
) -> Result<ScriptStoreInstallResult, String> {
    let release = fetch_latest_release(token)?;
    let manifest = read_manifest_from_release(token)?;
    let script = manifest
        .scripts
        .into_iter()
        .find(|item| item.id == script_id)
        .ok_or_else(|| format!("Script not found in store: {script_id}"))?;
    let asset_name = resolve_script_asset(&script);
    let asset = release
        .assets
        .into_iter()
        .find(|asset| asset.name == asset_name)
        .ok_or_else(|| format!("Asset not found for script: {}", script.name))?;
    let bytes = download_release_asset(token, asset.id)?;
    let actual_sha = sha256_hex(&bytes);
    if !actual_sha.eq_ignore_ascii_case(&script.sha256) {
        return Err(format!("Integrity check failed for {}", script.name));
    }

    let db_path = app_dir().join("donu_scheduler.sqlite");
    let pending_path = pending_script_path(&script.id, &script.version, &asset_name);
    let parent = pending_path
        .parent()
        .ok_or_else(|| "Invalid pending path".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    fs::write(&pending_path, bytes).map_err(|e| e.to_string())?;

    let conn = open_db(&db_path).map_err(|e| e.to_string())?;
    let script_db_id: String = conn
        .query_row(
            "SELECT script_db_id FROM script_store_installs WHERE store_script_id = ?1",
            params![script.id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE script_store_installs SET pending_path=?1, pending_version=?2, pending_sha256=?3, pending_source_tag=?4, pending_asset_name=?5, updated_at=?6 WHERE store_script_id=?7",
        params![pending_path.to_string_lossy().to_string(), script.version, script.sha256, release.tag_name, asset.name, now_iso(), script.id],
    ).map_err(|e| e.to_string())?;

    let _ = script_db_id;

    Ok(ScriptStoreInstallResult {
        script_id: script.id,
        script_name: script.name,
        version: script.version,
        path: pending_path.to_string_lossy().to_string(),
    })
}

pub fn apply_pending_updates() -> Result<Vec<ScriptStoreUpdateApplied>, String> {
    let db_path = app_dir().join("donu_scheduler.sqlite");
    let conn = open_db(&db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT store_script_id, script_db_id, name, version, sha256, runtime, source_owner, source_repo, source_tag, asset_name, installed_path, pending_path, pending_version, pending_sha256, pending_source_tag, pending_asset_name, installed_at, updated_at FROM script_store_installs WHERE pending_path IS NOT NULL AND pending_version IS NOT NULL")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(ScriptInstallRecord {
                store_script_id: row.get(0)?,
                script_db_id: row.get(1)?,
                name: row.get(2)?,
                version: row.get(3)?,
                sha256: row.get(4)?,
                runtime: row.get(5)?,
                source_owner: row.get(6)?,
                source_repo: row.get(7)?,
                source_tag: row.get(8)?,
                asset_name: row.get(9)?,
                installed_path: row.get(10)?,
                pending_path: row.get(11)?,
                pending_version: row.get(12)?,
                pending_sha256: row.get(13)?,
                pending_source_tag: row.get(14)?,
                pending_asset_name: row.get(15)?,
                installed_at: row.get(16)?,
                updated_at: row.get(17)?,
            })
        })
        .map_err(|e| e.to_string())?;
    let records = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
    drop(stmt);

    let mut applied = Vec::new();
    for record in records {
        let pending_path = record
            .pending_path
            .clone()
            .ok_or_else(|| "Missing pending path".to_string())?;
        if !Path::new(&pending_path).exists() {
            conn.execute(
                "UPDATE script_store_installs SET pending_path=NULL, pending_version=NULL, pending_sha256=NULL, pending_source_tag=NULL, pending_asset_name=NULL, updated_at=?1 WHERE store_script_id=?2",
                params![now_iso(), record.store_script_id],
            ).map_err(|e| e.to_string())?;
            continue;
        }
        let script = ScriptStoreScript {
            id: record.store_script_id.clone(),
            name: record.name.clone(),
            description: String::new(),
            version: record
                .pending_version
                .clone()
                .unwrap_or_else(|| record.version.clone()),
            runtime: record.runtime.clone(),
            entry: record.asset_name.clone(),
            path: pending_path.clone(),
            sha256: record
                .pending_sha256
                .clone()
                .unwrap_or_else(|| record.sha256.clone()),
            min_app_version: String::new(),
            deprecated: false,
            updated_at: now_iso(),
        };
        let _ = script;
        fs::copy(&pending_path, &record.installed_path).map_err(|e| e.to_string())?;
        let default_inputs_json = extract_default_inputs_json(Path::new(&record.installed_path))
            .unwrap_or_else(|_| "[]".to_string());
        let input = ScriptInput {
            name: record.name.clone(),
            description: String::new(),
            script_path: record.installed_path.clone(),
            default_args: String::new(),
            default_inputs_json,
        };
        let _ = crate::scripts::repository::update_script(&db_path, &record.script_db_id, &input)?;
        conn.execute(
            "UPDATE script_store_installs SET version=?1, sha256=?2, source_tag=?3, asset_name=?4, pending_path=NULL, pending_version=NULL, pending_sha256=NULL, pending_source_tag=NULL, pending_asset_name=NULL, updated_at=?5 WHERE store_script_id=?6",
            params![record.pending_version.clone().unwrap_or(record.version.clone()), record.pending_sha256.clone().unwrap_or(record.sha256.clone()), record.pending_source_tag.clone().unwrap_or(record.source_tag.clone()), record.pending_asset_name.clone().unwrap_or(record.asset_name.clone()), now_iso(), record.store_script_id],
        ).map_err(|e| e.to_string())?;
        let _ = fs::remove_file(&pending_path);
        applied.push(ScriptStoreUpdateApplied {
            script_id: record.store_script_id,
            script_name: record.name,
            version: record.pending_version.unwrap_or(record.version),
        });
    }
    Ok(applied)
}

fn upsert_install_record(
    db_path: &PathBuf,
    script: &ScriptStoreScript,
    script_db_id: &str,
    installed_path: &str,
    pending_path: Option<&str>,
    pending_version: Option<&str>,
    pending_sha256: Option<&str>,
    pending_source_tag: Option<&str>,
    asset_name: Option<&str>,
) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "INSERT OR REPLACE INTO script_store_installs (store_script_id, script_db_id, name, version, sha256, runtime, source_owner, source_repo, source_tag, asset_name, installed_path, pending_path, pending_version, pending_sha256, pending_source_tag, pending_asset_name, installed_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18)",
        params![script.id, script_db_id, script.name, script.version, script.sha256, script.runtime, STORE_OWNER, STORE_REPO, pending_source_tag.unwrap_or("latest"), asset_name.unwrap_or(&script.entry), installed_path, pending_path, pending_version, pending_sha256, pending_source_tag, asset_name.unwrap_or(&script.entry), now, now],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_default_inputs_json(path: &Path) -> Result<String, String> {
    let content = fs::read_to_string(path).map_err(|e| e.to_string())?;
    let cleaned = content.trim_start_matches('\u{feff}');
    let root: serde_json::Value = serde_json::from_str(cleaned).map_err(|e| e.to_string())?;
    let mut inputs = Vec::<serde_json::Value>::new();

    fn collect(nodes: &[serde_json::Value], results: &mut Vec<serde_json::Value>) {
        for node in nodes {
            if let Some(obj) = node.as_object() {
                if obj.get("type").and_then(|v| v.as_i64()) == Some(1) {
                    if let Some(raw_input) = obj.get("raw_input").and_then(|v| v.as_str()) {
                        if let Ok(raw) = serde_json::from_str::<Vec<serde_json::Value>>(raw_input) {
                            let allow = raw.iter().any(|item| {
                                item.get("Key").and_then(|v| v.as_str()) == Some("ALLOW_USER_INPUT")
                                    && item.get("Value").and_then(|v| v.as_str()) == Some("True")
                            });
                            if allow {
                                let get_val = |key: &str| {
                                    raw.iter()
                                        .find(|item| {
                                            item.get("Key").and_then(|v| v.as_str()) == Some(key)
                                        })
                                        .and_then(|item| item.get("Value"))
                                        .cloned()
                                        .unwrap_or(serde_json::Value::String(String::new()))
                                };
                                results.push(serde_json::json!({
                                    "name": obj.get("output_variable_name").and_then(|v| v.as_str()).unwrap_or(""),
                                    "comment": obj.get("comment").and_then(|v| v.as_str()).unwrap_or(""),
                                    "value": get_val("VALUE").as_str().unwrap_or(""),
                                    "inputType": get_val("USER_INPUT_TYPE").as_str().unwrap_or("Text"),
                                    "comboboxData": get_val("COMBOBOX_DATA").as_str().unwrap_or(""),
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
        serde_json::Value::Array(nodes) => collect(&nodes, &mut inputs),
        serde_json::Value::Object(obj) => {
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
