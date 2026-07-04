import { useEffect, useMemo, useState } from "react";
import { Eye, FlaskConical, Play, RefreshCw, Search, Square } from "lucide-react";
import { getInputCache, listScripts, listTestRuns, runBatchTest, runScriptTest, saveInputCache, stopBatchTestRun, stopTestRun } from "../../api";
import type { ManagerKey, ProfileSummary, Script, TestRun } from "../../types";
import { useInterval } from "../../hooks/useInterval";
import { useMultiSelect } from "../../hooks/useMultiSelect";
import { useProfiles } from "../../hooks/useProfiles";
import { buildCliArgs, parseDefaultInputsJson, type DefaultInput } from "../../utils/cliArgs";
import { formatDuration, formatTime } from "../../utils/format";
import { buildProfileSnapshots } from "../../utils/profiles";
import EmptyState from "../common/EmptyState";
import { useToast } from "../common/Toast";
import DefaultInputs from "../domain/DefaultInputs";
import LogViewer from "../domain/LogViewer";
import ManagerBadge from "../domain/ManagerBadge";
import StatusBadge from "../domain/StatusBadge";

const managers: { key: ManagerKey; label: string }[] = [{ key: "gpm", label: "GPM" }, { key: "donut", label: "Donut" }, { key: "gpmglobal", label: "GPM Global" }];

export default function TestLabPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [scriptId, setScriptId] = useState("");
  const [cliArgs, setCliArgs] = useState("");
  const [inputs, setInputs] = useState<DefaultInput[]>([]);
  const [manager, setManager] = useState<ManagerKey>("donut");
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"log" | "runs">("runs");
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
  const { profiles, loading, error, refresh } = useProfiles(manager);
  const { addToast } = useToast();

  async function load() { setScripts(await listScripts()); setRuns(await listTestRuns()); }
  useEffect(() => { void load().catch((e) => addToast({ type: "error", title: "Load failed", message: String(e) })); }, []);
  useInterval(() => { void listTestRuns().then(setRuns).catch(() => undefined); }, 3000);

  useEffect(() => {
    const script = scripts.find((s) => s.id === scriptId);
    if (!script) return;
    setInputs(parseDefaultInputsJson(script.default_inputs_json));
    void getInputCache(scriptId).then((cache) => { setCliArgs(cache.cli_args); setInputs(parseDefaultInputsJson(cache.default_inputs_json || script.default_inputs_json)); }).catch(() => undefined);
  }, [scriptId, scripts]);

  const filtered = useMemo(() => profiles.filter((p) => `${p.name} ${p.group_name || ""}`.toLowerCase().includes(search.toLowerCase())), [profiles, search]);
  const multi = useMultiSelect<ProfileSummary>(filtered, selectedProfiles, setSelectedProfiles);

  async function run(batch: boolean) {
    if (!scriptId || selectedProfiles.size === 0) return;
    const ids = Array.from(selectedProfiles);
    const args = buildCliArgs(inputs, cliArgs);
    const snapshots = buildProfileSnapshots(ids, profiles, manager);
    try {
      await saveInputCache(scriptId, cliArgs, JSON.stringify(inputs));
      const result = batch || ids.length > 1 ? await runBatchTest(scriptId, ids, args, manager, snapshots) : [await runScriptTest(scriptId, ids[0], args, manager, snapshots[0])];
      setSelectedRun(result[0]);
      setTab("log");
      await load();
    } catch (err) { addToast({ type: "error", title: "Run failed", message: String(err) }); }
  }

  async function stop(run: TestRun) {
    try { run.batch_id ? await stopBatchTestRun(run.batch_id) : await stopTestRun(run.id); await load(); } catch (err) { addToast({ type: "error", title: "Stop failed", message: String(err) }); }
  }

  return <div className="page"><div className="page__header"><h1 className="page__title"><FlaskConical size={18} /> Test Lab</h1><button className="btn btn--secondary" onClick={load}><RefreshCw size={14} /> Refresh</button></div>
    <div className="split-layout split-layout--40-60">
      <section className="panel"><div className="panel__header">Configuration</div><div className="panel__body form-grid">
        <label className="field"><span className="field__label">Script</span><select className="select" value={scriptId} onChange={(e) => setScriptId(e.target.value)}><option value="">Select script</option>{scripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {scriptId && <><div className="section-title">Inputs</div><DefaultInputs inputs={inputs} onChange={setInputs} /><label className="field"><span className="field__label">CLI Args</span><textarea className="textarea" value={cliArgs} onChange={(e) => setCliArgs(e.target.value)} /></label></>}
        <div className="section-title">Profiles</div><div className="tabs">{managers.map((m) => <button key={m.key} className={`tab ${manager === m.key ? "tab--active" : ""}`} onClick={() => { setManager(m.key); setSelectedProfiles(new Set()); }}>{m.label}</button>)}</div>
        <div className="search-input"><Search size={14} className="search-input__icon" /><input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search profiles" /></div>
        {error && <div className="error-banner">{error}</div>}{loading ? <div className="skeleton skeleton-row" /> : <div>{filtered.map((p, i) => <div key={p.id} className={`profile-item ${selectedProfiles.has(p.id) ? "profile-item--selected" : ""}`} onMouseDown={(e) => multi.handleRowMouseDown(e, i)} onMouseMove={(e) => multi.handleRowMouseMove(e, i)} onMouseUp={(e) => multi.handleRowMouseUp(e, i)}><span className="profile-item__name">{p.name}</span><span className="profile-item__group">{p.group_name}</span></div>)}</div>}
        <div className="page__actions"><button className="btn btn--secondary" onClick={refresh}>Refresh Profiles</button><button className="btn btn--primary" disabled={!scriptId || selectedProfiles.size === 0} onClick={() => void run(false)}><Play size={14} /> Run</button><button className="btn btn--primary" disabled={!scriptId || selectedProfiles.size < 2} onClick={() => void run(true)}><Play size={14} /> Run Batch ({selectedProfiles.size})</button></div>
      </div></section>
      <section className="panel"><div className="panel__header"><div className="tabs"><button className={`tab ${tab === "log" ? "tab--active" : ""}`} onClick={() => setTab("log")}>Live Log</button><button className={`tab ${tab === "runs" ? "tab--active" : ""}`} onClick={() => setTab("runs")}>Recent Runs</button></div></div><div className="panel__body panel__body--flush" style={{ display: "flex", flexDirection: "column" }}>{tab === "log" ? selectedRun ? <LogViewer kind="test" runId={selectedRun.id} running={selectedRun.status === "running" || selectedRun.status === "queued"} /> : <EmptyState title="No run selected" description="Start or select run to view logs." /> : <table className="table"><tbody>{runs.map((r) => <tr key={r.id}><td><StatusBadge status={r.status} /></td><td>{r.profile_name || r.profile_id}</td><td><ManagerBadge manager={r.manager} /></td><td>{formatTime(r.started_at)}</td><td>{formatDuration(r.started_at, r.finished_at)}</td><td><button className="btn btn--sm btn--ghost" onClick={() => { setSelectedRun(r); setTab("log"); }}><Eye size={12} /></button>{(r.status === "running" || r.status === "queued") && <button className="btn btn--sm btn--danger" onClick={() => void stop(r)}><Square size={12} /></button>}</td></tr>)}</tbody></table>}</div></section>
    </div>
  </div>;
}
