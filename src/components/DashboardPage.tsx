import { useEffect, useMemo, useState } from "react";
import * as api from "../api";
import type { JobDefinition, RunHistoryItem, RunningTask, Settings } from "../types";
import { useDialog } from "./DialogHost";

interface Props {
  onOpenJobs: () => void;
  onOpenRunning: () => void;
  onOpenHistory: () => void;
  onOpenStore: () => void;
  onOpenSettings: () => void;
}

function parseProfilesCount(value: string) {
  try {
    const profiles = JSON.parse(value || "[]");
    return Array.isArray(profiles) ? profiles.length : 0;
  } catch {
    return 0;
  }
}

function getScheduleLabel(job: JobDefinition) {
  try {
    const schedule = JSON.parse(job.schedule_json || "{}");
    if (schedule.type === "window_count") {
      return `${schedule.start_time || "--:--"}-${schedule.end_time || "--:--"}`;
    }
    if (schedule.type === "fixed_interval") {
      return `Every ${schedule.interval_minutes || "?"}m`;
    }
    if (schedule.type === "daily_times") {
      return Array.isArray(schedule.times) ? schedule.times.slice(0, 3).join(", ") : "Daily times";
    }
  } catch {
    return "Invalid schedule";
  }
  return "Schedule";
}

function getUpcomingTime(job: JobDefinition) {
  try {
    const schedule = JSON.parse(job.schedule_json || "{}");
    if (schedule.type === "window_count" && schedule.start_time) return schedule.start_time;
    if (schedule.type === "daily_times" && Array.isArray(schedule.times) && schedule.times.length > 0) {
      const now = new Date();
      const current = now.getHours() * 60 + now.getMinutes();
      const future = schedule.times
        .map((time: string) => {
          const [h, m] = String(time).split(":").map(Number);
          return { time, minutes: h * 60 + m };
        })
        .filter((item: { minutes: number }) => Number.isFinite(item.minutes))
        .sort((a: { minutes: number }, b: { minutes: number }) => a.minutes - b.minutes)
        .find((item: { minutes: number }) => item.minutes >= current);
      return future?.time || schedule.times[0];
    }
  } catch {
    return "--:--";
  }
  return "--:--";
}

function fmtTime(value: string | null) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return value;
  }
}

