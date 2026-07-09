use crate::db::open_db;
use crate::models::*;
use rusqlite::params;
use std::path::PathBuf;

pub fn list_jobs(db_path: &PathBuf) -> Result<Vec<JobDefinition>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, enabled, script_id, profile_ids_json, schedule_json, random_json, cli_args, default_inputs_json, timeout_seconds, created_at, updated_at FROM jobs ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(JobDefinition {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                enabled: row.get(3)?,
                script_id: row.get(4)?,
                profile_ids_json: row.get(5)?,
                schedule_json: row.get(6)?,
                random_json: row.get(7)?,
                cli_args: row.get(8)?,
                default_inputs_json: row.get(9)?,
                timeout_seconds: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn list_enabled_jobs(db_path: &PathBuf) -> Result<Vec<JobDefinition>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, description, enabled, script_id, profile_ids_json, schedule_json, random_json, cli_args, default_inputs_json, timeout_seconds, created_at, updated_at FROM jobs WHERE enabled = 1 ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(JobDefinition {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                enabled: row.get(3)?,
                script_id: row.get(4)?,
                profile_ids_json: row.get(5)?,
                schedule_json: row.get(6)?,
                random_json: row.get(7)?,
                cli_args: row.get(8)?,
                default_inputs_json: row.get(9)?,
                timeout_seconds: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_job(db_path: &PathBuf, id: &str) -> Result<JobDefinition, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, name, description, enabled, script_id, profile_ids_json, schedule_json, random_json, cli_args, default_inputs_json, timeout_seconds, created_at, updated_at FROM jobs WHERE id = ?1",
        params![id],
        |row| {
            Ok(JobDefinition {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                enabled: row.get(3)?,
                script_id: row.get(4)?,
                profile_ids_json: row.get(5)?,
                schedule_json: row.get(6)?,
                random_json: row.get(7)?,
                cli_args: row.get(8)?,
                default_inputs_json: row.get(9)?,
                timeout_seconds: row.get(10)?,
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

pub fn create_job(db_path: &PathBuf, input: &JobInput) -> Result<JobDefinition, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let id = new_id();
    let now = now_iso();

    validate_job_input(input)?;

    conn.execute(
        "INSERT INTO jobs (id, name, description, enabled, script_id, profile_ids_json, schedule_json, random_json, cli_args, default_inputs_json, timeout_seconds, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        params![id, input.name, input.description, input.enabled, input.script_id, input.profile_ids_json, input.schedule_json, input.random_json, input.cli_args, input.default_inputs_json, input.timeout_seconds, now, now],
    )
    .map_err(|e| e.to_string())?;

    get_job(db_path, &id)
}

pub fn update_job(db_path: &PathBuf, id: &str, input: &JobInput) -> Result<JobDefinition, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let now = now_iso();

    validate_job_input(input)?;

    let affected = conn
        .execute(
            "UPDATE jobs SET name=?1, description=?2, enabled=?3, script_id=?4, profile_ids_json=?5, schedule_json=?6, random_json=?7, cli_args=?8, default_inputs_json=?9, timeout_seconds=?10, updated_at=?11 WHERE id=?12",
            params![input.name, input.description, input.enabled, input.script_id, input.profile_ids_json, input.schedule_json, input.random_json, input.cli_args, input.default_inputs_json, input.timeout_seconds, now, id],
        )
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Job not found: {id}"));
    }

    get_job(db_path, id)
}

pub fn delete_job(db_path: &PathBuf, id: &str) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let affected = conn
        .execute("DELETE FROM jobs WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    if affected == 0 {
        return Err(format!("Job not found: {id}"));
    }
    Ok(())
}

pub fn set_job_enabled(db_path: &PathBuf, id: &str, enabled: i32) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let now = now_iso();
    let affected = conn
        .execute(
            "UPDATE jobs SET enabled=?1, updated_at=?2 WHERE id=?3",
            params![enabled, now, id],
        )
        .map_err(|e| e.to_string())?;
    if affected == 0 {
        return Err(format!("Job not found: {id}"));
    }
    Ok(())
}

pub fn upsert_job_profile_state(
    db_path: &PathBuf,
    job_id: &str,
    profile_id: &str,
    date: &str,
    target_count: i32,
) -> Result<JobProfileState, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let now = now_iso();

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM job_profile_states WHERE job_id=?1 AND profile_id=?2 AND date=?3",
            params![job_id, profile_id, date],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        return get_job_profile_state(db_path, &id);
    }

    let id = new_id();
    conn.execute(
        "INSERT INTO job_profile_states (id, job_id, profile_id, date, target_count, run_count, success_count, failed_count, status, next_run_at, last_run_at, current_run_id, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,0,0,0,'pending',NULL,NULL,NULL,?6,?7)",
        params![id, job_id, profile_id, date, target_count, now, now],
    )
    .map_err(|e| e.to_string())?;

    get_job_profile_state(db_path, &id)
}

