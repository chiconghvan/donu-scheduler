use crate::db::AppState;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

const RELEASES_API_URL: &str = "https://api.github.com/repos/chiconghvan/donu-scheduler/releases?per_page=100";
const UPDATE_DIR_NAME: &str = "updates";
const PENDING_INSTALLER_PATH_KEY: &str = "pending_installer_path";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub release_url: String,
    pub asset_name: String,
    pub download_url: String,
    pub release_notes: String,
    pub published_at: String,
    pub manual_update_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdatePrepareResult {
    pub latest_version: String,
    pub asset_name: String,
    pub installer_path: String,
    pub manual_update_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateAvailablePayload {
    pub current_version: String,
    pub latest_version: String,
    pub asset_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateDownloadStartedPayload {
    pub latest_version: String,
    pub asset_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateDownloadProgressPayload {
    pub latest_version: String,
    pub asset_name: String,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateReadyPayload {
    pub latest_version: String,
    pub asset_name: String,
    pub installer_path: String,
    pub manual_update_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppUpdateErrorPayload {
    pub message: String,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    draft: bool,
    prerelease: bool,
    body: Option<String>,
    published_at: Option<String>,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[tauri::command]
pub fn get_app_version() -> Result<String, String> {
    Ok(current_version())
}

#[tauri::command]
pub async fn check_for_app_updates(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Option<AppUpdateInfo>, String> {
    if app_updates_disabled(&state)? {
        return Ok(None);
    }

    check_latest_app_update().await
}

#[tauri::command]
pub async fn check_for_app_updates_manual() -> Result<Option<AppUpdateInfo>, String> {
    check_latest_app_update().await
}

#[tauri::command]
pub async fn download_and_prepare_app_update(
    app_handle: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    update: AppUpdateInfo,
) -> Result<AppUpdatePrepareResult, String> {
    let update_dir = app_update_dir();
    std::fs::create_dir_all(&update_dir).map_err(|e| e.to_string())?;
    let installer_path = update_dir.join(&update.asset_name);

    let _ = app_handle.emit(
        "app-update-download-started",
        AppUpdateDownloadStartedPayload {
            latest_version: update.latest_version.clone(),
            asset_name: update.asset_name.clone(),
        },
    );

    download_update_file(&app_handle, &update, &installer_path).await?;
    save_pending_installer_path(&state, &installer_path)?;

    let result = AppUpdatePrepareResult {
        latest_version: update.latest_version.clone(),
        asset_name: update.asset_name.clone(),
        installer_path: installer_path.to_string_lossy().to_string(),
        manual_update_required: update.manual_update_required,
    };

    let _ = app_handle.emit(
        "app-update-ready",
        AppUpdateReadyPayload {
            latest_version: result.latest_version.clone(),
            asset_name: result.asset_name.clone(),
            installer_path: result.installer_path.clone(),
            manual_update_required: result.manual_update_required,
        },
    );

    Ok(result)
}

#[tauri::command]
pub fn restart_application(
    app_handle: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    installer_path: Option<String>,
) -> Result<(), String> {
    let pending_path = match installer_path.filter(|path| !path.trim().is_empty()) {
        Some(path) => Some(path),
        None => load_pending_installer_path(&state)?,
    };

    if let Some(path) = pending_path {
        spawn_silent_update_script(PathBuf::from(path))?;
    }
    app_handle.exit(0);
    Ok(())
}

pub fn spawn_app_update_check(app_handle: AppHandle, state: Arc<AppState>) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
        match is_app_update_disabled(&state) {
            Ok(true) => return,
            Ok(false) => {}
            Err(e) => {
                let _ = app_handle.emit("app-update-error", AppUpdateErrorPayload { message: e });
                return;
            }
        }

        match check_latest_app_update().await {
            Ok(Some(update)) => {
                let _ = app_handle.emit(
                    "app-update-available",
                    AppUpdateAvailablePayload {
                        current_version: update.current_version,
                        latest_version: update.latest_version,
                        asset_name: update.asset_name,
                    },
                );
            }
            Ok(None) => {}
            Err(e) => {
                let _ = app_handle.emit("app-update-error", AppUpdateErrorPayload { message: e });
            }
        }
    });
}

async fn check_latest_app_update() -> Result<Option<AppUpdateInfo>, String> {
    let current = current_version();
    if current.starts_with("dev-") {
        return Ok(None);
    }
    if parse_stable_version(&current).is_none() {
        return Ok(None);
    }

    let releases = reqwest::Client::new()
        .get(RELEASES_API_URL)
        .header(reqwest::header::USER_AGENT, "DonuScheduler")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json::<Vec<GithubRelease>>()
        .await
        .map_err(|e| e.to_string())?;

    let latest = releases
        .into_iter()
        .filter(|release| !release.draft && !release.prerelease && parse_stable_version(&release.tag_name).is_some())
        .max_by(|a, b| compare_versions(&stable_part(&a.tag_name), &stable_part(&b.tag_name)))
        .ok_or_else(|| "No stable DonuScheduler release found".to_string())?;

    if compare_versions(&stable_part(&latest.tag_name), &stable_part(&current)) != Ordering::Greater {
        return Ok(None);
    }

    let asset = select_windows_asset(&latest.assets)
        .ok_or_else(|| format!("No Windows installer asset found for {}", latest.tag_name))?;
    let asset_name = asset.name.to_ascii_lowercase();
    let manual_update_required = !asset_name.ends_with(".exe") && !asset_name.ends_with(".msi");

    Ok(Some(AppUpdateInfo {
        current_version: current,
        latest_version: latest.tag_name,
        release_url: latest.html_url,
        asset_name: asset.name,
        download_url: asset.browser_download_url,
        release_notes: latest.body.unwrap_or_default(),
        published_at: latest.published_at.unwrap_or_default(),
        manual_update_required,
    }))
}

async fn download_update_file(
    app_handle: &AppHandle,
    update: &AppUpdateInfo,
    target_path: &Path,
) -> Result<(), String> {
    let temp_path = target_path.with_extension("download");
    if temp_path.exists() {
        std::fs::remove_file(&temp_path).map_err(|e| e.to_string())?;
    }

    let mut response = reqwest::Client::new()
        .get(&update.download_url)
        .header(reqwest::header::USER_AGENT, "DonuScheduler")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;

    let total_bytes = response.content_length();
    let mut downloaded_bytes = 0_u64;
    let mut file = tokio::fs::File::create(&temp_path).await.map_err(|e| e.to_string())?;
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|e| e.to_string())?;
        downloaded_bytes += chunk.len() as u64;
        let _ = app_handle.emit(
            "app-update-download-progress",
            AppUpdateDownloadProgressPayload {
                latest_version: update.latest_version.clone(),
                asset_name: update.asset_name.clone(),
                downloaded_bytes,
                total_bytes,
            },
        );
    }
    tokio::io::AsyncWriteExt::flush(&mut file).await.map_err(|e| e.to_string())?;

    if target_path.exists() {
        std::fs::remove_file(target_path).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&temp_path, target_path).map_err(|e| e.to_string())?;
    Ok(())
}

fn current_version() -> String {
    env!("BUILD_VERSION").to_string()
}

fn app_update_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("DonuScheduler").join(UPDATE_DIR_NAME)
}

fn save_pending_installer_path(
    state: &tauri::State<'_, Arc<AppState>>,
    installer_path: &Path,
) -> Result<(), String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    crate::db::set_setting(
        &conn,
        PENDING_INSTALLER_PATH_KEY,
        &installer_path.to_string_lossy(),
    )
    .map_err(|e| e.to_string())
}

