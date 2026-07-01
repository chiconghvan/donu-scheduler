import { Fragment, useEffect, useRef, useState } from "react";
import type { RunHistoryItem } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";

interface HistoryTask {
  id: string;
  kind: string;
  title: string;
  script_id: string | null;
  script_name: string | null;
  job_id: string | null;
  job_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  children: RunHistoryItem[];
}

function groupHistory(runs: RunHistoryItem[]): HistoryTask[] {
  const taskMap = new Map<string, HistoryTask>();
  const singles: HistoryTask[] = [];

  for (const r of runs) {
    if (r.kind === "job" && r.job_id) {
      const key = `job-${r.job_id}`;
      const existing = taskMap.get(key);
      if (existing) {
        existing.children.push(r);
        if (!existing.started_at || r.started_at < existing.started_at) existing.started_at = r.started_at;
        if (!existing.finished_at || (r.finished_at && r.finished_at > existing.finished_at!)) existing.finished_at = r.finished_at;
      } else {
        taskMap.set(key, {
          id: r.job_id,
          kind: "job",
          title: r.job_name || r.job_id,
          script_id: r.script_id,
          script_name: r.script_name,
          job_id: r.job_id,
          job_name: r.job_name,
          started_at: r.started_at,
          finished_at: r.finished_at,
          children: [r],
        });
      }
    } else if (r.kind === "test" && r.batch_id) {
      const key = `batch-${r.batch_id}`;
      const existing = taskMap.get(key);
      if (existing) {
        existing.children.push(r);
        if (!existing.started_at || r.started_at < existing.started_at) existing.started_at = r.started_at;
        if (!existing.finished_at || (r.finished_at && r.finished_at > existing.finished_at!)) existing.finished_at = r.finished_at;
      } else {
        taskMap.set(key, {
          id: r.batch_id,
          kind: "test_batch",
          title: `Batch (${r.script_name || r.script_id.slice(0, 8)})`,
          script_id: r.script_id,
          script_name: r.script_name,
          job_id: null,
          job_name: null,
          started_at: r.started_at,
          finished_at: r.finished_at,
          children: [r],
        });
      }
    } else {
      singles.push({
        id: r.id,
        kind: "test_single",
        title: "Single",
        script_id: r.script_id,
        script_name: r.script_name,
        job_id: null,
        job_name: null,
        started_at: r.started_at,
        finished_at: r.finished_at,
        children: [r],
      });
    }
  }

  return [...singles, ...taskMap.values()].sort((a, b) => {
    const aStart = a.started_at || "";
    const bStart = b.started_at || "";
    return bStart.localeCompare(aStart);
  });
}

export default function RunHistoryPage() {
  const dialog = useDialog();
  const [runs, setRuns] = useState<RunHistoryItem[]>([]);
  const [selectedRun, setSelectedRun] = useState<RunHistoryItem | null>(null);
  const [log, setLog] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLPreElement>(null);

  const load = async () => {
    try {
      const history = await api.listRunHistory();
      setRuns(history);
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const container = logContainerRef.current;
    if (container && logEndRef.current) {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      if (isNearBottom) {
        logEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [log]);

  const tasks = groupHistory(runs);
  const totalChildren = tasks.reduce((s, t) => s + t.children.length, 0);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getProfileLabel = (item: RunHistoryItem) => {
    const source = item.manager || (item.kind === "job" ? "donut" : "unknown");
    const label = source === "gpm" ? "GPM" : source === "gpmglobal" ? "GPMGlobal" : source === "donut" ? "Donut" : "Unknown";
    const displayName = item.profile_name || item.profile_id.slice(0, 12) + "...";
    return (
      <span style={{ display: "inline-flex", alignItems: "center" }}>
        <span className={`manager-badge ${source === "gpm" ? "manager-gpm" : source === "gpmglobal" ? "manager-gpmglobal" : "manager-donut"}`}>
          {label}
        </span>
        {displayName}
      </span>
    );
  };

  const openLog = async (item: RunHistoryItem) => {
    setSelectedRun(item);
    setLog("");
    try {
      const existingLog = await api.getRunHistoryLog(item.kind, item.id);
      if (existingLog) setLog(existingLog);
    } catch {
      // ignore
    }
  };

  const fmt = (value: string | null) => (value ? new Date(value).toLocaleString() : "-");

  return (
    <div>
      <h1>Run History</h1>

      <div className="card">
        <div className="flex-row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>All Runs ({totalChildren})</h2>
          <button className="btn btn-secondary btn-sm" onClick={load}>
            Refresh
          </button>
        </div>

        {tasks.length === 0 ? (
          <p className="text-muted">No runs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Type</th>
                <th>Task</th>
                <th>Script</th>
                <th>Runs</th>
                <th>Status</th>
                <th>Started</th>
                <th>Finished</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <Fragment key={task.id}>
                  <tr>
                    <td>
                      {task.children.length > 1 && (
                        <button className="expand-button" onClick={() => toggle(task.id)}>
                          {expanded.has(task.id) ? "▼" : "▶"}
                        </button>
                      )}
                    </td>
                    <td>{task.kind}</td>
                    <td>{task.title}</td>
                    <td>{task.script_name || task.script_id || "-"}</td>
                    <td>{task.children.length}</td>
                    <td>
                      {task.children.length === 1 ? (
                        <span className={`status-badge status-${task.children[0].status}`}>
                          {task.children[0].status}
                        </span>
                      ) : (
                        <span className="status-badge status-done">
                          {task.children.filter((c) => c.status === "success").length}/
                          {task.children.length}
                        </span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmt(task.started_at)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(task.finished_at)}</td>
                    <td>
                      {task.children.length === 1 && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => openLog(task.children[0])}
                        >
                          Log
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded.has(task.id) &&
                    task.children.map((child) => (
                      <tr key={`${child.kind}-${child.id}`} className="history-child-row">
                        <td></td>
                        <td colSpan={2}>
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            {getProfileLabel(child)}
                          </span>
                        </td>
                        <td style={{ fontFamily: "monospace", fontSize: 11, color: "#8899b0" }}>
                          PID {child.pid ?? "-"}
                        </td>
                        <td>
                          <span className={`status-badge status-${child.status}`}>{child.status}</span>
                        </td>
                        <td style={{ fontSize: 12 }}>{fmt(child.started_at)}</td>
                        <td style={{ fontSize: 12 }}>{fmt(child.finished_at)}</td>
                        <td>{child.exit_code ?? "-"}</td>
                        <td>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openLog(child)}
                          >
                            Log
                          </button>
                          {child.error_message && (
                            <span style={{ marginLeft: 6, fontSize: 11, color: "#e95d5d" }}>
                              {child.error_message}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedRun && (
        <div className="card">
          <h2>
            Log Output - {selectedRun.kind}: {selectedRun.script_name || selectedRun.script_id.slice(0, 8)}
          </h2>
          <pre className="log-box" ref={logContainerRef}>
            {log || "(loading...)"}
            <div ref={logEndRef} />
          </pre>
        </div>
      )}
    </div>
  );
}