pub fn get_job_profile_state(db_path: &PathBuf, id: &str) -> Result<JobProfileState, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, job_id, profile_id, date, target_count, run_count, success_count, failed_count, status, next_run_at, last_run_at, current_run_id, created_at, updated_at FROM job_profile_states WHERE id=?1",
        params![id],
        |row| Ok(JobProfileState {
            id: row.get(0)?,
            job_id: row.get(1)?,
            profile_id: row.get(2)?,
            date: row.get(3)?,
            target_count: row.get(4)?,
            run_count: row.get(5)?,
            success_count: row.get(6)?,
            failed_count: row.get(7)?,
            status: row.get(8)?,
            next_run_at: row.get(9)?,
            last_run_at: row.get(10)?,
            current_run_id: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        }),
    )
    .map_err(|e| e.to_string())
}

pub fn get_today_job_states(
    db_path: &PathBuf,
    job_id: &str,
) -> Result<Vec<JobProfileState>, String> {
    let today = crate::models::today_iso();
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, job_id, profile_id, date, target_count, run_count, success_count, failed_count, status, next_run_at, last_run_at, current_run_id, created_at, updated_at FROM job_profile_states WHERE job_id=?1 AND date=?2 ORDER BY profile_id")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![job_id, today], |row| {
            Ok(JobProfileState {
                id: row.get(0)?,
                job_id: row.get(1)?,
                profile_id: row.get(2)?,
                date: row.get(3)?,
                target_count: row.get(4)?,
                run_count: row.get(5)?,
                success_count: row.get(6)?,
                failed_count: row.get(7)?,
                status: row.get(8)?,
                next_run_at: row.get(9)?,
                last_run_at: row.get(10)?,
                current_run_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn get_latest_job_profile_state(
    db_path: &PathBuf,
    job_id: &str,
    profile_id: &str,
) -> Result<Option<JobProfileState>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, job_id, profile_id, date, target_count, run_count, success_count, failed_count, status, next_run_at, last_run_at, current_run_id, created_at, updated_at FROM job_profile_states WHERE job_id=?1 AND profile_id=?2 ORDER BY updated_at DESC LIMIT 1",
        params![job_id, profile_id],
        |row| Ok(JobProfileState {
            id: row.get(0)?,
            job_id: row.get(1)?,
            profile_id: row.get(2)?,
            date: row.get(3)?,
            target_count: row.get(4)?,
            run_count: row.get(5)?,
            success_count: row.get(6)?,
            failed_count: row.get(7)?,
            status: row.get(8)?,
            next_run_at: row.get(9)?,
            last_run_at: row.get(10)?,
            current_run_id: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
        }),
    );

    match result {
        Ok(state) => Ok(Some(state)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn list_job_runs(db_path: &PathBuf, job_id: &str) -> Result<Vec<JobRun>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT jr.id, jr.job_id, jr.profile_id, jr.script_id, jr.status, jr.started_at, jr.finished_at, jr.exit_code, jr.pid, jr.log_path, jr.error_message, COALESCE(NULLIF(jr.manager, ''), pc.manager, 'donut'), COALESCE(NULLIF(jr.profile_name, ''), pc.profile_name, jr.profile_id), COALESCE(jr.group_name, pc.group_name), jr.created_at FROM job_runs jr LEFT JOIN profile_cache pc ON pc.profile_id = jr.profile_id AND pc.manager = jr.manager WHERE jr.job_id=?1 ORDER BY jr.created_at DESC LIMIT 100")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![job_id], |row| {
            Ok(JobRun {
                id: row.get(0)?,
                job_id: row.get(1)?,
                profile_id: row.get(2)?,
                script_id: row.get(3)?,
                status: row.get(4)?,
                started_at: row.get(5)?,
                finished_at: row.get(6)?,
                exit_code: row.get(7)?,
                pid: row.get(8)?,
                log_path: row.get(9)?,
                error_message: row.get(10)?,
                manager: row.get(11)?,
                profile_name: row.get(12)?,
                group_name: row.get(13)?,
                created_at: row.get(14)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn insert_job_run(db_path: &PathBuf, run: &JobRun) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO job_runs (id, job_id, profile_id, script_id, status, started_at, finished_at, exit_code, pid, log_path, error_message, manager, profile_name, group_name, created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)",
        params![run.id, run.job_id, run.profile_id, run.script_id, run.status, run.started_at, run.finished_at, run.exit_code, run.pid, run.log_path, run.error_message, run.manager, run.profile_name, run.group_name, run.created_at],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_job_run(
    db_path: &PathBuf,
    run_id: &str,
    status: &str,
    finished_at: &str,
    exit_code: Option<i32>,
    error_message: Option<&str>,
) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE job_runs SET status=?1, finished_at=?2, exit_code=?3, error_message=?4 WHERE id=?5",
        params![status, finished_at, exit_code, error_message, run_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_job_run_status(db_path: &PathBuf, run_id: &str, status: &str) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE job_runs SET status=?1 WHERE id=?2",
        params![status, run_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn update_job_run_pid(db_path: &PathBuf, run_id: &str, pid: Option<u32>) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE job_runs SET pid=?1 WHERE id=?2",
        params![pid, run_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_job_run_pid(db_path: &PathBuf, run_id: &str) -> Result<Option<u32>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT pid FROM job_runs WHERE id=?1",
        params![run_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn get_job_run_status(db_path: &PathBuf, run_id: &str) -> Result<String, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT status FROM job_runs WHERE id=?1",
        params![run_id],
        |row| row.get(0),
    )
    .map_err(|e| e.to_string())
}

pub fn get_job_run_profile_manager(
    db_path: &PathBuf,
    run_id: &str,
) -> Result<(String, String), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let (profile_id, profile_ids_json): (String, Option<String>) = conn
        .query_row(
            "SELECT jr.profile_id, j.profile_ids_json FROM job_runs jr LEFT JOIN jobs j ON j.id = jr.job_id WHERE jr.id=?1",
            params![run_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    if let Some(profile_ids_json) = profile_ids_json {
        let profiles: Vec<JobProfileRef> = serde_json::from_str(&profile_ids_json)
            .map_err(|e| format!("Invalid profile_ids_json: {e}"))?;
        if let Some(profile) = profiles
            .into_iter()
            .find(|profile| profile.id == profile_id)
        {
            return Ok((profile_id, profile.manager));
        }
    }

    let manager = conn
        .query_row(
            "SELECT manager FROM profile_cache WHERE profile_id=?1 ORDER BY updated_at DESC LIMIT 1",
            params![profile_id],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "donut".to_string());
    Ok((profile_id, manager))
}

pub fn get_all_running_profile_states(db_path: &PathBuf) -> Result<Vec<JobProfileState>, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, job_id, profile_id, date, target_count, run_count, success_count, failed_count, status, next_run_at, last_run_at, current_run_id, created_at, updated_at FROM job_profile_states WHERE status='running' AND current_run_id IS NOT NULL")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(JobProfileState {
                id: row.get(0)?,
                job_id: row.get(1)?,
                profile_id: row.get(2)?,
                date: row.get(3)?,
                target_count: row.get(4)?,
                run_count: row.get(5)?,
                success_count: row.get(6)?,
                failed_count: row.get(7)?,
                status: row.get(8)?,
                next_run_at: row.get(9)?,
                last_run_at: row.get(10)?,
                current_run_id: row.get(11)?,
                created_at: row.get(12)?,
                updated_at: row.get(13)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

pub fn update_job_profile_state(
    db_path: &PathBuf,
    state_id: &str,
    run_count: i32,
    success_count: i32,
    failed_count: i32,
    status: &str,
    next_run_at: Option<&str>,
    last_run_at: &str,
    current_run_id: Option<&str>,
) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let now = now_iso();
    conn.execute(
        "UPDATE job_profile_states SET run_count=?1, success_count=?2, failed_count=?3, status=?4, next_run_at=?5, last_run_at=?6, current_run_id=?7, updated_at=?8 WHERE id=?9",
        params![run_count, success_count, failed_count, status, next_run_at, last_run_at, current_run_id, now, state_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn validate_job_input(input: &JobInput) -> Result<(), String> {
    let profile_ids: Vec<JobProfileRef> = serde_json::from_str(&input.profile_ids_json)
        .map_err(|e| format!("Invalid profile_ids_json: {e}"))?;
    for profile in profile_ids {
        if profile.id.trim().is_empty() {
            return Err("Profile id must not be empty".to_string());
        }
        if !matches!(profile.manager.as_str(), "gpm" | "gpmglobal" | "donut") {
            return Err(format!("Unsupported profile manager: {}", profile.manager));
        }
    }

    // Validate schedule_json
    if !input.schedule_json.trim().is_empty() {
        let _: ScheduleConfig = ScheduleConfig::parse(&input.schedule_json)?;
    }

    // Validate random_json
    if !input.random_json.trim().is_empty() {
        let _: RandomConfig = RandomConfig::parse(&input.random_json)?;
    }

    // cli_args is plain text, no validation needed

    serde_json::from_str::<serde_json::Value>(&input.default_inputs_json)
        .map_err(|e| format!("Invalid default_inputs_json: {e}"))?;

    Ok(())
}
