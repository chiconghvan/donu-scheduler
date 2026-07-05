use crate::db::open_db;
use crate::models::RunHistoryItem;
use rusqlite::params;
use std::path::PathBuf;

pub fn list_run_history(db_path: &PathBuf) -> Result<Vec<RunHistoryItem>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "
            SELECT * FROM (
                SELECT
                    tr.id AS id,
                    'test' AS kind,
                    NULL AS job_id,
                    NULL AS job_name,
                    tr.script_id AS script_id,
                    s.name AS script_name,
                    tr.profile_id AS profile_id,
                    tr.profile_name AS profile_name,
                    tr.group_name AS group_name,
                    tr.status AS status,
                    tr.started_at AS started_at,
                    tr.finished_at AS finished_at,
                    tr.exit_code AS exit_code,
                    tr.pid AS pid,
                    tr.error_message AS error_message,
                    tr.log_path AS log_path,
                    tr.manager AS manager,
                    tr.batch_id AS batch_id,
                    tr.created_at AS created_at,
                    tr.updated_at AS updated_at
                FROM test_runs tr
                LEFT JOIN scripts s ON s.id = tr.script_id

                UNION ALL

                SELECT
                    jr.id AS id,
                    'job' AS kind,
                    jr.job_id AS job_id,
                    j.name AS job_name,
                    jr.script_id AS script_id,
                    s.name AS script_name,
                    jr.profile_id AS profile_id,
                    jr.profile_name AS profile_name,
                    jr.group_name AS group_name,
                    jr.status AS status,
                    jr.started_at AS started_at,
                    jr.finished_at AS finished_at,
                    jr.exit_code AS exit_code,
                    jr.pid AS pid,
                    jr.error_message AS error_message,
                    jr.log_path AS log_path,
                    NULL AS manager,
                    NULL AS batch_id,
                    jr.created_at AS created_at,
                    jr.created_at AS updated_at
                FROM job_runs jr
                LEFT JOIN jobs j ON j.id = jr.job_id
                LEFT JOIN scripts s ON s.id = jr.script_id
            )
            ORDER BY created_at DESC
            LIMIT 200
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(RunHistoryItem {
                id: row.get(0)?,
                kind: row.get(1)?,
                job_id: row.get(2)?,
                job_name: row.get(3)?,
                script_id: row.get(4)?,
                script_name: row.get(5)?,
                profile_id: row.get(6)?,
                profile_name: row.get(7)?,
                group_name: row.get(8)?,
                status: row.get(9)?,
                started_at: row.get(10)?,
                finished_at: row.get(11)?,
                exit_code: row.get(12)?,
                pid: row.get(13)?,
                error_message: row.get(14)?,
                log_path: row.get(15)?,
                manager: row.get(16)?,
                batch_id: row.get(17)?,
                created_at: row.get(18)?,
                updated_at: row.get(19)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_run_history_log(db_path: &PathBuf, kind: &str, run_id: &str) -> Result<String, String> {
    let log_path = get_log_path(db_path, kind, run_id)?;
    std::fs::read_to_string(&log_path)
        .map_err(|e| format!("Failed to read log file {log_path}: {e}"))
}

pub fn get_log_path(db_path: &PathBuf, kind: &str, run_id: &str) -> Result<String, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let log_path: Option<String> = if kind == "job" {
        conn.query_row(
            "SELECT log_path FROM job_runs WHERE id=?1",
            params![run_id],
            |row| row.get(0),
        )
        .ok()
    } else {
        conn.query_row(
            "SELECT log_path FROM test_runs WHERE id=?1",
            params![run_id],
            |row| row.get(0),
        )
        .ok()
    };

    log_path.ok_or_else(|| format!("Log path not found for run: {run_id}"))
}