export default function DashboardPage({
  onOpenJobs,
  onOpenRunning,
  onOpenHistory,
  onOpenStore,
  onOpenSettings,
}: Props) {
  const dialog = useDialog();
  const [jobs, setJobs] = useState<JobDefinition[]>([]);
  const [running, setRunning] = useState<RunningTask[]>([]);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [jobData, runningData, historyData, settingsData] = await Promise.all([
        api.listJobs(),
        api.listRunningTasks(),
        api.listRunHistory(),
        api.getSettings(),
      ]);
      setJobs(jobData);
      setRunning(runningData);
      setHistory(historyData);
      setSettings(settingsData);
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const activeJobs = jobs.filter((job) => !!job.enabled);
    const runningProfiles = running.reduce((sum, task) => sum + task.running_count, 0);
    const queuedProfiles = running.reduce((sum, task) => sum + task.queued_count + task.scheduled_count, 0);
    const today = new Date().toDateString();
    const failedToday = history.filter((item) => {
      try {
        return item.status === "failed" && new Date(item.started_at).toDateString() === today;
      } catch {
        return false;
      }
    }).length;
    return { activeJobs, runningProfiles, queuedProfiles, failedToday };
  }, [jobs, running, history]);

  const upcoming = useMemo(
    () =>
      stats.activeJobs
        .map((job) => ({
          job,
          time: getUpcomingTime(job),
          profiles: parseProfilesCount(job.profile_ids_json),
          label: getScheduleLabel(job),
        }))
        .sort((a, b) => a.time.localeCompare(b.time))
        .slice(0, 6),
    [stats.activeJobs]
  );

  const recent = history.slice(0, 6);
  const hasData = jobs.length > 0 || running.length > 0 || history.length > 0;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Dashboard</h1>
          <div className="page-description">Idle cockpit for schedules, runtime, managers, and recent automation activity.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={onOpenJobs}>+ New Job</button>
        </div>
      </div>

      {!hasData ? (
        <div className="panel empty-state">
          <div className="empty-state-inner">
            <div className="empty-icon">DS</div>
            <h2>No automation configured yet</h2>
            <p className="text-muted">Install a script, connect a profile manager, then create first scheduled job.</p>
            <div className="page-actions">
              <button className="btn btn-primary btn-sm" onClick={onOpenStore}>Open Script Store</button>
              <button className="btn btn-secondary btn-sm" onClick={onOpenSettings}>Settings</button>
              <button className="btn btn-secondary btn-sm" onClick={onOpenJobs}>+ New Job</button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="metric-grid">
            <button className="metric-card" onClick={onOpenJobs} type="button">
              <div className="metric-label">Jobs Active</div>
              <div className="metric-value">{stats.activeJobs.length}</div>
              <div className="metric-note">{jobs.length - stats.activeJobs.length} disabled</div>
            </button>
            <button className="metric-card" onClick={onOpenRunning} type="button">
              <div className="metric-label">Running Now</div>
              <div className="metric-value">{stats.runningProfiles}</div>
              <div className="metric-note">{running.length} active tasks</div>
            </button>
            <button className="metric-card" onClick={onOpenJobs} type="button">
              <div className="metric-label">Queued / Scheduled</div>
              <div className="metric-value">{stats.queuedProfiles}</div>
              <div className="metric-note">across running tasks</div>
            </button>
            <button className="metric-card" onClick={onOpenHistory} type="button">
              <div className="metric-label">Failed Today</div>
              <div className="metric-value">{stats.failedToday}</div>
              <div className="metric-note">View logs</div>
            </button>
          </div>

          <div className="dashboard-grid two-col">
            <section className="panel table-panel">
              <div className="panel-header">
                <h2>Upcoming Schedule</h2>
                <button className="btn btn-secondary btn-sm" onClick={onOpenJobs}>Jobs</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Job</th>
                      <th>Profiles</th>
                      <th>Schedule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcoming.length === 0 ? (
                      <tr><td colSpan={4} className="text-muted">No enabled jobs.</td></tr>
                    ) : upcoming.map((item) => (
                      <tr key={item.job.id} onClick={onOpenJobs} style={{ cursor: "pointer" }}>
                        <td className="mono">{item.time}</td>
                        <td>{item.job.name}</td>
                        <td>{item.profiles}</td>
                        <td className="text-muted">{item.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>System Health</h2>
                <button className="btn btn-secondary btn-sm" onClick={onOpenSettings}>Settings</button>
              </div>
              <div className="form-section">
                <div className="flex-row" style={{ justifyContent: "space-between" }}>
                  <span>Runtime</span>
                  <span className="status-badge status-success">OK</span>
                </div>
                <div className="flex-row" style={{ justifyContent: "space-between" }}>
                  <span>GPMLogin</span>
                  <span className="text-muted mono">{settings?.gpmlogin_api_base_url || "-"}</span>
                </div>
                <div className="flex-row" style={{ justifyContent: "space-between" }}>
                  <span>GPMGlobal</span>
                  <span className="text-muted mono">{settings?.gpmglobal_api_base_url || "-"}</span>
                </div>
                <div className="flex-row" style={{ justifyContent: "space-between" }}>
                  <span>Donut API</span>
                  <span className="text-muted mono">{settings?.donutbrowser_api_base_url || "-"}</span>
                </div>
                <div className="flex-row" style={{ justifyContent: "space-between" }}>
                  <span>Max Parallel</span>
                  <span className="status-badge status-pending">{settings?.global_max_parallel_runtime ?? "-"}</span>
                </div>
              </div>
            </section>
          </div>

          <div className="dashboard-grid two-col">
            <section className="panel table-panel">
              <div className="panel-header">
                <h2>Active Tasks</h2>
                <button className="btn btn-secondary btn-sm" onClick={onOpenRunning}>Running</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Task</th>
                      <th>State</th>
                      <th>Progress</th>
                      <th>Next</th>
                    </tr>
                  </thead>
                  <tbody>
                    {running.length === 0 ? (
                      <tr><td colSpan={4} className="text-muted">No running tasks.</td></tr>
                    ) : running.slice(0, 6).map((task) => (
                      <tr key={task.id} onClick={onOpenRunning} style={{ cursor: "pointer" }}>
                        <td>{task.title}</td>
                        <td><span className={`status-badge status-${task.status}`}>{task.status}</span></td>
                        <td>{task.running_count}/{task.profile_count}</td>
                        <td className="mono text-muted">{fmtTime(task.next_run_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="panel table-panel">
              <div className="panel-header">
                <h2>Recent Runs</h2>
                <button className="btn btn-secondary btn-sm" onClick={onOpenHistory}>History</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Run</th>
                      <th>Profile</th>
                      <th>Result</th>
                      <th>Started</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.length === 0 ? (
                      <tr><td colSpan={4} className="text-muted">No runs yet.</td></tr>
                    ) : recent.map((item) => (
                      <tr key={`${item.kind}-${item.id}`} onClick={onOpenHistory} style={{ cursor: "pointer" }}>
                        <td>{item.job_name || item.script_name || item.kind}</td>
                        <td>{item.profile_name || item.profile_id.slice(0, 10)}</td>
                        <td><span className={`status-badge status-${item.status}`}>{item.status}</span></td>
                        <td className="mono text-muted">{fmtTime(item.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
