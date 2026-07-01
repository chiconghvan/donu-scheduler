use crate::db::open_db;
use crate::models::Settings;
use std::path::PathBuf;

pub fn get_settings(db_path: &PathBuf) -> Result<Settings, String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    let runtime_path = crate::db::get_setting(&conn, "runtime_path").unwrap_or_default();
    let gpmlogin_api_base_url =
        crate::db::get_setting(&conn, "gpmlogin_api_base_url").unwrap_or_else(|_| "http://127.0.0.1:19995".to_string());
    let gpmglobal_api_base_url =
        crate::db::get_setting(&conn, "gpmglobal_api_base_url").unwrap_or_else(|_| "http://127.0.0.1:9495".to_string());
    let donutbrowser_api_base_url =
        crate::db::get_setting(&conn, "donutbrowser_api_base_url").unwrap_or_else(|_| "http://127.0.0.1:10108".to_string());
    let global_max_parallel_runtime = crate::db::get_setting(&conn, "global_max_parallel_runtime")
        .unwrap_or_else(|_| "3".to_string())
        .parse::<i32>()
        .unwrap_or(3);

    Ok(Settings {
        runtime_path,
        gpmlogin_api_base_url,
        gpmglobal_api_base_url,
        donutbrowser_api_base_url,
        global_max_parallel_runtime,
    })
}

pub fn update_settings(db_path: &PathBuf, settings: &Settings) -> Result<(), String> {
    let conn = open_db(db_path).map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "runtime_path", &settings.runtime_path)
        .map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "gpmlogin_api_base_url", &settings.gpmlogin_api_base_url)
        .map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "gpmglobal_api_base_url", &settings.gpmglobal_api_base_url)
        .map_err(|e| e.to_string())?;
    crate::db::set_setting(&conn, "donutbrowser_api_base_url", &settings.donutbrowser_api_base_url)
        .map_err(|e| e.to_string())?;
    crate::db::set_setting(
        &conn,
        "global_max_parallel_runtime",
        &settings.global_max_parallel_runtime.to_string(),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
