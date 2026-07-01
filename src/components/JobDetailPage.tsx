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
    <div>
      <button className="btn btn-secondary mb-12" onClick={onBack}>
        &larr; Back to Jobs
      </button>

      {job && (
        <>
          <h1>{job.name}</h1>
          <div className="card">
            <h2>Job Info</h2>
            <table>
              <tbody>
                <tr>
                  <td style={{ width: 160 }}>Description</td>
                  <td>{job.description}</td>
                </tr>
                <tr>
                  <td>Script</td>
                  <td style={{ fontFamily: "monospace" }}>
                    {script ? `${script.name} (${script.script_path})` : job.script_id}
                  </td>
                </tr>
                <tr>
                  <td>Profiles</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
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

          <div className="card">
            <h2>Today's Profile States ({states.length})</h2>
            {states.length === 0 ? (
              <p className="text-muted">
                No states yet. States are created by the scheduler.
              </p>
            ) : (
              <table>
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
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
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
              </table>
            )}
          </div>

          <div className="card">
            <h2>Run History ({runs.length})</h2>
            {runs.length === 0 ? (
              <p className="text-muted">No runs yet.</p>
            ) : (
              <table>
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
                      <td style={{ fontFamily: "monospace", fontSize: 12 }}>
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
                      <td style={{ color: "#e95d5d", fontSize: 12 }}>
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
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
