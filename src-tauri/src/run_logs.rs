use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const LOG_RETENTION_HOURS: i64 = 24;
const MAX_LOG_LINES: usize = 500;

pub fn prepare_log_path(
    script_path: &str,
    profile_id: &str,
    run_id: &str,
    started_at: &str,
) -> Result<String, String> {
    cleanup_old_logs().ok();

    let logs_dir = get_logs_dir();
    fs::create_dir_all(&logs_dir).map_err(|e| format!("Failed to create logs dir: {e}"))?;

    let script_name = Path::new(script_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("script");
    let started_tag = started_at.replace([':', '-', 'T'], "").replace(' ', "_");
    let file_name = format!(
        "{}_profile-{}_script-{}_run-{}.txt",
        started_tag,
        sanitize(profile_id),
        sanitize(script_name),
        sanitize(run_id)
    );

    Ok(logs_dir.join(file_name).to_string_lossy().to_string())
}

pub fn cleanup_old_logs() -> Result<(), String> {
    let logs_dir = get_logs_dir();
    if !logs_dir.exists() {
        return Ok(());
    }

    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs((LOG_RETENTION_HOURS * 3600) as u64))
        .ok_or_else(|| "Failed to compute log retention cutoff".to_string())?;

    let entries = fs::read_dir(&logs_dir).map_err(|e| format!("Failed to read logs dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("txt") {
            continue;
        }

        let should_delete = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .map(|modified| modified < cutoff)
            .unwrap_or(false);

        if should_delete {
            let _ = fs::remove_file(path);
        }
    }

    Ok(())
}

pub fn write_log_file(
    log_path: &str,
    header: &[String],
    lines: &[String],
    footer: Option<String>,
) -> Result<(), String> {
    let path = Path::new(log_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create log parent dir: {e}"))?;
    }

    let mut file = fs::File::create(path).map_err(|e| format!("Failed to write log file: {e}"))?;
    for line in header {
        writeln!(file, "{line}").map_err(|e| format!("Failed to write log file: {e}"))?;
    }
    for line in lines.iter().rev().take(MAX_LOG_LINES).collect::<Vec<_>>().into_iter().rev() {
        writeln!(file, "{line}").map_err(|e| format!("Failed to write log file: {e}"))?;
    }
    if let Some(footer) = footer {
        writeln!(file, "{footer}").map_err(|e| format!("Failed to write log file: {e}"))?;
    }
    Ok(())
}

pub fn append_spawn_error(log_path: &str, message: &str) {
    let _ = fs::write(log_path, message);
}

fn get_logs_dir() -> PathBuf {
    dirs::cache_dir()
        .unwrap_or_else(|| dirs::data_local_dir().unwrap_or_else(|| PathBuf::from(".")))
        .join("DonuScheduler")
        .join("temp")
        .join("logs")
}

fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            ' ' => '_',
            _ => c,
        })
        .collect()
}
