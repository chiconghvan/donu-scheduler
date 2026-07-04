import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronDown, ChevronRight, Eye, RefreshCw, Search, Square } from "lucide-react";
import { listRunHistory, listRunningTasks, stopRunningProcess, stopRunningTask } from "../../api";
import type { RunHistoryItem, RunningTask } from "../../types";
import { useInterval } from "../../hooks/useInterval";
import { formatDuration, formatTime } from "../../utils/format";
import { groupHistory } from "../../utils/historyGrouping";
import EmptyState from "../common/EmptyState";
import { useToast } from "../common/Toast";
import LogViewer from "../domain/LogViewer";
import ManagerBadge from "../domain/ManagerBadge";
import StatusBadge from "../domain/StatusBadge";

export default function ActivityPage() {
  const [tasks, setTasks] = useState<RunningTask[]>([]);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");
  const [log, setLog] = useState<{ kind: "test" | "job"; runId: string; running: boolean } | null>(null);
  const { addToast } = useToast();

  async function loadTasks() { try { setTasks(await listRunningTasks()); } catch { /* poll retry */ } }
  async function loadHistory() { try { setHistory(await listRunHistory()); } catch (err) { addToast({ type: "error", title: "History failed", message: String(err) }); } }
  async function loadAll() { await Promise.all([loadTasks(), loadHistory()]); }
  useEffect(() => { void loadAll(); }, []);
  useInterval(() => { void loadTasks(); }, 3000);

  const filtered = useMemo(() => history.filter((r) => {
    const q = query.toLowerCase();
    if (kind !== "all" && r.kind !== kind) return false;
    if (status !== "all" && r.status !== status) return false;
    return !q || `${r.script_name} ${r.profile_name} ${r.job_name}`.toLowerCase().includes(q);
  }), [history, query, kind, status]);
  const groups = groupHistory(filtered);

  function toggle(id: string) {
    setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  async function stopTask(t: RunningTask, mode?: string) {
    try { await stopRunningTask(t.kind, t.id, mode); await loadAll(); } catch (err) { addToast({ type: "error", title: "Stop failed", message: String(err) }); }
  }
  async function stopProc(kindValue: string, runId: string) {
    try { await stopRunningProcess(kindValue, runId); await loadAll(); } catch (err) { addToast({ type: "error", title: "Stop failed", message: String(err) }); }
  }

  return <div className="page">
    <div className="page__header"><h1 className="page__title"><Activity size={18} /> Activity</h1><button className="btn btn--secondary" onClick={loadAll}><RefreshCw size={14} /> Refresh</button></div>
    <section className="panel" style={{ marginBottom: 16 }}>
      <div className="panel__header">Active Tasks ({tasks.length})</div>
      <div className="panel__body">{tasks.length === 0 ? <EmptyState title="No active tasks" description="All automation is idle." /> : tasks.map((t) => <div className="task-card" key={`${t.kind}-${t.id}`}>
        <div className="task-card__header" onClick={() => toggle(`${t.kind}-${t.id}`)}>{expanded.has(`${t.kind}-${t.id}`) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}<StatusBadge status={t.status} /><div className="task-card__title">{t.title}</div><div className="task-card__meta">{t.running_count}/{t.profile_count} running</div><button className="btn btn--sm btn--danger" onClick={(e) => { e.stopPropagation(); void stopTask(t); }}><Square size={12} /> Stop</button>{t.kind === "job" && <button className="btn btn--sm btn--danger" onClick={(e) => { e.stopPropagation(); void stopTask(t, "stop_job"); }}>Stop Job</button>}</div>
        {expanded.has(`${t.kind}-${t.id}`) && <div className="task-card__children">{t.children.map((c) => <div className="task-card__child" key={c.id}><StatusBadge status={c.status} /><span style={{ flex: 1 }}>{c.profile_name}</span><span className="task-card__meta">pid {c.pid || "-"}</span>{c.run_id && <button className="btn btn--sm btn--ghost" onClick={() => setLog({ kind: t.kind === "job" ? "job" : "test", runId: c.run_id!, running: c.status === "running" })}><Eye size={12} /></button>}{c.run_id && <button className="btn btn--sm btn--danger" onClick={() => void stopProc(t.kind, c.run_id!)}><Square size={12} /></button>}</div>)}</div>}
      </div>)}</div>
    </section>
    <section className="panel">
      <div className="panel__header"><span>History</span><div className="page__actions"><div className="search-input"><Search size={14} className="search-input__icon" /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" /></div><select className="select" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">All</option><option value="test">Test</option><option value="job">Job</option></select><select className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All</option><option value="success">Success</option><option value="failed">Failed</option><option value="stopped">Stopped</option></select></div></div>
      <div className="panel__body panel__body--flush"><table className="table"><tbody>{groups.map((g) => g.children.map((r) => <tr key={r.id}><td><StatusBadge status={r.status} /></td><td>{r.kind}</td><td>{r.script_name || r.script_id}</td><td>{r.profile_name}</td><td>{r.manager && <ManagerBadge manager={r.manager} />}</td><td>{formatTime(r.started_at)}</td><td>{formatDuration(r.started_at, r.finished_at)}</td><td><button className="btn btn--sm btn--ghost" onClick={() => setLog({ kind: r.kind === "job" ? "job" : "test", runId: r.id, running: r.status === "running" })}><Eye size={12} /> Log</button></td></tr>))}</tbody></table></div>
    </section>
    {log && <div className="dialog-backdrop" onClick={() => setLog(null)}><div className="dialog" style={{ width: "80vw", height: "75vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}><div className="dialog__header">Log <button className="btn btn--sm btn--secondary" onClick={() => setLog(null)}>Close</button></div><LogViewer kind={log.kind} runId={log.runId} running={log.running} /></div></div>}
  </div>;
}
