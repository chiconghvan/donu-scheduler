use serde::Serialize;
use std::sync::{Arc, Mutex};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tauri::Emitter;

static LAST_RUNTIME_SPAWN_AT: OnceLock<tokio::sync::Mutex<Option<Instant>>> = OnceLock::new();

#[derive(Clone, Serialize)]
pub struct LogEventPayload {
    pub run_id: String,
    pub seq: u64,
    pub ts: String,
    pub line: String,
    pub source: String,
}

pub struct RunnerRequest {
    pub script_path: String,
    pub profile_id: String,
    pub cli_args: String,
    pub runtime_path: String,
    pub log_path: Option<String>,
    pub manager: String,
    pub api_url: String,
}

pub struct RunnerOutcome {
    pub success: bool,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
    pub log_path: Option<String>,
}

pub struct SpawnedProcess {
    pub child: tokio::process::Child,
    pub pid: Option<u32>,
    pub log_prefix: String,
    pub log_path: Option<String>,
}

pub async fn spawn_runtime_queued(request: &RunnerRequest) -> Result<SpawnedProcess, RunnerOutcome> {
    let gate = LAST_RUNTIME_SPAWN_AT.get_or_init(|| tokio::sync::Mutex::new(None));
    let mut last_spawn_at = gate.lock().await;

    if let Some(last) = *last_spawn_at {
        let delay = Duration::from_millis(1000 + rand::random::<u64>() % 1000);
        let elapsed = last.elapsed();
        if elapsed < delay {
            tokio::time::sleep(delay - elapsed).await;
        }
    }

    let result = spawn_runtime(request);
    *last_spawn_at = Some(Instant::now());
    result
}

pub fn spawn_runtime(request: &RunnerRequest) -> Result<SpawnedProcess, RunnerOutcome> {
    let runtime_path = std::path::PathBuf::from(&request.runtime_path);

    if !runtime_path.exists() {
        if let Some(log_path) = request.log_path.as_deref() {
            crate::run_logs::append_spawn_error(
                log_path,
                &format!("[runner] Runtime not found: {}\n", request.runtime_path),
            );
        }
        return Err(RunnerOutcome {
            success: false,
            exit_code: None,
            error_message: Some(format!("Runtime not found: {}", request.runtime_path)),
            log_path: request.log_path.clone(),
        });
    }

    let mut args: Vec<String> = Vec::new();

    args.push("--script".to_string());
    args.push(request.script_path.clone());

    args.push("--manager".to_string());
    args.push(request.manager.clone());

    args.push("--api".to_string());
    args.push(request.api_url.clone());

    args.push("--profile".to_string());
    args.push(request.profile_id.clone());

    for arg in request.cli_args.split_whitespace() {
        args.push(arg.to_string());
    }

    let log_prefix = format!(
        "[runner] Spawning: {} {}\n",
        request.runtime_path,
        args.join(" ")
    );

    let child = match Command::new(&request.runtime_path)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            if let Some(log_path) = request.log_path.as_deref() {
                crate::run_logs::append_spawn_error(
                    log_path,
                    &format!("[runner] Spawn error: {e}\n"),
                );
            }
            return Err(RunnerOutcome {
                success: false,
                exit_code: None,
                error_message: Some(format!("Failed to spawn runtime: {e}")),
                log_path: request.log_path.clone(),
            });
        }
    };

    let pid = child.id();

    Ok(SpawnedProcess {
        child,
        pid,
        log_prefix,
        log_path: request.log_path.clone(),
    })
}

pub async fn wait_runtime(
    spawned: SpawnedProcess,
    run_id: String,
    app_handle: tauri::AppHandle,
    log_registry: Arc<Mutex<crate::run_logs::LogRegistry>>,
) -> RunnerOutcome {
    let mut child = spawned.child;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let log_path = spawned.log_path.clone();
    let _ = crate::run_logs::init_live_run(&log_registry, &run_id, log_path.clone());

    emit_log_entry(
        &app_handle,
        &log_registry,
        &run_id,
        "runner",
        spawned.log_prefix.trim_end(),
        log_path.as_deref(),
    );

    let run_id_clone = run_id.clone();
    let app_clone = app_handle.clone();
    let log_registry_clone = Arc::clone(&log_registry);
    let log_path_clone = log_path.clone();
    let stdout_task = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_log_entry(
                    &app_clone,
                    &log_registry_clone,
                    &run_id_clone,
                    "stdout",
                    &line,
                    log_path_clone.as_deref(),
                );
            }
        }
    });

    let run_id_clone2 = run_id.clone();
    let app_clone2 = app_handle.clone();
    let log_registry_clone2 = Arc::clone(&log_registry);
    let log_path_clone2 = log_path.clone();

    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_log_entry(
                    &app_clone2,
                    &log_registry_clone2,
                    &run_id_clone2,
                    "stderr",
                    &line,
                    log_path_clone2.as_deref(),
                );
            }
        }
    });

    let result = child.wait().await;
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    match result {
        Ok(status) => {
            let exit_code = status.code();
            let success = status.success();
            emit_log_entry(
                &app_handle,
                &log_registry,
                &run_id,
                "runner",
                &format!("Process exited with code: {exit_code:?}"),
                log_path.as_deref(),
            );

            RunnerOutcome {
                success,
                exit_code,
                error_message: if !success {
                    Some(format!("Process exited with code: {exit_code:?}"))
                } else {
                    None
                },
                log_path,
            }
        }
        Err(e) => {
            emit_log_entry(
                &app_handle,
                &log_registry,
                &run_id,
                "runner",
                &format!("Failed to run runtime: {e}"),
                log_path.as_deref(),
            );
            RunnerOutcome {
                success: false,
                exit_code: None,
                error_message: Some(format!("Failed to run runtime: {e}")),
                log_path,
            }
        }
    }
}

fn emit_log_entry(
    app_handle: &tauri::AppHandle,
    log_registry: &Arc<Mutex<crate::run_logs::LogRegistry>>,
    run_id: &str,
    source: &str,
    line: &str,
    log_path: Option<&str>,
) {
    if let Ok(entry) = crate::run_logs::append_live_entry(
        log_registry,
        run_id,
        source,
        line,
        log_path,
    ) {
        let _ = app_handle.emit(
            "log-stream",
            LogEventPayload {
                run_id: entry.run_id,
                seq: entry.seq,
                ts: entry.ts,
                line: entry.line,
                source: entry.source,
            },
        );
    }
}

pub fn is_process_alive(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        const CREATE_NO_WINDOW: u32 = 0x08000000;

        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                stdout.contains(&pid.to_string())
            }
            Err(_) => false,
        }
    }
    #[cfg(target_os = "linux")]
    {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(target_os = "macos")]
    {
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        false
    }
}
