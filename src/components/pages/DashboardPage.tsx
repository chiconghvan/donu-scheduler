import { useEffect, useState } from "react";
import { Activity, CalendarClock, CheckCircle, Clock, FileCode, RefreshCw } from "lucide-react";
import { listJobs, listRunHistory, listRunningTasks, listScripts } from "../../api";
import type { JobDefinition, RunHistoryItem, RunningTask, Script } from "../../types";
import { calculateSuccessRate, formatDuration, formatTime } from "../../utils/format";
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
  const recentRuns = history.slice(0, 10);

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">Dashboard</h1>
        <div className="page__actions">
          <button className="btn btn--secondary" onClick={load} disabled={loading}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>
      {error && <div className="error-banner"><span className="error-banner__message">{error}</span></div>}

      <div className="metric-grid">
        <Metric icon={<FileCode size={18} />} value={scripts.length} label="Scripts" onClick={() => onNavigate("store")} />
        <Metric icon={<CalendarClock size={18} />} value={`${enabledJobs}/${jobs.length}`} label="Jobs enabled" onClick={() => onNavigate("jobs")} />
        <Metric icon={<Activity size={18} />} value={running.length} label="Active tasks" onClick={() => onNavigate("activity")} />
        <Metric icon={<CheckCircle size={18} />} value={`${calculateSuccessRate(history)}%`} label="Success rate" onClick={() => onNavigate("activity")} />
      </div>

      {loading ? (
        <div className="two-col-grid"><div className="skeleton skeleton-card" /><div className="skeleton skeleton-card" /></div>
      ) : jobs.length === 0 ? (
        <EmptyState icon={<CalendarClock size={48} />} title="No jobs configured" description="Create first scheduled automation job." action={<button className="btn btn--primary" onClick={() => onNavigate("jobs")}>Create Job</button>} />
      ) : (
        <>
          <div className="two-col-grid">
            <section className="panel">
              <div className="panel__header">Active Tasks</div>
              <div className="panel__body panel__body--flush">
                {running.length === 0 ? <EmptyState title="No active tasks" description="Automation idle." /> : (
                  <table className="table"><tbody>{running.slice(0, 5).map((t) => (
                    <tr key={`${t.kind}-${t.id}`} onClick={() => onNavigate("activity")} style={{ cursor: "pointer" }}>
                      <td><StatusBadge status={t.status} /></td><td>{t.title}</td><td>{t.profile_count} profiles</td>
                    </tr>
                  ))}</tbody></table>
                )}
              </div>
            </section>
            <section className="panel">
              <div className="panel__header">Upcoming Schedule</div>
              <div className="panel__body panel__body--flush">
                <table className="table"><tbody>{jobs.filter((j) => j.enabled === 1).slice(0, 8).map((j) => (
                  <tr key={j.id} onClick={() => onNavigate("jobs")} style={{ cursor: "pointer" }}>
                    <td><Clock size={14} /></td><td>{j.name}</td><td>{getScheduleLabel(j)}</td><td>{getUpcomingTime(j)}</td><td>{parseProfilesCount(j.profile_ids_json)} profiles</td>
                  </tr>
                ))}</tbody></table>
              </div>
            </section>
          </div>
          <section className="panel">
            <div className="panel__header">Recent Runs</div>
            <div className="panel__body panel__body--flush">
              <div className="table-wrap"><table className="table"><thead><tr><th>Status</th><th>Script</th><th>Profile</th><th>Time</th><th>Duration</th></tr></thead><tbody>{recentRuns.map((r) => (
                <tr key={`${r.kind}-${r.id}`}><td><StatusBadge status={r.status} /></td><td>{r.script_name || r.script_id}</td><td>{r.profile_name || r.profile_id}</td><td>{formatTime(r.started_at)}</td><td>{formatDuration(r.started_at, r.finished_at)}</td></tr>
              ))}</tbody></table></div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ icon, value, label, onClick }: { icon: React.ReactNode; value: React.ReactNode; label: string; onClick: () => void }) {
  return <div className="card card--clickable metric-card" onClick={onClick}><div className="metric-card__icon">{icon}</div><div className="metric-card__value">{value}</div><div className="metric-card__label">{label}</div></div>;
}
