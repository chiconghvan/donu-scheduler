mod db;
mod input_cache;
mod jobs;
mod models;
mod run_logs;
mod profile_manager;
mod runner;
mod running;
mod run_history;
mod scripts;
mod settings;
mod test_runs;

use db::AppState;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

fn get_app_data_dir() -> PathBuf {
    let base = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join("DonuScheduler")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_dir = get_app_data_dir();
    std::fs::create_dir_all(&app_dir).expect("Failed to create app data directory");

    let db_path = db::get_db_path(&app_dir);
    {
        let conn = db::open_db(&db_path).expect("Failed to open database");
        db::init_db(&conn).expect("Failed to initialize database");
    }
    let _ = run_logs::cleanup_old_logs();

    let max_parallel = {
        let conn = db::open_db(&db_path).expect("Failed to open database for settings");
        db::get_setting(&conn, "global_max_parallel_runtime")
            .unwrap_or_else(|_| "3".to_string())
            .parse::<usize>()
            .unwrap_or(3)
    };

    let state = Arc::new(AppState {
        db_path: Mutex::new(db_path.clone()),
        process_registry: Arc::new(Mutex::new(HashMap::new())),
        run_semaphore: Arc::new(tokio::sync::Semaphore::new(max_parallel)),
    });

    let db_for_scheduler = db_path.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(state)
        .setup(move |app| {
            let state_handle = app.state::<Arc<AppState>>();
            let registry = Arc::clone(&state_handle.process_registry);
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(20)).await;
                    jobs::scheduler::scheduler_tick(
                        db_for_scheduler.clone(),
                        registry.clone(),
                        app_handle.clone(),
                    )
                    .await;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            scripts::commands::list_scripts,
            scripts::commands::get_script,
            scripts::commands::create_script,
            scripts::commands::update_script,
            scripts::commands::delete_script,
            scripts::commands::open_file_dialog,
            scripts::commands::read_file_content,
            jobs::commands::list_jobs,
            jobs::commands::get_job,
            jobs::commands::create_job,
            jobs::commands::update_job,
            jobs::commands::delete_job,
            jobs::commands::set_job_enabled,
            jobs::commands::get_today_job_states,
            jobs::commands::list_job_runs,
            jobs::commands::stop_job_run,
            running::commands::list_running_tasks,
            running::commands::stop_running_task,
            running::commands::stop_running_process,
            settings::commands::get_settings,
            settings::commands::update_settings,
            test_runs::commands::run_script_test,
            test_runs::commands::run_batch_test,
            test_runs::commands::list_test_runs,
            test_runs::commands::get_test_run_log,
            test_runs::commands::stop_test_run,
            test_runs::commands::stop_batch_test_run,
            run_history::commands::list_run_history,
            run_history::commands::get_run_history_log,
            profile_manager_cmds::list_gpm_profiles,
            profile_manager_cmds::list_donut_profiles,
            profile_manager_cmds::list_gpmglobal_profiles,
            input_cache::commands::get_input_cache,
            input_cache::commands::save_input_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

mod profile_manager_cmds {
    use crate::db::AppState;
    use crate::models::ProfileSummary;
    use crate::profile_manager::donutbrowser_client::DonutBrowserClient;
    use crate::profile_manager::gpmglobal_client::GpmGlobalClient;
    use crate::profile_manager::gpmlogin_client::GpmLoginClient;
    use std::sync::Arc;

    #[tauri::command]
    pub async fn list_gpm_profiles(
        state: tauri::State<'_, Arc<AppState>>,
    ) -> Result<Vec<ProfileSummary>, String> {
        let (db_path_owned, base_url) = {
            let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
            let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
            (db_path.clone(), crate::db::get_setting(&conn, "gpmlogin_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:19995".to_string()))
        };

        let client = GpmLoginClient::new(base_url);
        let profiles = client.list_profiles().await?;
        cache_profiles(&db_path_owned, &profiles)?;
        Ok(profiles)
    }

    #[tauri::command]
    pub async fn list_donut_profiles(
        state: tauri::State<'_, Arc<AppState>>,
    ) -> Result<Vec<ProfileSummary>, String> {
        let (db_path_owned, base_url) = {
            let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
            let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
            (db_path.clone(), crate::db::get_setting(&conn, "donutbrowser_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:10108".to_string()))
        };

        let client = DonutBrowserClient::new(base_url);
        let profiles = client.list_profiles().await?;
        cache_profiles(&db_path_owned, &profiles)?;
        Ok(profiles)
    }

    #[tauri::command]
    pub async fn list_gpmglobal_profiles(
        state: tauri::State<'_, Arc<AppState>>,
    ) -> Result<Vec<ProfileSummary>, String> {
        let (db_path_owned, base_url) = {
            let db_path = state.db_path.lock().map_err(|e| e.to_string())?;
            let conn = crate::db::open_db(&db_path).map_err(|e| e.to_string())?;
            (db_path.clone(), crate::db::get_setting(&conn, "gpmglobal_api_base_url")
                .unwrap_or_else(|_| "http://127.0.0.1:9495".to_string()))
        };

        let client = GpmGlobalClient::new(base_url);
        let profiles = client.list_profiles().await?;
        cache_profiles(&db_path_owned, &profiles)?;
        Ok(profiles)
    }

    fn cache_profiles(db_path: &std::path::PathBuf, profiles: &[ProfileSummary]) -> Result<(), String> {
        let conn = crate::db::open_db(db_path).map_err(|e| e.to_string())?;
        for profile in profiles {
            let snapshot = crate::models::ProfileSnapshot {
                profile_id: profile.id.clone(),
                profile_name: profile.name.clone(),
                manager: profile.manager.clone(),
                group_name: profile.group_name.clone(),
            };
            crate::db::upsert_profile_cache(&conn, &snapshot).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}
