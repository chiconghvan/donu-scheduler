import { useEffect, useState } from "react";
import type {
  JobDefinition,
  JobProfileState,
  JobRun,
  Script,
} from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";

export default function JobDetailPage({
  jobId,
  onBack,
}: {
  jobId: string;
  onBack: () => void;
}) {
  const dialog = useDialog();
  const [job, setJob] = useState<JobDefinition | null>(null);
  const [states, setStates] = useState<JobProfileState[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [script, setScript] = useState<Script | null>(null);
  const [tab, setTab] = useState<"overview" | "states" | "runs" | "config">("overview");

  const load = async () => {
    try {
      const [j, s, r] = await Promise.all([
        api.getJob(jobId),
        api.getTodayJobStates(jobId),
        api.listJobRuns(jobId),
      ]);
      setJob(j);
      setStates(s);
      setRuns(r);
      try {
        setScript(await api.getScript(j.script_id));
      } catch {
        setScript(null);
      }
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  const handleStopRun = async (runId: string) => {
    try {
      await api.stopJobRun(runId);
      load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  useEffect(() => {
    load();
  }, [jobId]);

  return (
    <div className="page">
      {job && (
        <>
          <div className="page-header">
            <div className="page-title-block">
              <h1>{job.name}</h1>
              <div className="page-description">Scheduled job detail, today states, and run history.</div>
            </div>
            <div className="page-actions">
              <button className="btn btn-secondary btn-sm" onClick={onBack}>← Jobs</button>
              <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
            </div>
          </div>

          <div className="tabs">
            <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Overview</button>
            <button className={tab === "states" ? "active" : ""} onClick={() => setTab("states")}>Today States</button>
            <button className={tab === "runs" ? "active" : ""} onClick={() => setTab("runs")}>Run History</button>
            <button className={tab === "config" ? "active" : ""} onClick={() => setTab("config")}>Config</button>
          </div>

          {tab === "overview" && <>
          <div className="metric-grid">
            <div className="metric-card"><div className="metric-label">Profiles</div><div className="metric-value">{states.length}</div><div className="metric-note">today states</div></div>
            <div className="metric-card"><div className="metric-label">Success</div><div className="metric-value">{states.reduce((s, x) => s + x.success_count, 0)}</div><div className="metric-note">completed today</div></div>
            <div className="metric-card"><div className="metric-label">Failed</div><div className="metric-value">{states.reduce((s, x) => s + x.failed_count, 0)}</div><div className="metric-note">failed today</div></div>
            <div className="metric-card"><div className="metric-label">Runs</div><div className="metric-value">{runs.length}</div><div className="metric-note">history entries</div></div>
          </div>

          <div className="panel">
            <div className="panel-header"><h2>Job Info</h2><span className={`status-badge ${job.enabled ? "status-success" : "status-pending"}`}>{job.enabled ? "Enabled" : "Disabled"}</span></div>
            <table>
              <tbody>
                <tr>
                  <td style={{ width: 160 }}>Description</td>
                  <td>{job.description}</td>
                </tr>
                <tr>
                  <td>Script</td>
                  <td className="mono">
                    {script ? `${script.name} (${script.script_path})` : job.script_id}
                  </td>
                </tr>
                <tr>
                  <td>Profiles</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {job.profile_ids_json}
                  </td>
                </tr>
                <tr>
                  <td>Timeout</td>
                  <td>{job.timeout_seconds}s</td>
                </tr>
                <tr>
                  <td>Status</td>
                  <td>
                    <span
                      className={`status-badge ${
                        job.enabled ? "status-success" : "status-pending"
                      }`}
                    >
                      {job.enabled ? "ENABLED" : "DISABLED"}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          </>}

          {tab === "states" && <div className="panel table-panel">
            <div className="panel-header"><h2>Today's Profile States ({states.length})</h2></div>
            {states.length === 0 ? (
              <div className="empty-state"><div className="empty-state-inner"><div className="empty-icon">J</div><p className="text-muted">No states yet. States are created by the scheduler.</p></div></div>
            ) : (
              <div className="table-wrap"><table>
                <thead>
                  <tr>
                    <th>Profile ID</th>
                    <th>Target</th>
                    <th>Run</th>
                    <th>Success</th>
                    <th>Failed</th>
                    <th>Status</th>
                    <th>Next Run</th>
                    <th>Last Run</th>
                  </tr>
                </thead>
                <tbody>
                  {states.map((s) => (
                    <tr key={s.id}>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {s.profile_id.slice(0, 12)}...
                      </td>
                      <td>{s.target_count}</td>
                      <td>{s.run_count}</td>
                      <td>{s.success_count}</td>
                      <td>{s.failed_count}</td>
                      <td>
                        <span className={`status-badge status-${s.status}`}>
                          {s.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {s.next_run_at
                          ? new Date(s.next_run_at).toLocaleTimeString()
                          : "-"}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {s.last_run_at
                          ? new Date(s.last_run_at).toLocaleTimeString()
                          : "-"}
                      </td>
                    </tr>
                  ))}
                  </tbody>
              </table></div>
            )}
          </div>}

          {tab === "runs" && <div className="panel table-panel">
            <div className="panel-header"><h2>Run History ({runs.length})</h2></div>
            {runs.length === 0 ? (
              <p className="text-muted">No runs yet.</p>
            ) : (
              <div className="table-wrap"><table>
                <thead>
                  <tr>
                    <th>Profile ID</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Finished</th>
                    <th>Exit Code</th>
                    <th>Error</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {r.profile_id.slice(0, 12)}...
                      </td>
                      <td>
                        <span className={`status-badge status-${r.status}`}>
                          {r.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {new Date(r.started_at).toLocaleString()}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {r.finished_at
                          ? new Date(r.finished_at).toLocaleString()
                          : "-"}
                      </td>
                      <td>{r.exit_code ?? "-"}</td>
                      <td style={{ color: "var(--destructive)", fontSize: 12 }}>
                        {r.error_message || ""}
                      </td>
                      <td>
                        {r.status === "running" && (
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleStopRun(r.id)}
                          >
                            Stop
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </div>}

          {tab === "config" && <div className="json-grid">
            <div className="panel"><h2>Profiles JSON</h2><textarea readOnly value={job.profile_ids_json} rows={14} /></div>
            <div className="panel"><h2>Schedule JSON</h2><textarea readOnly value={job.schedule_json} rows={14} /></div>
            <div className="panel"><h2>Random JSON</h2><textarea readOnly value={job.random_json} rows={10} /></div>
            <div className="panel"><h2>CLI Args</h2><textarea readOnly value={job.cli_args || ""} rows={10} /></div>
          </div>}
        </>
      )}
    </div>
  );
}
