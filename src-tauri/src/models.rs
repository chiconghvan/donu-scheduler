use chrono::{Local, NaiveTime};
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
    pub runtime_path: String,
    pub gpmlogin_api_base_url: String,
    pub gpmglobal_api_base_url: String,
    pub donutbrowser_api_base_url: String,
    pub global_max_parallel_runtime: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileSummary {
    pub id: String,
    pub name: String,
    pub manager: String,
    pub group_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleConfig {
    #[serde(rename = "type")]
    pub schedule_type: String,
    pub start_time: String,
    pub end_time: String,
    pub posts_per_profile: i32,
    pub active_days: Vec<u32>,
    pub count_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RandomConfig {
    pub min_gap_minutes: f64,
    pub max_delay_factor: f64,
}

impl ScheduleConfig {
    pub fn parse(json: &str) -> Result<Self, String> {
        serde_json::from_str(json).map_err(|e| format!("Invalid schedule_json: {e}"))
    }

    pub fn is_active_day(&self, day_of_week: u32) -> bool {
        self.active_days.contains(&day_of_week)
    }

    pub fn window_start_today(&self) -> Option<chrono::NaiveDateTime> {
        let today = Local::now().date_naive();
        let time = NaiveTime::parse_from_str(&self.start_time, "%H:%M").ok()?;
        Some(today.and_time(time))
    }

    pub fn window_end_today(&self) -> Option<chrono::NaiveDateTime> {
        let today = Local::now().date_naive();
        let time = NaiveTime::parse_from_str(&self.end_time, "%H:%M").ok()?;
        Some(today.and_time(time))
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
    let max_delay = avg_gap * random_cfg.max_delay_factor;
    let min_gap = random_cfg.min_gap_minutes;

    let delay = if max_delay <= min_gap {
        min_gap
    } else {
        rand::thread_rng().gen_range(min_gap..max_delay)
    };

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