fn load_pending_installer_path(state: &tauri::State<'_, Arc<AppState>>) -> Result<Option<String>, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    Ok(crate::db::get_setting(&conn, PENDING_INSTALLER_PATH_KEY)
        .ok()
        .filter(|path| !path.trim().is_empty()))
}

fn spawn_silent_update_script(installer_path: PathBuf) -> Result<(), String> {
    if !installer_path.exists() {
        return Err(format!("Pending installer not found: {}", installer_path.display()));
    }

    let app_exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let pid = std::process::id();
    let script_path = app_update_dir().join("install_pending_update.cmd");
    let log_path = app_update_dir().join("install_pending_update.log");
    let installer_args = silent_installer_args(&installer_path)?;
    let content = format!(
        "@echo off\r\n\
setlocal\r\n\
set \"APP_PID={}\"\r\n\
set \"INSTALLER={}\"\r\n\
set \"APP_EXE={}\"\r\n\
set \"LOG_PATH={}\"\r\n\
:wait_app\r\n\
tasklist /fi \"PID eq %APP_PID%\" | findstr /r /c:\"[ ]%APP_PID%[ ]\" >nul\r\n\
if not errorlevel 1 (\r\n\
  timeout /t 1 /nobreak >nul\r\n\
  goto wait_app\r\n\
)\r\n\
echo [%date% %time%] Running installer: \"%INSTALLER%\" {} > \"%LOG_PATH%\"\r\n\
\"%INSTALLER%\" {} >> \"%LOG_PATH%\" 2>&1\r\n\
set \"INSTALL_EXIT=%ERRORLEVEL%\"\r\n\
echo [%date% %time%] Installer exit code: %INSTALL_EXIT% >> \"%LOG_PATH%\"\r\n\
start \"\" \"%APP_EXE%\"\r\n\
exit /b %INSTALL_EXIT%\r\n\
endlocal\r\n",
        pid,
        batch_escape(&installer_path.to_string_lossy()),
        batch_escape(&app_exe.to_string_lossy()),
        batch_escape(&log_path.to_string_lossy()),
        installer_args,
        installer_args,
    );
    std::fs::write(&script_path, content).map_err(|e| e.to_string())?;

    std::process::Command::new("cmd")
        .args(["/C", "start", "", &script_path.to_string_lossy()])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn silent_installer_args(installer_path: &Path) -> Result<&'static str, String> {
    match installer_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("exe") => Ok("/s /update"),
        Some("msi") => Ok("/quiet"),
        _ => Err(format!(
            "Unsupported update installer type: {}",
            installer_path.display()
        )),
    }
}

