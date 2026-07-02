use crate::db::AppState;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

const RELEASE_API_URL: &str = "https://api.github.com/repos/chiconghvan/donumate/releases/latest";
const RUNTIME_EXE_NAME: &str = "donumate.exe";
const METADATA_FILE_NAME: &str = "runtime.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuntimeMetadata {
    pub version: String,
    pub asset_name: String,
    pub downloaded_at: String,
    pub pending_version: Option<String>,
    pub pending_asset_name: Option<String>,
    pub pending_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeDownloadStartedPayload {
    pub version: String,
    pub asset_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeUpdateAvailablePayload {
    pub current_version: String,
    pub latest_version: String,
    pub asset_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeUpdateSuccessPayload {
    pub version: String,
    pub asset_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeUpdateErrorPayload {
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Clone)]
struct RuntimeReleaseAsset {
    version: String,
    asset_name: String,
    download_url: String,
}

pub fn runtime_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("DonuScheduler").join("runtime")
}

pub fn runtime_exe_path() -> PathBuf {
    runtime_dir().join(RUNTIME_EXE_NAME)
}

pub fn runtime_exe_path_string() -> String {
    runtime_exe_path().to_string_lossy().to_string()
}

pub fn spawn_runtime_manager(
    app_handle: tauri::AppHandle,
    process_registry: Arc<Mutex<HashMap<String, u32>>>,
) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        if let Err(e) = ensure_runtime_on_startup(app_handle.clone(), Arc::clone(&process_registry)).await {
            let _ = app_handle.emit("runtime-update-error", RuntimeUpdateErrorPayload { message: e });
        }

        let mut last_release_check = std::time::Instant::now();
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(20)).await;
            if let Err(e) = apply_pending_update_if_possible(app_handle.clone(), Arc::clone(&process_registry)).await {
                let _ = app_handle.emit("runtime-update-error", RuntimeUpdateErrorPayload { message: e });
            }
            if last_release_check.elapsed() >= std::time::Duration::from_secs(2 * 60 * 60) {
                last_release_check = std::time::Instant::now();
                if let Err(e) = check_runtime_update(app_handle.clone(), Arc::clone(&process_registry), true).await {
                    let _ = app_handle.emit("runtime-update-error", RuntimeUpdateErrorPayload { message: e });
                }
            }
        }
    });
}

#[tauri::command]
pub async fn update_runtime(
    state: tauri::State<'_, Arc<AppState>>,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let asset = fetch_latest_runtime_asset().await?;
    install_runtime_asset(app_handle, Arc::clone(&state.process_registry), &asset, false).await
}

async fn ensure_runtime_on_startup(
    app_handle: tauri::AppHandle,
    process_registry: Arc<Mutex<HashMap<String, u32>>>,
) -> Result<(), String> {
    std::fs::create_dir_all(runtime_dir()).map_err(|e| e.to_string())?;
    apply_pending_update_if_possible(app_handle.clone(), Arc::clone(&process_registry)).await?;

    if !runtime_exe_path().exists() {
        let asset = fetch_latest_runtime_asset().await?;
        let _ = app_handle.emit(
            "runtime-download-started",
            RuntimeDownloadStartedPayload {
                version: asset.version.clone(),
                asset_name: asset.asset_name.clone(),
            },
        );
        install_runtime_asset(app_handle, process_registry, &asset, true).await?;
        return Ok(());
    }

    check_runtime_update(app_handle, process_registry, true).await
}

async fn check_runtime_update(
    app_handle: tauri::AppHandle,
    process_registry: Arc<Mutex<HashMap<String, u32>>>,
    notify_available: bool,
) -> Result<(), String> {
    apply_pending_update_if_possible(app_handle.clone(), Arc::clone(&process_registry)).await?;

    let asset = fetch_latest_runtime_asset().await?;
    let metadata = read_metadata().unwrap_or_default();
    if metadata.version.is_empty() || compare_versions(&asset.version, &metadata.version) == Ordering::Greater {
        if notify_available {
            let _ = app_handle.emit(
                "runtime-update-available",
                RuntimeUpdateAvailablePayload {
                    current_version: metadata.version,
                    latest_version: asset.version,
                    asset_name: asset.asset_name,
                },
            );
        }
    }

    Ok(())
}

async fn install_runtime_asset(
    app_handle: tauri::AppHandle,
    process_registry: Arc<Mutex<HashMap<String, u32>>>,
    asset: &RuntimeReleaseAsset,
    initial_install: bool,
) -> Result<(), String> {
    std::fs::create_dir_all(runtime_dir()).map_err(|e| e.to_string())?;

    if !initial_install && is_runtime_running(&process_registry) {
        let cache_path = runtime_dir().join(&asset.asset_name);
        download_file(&asset.download_url, &cache_path).await?;
        let mut metadata = read_metadata().unwrap_or_default();
        metadata.pending_version = Some(asset.version.clone());
        metadata.pending_asset_name = Some(asset.asset_name.clone());
        metadata.pending_path = Some(cache_path.to_string_lossy().to_string());
        write_metadata(&metadata)?;
        return Ok(());
    }

    let exe_path = runtime_exe_path();
    download_file(&asset.download_url, &exe_path).await?;
    write_metadata(&RuntimeMetadata {
        version: asset.version.clone(),
        asset_name: asset.asset_name.clone(),
        downloaded_at: crate::models::now_iso(),
        pending_version: None,
        pending_asset_name: None,
        pending_path: None,
    })?;
    if !initial_install {
        emit_update_success(app_handle, asset.version.clone(), asset.asset_name.clone()).await;
    }
    Ok(())
}

