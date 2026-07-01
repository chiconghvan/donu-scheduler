use serde::Serialize;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tauri::Emitter;

#[derive(Clone, Serialize)]
pub struct LogEventPayload {
    pub run_id: String,
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
) -> RunnerOutcome {
    let mut child = spawned.child;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let run_id_clone = run_id.clone();
    let app_clone = app_handle.clone();
    let log_lines: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let stdout_lines = Arc::clone(&log_lines);
    let stderr_lines = Arc::clone(&log_lines);

    let stdout_task = tokio::spawn(async move {
        if let Some(stdout) = stdout {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut buf) = stdout_lines.lock() {
                    buf.push(format!("[stdout] {line}"));
                }
                let _ = app_clone.emit(
                    "log-stream",
                    LogEventPayload {
                        run_id: run_id_clone.clone(),
                        line,
                        source: "stdout".to_string(),
                    },
                );
            }
        }
    });

    let run_id_clone2 = run_id.clone();
    let app_clone2 = app_handle.clone();

    // Spawn stderr reader
    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                if let Ok(mut buf) = stderr_lines.lock() {
                    buf.push(format!("[stderr] {line}"));
                }
                let _ = app_clone2.emit(
                    "log-stream",
                    LogEventPayload {
                        run_id: run_id_clone2.clone(),
                        line,
                        source: "stderr".to_string(),
                    },
                );
            }
        }
    });

    // Wait for both readers to finish
    let _ = stdout_task.await;
    let _ = stderr_task.await;

    // Wait for process to exit
    let result = child.wait().await;

    match result {
        Ok(status) => {
            let exit_code = status.code();
            let success = status.success();

            if let Some(log_path) = spawned.log_path.as_deref() {
                let header = vec![
                    format!("[runner] Run id: {run_id}"),
                    spawned.log_prefix.clone(),
                    format!("[runner] Process exited with code: {exit_code:?}"),
                ];
                let lines = log_lines.lock().map(|buf| buf.clone()).unwrap_or_default();
                let _ = crate::run_logs::write_log_file(log_path, &header, &lines, None);
            }

            RunnerOutcome {
                success,
                exit_code,
                error_message: if !success {
                    Some(format!("Process exited with code: {exit_code:?}"))
                } else {
                    None
                },
                log_path: spawned.log_path,
            }
        }
        Err(e) => RunnerOutcome {
            success: false,
            exit_code: None,
            error_message: Some(format!("Failed to run runtime: {e}")),
            log_path: spawned.log_path,
        },
    }
}

pub fn is_process_alive(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let output = Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/NH"])
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
