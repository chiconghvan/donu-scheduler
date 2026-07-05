use rusqlite::{Connection, Result as SqlResult};
use crate::run_logs::LogRegistry;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub db_path: Mutex<PathBuf>,
    pub process_registry: Arc<Mutex<HashMap<String, u32>>>,
    pub log_registry: Arc<Mutex<LogRegistry>>,
    pub run_semaphore: Arc<tokio::sync::Semaphore>,
}

pub fn get_db_path(app_dir: &PathBuf) -> PathBuf {
    app_dir.join("donu_scheduler.sqlite")
}

pub fn open_db(db_path: &PathBuf) -> SqlResult<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

pub fn init_db(conn: &Connection) -> SqlResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS scripts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            script_path TEXT NOT NULL,
            default_args TEXT NOT NULL DEFAULT '',
            default_inputs_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            enabled INTEGER NOT NULL DEFAULT 1,
            script_id TEXT NOT NULL,
            profile_ids_json TEXT NOT NULL DEFAULT '[]',
            schedule_json TEXT NOT NULL DEFAULT '{}',
            random_json TEXT NOT NULL DEFAULT '{}',
            cli_args TEXT NOT NULL DEFAULT '',
            timeout_seconds INTEGER NOT NULL DEFAULT 300,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS job_profile_states (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            date TEXT NOT NULL,
            target_count INTEGER NOT NULL DEFAULT 0,
            run_count INTEGER NOT NULL DEFAULT 0,
            success_count INTEGER NOT NULL DEFAULT 0,
            failed_count INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            next_run_at TEXT,
            last_run_at TEXT,
            current_run_id TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            UNIQUE(job_id, profile_id, date)
        );

        CREATE INDEX IF NOT EXISTS idx_job_profile_states_job
            ON job_profile_states(job_id);

        CREATE TABLE IF NOT EXISTS job_runs (
            id TEXT PRIMARY KEY,
            job_id TEXT,
            profile_id TEXT NOT NULL,
            script_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at TEXT NOT NULL,
            finished_at TEXT,
            exit_code INTEGER,
            log_path TEXT,
            error_message TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE,
            FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_job_runs_job
            ON job_runs(job_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS test_runs (
            id TEXT PRIMARY KEY,
            script_id TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            started_at TEXT NOT NULL,
            finished_at TEXT,
            exit_code INTEGER,
            log_path TEXT,
            error_message TEXT,
            cli_args TEXT NOT NULL DEFAULT '',
            manager TEXT NOT NULL DEFAULT 'donut',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY(script_id) REFERENCES scripts(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS profile_cache (
            profile_id TEXT NOT NULL,
            manager TEXT NOT NULL,
            profile_name TEXT NOT NULL,
            group_name TEXT,
            updated_at TEXT NOT NULL,
            PRIMARY KEY(profile_id, manager)
        );

        INSERT OR IGNORE INTO settings (key, value) VALUES
            ('gpmlogin_api_base_url', 'http://127.0.0.1:19995'),
            ('gpmglobal_api_base_url', 'http://127.0.0.1:9495'),
            ('donutbrowser_api_base_url', 'http://127.0.0.1:10108'),
            ('global_max_parallel_runtime', '3'),
            ('log_retention_days', '30'),
            ('disable_auto_updates', 'false'),
            ('disable_runtime_updates', 'false');
        ",
    )?;

    // Migration: add default_inputs_json to scripts if missing
    let has_col: bool = conn
        .prepare("PRAGMA table_info(scripts)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| {
                    cols.filter_map(|c| c.ok()).any(|c| c == "default_inputs_json")
                })
        })
        .unwrap_or(false);

    if !has_col {
        conn.execute_batch(
            "ALTER TABLE scripts ADD COLUMN default_inputs_json TEXT NOT NULL DEFAULT '[]';",
        )?;
    }

    // Migration: add pid to job_runs if missing
    let has_pid_col: bool = conn
        .prepare("PRAGMA table_info(job_runs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "pid"))
        })
        .unwrap_or(false);

    if !has_pid_col {
        conn.execute_batch("ALTER TABLE job_runs ADD COLUMN pid INTEGER;")?;
    }

    // Migration: add batch_id to test_runs if missing
    let has_batch_col: bool = conn
        .prepare("PRAGMA table_info(test_runs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "batch_id"))
        })
        .unwrap_or(false);

    if !has_batch_col {
        conn.execute_batch("ALTER TABLE test_runs ADD COLUMN batch_id TEXT;")?;
    }

    // Migration: add pid to test_runs if missing
    let has_pid_col: bool = conn
        .prepare("PRAGMA table_info(test_runs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "pid"))
        })
        .unwrap_or(false);

    if !has_pid_col {
        conn.execute_batch("ALTER TABLE test_runs ADD COLUMN pid INTEGER;")?;
    }

    // Migration: add manager to test_runs if missing
    let has_manager_col: bool = conn
        .prepare("PRAGMA table_info(test_runs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "manager"))
        })
        .unwrap_or(false);

    if !has_manager_col {
        conn.execute_batch("ALTER TABLE test_runs ADD COLUMN manager TEXT NOT NULL DEFAULT 'donut';")?;
    }

    let has_test_profile_name_col: bool = conn
        .prepare("PRAGMA table_info(test_runs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "profile_name"))
        })
        .unwrap_or(false);

    if !has_test_profile_name_col {
        conn.execute_batch("ALTER TABLE test_runs ADD COLUMN profile_name TEXT NOT NULL DEFAULT '';")?;
    }

    let has_test_group_name_col: bool = conn
        .prepare("PRAGMA table_info(test_runs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "group_name"))
        })
        .unwrap_or(false);

    if !has_test_group_name_col {
        conn.execute_batch("ALTER TABLE test_runs ADD COLUMN group_name TEXT;")?;
    }

    let has_job_profile_name_col: bool = conn
        .prepare("PRAGMA table_info(job_runs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "profile_name"))
        })
        .unwrap_or(false);

    if !has_job_profile_name_col {
        conn.execute_batch("ALTER TABLE job_runs ADD COLUMN profile_name TEXT NOT NULL DEFAULT '';")?;
    }

    let has_job_group_name_col: bool = conn
        .prepare("PRAGMA table_info(job_runs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "group_name"))
        })
        .unwrap_or(false);

    if !has_job_group_name_col {
        conn.execute_batch("ALTER TABLE job_runs ADD COLUMN group_name TEXT;")?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS script_store_installs (
            store_script_id TEXT PRIMARY KEY,
            script_db_id TEXT NOT NULL,
            name TEXT NOT NULL,
            version TEXT NOT NULL,
            sha256 TEXT NOT NULL,
            runtime TEXT NOT NULL,
            source_owner TEXT NOT NULL,
            source_repo TEXT NOT NULL,
            source_tag TEXT NOT NULL,
            asset_name TEXT NOT NULL,
            installed_path TEXT NOT NULL,
            pending_path TEXT,
            pending_version TEXT,
            pending_sha256 TEXT,
            pending_source_tag TEXT,
            pending_asset_name TEXT,
            installed_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        ",
    )?;

    let has_store_pending_path: bool = conn
        .prepare("PRAGMA table_info(script_store_installs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "pending_path"))
        })
        .unwrap_or(false);
    if !has_store_pending_path {
        conn.execute_batch("ALTER TABLE script_store_installs ADD COLUMN pending_path TEXT;")?;
    }

    let has_store_pending_version: bool = conn
        .prepare("PRAGMA table_info(script_store_installs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "pending_version"))
        })
        .unwrap_or(false);
    if !has_store_pending_version {
        conn.execute_batch("ALTER TABLE script_store_installs ADD COLUMN pending_version TEXT;")?;
    }

    let has_store_pending_sha256: bool = conn
        .prepare("PRAGMA table_info(script_store_installs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "pending_sha256"))
        })
        .unwrap_or(false);
    if !has_store_pending_sha256 {
        conn.execute_batch("ALTER TABLE script_store_installs ADD COLUMN pending_sha256 TEXT;")?;
    }

    let has_store_pending_source_tag: bool = conn
        .prepare("PRAGMA table_info(script_store_installs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "pending_source_tag"))
        })
        .unwrap_or(false);
    if !has_store_pending_source_tag {
        conn.execute_batch("ALTER TABLE script_store_installs ADD COLUMN pending_source_tag TEXT;")?;
    }

    let has_store_pending_asset_name: bool = conn
        .prepare("PRAGMA table_info(script_store_installs)")
        .ok()
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))
                .ok()
                .map(|cols| cols.filter_map(|c| c.ok()).any(|c| c == "pending_asset_name"))
        })
        .unwrap_or(false);
    if !has_store_pending_asset_name {
        conn.execute_batch("ALTER TABLE script_store_installs ADD COLUMN pending_asset_name TEXT;")?;
    }

    // Migration: create input_cache table if not exists
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS input_cache (
            script_id TEXT PRIMARY KEY,
            cli_args TEXT NOT NULL DEFAULT '',
            default_inputs_json TEXT NOT NULL DEFAULT '[]'
        );
        ",
    )?;

    Ok(())
}

pub fn get_setting(conn: &Connection, key: &str) -> SqlResult<String> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        [key],
        |row| row.get(0),
    )
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
        [key, value],
    )?;
    Ok(())
}

pub fn upsert_profile_cache(conn: &Connection, snapshot: &crate::models::ProfileSnapshot) -> SqlResult<()> {
    conn.execute(
        "INSERT OR REPLACE INTO profile_cache (profile_id, manager, profile_name, group_name, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![snapshot.profile_id, snapshot.manager, snapshot.profile_name, snapshot.group_name, crate::models::now_iso()],
    )?;
    Ok(())
}

#[allow(dead_code)]
pub fn get_cached_profile(conn: &Connection, profile_id: &str, manager: &str) -> SqlResult<Option<(String, Option<String>)>> {
    let result = conn.query_row(
        "SELECT profile_name, group_name FROM profile_cache WHERE profile_id = ?1 AND manager = ?2",
        rusqlite::params![profile_id, manager],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
    );
    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}
