export interface Script {
  id: string;
  name: string;
  description: string;
  script_path: string;
  default_args: string;
  default_inputs_json: string;
  created_at: string;
  updated_at: string;
}

export interface ScriptInput {
  name: string;
  description: string;
  script_path: string;
  default_args: string;
  default_inputs_json: string;
}

export interface JobDefinition {
  id: string;
  name: string;
  description: string;
  enabled: number;
  script_id: string;
  profile_ids_json: string;
  schedule_json: string;
  random_json: string;
  cli_args: string;
  timeout_seconds: number;
  created_at: string;
  updated_at: string;
}

export interface JobInput {
  name: string;
  description: string;
  enabled: number;
  script_id: string;
  profile_ids_json: string;
  schedule_json: string;
  random_json: string;
  cli_args: string;
  timeout_seconds: number;
}

export interface JobProfileState {
  id: string;
  job_id: string;
  profile_id: string;
  date: string;
  target_count: number;
  run_count: number;
  success_count: number;
  failed_count: number;
  status: string;
  next_run_at: string | null;
  last_run_at: string | null;
  current_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobRun {
  id: string;
  job_id: string | null;
  profile_id: string;
  script_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  pid: number | null;
  log_path: string | null;
  error_message: string | null;
  profile_name: string;
  group_name: string | null;
  created_at: string;
}

export interface TestRun {
  id: string;
  script_id: string;
  profile_id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  pid: number | null;
  log_path: string | null;
  error_message: string | null;
  cli_args: string;
  manager: string;
  batch_id: string | null;
  profile_name: string;
  group_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfileSnapshot {
  profile_id: string;
  profile_name: string;
  manager: string;
  group_name: string | null;
}

export interface RunningProcess {
  id: string;
  run_id: string | null;
  profile_id: string;
  profile_name: string;
  manager: string | null;
  pid: number | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  next_run_at: string | null;
  exit_code: number | null;
  error_message: string | null;
}

export interface RunningTask {
  id: string;
  kind: string;
  title: string;
  script_id: string | null;
  script_name: string | null;
  job_id: string | null;
  job_name: string | null;
  manager: string | null;
  status: string;
  profile_count: number;
  running_count: number;
  queued_count: number;
  scheduled_count: number;
  started_at: string | null;
  next_run_at: string | null;
  children: RunningProcess[];
}

export interface Settings {
  runtime_path: string;
  gpmlogin_api_base_url: string;
  gpmglobal_api_base_url: string;
  donutbrowser_api_base_url: string;
  global_max_parallel_runtime: number;
}

export interface ProfileSummary {
  id: string;
  name: string;
  manager: string;
  group_name: string | null;
}

export interface InputCache {
  script_id: string;
  cli_args: string;
  default_inputs_json: string;
}

export interface RunHistoryItem {
  id: string;
  kind: string;
  job_id: string | null;
  job_name: string | null;
  script_id: string;
  script_name: string | null;
  profile_id: string;
  profile_name: string;
  group_name: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  pid: number | null;
  error_message: string | null;
  log_path: string | null;
  manager: string | null;
  batch_id: string | null;
  created_at: string;
  updated_at: string;
}
