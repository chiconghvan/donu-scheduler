import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarClock, CheckCircle, Clock, FileCode, Gauge, PlayCircle, RefreshCw } from "lucide-react";
import { listJobs, listRunHistory, listRunningTasks, listScripts } from "../../api";
import type { JobDefinition, RunHistoryItem, RunningTask, Script } from "../../types";
import { calculateSuccessRate, formatTime } from "../../utils/format";
import { getScheduleLabel, getUpcomingTime, parseProfilesCount } from "../../utils/schedule";
import StatusBadge from "../domain/StatusBadge";
import EmptyState from "../common/EmptyState";

interface Props {
  onNavigate: (page: string) => void;
}

export default function DashboardPage({ onNavigate }: Props) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [jobs, setJobs] = useState<JobDefinition[]>([]);
  const [running, setRunning] = useState<RunningTask[]>([]);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [scriptsRes, jobsRes, runningRes, historyRes] = await Promise.all([
        listScripts(),
        listJobs(),
        listRunningTasks(),
        listRunHistory(),
      ]);
      setScripts(scriptsRes);
      setJobs(jobsRes);
      setRunning(runningRes);
      setHistory(historyRes);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const enabledJobs = jobs.filter((j) => j.enabled === 1).length;
  const disabledJobs = jobs.length - enabledJobs;
  const activeProfiles = running.reduce((sum, task) => sum + task.running_count, 0);
  const queuedProfiles = running.reduce((sum, task) => sum + task.queued_count + task.scheduled_count, 0);
  const failedRuns = history.filter((run) => run.status === "failed").length;
  const stoppedRuns = history.filter((run) => run.status === "stopped").length;
  const successRate = calculateSuccessRate(history);
  const lastRun = history[0];
  const enabledJobList = useMemo(() => jobs.filter((j) => j.enabled === 1), [jobs]);
  const healthState = running.length > 0 ? "running" : failedRuns > 0 ? "attention" : "idle";
  const healthLabel = healthState === "running" ? "Automation running" : healthState === "attention" ? "Needs attention" : "System idle";

  return (
    <div className="page dashboard-page">
      <div className="page__header dashboard-page__header">
        <div>
          <h1 className="page__title">Dashboard</h1>
          <div className="dashboard-page__subtitle">Scheduler overview, workload, job coverage.</div>
        </div>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>
      {error && <div className="error-banner"><span className="error-banner__message">{error}</span></div>}

      <section className="dashboard-hero">
        <div className={`dashboard-hero__orb dashboard-hero__orb--${healthState}`} />
        <div>
          <div className="dashboard-hero__eyebrow"><Gauge size={14} /> Control Center</div>
          <h2>{healthLabel}</h2>
          <p>{running.length > 0 ? `${running.length} task group(s), ${activeProfiles} profile(s) executing now.` : lastRun ? `Last process started at ${formatTime(lastRun.started_at)}.` : "No run history yet."}</p>
        </div>
        <div className="dashboard-hero__stats">
          <div><span>{successRate}%</span><small>Success</small></div>
          <div><span>{activeProfiles}</span><small>Running profiles</small></div>
          <div><span>{enabledJobs}</span><small>Enabled jobs</small></div>
        </div>
      </section>

      {loading ? (
        <>
          <div className="dashboard-main"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div>
          <section className="panel dashboard-panel dashboard-workload-panel"><div className="panel__body"><div className="skeleton skeleton-card" /></div></section>
        </>
      ) : (
        <>
          <div className="dashboard-main">
            <section className="panel dashboard-panel dashboard-schedule-panel">
              <div className="panel__header"><span>Upcoming Schedule</span><button className="btn btn--sm btn--ghost" onClick={() => onNavigate("jobs")}>Manage Jobs</button></div>
              <div className="panel__body panel__body--flush">
                {enabledJobList.length === 0 ? <EmptyState icon={<AlertTriangle size={42} />} title="No enabled jobs" description="Create or enable jobs to populate scheduler timeline." action={jobs.length === 0 ? <button className="btn btn--primary" onClick={() => onNavigate("jobs")}>Create Job</button> : undefined} /> : (
                  <table className="table dashboard-schedule"><thead><tr><th>Job</th><th>Window</th><th>Next</th><th>Profiles</th></tr></thead><tbody>{enabledJobList.map((job) => (
                    <tr key={job.id} onClick={() => onNavigate("jobs")}><td>{job.name}</td><td>{getScheduleLabel(job)}</td><td><Clock size={14} /> {getUpcomingTime(job)}</td><td>{parseProfilesCount(job.profile_ids_json)}</td></tr>
                  ))}</tbody></table>
                )}
              </div>
            </section>

            <div className="dashboard-kpi-grid">
              <Metric icon={<FileCode size={18} />} value={scripts.length} label="Scripts installed" meta="Script Store" onClick={() => onNavigate("store")} />
              <Metric icon={<CalendarClock size={18} />} value={`${enabledJobs}/${jobs.length}`} label="Jobs enabled" meta={`${disabledJobs} disabled`} onClick={() => onNavigate("jobs")} />
              <Metric icon={<Activity size={18} />} value={running.length} label="Active task groups" meta={`${queuedProfiles} queued/scheduled`} onClick={() => onNavigate("activity")} />
              <Metric icon={<CheckCircle size={18} />} value={`${successRate}%`} label="Run health" meta={`${failedRuns} failed, ${stoppedRuns} stopped`} onClick={() => onNavigate("activity")} />
            </div>
          </div>

          <section className="panel dashboard-panel dashboard-workload-panel">
            <div className="panel__header"><span>Live Workload</span><button className="btn btn--sm btn--ghost" onClick={() => onNavigate("activity")}>Open Activity</button></div>
            <div className="panel__body">
              {running.length === 0 ? <EmptyState icon={<PlayCircle size={42} />} title="Automation idle" description="No profiles are executing now." /> : (
                <div className="dashboard-workload">{running.map((task) => <WorkloadCard key={`${task.kind}-${task.id}`} task={task} onClick={() => onNavigate("activity")} />)}</div>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ icon, value, label, meta, onClick }: { icon: React.ReactNode; value: React.ReactNode; label: string; meta: string; onClick: () => void }) {
  return <div className="card card--clickable metric-card dashboard-metric" onClick={onClick}><div className="metric-card__icon">{icon}</div><div className="metric-card__value">{value}</div><div className="metric-card__label">{label}</div><div className="dashboard-metric__meta">{meta}</div></div>;
}

function WorkloadCard({ task, onClick }: { task: RunningTask; onClick: () => void }) {
  return <button className="dashboard-workload__card" onClick={onClick}>
    <div><StatusBadge status={task.status} /></div>
    <div className="dashboard-workload__main"><strong>{task.title}</strong><span>{task.running_count}/{task.profile_count} running</span></div>
    <div className="dashboard-workload__queue">{task.queued_count + task.scheduled_count} queued</div>
  </button>;
}
