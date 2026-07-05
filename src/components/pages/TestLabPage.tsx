import { useEffect, useState } from "react";
import { Eye, Play, PlaySquare, RefreshCw, Square, Users } from "lucide-react";
import { getInputCache, listScripts, listTestRuns, runBatchTest, runScriptTest, saveInputCache, stopBatchTestRun, stopTestRun } from "../../api";
import type { ProfileSnapshot, Script, SelectedJobProfile, TestRun } from "../../types";
import { useInterval } from "../../hooks/useInterval";
import { buildCliArgs, parseDefaultInputsJson, type DefaultInput } from "../../utils/cliArgs";
import { formatDuration, formatTime } from "../../utils/format";
import EmptyState from "../common/EmptyState";
import { useToast } from "../common/Toast";
import DefaultInputs from "../domain/DefaultInputs";
import LogViewer from "../domain/LogViewer";
import ManagerBadge from "../domain/ManagerBadge";
import ProfilePickerDialog from "../domain/ProfilePickerDialog";
import StatusBadge from "../domain/StatusBadge";

export default function TestLabPage() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [scriptId, setScriptId] = useState("");
  const [cliArgs, setCliArgs] = useState("");
  const [inputs, setInputs] = useState<DefaultInput[]>([]);
  const [selectedJobProfiles, setSelectedJobProfiles] = useState<SelectedJobProfile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tab, setTab] = useState<"log" | "runs">("runs");
  const [selectedRun, setSelectedRun] = useState<TestRun | null>(null);
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

  async function run(batch: boolean) {
    if (!scriptId || selectedJobProfiles.length === 0) return;
    const ids = selectedJobProfiles.map((p) => p.id);
    const args = buildCliArgs(inputs, cliArgs);
    const snapshots: ProfileSnapshot[] = selectedJobProfiles.map((p) => ({
      profile_id: p.id,
      profile_name: p.name,
      manager: p.manager,
      group_name: p.group_name,
    }));
    const manager = selectedJobProfiles[0].manager;
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



  return <div className="page test-lab-page"><div className="page__header"><h1 className="page__title"><PlaySquare size={18} /> Manual Run</h1><button className="btn btn--secondary" onClick={load}><RefreshCw size={14} /> Refresh</button></div>
    <div className="split-layout split-layout--40-60">
      <section className="panel"><div className="panel__header">Configuration</div><div className="panel__body form-grid">
        <label className="field"><span className="field__label">Script</span><select className="select" value={scriptId} onChange={(e) => setScriptId(e.target.value)}><option value="">Select script</option>{scripts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <div className="section-title">Profiles</div>
        <div className="job-profile-picker-row">
          <button className="btn btn--secondary" type="button" onClick={() => setPickerOpen(true)}><Users size={14} /> Select Profiles ({selectedJobProfiles.length})</button>
        </div>
        {scriptId && <><div className="section-title">Inputs</div><DefaultInputs inputs={inputs} onChange={setInputs} /><label className="field"><span className="field__label">CLI Args</span><textarea className="textarea" value={cliArgs} onChange={(e) => setCliArgs(e.target.value)} /></label></>}
        <div className="page__actions"><button className="btn btn--primary" disabled={!scriptId || selectedJobProfiles.length === 0} onClick={() => void run(false)}><Play size={14} /> Run</button><button className="btn btn--primary" disabled={!scriptId || selectedJobProfiles.length < 2} onClick={() => void run(true)}><Play size={14} /> Run Batch ({selectedJobProfiles.length})</button></div>
      </div></section>
      <section className="panel"><div className="panel__header"><div className="tabs"><button className={`tab ${tab === "log" ? "tab--active" : ""}`} onClick={() => setTab("log")}>Live Log</button><button className={`tab ${tab === "runs" ? "tab--active" : ""}`} onClick={() => setTab("runs")}>Recent Runs</button></div></div><div className="panel__body panel__body--flush" style={{ display: "flex", flexDirection: "column" }}>{tab === "log" ? selectedRun ? <LogViewer kind="test" runId={selectedRun.id} running={selectedRun.status === "running" || selectedRun.status === "queued"} /> : <EmptyState title="No run selected" description="Start or select run to view logs." /> : <table className="table"><tbody>{runs.map((r) => <tr key={r.id}><td><StatusBadge status={r.status} /></td><td>{r.profile_name || r.profile_id}</td><td><ManagerBadge manager={r.manager} /></td><td>{formatTime(r.started_at)}</td><td>{formatDuration(r.started_at, r.finished_at)}</td><td><button className="btn btn--sm btn--ghost" onClick={() => { setSelectedRun(r); setTab("log"); }}><Eye size={12} /></button>{(r.status === "running" || r.status === "queued") && <button className="btn btn--sm btn--danger" onClick={() => void stop(r)}><Square size={12} /></button>}</td></tr>)}</tbody></table>}</div></section>
    </div>
    <ProfilePickerDialog open={pickerOpen} selected={selectedJobProfiles} onCancel={() => setPickerOpen(false)} onDone={(p) => { setSelectedJobProfiles(p); setPickerOpen(false); }} />
  </div>;
}
