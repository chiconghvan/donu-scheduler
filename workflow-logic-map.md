# Workflow Logic Map

## Use Cases
| Use case | Backend commands | Entities | States |
|---|---|---|---|
| Manage scripts | `list_scripts`, `get_script`, `create_script`, `update_script`, `delete_script`, `open_file_dialog`, `read_file_content` | `Script`, `ScriptInput` | n/a |
| Script store | `script_store_has_token`, `script_store_save_token`, `script_store_list`, `script_store_install`, `script_store_update`, `script_store_apply_pending_updates` | `ScriptStoreCatalog`, `ScriptStoreScript`, `ScriptInstallRecord` | installed, available, update_available, pending_update |
| Manual test run | `run_script_test`, `run_batch_test`, `list_test_runs`, `stop_test_run`, `stop_batch_test_run`, `get_run_log_tail` | `TestRun`, `ProfileSnapshot`, `LogEntry` | queued, running, success, failed, stopped |
| Scheduled jobs | `list_jobs`, `get_job`, `create_job`, `update_job`, `delete_job`, `set_job_enabled`, `get_today_job_states`, `list_job_runs`, `stop_job_run` | `JobDefinition`, `JobInput`, `JobProfileState`, `JobRun` | pending, running, done, expired, stopped, success, failed |
| Monitor activity | `list_running_tasks`, `stop_running_task`, `stop_running_process`, `list_run_history`, `get_run_history_log`, `get_run_log_tail` | `RunningTask`, `RunningProcess`, `RunHistoryItem` | running, queued, scheduled, stopped |
| Profiles | `list_gpm_profiles`, `list_gpmglobal_profiles`, `list_donut_profiles` | `ProfileSummary`, `ProfileCache` | available/unavailable by API result |
| Settings/runtime | `get_settings`, `update_settings`, `get_runtime_status`, `update_runtime` | `Settings`, `RuntimeStatus` | installed, update_available, pending_update |

## Main Data Models
| Model | Key fields |
|---|---|
| `Script` | `id`, `name`, `script_path`, `default_args`, `default_inputs_json` |
| `JobDefinition` | `id`, `enabled`, `script_id`, `profile_ids_json`, `schedule_json`, `random_json`, `cli_args`, `timeout_seconds` |
| `JobProfileState` | `job_id`, `profile_id`, `date`, `target_count`, `run_count`, `success_count`, `failed_count`, `status`, `next_run_at`, `current_run_id` |
| `JobRun` | `job_id`, `profile_id`, `script_id`, `status`, `pid`, `log_path`, `error_message` |
| `TestRun` | `script_id`, `profile_id`, `status`, `pid`, `cli_args`, `manager`, `batch_id`, `log_path` |
| `RunningTask` | `kind`, `title`, `status`, `profile_count`, `running_count`, `queued_count`, `children` |
| `RunHistoryItem` | unified test/job history row |

## Scheduler Behavior
Scheduler starts in `lib.rs` with `tauri::async_runtime::spawn()`, ticks every 20s.

Flow: reconcile stale running states -> list enabled jobs -> parse `profile_ids_json`, `schedule_json`, `random_json` -> upsert today's `job_profile_states` -> compute `next_run_at` -> spawn runtime if due -> update `job_runs` and `job_profile_states` after exit.

## Runner Behavior
`runner::spawn_runtime()` starts `donumate.exe` with plain CLI args: `--script`, `--manager`, `--api`, `--profile`, plus stored args. `runner::wait_runtime()` streams stdout/stderr to in-memory `LogRegistry`, disk log file, and frontend `log-stream` event.

## State Transitions
`TestRun`/`JobRun`: `queued|pending -> running -> success|failed|stopped`.

`JobProfileState`: `pending -> running -> pending|done|expired|stopped`. `done` when target reached, `expired` when window ends, `stopped` on user stop-job.

## Schedule Types
`window_count`: run N successful times in `[start_time, end_time]` with random min/max gap.

`fixed_interval`: run every `interval_minutes` after previous completion.

`daily_times`: run at fixed HH:MM times, one state per profile/day.
