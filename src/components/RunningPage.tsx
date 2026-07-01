import { Fragment, useEffect, useState } from "react";
import type { RunningTask } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";

export default function RunningPage() {
  const dialog = useDialog();
  const [tasks, setTasks] = useState<RunningTask[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async () => {
    try {
      setTasks(await api.listRunningTasks());
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  useEffect(() => {
    load();
    const id = window.setInterval(load, 3000);
    return () => window.clearInterval(id);
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const stopTask = async (task: RunningTask, mode?: string) => {
    try {
      await api.stopRunningTask(task.kind, task.id, mode);
      await load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  const stopChild = async (task: RunningTask, runId: string | null) => {
    if (!runId) return;
    try {
      await api.stopRunningProcess(task.kind, runId);
      await load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  const fmt = (value: string | null) => (value ? new Date(value).toLocaleString() : "-");

  return (
    <div>
      <h1>Running</h1>
      <div className="card">
        <div className="flex-row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Active Tasks ({tasks.length})</h2>
          <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
        </div>
        {tasks.length === 0 ? (
          <p className="text-muted">No running tasks.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Type</th>
                <th>Task</th>
                <th>Script</th>
                <th>Status</th>
                <th>Profiles</th>
                <th>Running</th>
                <th>Queued</th>
                <th>Scheduled</th>
                <th>Started</th>
                <th>Next Run</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <Fragment key={task.id}>
                  <tr key={task.id}>
                    <td>
                      <button className="expand-button" onClick={() => toggle(task.id)}>
                        {expanded.has(task.id) ? "▼" : "▶"}
                      </button>
                    </td>
                    <td>{task.kind}</td>
                    <td>{task.title}</td>
                    <td>{task.script_name || task.script_id || "-"}</td>
                    <td><span className={`status-badge status-${task.status}`}>{task.status}</span></td>
                    <td>{task.profile_count}</td>
                    <td>{task.running_count}</td>
                    <td>{task.queued_count}</td>
                    <td>{task.scheduled_count}</td>
                    <td>{fmt(task.started_at)}</td>
                    <td>{fmt(task.next_run_at)}</td>
                    <td>
                      <div className="flex-row">
                        {task.kind === "job" ? (
                          <>
                            <button className="btn btn-danger btn-sm" onClick={() => stopTask(task, "stop_running")}>Stop Running</button>
                            <button className="btn btn-danger btn-sm" onClick={() => stopTask(task, "stop_job")}>Stop Job</button>
                          </>
                        ) : (
                          <button className="btn btn-danger btn-sm" onClick={() => stopTask(task)}>Stop Task</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded.has(task.id) && task.children.map((child) => (
                    <tr key={`${task.id}-${child.id}`} className="running-child-row">
                      <td></td>
                      <td>profile</td>
                      <td>{child.profile_name}</td>
                      <td>{child.manager || "-"}</td>
                      <td><span className={`status-badge status-${child.status}`}>{child.status}</span></td>
                      <td colSpan={2}>{child.pid ?? "-"}</td>
                      <td>{fmt(child.started_at)}</td>
                      <td>{fmt(child.next_run_at)}</td>
                      <td colSpan={2}>{child.error_message || ""}</td>
                      <td>
                        {child.status === "running" && (
                          <button className="btn btn-danger btn-sm" onClick={() => stopChild(task, child.run_id)}>Stop</button>
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
    </div>
  );
}