fn batch_escape(value: &str) -> String {
    value.replace('%', "%%")
}

fn app_updates_disabled(state: &tauri::State<'_, Arc<AppState>>) -> Result<bool, String> {
    is_app_update_disabled(state.inner())
}

fn is_app_update_disabled(state: &Arc<AppState>) -> Result<bool, String> {
    let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
    let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
    Ok(crate::db::get_setting(&conn, "disable_auto_updates")
        .unwrap_or_else(|_| "false".to_string())
        == "true")
}

fn select_windows_asset(assets: &[GithubAsset]) -> Option<GithubAsset> {
    let mut candidates = assets.iter().filter(|asset| {
        let name = asset.name.to_ascii_lowercase();
        name.contains("windows") || name.contains("win") || name.contains("x64") || name.contains("setup")
    });

    candidates
        .clone()
        .find(|asset| {
            let name = asset.name.to_ascii_lowercase();
            name.ends_with(".exe") && name.contains("setup") && name.contains("x64")
        })
        .or_else(|| {
            candidates.clone().find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.ends_with(".exe") && name.contains("setup")
            })
        })
        .or_else(|| {
            candidates.clone().find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.ends_with(".msi") && name.contains("x64")
            })
        })
        .or_else(|| {
            candidates.clone().find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.ends_with(".msi")
            })
        })
        .or_else(|| {
            candidates.find(|asset| {
                let name = asset.name.to_ascii_lowercase();
                name.ends_with(".zip") && name.contains("portable") && name.contains("x64")
            })
        })
        .cloned()
}

fn parse_stable_version(version: &str) -> Option<Vec<u64>> {
    let trimmed = version.strip_prefix('v').unwrap_or(version);
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() != 3 {
        return None;
    }
    let parsed: Option<Vec<u64>> = parts
        .into_iter()
        .map(|part| {
            if part.is_empty() || !part.chars().all(|c| c.is_ascii_digit()) {
                None
            } else {
                part.parse::<u64>().ok()
            }
        })
        .collect();
    parsed
}

fn stable_part(version: &str) -> String {
    version.strip_prefix('v').unwrap_or(version).to_string()
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
