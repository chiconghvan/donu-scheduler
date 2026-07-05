use chrono::{Datelike, Local, NaiveTime};
use rand::Rng;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Script {
    pub id: String,
    pub name: String,
    pub description: String,
    pub script_path: String,
    pub default_args: String,
    pub default_inputs_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptInput {
    pub name: String,
    pub description: String,
    pub script_path: String,
    pub default_args: String,
    pub default_inputs_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobDefinition {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: i32,
    pub script_id: String,
    pub profile_ids_json: String,
    pub schedule_json: String,
    pub random_json: String,
    pub cli_args: String,
    pub timeout_seconds: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobInput {
    pub name: String,
    pub description: String,
    pub enabled: i32,
    pub script_id: String,
    pub profile_ids_json: String,
    pub schedule_json: String,
    pub random_json: String,
    pub cli_args: String,
    pub timeout_seconds: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobProfileState {
    pub id: String,
    pub job_id: String,
    pub profile_id: String,
    pub date: String,
    pub target_count: i32,
    pub run_count: i32,
    pub success_count: i32,
    pub failed_count: i32,
    pub status: String,
    pub next_run_at: Option<String>,
    pub last_run_at: Option<String>,
    pub current_run_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobRun {
    pub id: String,
    pub job_id: Option<String>,
    pub profile_id: String,
    pub script_id: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub pid: Option<u32>,
    pub log_path: Option<String>,
    pub error_message: Option<String>,
    pub profile_name: String,
    pub group_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestRun {
    pub id: String,
    pub script_id: String,
    pub profile_id: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub pid: Option<u32>,
    pub log_path: Option<String>,
    pub error_message: Option<String>,
    pub cli_args: String,
    pub manager: String,
    pub batch_id: Option<String>,
    pub profile_name: String,
    pub group_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSnapshot {
    pub profile_id: String,
    pub profile_name: String,
    pub manager: String,
    pub group_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningProcess {
    pub id: String,
    pub run_id: Option<String>,
    pub profile_id: String,
    pub profile_name: String,
    pub manager: Option<String>,
    pub pid: Option<u32>,
    pub status: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub next_run_at: Option<String>,
    pub exit_code: Option<i32>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningTask {
    pub id: String,
    pub kind: String,
    pub title: String,
    pub script_id: Option<String>,
    pub script_name: Option<String>,
    pub job_id: Option<String>,
    pub job_name: Option<String>,
    pub manager: Option<String>,
    pub status: String,
    pub profile_count: i32,
    pub running_count: i32,
    pub queued_count: i32,
    pub scheduled_count: i32,
    pub started_at: Option<String>,
    pub next_run_at: Option<String>,
    pub children: Vec<RunningProcess>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunHistoryItem {
    pub id: String,
    pub kind: String,
    pub job_id: Option<String>,
    pub job_name: Option<String>,
    pub script_id: String,
    pub script_name: Option<String>,
    pub profile_id: String,
    pub profile_name: String,
    pub group_name: Option<String>,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub exit_code: Option<i32>,
    pub pid: Option<u32>,
    pub error_message: Option<String>,
    pub log_path: Option<String>,
    pub manager: Option<String>,
    pub batch_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub gpmlogin_api_base_url: String,
    pub gpmglobal_api_base_url: String,
    pub donutbrowser_api_base_url: String,
    pub global_max_parallel_runtime: i32,
    pub log_retention_days: i32,
    pub disable_auto_updates: bool,
    pub disable_runtime_updates: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptStoreScript {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub runtime: String,
    pub entry: String,
    pub path: String,
    pub sha256: String,
    pub min_app_version: String,
    pub deprecated: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptStoreMetadata {
    pub store_version: String,
    pub scripts: Vec<ScriptStoreScript>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptStoreCatalogItem {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub runtime: String,
    pub entry: String,
    pub path: String,
    pub sha256: String,
    pub min_app_version: String,
    pub deprecated: bool,
    pub updated_at: String,
    pub installed: bool,
    pub installed_version: Option<String>,
    pub installed_sha256: Option<String>,
    pub update_available: bool,
    pub pending_update: bool,
    pub source_tag: Option<String>,
    pub asset_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptStoreCatalog {
    pub store_version: String,
    pub scripts: Vec<ScriptStoreCatalogItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptStoreInstallResult {
    pub script_id: String,
    pub script_name: String,
    pub version: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptStoreUpdateApplied {
    pub script_id: String,
    pub script_name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptStoreUpdateSuccessPayload {
    pub script_id: String,
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub manager: String,
    pub group_name: Option<String>,
    pub browser_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobProfileRef {
    pub id: String,
    pub manager: String,
    pub name: Option<String>,
    pub group_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleConfig {
    #[serde(rename = "type")]
    pub schedule_type: String,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub runs_per_profile: Option<i32>,
    pub interval_minutes: Option<i64>,
    pub times: Option<Vec<String>>,
    pub active_days: Vec<u32>,
    pub count_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RandomConfig {
    pub min_gap_minutes: f64,
    pub max_gap_minutes: f64,
}

impl ScheduleConfig {
    pub fn parse(json: &str) -> Result<Self, String> {
        let cfg: Self =
            serde_json::from_str(json).map_err(|e| format!("Invalid schedule_json: {e}"))?;
        cfg.validate()?;
        Ok(cfg)
    }

    pub fn validate(&self) -> Result<(), String> {
        match self.schedule_type.as_str() {
            "window_count" => {
                self.require_time(self.start_time.as_deref(), "start_time")?;
                self.require_time(self.end_time.as_deref(), "end_time")?;
                if self.runs_per_profile.unwrap_or(0) <= 0 {
                    return Err("runs_per_profile must be greater than 0".to_string());
                }
            }
            "fixed_interval" => {
                if self.interval_minutes.unwrap_or(0) <= 0 {
                    return Err("interval_minutes must be greater than 0".to_string());
                }
            }
            "daily_times" => {
                let times = self.times.as_ref().ok_or("times is required")?;
                if times.is_empty() {
                    return Err("times must not be empty".to_string());
                }
                for time in times {
                    self.require_time(Some(time), "times")?;
                }
            }
            other => return Err(format!("Unsupported schedule type: {other}")),
        }

        if self.active_days.is_empty() || self.active_days.iter().any(|day| *day == 0 || *day > 7) {
            return Err("active_days must contain values from 1 to 7".to_string());
        }

        Ok(())
    }

    fn require_time(&self, value: Option<&str>, field: &str) -> Result<(), String> {
        let value = value.ok_or_else(|| format!("{field} is required"))?;
        NaiveTime::parse_from_str(value, "%H:%M")
            .map(|_| ())
            .map_err(|_| format!("{field} must use HH:mm format"))
    }

    pub fn is_active_day(&self, day_of_week: u32) -> bool {
        self.active_days.contains(&day_of_week)
    }

    pub fn is_active_today(&self) -> bool {
        let day = Local::now().weekday().number_from_monday();
        self.is_active_day(day)
    }

    pub fn window_start_today(&self) -> Option<chrono::NaiveDateTime> {
        let today = Local::now().date_naive();
        let time = NaiveTime::parse_from_str(self.start_time.as_deref()?, "%H:%M").ok()?;
        Some(today.and_time(time))
    }

    pub fn window_end_today(&self) -> Option<chrono::NaiveDateTime> {
        let today = Local::now().date_naive();
        let time = NaiveTime::parse_from_str(self.end_time.as_deref()?, "%H:%M").ok()?;
        Some(today.and_time(time))
    }

    pub fn target_count(&self) -> i32 {
        match self.schedule_type.as_str() {
            "window_count" => self.runs_per_profile.unwrap_or(0),
            "fixed_interval" => 0,
            "daily_times" => self
                .times
                .as_ref()
                .map(|times| times.len() as i32)
                .unwrap_or(0),
            _ => 0,
        }
    }
}

impl RandomConfig {
    pub fn parse(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("Invalid random_json: {e}"))
    }
}

pub fn compute_next_run(
    target_count: i32,
    run_count: i32,
    now: chrono::NaiveDateTime,
    window_end: chrono::NaiveDateTime,
    random_cfg: &RandomConfig,
) -> Option<chrono::NaiveDateTime> {
    let remaining_posts = target_count - run_count;
    if remaining_posts <= 0 {
        return None;
    }

    let remaining_minutes = (window_end - now).num_minutes() as f64;
    if remaining_minutes <= 0.0 {
        return None;
    }

    let avg_gap = remaining_minutes / remaining_posts as f64;
    let min_delay = avg_gap * 0.6;
    let max_delay = avg_gap * 1.3;

    let random_delay = if min_delay >= max_delay {
        min_delay
    } else {
        rand::thread_rng().gen_range(min_delay..max_delay)
    };

    let delay = random_delay.clamp(random_cfg.min_gap_minutes, random_cfg.max_gap_minutes);

    let mut next = now + chrono::Duration::minutes(delay as i64);
    if next > window_end {
        next = window_end;
    }
    Some(next)
}

pub fn now_iso() -> String {
    Local::now().format("%Y-%m-%dT%H:%M:%S").to_string()
}

pub fn today_iso() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