async fn apply_pending_update_if_possible(
    app_handle: tauri::AppHandle,
    process_registry: Arc<Mutex<HashMap<String, u32>>>,
) -> Result<(), String> {
    if is_runtime_running(&process_registry) {
        return Ok(());
    }

    let mut metadata = match read_metadata() {
        Ok(value) => value,
        Err(_) => return Ok(()),
    };
    let Some(pending_path) = metadata.pending_path.clone() else {
        return Ok(());
    };

    let pending = PathBuf::from(pending_path);
    if !pending.exists() {
        metadata.pending_version = None;
        metadata.pending_asset_name = None;
        metadata.pending_path = None;
        write_metadata(&metadata)?;
        return Ok(());
    }

    let target = runtime_exe_path();
    if target.exists() {
        std::fs::remove_file(&target).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&pending, &target).map_err(|e| e.to_string())?;

    let version = metadata.pending_version.clone().unwrap_or_default();
    let asset_name = metadata.pending_asset_name.clone().unwrap_or_default();
    metadata.version = version.clone();
    metadata.asset_name = asset_name.clone();
    metadata.downloaded_at = crate::models::now_iso();
    metadata.pending_version = None;
    metadata.pending_asset_name = None;
    metadata.pending_path = None;
    write_metadata(&metadata)?;
    emit_update_success(app_handle, version, asset_name).await;
    Ok(())
}

async fn fetch_latest_runtime_asset() -> Result<RuntimeReleaseAsset, String> {
    let release = reqwest::Client::new()
        .get(RELEASE_API_URL)
        .header(reqwest::header::USER_AGENT, "DonuScheduler")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<GithubRelease>()
        .await
        .map_err(|e| e.to_string())?;

    release
        .assets
        .into_iter()
        .filter_map(|asset| parse_runtime_version(&asset.name).map(|version| (asset, version)))
        .max_by(|(_, a), (_, b)| compare_versions(a, b))
        .map(|(asset, version)| RuntimeReleaseAsset {
            version,
            asset_name: asset.name,
            download_url: asset.browser_download_url,
        })
        .ok_or_else(|| "No donumate_v<version>.exe asset found in latest release".to_string())
}

async fn download_file(url: &str, target_path: &Path) -> Result<(), String> {
    let temp_path = target_path.with_extension("download");
    if temp_path.exists() {
        std::fs::remove_file(&temp_path).map_err(|e| e.to_string())?;
    }

    let bytes = reqwest::Client::new()
        .get(url)
        .header(reqwest::header::USER_AGENT, "DonuScheduler")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    tokio::fs::write(&temp_path, bytes).await.map_err(|e| e.to_string())?;
    if target_path.exists() {
        std::fs::remove_file(target_path).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&temp_path, target_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn metadata_path() -> PathBuf {
    runtime_dir().join(METADATA_FILE_NAME)
}

fn read_metadata() -> Result<RuntimeMetadata, String> {
    let content = std::fs::read_to_string(metadata_path()).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

fn write_metadata(metadata: &RuntimeMetadata) -> Result<(), String> {
    std::fs::create_dir_all(runtime_dir()).map_err(|e| e.to_string())?;
    let content = serde_json::to_string_pretty(metadata).map_err(|e| e.to_string())?;
    std::fs::write(metadata_path(), content).map_err(|e| e.to_string())
}

fn parse_runtime_version(asset_name: &str) -> Option<String> {
    let version = asset_name.strip_prefix("donumate_v")?.strip_suffix(".exe")?;
    if version.split('.').all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit())) {
        Some(version.to_string())
    } else {
        None
    }
}

fn compare_versions(a: &str, b: &str) -> Ordering {
    let a_parts: Vec<u64> = a.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    let b_parts: Vec<u64> = b.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    let len = a_parts.len().max(b_parts.len());
    for i in 0..len {
        let a_part = *a_parts.get(i).unwrap_or(&0);
        let b_part = *b_parts.get(i).unwrap_or(&0);
        match a_part.cmp(&b_part) {
            Ordering::Equal => continue,
            ordering => return ordering,
        }
    }
    Ordering::Equal
}

fn is_runtime_running(process_registry: &Arc<Mutex<HashMap<String, u32>>>) -> bool {
    if let Ok(registry) = process_registry.lock() {
        if registry.values().any(|pid| crate::runner::is_process_alive(*pid)) {
            return true;
        }
    }

    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq donumate.exe", "/NH"])
            .output();
        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
            return stdout.contains("donumate.exe");
        }
    }

    false
}

async fn emit_update_success(app_handle: tauri::AppHandle, version: String, asset_name: String) {
    let payload = RuntimeUpdateSuccessPayload { version, asset_name };
    let _ = app_handle.emit("runtime-update-success", payload);

    if !has_visible_window(&app_handle) {
        #[allow(unused_imports)]
        use tauri_plugin_notification::NotificationExt;
        let _ = app_handle
            .notification()
            .builder()
            .title("DonuScheduler")
            .body("DonuScheduler đã update runtime thành công")
            .show();
    }
}

fn has_visible_window(app_handle: &tauri::AppHandle) -> bool {
    app_handle.webview_windows().values().any(|window| {
        window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
    })
}
