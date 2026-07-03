use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

pub const MAX_LOG_LINES: usize = 2000;

#[derive(Clone, Serialize)]
pub struct LogEntry {
    pub run_id: String,
    pub seq: u64,
    pub ts: String,
    pub source: String,
    pub line: String,
}

#[derive(Default)]
pub struct LogRegistry {
    runs: HashMap<String, RunLogBuffer>,
}

struct RunLogBuffer {
    next_seq: u64,
    lines: VecDeque<LogEntry>,
    log_path: Option<String>,
}

impl Default for RunLogBuffer {
    fn default() -> Self {
        Self {
            next_seq: 1,
            lines: VecDeque::new(),
            log_path: None,
        }
    }
}

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
    Ok(())
}

pub fn append_spawn_error(log_path: &str, message: &str) {
    if let Some(parent) = Path::new(log_path).parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(log_path, strip_ansi_escape(message));
}

pub fn init_live_run(
    registry: &Arc<Mutex<LogRegistry>>,
    run_id: &str,
    log_path: Option<String>,
) -> Result<(), String> {
    let mut registry = registry.lock().map_err(|e| e.to_string())?;
    let buffer = registry
        .runs
        .entry(run_id.to_string())
        .or_insert_with(RunLogBuffer::default);
    buffer.log_path = log_path;
    Ok(())
}

pub fn append_live_entry(
    registry: &Arc<Mutex<LogRegistry>>,
    run_id: &str,
    source: &str,
    line: &str,
    log_path: Option<&str>,
) -> Result<LogEntry, String> {
    let (entry, effective_log_path) = {
        let mut registry = registry.lock().map_err(|e| e.to_string())?;
        let buffer = registry
            .runs
            .entry(run_id.to_string())
            .or_insert_with(RunLogBuffer::default);
        if let Some(path) = log_path {
            buffer.log_path = Some(path.to_string());
        }

        let entry = LogEntry {
            run_id: run_id.to_string(),
            seq: buffer.next_seq,
            ts: crate::models::now_iso(),
            source: source.to_string(),
            line: strip_ansi_escape(line),
        };
        buffer.next_seq += 1;
        buffer.lines.push_back(entry.clone());
        while buffer.lines.len() > MAX_LOG_LINES {
            buffer.lines.pop_front();
        }
        (entry, buffer.log_path.clone())
    };

    if let Some(path) = effective_log_path {
        append_entry_to_file(&path, &entry)?;
    }

    Ok(entry)
}

pub fn get_live_tail(
    registry: &Arc<Mutex<LogRegistry>>,
    run_id: &str,
    after_seq: Option<u64>,
    max_lines: Option<usize>,
) -> Result<Option<Vec<LogEntry>>, String> {
    let registry = registry.lock().map_err(|e| e.to_string())?;
    let Some(buffer) = registry.runs.get(run_id) else {
        return Ok(None);
    };

    let limit = max_lines.unwrap_or(MAX_LOG_LINES).min(MAX_LOG_LINES);
    let mut entries: Vec<LogEntry> = buffer
        .lines
        .iter()
        .filter(|entry| after_seq.map(|seq| entry.seq > seq).unwrap_or(true))
        .cloned()
        .collect();
    if entries.len() > limit {
        entries = entries[entries.len() - limit..].to_vec();
    }
    Ok(Some(entries))
}

pub fn tail_log_file(
    run_id: &str,
    log_path: &str,
    after_seq: Option<u64>,
    max_lines: Option<usize>,
) -> Result<Vec<LogEntry>, String> {
    let content = fs::read_to_string(log_path)
        .map_err(|e| format!("Failed to read log file {log_path}: {e}"))?;
    let limit = max_lines.unwrap_or(MAX_LOG_LINES).min(MAX_LOG_LINES);
    let mut fallback_seq = 1_u64;
    let mut entries = Vec::new();

    for raw in content.lines() {
        let entry = parse_log_line(run_id, raw, fallback_seq);
        fallback_seq = fallback_seq.max(entry.seq + 1);
        if after_seq.map(|seq| entry.seq > seq).unwrap_or(true) {
            entries.push(entry);
        }
    }

    if entries.len() > limit {
        entries = entries[entries.len() - limit..].to_vec();
    }

    Ok(entries)
}

fn append_entry_to_file(log_path: &str, entry: &LogEntry) -> Result<(), String> {
    let path = Path::new(log_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create log parent dir: {e}"))?;
    }
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("Failed to append log file: {e}"))?;
    writeln!(
        file,
        "[{}] [{:06}] [{}] {}",
        entry.ts, entry.seq, entry.source, entry.line
    )
    .map_err(|e| format!("Failed to append log file: {e}"))?;
    Ok(())
}

fn parse_log_line(run_id: &str, raw: &str, fallback_seq: u64) -> LogEntry {
    if let Some(rest) = raw.strip_prefix('[') {
        if let Some((ts, rest)) = rest.split_once("] [") {
            if let Some((seq_text, rest)) = rest.split_once("] [") {
                if let Some((source, line)) = rest.split_once("] ") {
                    if let Ok(seq) = seq_text.parse::<u64>() {
                        return LogEntry {
                            run_id: run_id.to_string(),
                            seq,
                            ts: ts.to_string(),
                            source: source.to_string(),
                            line: strip_ansi_escape(line),
                        };
                    }
                }
            }
        }
    }

    LogEntry {
        run_id: run_id.to_string(),
        seq: fallback_seq,
        ts: String::new(),
        source: "raw".to_string(),
        line: strip_ansi_escape(raw),
    }
}

fn strip_ansi_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '\u{1b}' {
            if matches!(chars.peek(), Some('[')) {
                let _ = chars.next();
                while let Some(&next) = chars.peek() {
                    if next.is_ascii_alphabetic() {
                        let _ = chars.next();
                        break;
                    }
                    let _ = chars.next();
                }
                continue;
            }
            continue;
        }
        out.push(ch);
    }

    out
}

fn get_logs_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("DonuScheduler")
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
