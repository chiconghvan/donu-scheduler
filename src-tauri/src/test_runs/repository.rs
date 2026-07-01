use crate::db::open_db;
use crate::models::*;
use rusqlite::params;
use std::path::PathBuf;

pub fn list_test_runs(db_path: &PathBuf) -> Result<Vec<TestRun>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, script_id, profile_id, status, started_at, finished_at, exit_code, pid, log_path, error_message, cli_args, manager, batch_id, profile_name, group_name, created_at, updated_at FROM test_runs ORDER BY created_at DESC LIMIT 100")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(TestRun {
                id: row.get(0)?,
                script_id: row.get(1)?,
                profile_id: row.get(2)?,
                status: row.get(3)?,
                started_at: row.get(4)?,
                finished_at: row.get(5)?,
                exit_code: row.get(6)?,
                pid: row.get(7)?,
                log_path: row.get(8)?,
                error_message: row.get(9)?,
                cli_args: row.get(10)?,
                manager: row.get(11)?,
                batch_id: row.get(12)?,
                profile_name: row.get(13)?,
                group_name: row.get(14)?,
                created_at: row.get(15)?,
                updated_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn insert_test_run(db_path: &PathBuf, run: &TestRun) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO test_runs (id, script_id, profile_id, status, started_at, finished_at, exit_code, pid, log_path, error_message, cli_args, manager, batch_id, profile_name, group_name, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        params![run.id, run.script_id, run.profile_id, run.status, run.started_at, run.finished_at, run.exit_code, run.pid, run.log_path, run.error_message, run.cli_args, run.manager, run.batch_id, run.profile_name, run.group_name, run.created_at, run.updated_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_test_run_pid(db_path: &PathBuf, run_id: &str, pid: Option<u32>) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE test_runs SET pid=?1, updated_at=?2 WHERE id=?3",
        params![pid, now_iso(), run_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_test_run_status(db_path: &PathBuf, run_id: &str, status: &str) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE test_runs SET status=?1, updated_at=?2 WHERE id=?3",
        params![status, now_iso(), run_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_test_run_status(db_path: &PathBuf, run_id: &str) -> Result<String, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT status FROM test_runs WHERE id=?1",
        params![run_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn get_test_run_pid(db_path: &PathBuf, run_id: &str) -> Result<Option<u32>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT pid FROM test_runs WHERE id=?1",
        params![run_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn get_test_run_profile(db_path: &PathBuf, run_id: &str) -> Result<(String, String), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT profile_id, manager FROM test_runs WHERE id=?1",
        params![run_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .map_err(|e| e.to_string())
}

pub fn update_test_run(
    db_path: &PathBuf,
    run_id: &str,
    status: &str,
    finished_at: &str,
    exit_code: Option<i32>,
    error_message: Option<&str>,
    log_path: Option<&str>,
) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE test_runs SET status=?1, finished_at=?2, exit_code=?3, error_message=?4, log_path=?5, pid=NULL, updated_at=?6 WHERE id=?7",
        params![status, finished_at, exit_code, error_message, log_path, now, run_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_test_run_log(db_path: &PathBuf, run_id: &str) -> Result<String, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let log_path: Option<String> = conn
        .query_row(
            "SELECT log_path FROM test_runs WHERE id=?1",
            params![run_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let log_path = log_path.ok_or_else(|| format!("Log path not found for test run: {run_id}"))?;
    std::fs::read_to_string(&log_path).map_err(|e| format!("Failed to read log file {log_path}: {e}"))
}
