use crate::db::open_db;
use crate::models::{ProfileRuntimeRun, ProfileRuntimeStats, RunHistoryItem};
use rusqlite::params;
use std::collections::HashMap;
use std::path::PathBuf;

pub fn list_run_history(db_path: &PathBuf) -> Result<Vec<RunHistoryItem>, String> {
    list_run_history_with_limit(db_path, 200)
}

pub fn list_dashboard_run_history(db_path: &PathBuf) -> Result<Vec<RunHistoryItem>, String> {
    list_run_history_with_limit(db_path, -1)
}

fn list_run_history_with_limit(
    db_path: &PathBuf,
    limit: i64,
) -> Result<Vec<RunHistoryItem>, String> {
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
                    COALESCE(NULLIF(tr.profile_name, ''), pc.profile_name, tr.profile_id) AS profile_name,
                    COALESCE(tr.group_name, pc.group_name) AS group_name,
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
                LEFT JOIN profile_cache pc ON pc.profile_id = tr.profile_id AND pc.manager = tr.manager

                UNION ALL

                SELECT
                    jr.id AS id,
                    'job' AS kind,
                    jr.job_id AS job_id,
                    j.name AS job_name,
                    jr.script_id AS script_id,
                    s.name AS script_name,
                    jr.profile_id AS profile_id,
                    COALESCE(NULLIF(jr.profile_name, ''), pc.profile_name, jr.profile_id) AS profile_name,
                    COALESCE(jr.group_name, pc.group_name) AS group_name,
                    jr.status AS status,
                    jr.started_at AS started_at,
                    jr.finished_at AS finished_at,
                    jr.exit_code AS exit_code,
                    jr.pid AS pid,
                    jr.error_message AS error_message,
                    jr.log_path AS log_path,
                    COALESCE(NULLIF(jr.manager, ''), pc.manager, 'donut') AS manager,
                    NULL AS batch_id,
                    jr.created_at AS created_at,
                    jr.created_at AS updated_at
                FROM job_runs jr
                LEFT JOIN jobs j ON j.id = jr.job_id
                LEFT JOIN scripts s ON s.id = jr.script_id
                LEFT JOIN profile_cache pc ON pc.profile_id = jr.profile_id AND pc.manager = jr.manager
            )
            ORDER BY created_at DESC
            LIMIT ?1
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![limit], |row| {
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

pub fn list_profile_runtime_stats(db_path: &PathBuf) -> Result<Vec<ProfileRuntimeStats>, String> {
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
                    COALESCE(NULLIF(tr.profile_name, ''), pc.profile_name, tr.profile_id) AS profile_name,
                    COALESCE(tr.group_name, pc.group_name) AS group_name,
                    tr.status AS status,
                    tr.started_at AS started_at,
                    tr.finished_at AS finished_at,
                    tr.exit_code AS exit_code,
                    tr.error_message AS error_message,
                    tr.log_path AS log_path,
                    tr.manager AS manager,
                    tr.created_at AS created_at
                FROM test_runs tr
                LEFT JOIN scripts s ON s.id = tr.script_id
                LEFT JOIN profile_cache pc ON pc.profile_id = tr.profile_id AND pc.manager = tr.manager

                UNION ALL

                SELECT
                    jr.id AS id,
                    'job' AS kind,
                    jr.job_id AS job_id,
                    j.name AS job_name,
                    jr.script_id AS script_id,
                    s.name AS script_name,
                    jr.profile_id AS profile_id,
                    COALESCE(NULLIF(jr.profile_name, ''), pc.profile_name, jr.profile_id) AS profile_name,
                    COALESCE(jr.group_name, pc.group_name) AS group_name,
                    jr.status AS status,
                    jr.started_at AS started_at,
                    jr.finished_at AS finished_at,
                    jr.exit_code AS exit_code,
                    jr.error_message AS error_message,
                    jr.log_path AS log_path,
                    COALESCE(NULLIF(jr.manager, ''), pc.manager, 'donut') AS manager,
                    jr.created_at AS created_at
                FROM job_runs jr
                LEFT JOIN jobs j ON j.id = jr.job_id
                LEFT JOIN scripts s ON s.id = jr.script_id
                LEFT JOIN profile_cache pc ON pc.profile_id = jr.profile_id AND pc.manager = jr.manager
            )
            ORDER BY created_at DESC
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ProfileRuntimeRun {
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
                error_message: row.get(13)?,
                log_path: row.get(14)?,
                manager: row.get(15)?,
                created_at: row.get(16)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut stats_by_profile: HashMap<String, ProfileRuntimeStats> = HashMap::new();
    for row in rows {
        let run = row.map_err(|e| e.to_string())?;
        let key = format!("{}:{}", run.manager, run.profile_id);
        let stats = stats_by_profile
            .entry(key)
            .or_insert_with(|| ProfileRuntimeStats {
                profile_id: run.profile_id.clone(),
                profile_name: run.profile_name.clone(),
                group_name: run.group_name.clone(),
                manager: run.manager.clone(),
                total_runs: 0,
                success_runs: 0,
                failed_runs: 0,
                stopped_runs: 0,
                latest_run_at: None,
                runs: Vec::new(),
            });

        stats.total_runs += 1;
        match run.status.as_str() {
            "success" => stats.success_runs += 1,
            "failed" => stats.failed_runs += 1,
            "stopped" => stats.stopped_runs += 1,
            _ => {}
        }
        if stats
            .latest_run_at
            .as_ref()
            .map(|latest| run.started_at > *latest)
            .unwrap_or(true)
        {
            stats.latest_run_at = Some(run.started_at.clone());
        }
        stats.runs.push(run);
    }

    let mut result: Vec<ProfileRuntimeStats> = stats_by_profile.into_values().collect();
    result.sort_by(|a, b| {
        b.latest_run_at
            .as_deref()
            .unwrap_or("")
            .cmp(a.latest_run_at.as_deref().unwrap_or(""))
    });
    Ok(result)
}
