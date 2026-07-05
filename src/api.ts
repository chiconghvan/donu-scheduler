import { invoke } from "@tauri-apps/api/core";
import type {
  Script,
  ScriptInput,
  JobDefinition,
  JobInput,
  JobProfileState,
  JobRun,
  TestRun,
  Settings,
  ProfileSummary,
  ProfileSnapshot,
  RunningTask,
  InputCache,
  RunHistoryItem,
  LogEntry,
  RuntimeStatus,
  ScriptStoreCatalog,
  ScriptStoreInstallResult,
  ScriptStoreUpdateApplied,
  AppUpdateInfo,
  AppUpdatePrepareResult,
} from "./types";

export async function listScripts(): Promise<Script[]> {
  return invoke("list_scripts");
}

export async function getScript(id: string): Promise<Script> {
  return invoke("get_script", { id });
}

export async function createScript(input: ScriptInput): Promise<Script> {
  return invoke("create_script", { input });
}

export async function updateScript(
  id: string,
  input: ScriptInput
): Promise<Script> {
  return invoke("update_script", { id, input });
}

export async function deleteScript(id: string): Promise<void> {
  return invoke("delete_script", { id });
}

export async function listJobs(): Promise<JobDefinition[]> {
  return invoke("list_jobs");
}

export async function getJob(id: string): Promise<JobDefinition> {
  return invoke("get_job", { id });
}

export async function createJob(input: JobInput): Promise<JobDefinition> {
  return invoke("create_job", { input });
}

export async function updateJob(
  id: string,
  input: JobInput
): Promise<JobDefinition> {
  return invoke("update_job", { id, input });
}

export async function deleteJob(id: string): Promise<void> {
  return invoke("delete_job", { id });
}

export async function setJobEnabled(
  id: string,
  enabled: boolean
): Promise<void> {
  return invoke("set_job_enabled", { id, enabled: enabled ? 1 : 0 });
}

export async function getTodayJobStates(
  jobId: string
): Promise<JobProfileState[]> {
  return invoke("get_today_job_states", { jobId });
}

export async function listJobRuns(jobId: string): Promise<JobRun[]> {
  return invoke("list_job_runs", { jobId });
}

export async function getSettings(): Promise<Settings> {
  return invoke("get_settings");
}

export async function updateSettings(settings: Settings): Promise<void> {
  return invoke("update_settings", { settings });
}

export async function updateRuntime(): Promise<void> {
  return invoke("update_runtime");
}

export async function getRuntimeStatus(): Promise<RuntimeStatus> {
  return invoke("get_runtime_status");
}

export async function getAppVersion(): Promise<string> {
  return invoke("get_app_version");
}

export async function checkForAppUpdates(): Promise<AppUpdateInfo | null> {
  return invoke("check_for_app_updates");
}

export async function checkForAppUpdatesManual(): Promise<AppUpdateInfo | null> {
  return invoke("check_for_app_updates_manual");
}

export async function getPendingAppUpdate(): Promise<AppUpdatePrepareResult | null> {
  return invoke("get_pending_app_update");
}

export async function downloadAndPrepareAppUpdate(
  update: AppUpdateInfo
): Promise<AppUpdatePrepareResult> {
  return invoke("download_and_prepare_app_update", { update });
}

export async function restartApplication(installerPath?: string): Promise<void> {
  return invoke("restart_application", { installerPath: installerPath ?? null });
}

export async function runScriptTest(
  scriptId: string,
  profileId: string,
  cliArgs: string,
  manager: string,
  profileSnapshot: ProfileSnapshot
): Promise<TestRun> {
  return invoke("run_script_test", {
    scriptId,
    profileId,
    cliArgs,
    manager,
    profileSnapshot,
  });
}

export async function runBatchTest(
  scriptId: string,
  profileIds: string[],
  cliArgs: string,
  manager: string,
  profileSnapshots: ProfileSnapshot[]
): Promise<TestRun[]> {
  return invoke("run_batch_test", {
    scriptId,
    profileIds,
    cliArgs,
    manager,
    profileSnapshots,
  });
}

export async function listRunningTasks(): Promise<RunningTask[]> {
  return invoke("list_running_tasks");
}

export async function stopRunningTask(
  kind: string,
  taskId: string,
  mode?: string
): Promise<void> {
  return invoke("stop_running_task", { kind, taskId, mode });
}

export async function stopRunningProcess(
  kind: string,
  runId: string
): Promise<void> {
  return invoke("stop_running_process", { kind, runId });
}

export async function listTestRuns(): Promise<TestRun[]> {
  return invoke("list_test_runs");
}

export async function listRunHistory(): Promise<RunHistoryItem[]> {
  return invoke("list_run_history");
}

export async function getTestRunLog(runId: string): Promise<string> {
  return invoke("get_test_run_log", { runId });
}

export async function getRunHistoryLog(
  kind: string,
  runId: string
): Promise<string> {
  return invoke("get_run_history_log", { kind, runId });
}

export async function getRunLogTail(
  kind: string,
  runId: string,
  afterSeq: number | null,
  maxLines: number
): Promise<LogEntry[]> {
  return invoke("get_run_log_tail", { kind, runId, afterSeq, maxLines });
}

export async function stopTestRun(runId: string): Promise<void> {
  return invoke("stop_test_run", { runId });
}

export async function stopBatchTestRun(batchId: string): Promise<void> {
  return invoke("stop_batch_test_run", { batchId });
}

export async function stopJobRun(runId: string): Promise<void> {
  return invoke("stop_job_run", { runId });
}

export async function listGpmProfiles(): Promise<ProfileSummary[]> {
  return invoke("list_gpm_profiles");
}

export async function listGpmGlobalProfiles(): Promise<ProfileSummary[]> {
  return invoke("list_gpmglobal_profiles");
}

export async function listDonutProfiles(): Promise<ProfileSummary[]> {
  return invoke("list_donut_profiles");
}

export async function openFileDialog(
  filterName: string,
  filterExtensions: string[]
): Promise<string | null> {
  return invoke("open_file_dialog", { filterName, filterExtensions });
}

export async function readFileContent(path: string): Promise<string> {
  return invoke("read_file_content", { path });
}

export async function getInputCache(scriptId: string): Promise<InputCache> {
  return invoke("get_input_cache", { scriptId });
}

export async function saveInputCache(
  scriptId: string,
  cliArgs: string,
  defaultInputsJson: string
): Promise<void> {
  return invoke("save_input_cache", {
    scriptId,
    cliArgs,
    defaultInputsJson,
  });
}

export async function scriptStoreHasToken(): Promise<boolean> {
  return invoke("script_store_has_token");
}

export async function scriptStoreSaveToken(token: string): Promise<void> {
  return invoke("script_store_save_token", { token });
}

export async function listScriptStore(): Promise<ScriptStoreCatalog> {
  return invoke("script_store_list");
}

export async function installScriptStore(scriptId: string): Promise<ScriptStoreInstallResult> {
  return invoke("script_store_install", { scriptId });
}

export async function updateScriptStore(scriptId: string): Promise<ScriptStoreInstallResult> {
  return invoke("script_store_update", { scriptId });
}

export async function applyPendingScriptStoreUpdates(): Promise<ScriptStoreUpdateApplied[]> {
  return invoke("script_store_apply_pending_updates");
}
