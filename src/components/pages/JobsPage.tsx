import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Pencil, Plus, RefreshCw, Search, Square, Trash2, Users, X } from "lucide-react";
import { createJob, deleteJob, getInputCache, getTodayJobStates, listJobRuns, listJobs, listScripts, saveInputCache, setJobEnabled, stopJobRun, updateJob } from "../../api";
import type { JobDefinition, JobInput, JobProfileState, JobRun, Script, SelectedJobProfile } from "../../types";
import { parseDefaultInputsJson, type DefaultInput } from "../../utils/cliArgs";
import { formatDuration, formatTime } from "../../utils/format";
import { defaultScheduleUi, getScheduleLabel, getSchedulePreview, jsonToSchedule, parseProfilesCount, parseSelectedProfiles, randomToJson, scheduleToJson, type ScheduleUiState } from "../../utils/schedule";
import EmptyState from "../common/EmptyState";
import { useDialog } from "../common/Dialog";
import { useToast } from "../common/Toast";
import DefaultInputs from "../domain/DefaultInputs";
import ManagerBadge from "../domain/ManagerBadge";
import ProfilePickerDialog from "../domain/ProfilePickerDialog";
import ScheduleForm from "../domain/ScheduleForm";
import StatusBadge from "../domain/StatusBadge";

type Mode = "view" | "edit";

const emptyForm = {
  name: "",
  description: "",
  script_id: "",
  cli_args: "",
  timeout_seconds: 300,
};

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobDefinition[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [schedule, setSchedule] = useState<ScheduleUiState>(defaultScheduleUi);
  const [profiles, setProfiles] = useState<SelectedJobProfile[]>([]);
  const [inputs, setInputs] = useState<DefaultInput[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [states, setStates] = useState<JobProfileState[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [tab, setTab] = useState<"overview" | "states" | "runs">("overview");
  const { addToast } = useToast();
  const { showDialog } = useDialog();

  async function load() { const [j, s] = await Promise.all([listJobs(), listScripts()]); setJobs(j); setScripts(s); }
  async function loadDetail(id: string) { const [st, rn] = await Promise.all([getTodayJobStates(id), listJobRuns(id)]); setStates(st); setRuns(rn); }
  useEffect(() => { void load().catch((e) => addToast({ type: "error", title: "Load failed", message: String(e) })); }, []);
  useEffect(() => { if (selectedId) void loadDetail(selectedId).catch(() => undefined); }, [selectedId]);

  const selected = jobs.find((j) => j.id === selectedId) || null;
  const filtered = useMemo(() => jobs.filter((j) => j.name.toLowerCase().includes(query.toLowerCase())), [jobs, query]);

  function startCreate() { setCreateOpen(true); setValidationErrors([]); setForm(emptyForm); setSchedule(defaultScheduleUi); setProfiles([]); setInputs([]); }
  function startEdit(job: JobDefinition) {
    setMode("edit"); setValidationErrors([]); setSelectedId(job.id); setForm({ name: job.name, description: job.description, script_id: job.script_id, cli_args: job.cli_args, timeout_seconds: job.timeout_seconds }); setSchedule(jsonToSchedule(job.schedule_json, job.random_json)); setProfiles(parseSelectedProfiles(job.profile_ids_json));
    const script = scripts.find((s) => s.id === job.script_id); setInputs(parseDefaultInputsJson(script?.default_inputs_json || "[]"));
    void getInputCache(job.script_id).then((c) => { setInputs(parseDefaultInputsJson(c.default_inputs_json || script?.default_inputs_json || "[]")); }).catch(() => undefined);
  }
  async function onScriptChange(id: string) { setForm({ ...form, script_id: id }); const script = scripts.find((s) => s.id === id); setInputs(parseDefaultInputsJson(script?.default_inputs_json || "[]")); try { const cache = await getInputCache(id); setInputs(parseDefaultInputsJson(cache.default_inputs_json || script?.default_inputs_json || "[]")); setForm((f) => ({ ...f, cli_args: cache.cli_args })); } catch { /* ignore */ } }

  function validate() {
    const errors: string[] = [];
    if (!form.name.trim()) errors.push("Nhập tên job.");
    if (!form.script_id) errors.push("Chọn script.");
    if (profiles.length === 0) errors.push("Chọn ít nhất 1 profile.");
    return errors;
  }

  async function save(isCreate = false) {
    const errors = validate();
    setValidationErrors(errors);
    if (errors.length > 0) { addToast({ type: "warning", title: "Missing required fields" }); return; }
    const input: JobInput = { name: form.name, description: form.description, enabled: 1, script_id: form.script_id, profile_ids_json: JSON.stringify(profiles), schedule_json: scheduleToJson(schedule), random_json: randomToJson(schedule), cli_args: form.cli_args, timeout_seconds: form.timeout_seconds };
    setSaving(true);
    try { await saveInputCache(form.script_id, form.cli_args, JSON.stringify(inputs)); const saved = isCreate ? await createJob(input) : selectedId ? await updateJob(selectedId, input) : await createJob(input); setMode("view"); setCreateOpen(false); setSelectedId(saved.id); await load(); addToast({ type: "success", title: "Job saved" }); } catch (err) { addToast({ type: "error", title: "Save failed", message: String(err) }); } finally { setSaving(false); }
  }
  async function remove(job: JobDefinition) { if (!(await showDialog({ title: "Delete job", message: `Delete ${job.name}?`, confirmLabel: "Delete", variant: "danger" }))) return; try { await deleteJob(job.id); setSelectedId(null); await load(); } catch (err) { addToast({ type: "error", title: "Delete failed", message: String(err) }); } }
  async function toggle(job: JobDefinition, enabled: boolean) { try { await setJobEnabled(job.id, enabled); await load(); } catch (err) { addToast({ type: "error", title: "Toggle failed", message: String(err) }); } }

  return <div className="page jobs-page"><div className="page__header"><h1 className="page__title"><CalendarClock size={18} /> Jobs</h1><div className="page__actions"><button className="btn btn--secondary" onClick={load}><RefreshCw size={14} /> Refresh</button><button className="btn btn--primary" onClick={startCreate}><Plus size={14} /> New Job</button></div></div>
    <div className="split-layout">
      <section className="panel"><div className="panel__header"><div className="search-input"><Search size={14} className="search-input__icon" /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search jobs" /></div></div><div className="panel__body">{filtered.length === 0 ? <EmptyState title="No jobs" action={<button className="btn btn--primary" onClick={startCreate}>Create Job</button>} /> : filtered.map((j) => <div key={j.id} className={`card card--clickable ${selectedId === j.id ? "table-row--selected" : ""}`} style={{ marginBottom: 8 }} onClick={() => { setSelectedId(j.id); setMode("view"); }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><strong style={{ flex: 1 }}>{j.name}</strong><label className="toggle" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={j.enabled === 1} onChange={(e) => void toggle(j, e.target.checked)} /><span className="toggle__track" /><span className="toggle__thumb" /></label></div><div style={{ color: "var(--fg-secondary)", marginTop: 6 }}>{scripts.find((s) => s.id === j.script_id)?.name || j.script_id}</div><div style={{ color: "var(--fg-muted)", marginTop: 4 }}>{getScheduleLabel(j)} · {parseProfilesCount(j.profile_ids_json)} profiles</div></div>)}</div></section>
      <section className="panel"><div className="panel__header">{mode === "edit" ? "Edit Job" : selected ? selected.name : "Job Detail"}</div><div className="panel__body">{mode === "edit" ? <JobForm form={form} setForm={setForm} scripts={scripts} onScriptChange={onScriptChange} inputs={inputs} setInputs={setInputs} schedule={schedule} setSchedule={setSchedule} profiles={profiles} openPicker={() => setPickerOpen(true)} onCancel={() => setMode("view")} onSave={() => void save(false)} validationErrors={validationErrors} saving={saving} submitLabel="Save Job" showFooter /> : selected ? <JobDetail job={selected} states={states} runs={runs} tab={tab} setTab={setTab} scripts={scripts} onEdit={() => startEdit(selected)} onDelete={() => void remove(selected)} onStop={async (id: string) => { await stopJobRun(id); await loadDetail(selected.id); }} /> : <EmptyState title="Select a job" description="Choose job from list or create new one." />}</div></section>
    </div>
    {createOpen && <JobCreateDialog form={form} setForm={setForm} scripts={scripts} onScriptChange={onScriptChange} inputs={inputs} setInputs={setInputs} schedule={schedule} setSchedule={setSchedule} profiles={profiles} openPicker={() => setPickerOpen(true)} validationErrors={validationErrors} saving={saving} onCancel={() => { if (!saving) setCreateOpen(false); }} onSave={() => void save(true)} />}
    <ProfilePickerDialog open={pickerOpen} selected={profiles} onCancel={() => setPickerOpen(false)} onDone={(p) => { setProfiles(p); setPickerOpen(false); }} />
  </div>;
}

function JobCreateDialog(props: any) { return <div className="dialog-backdrop" onClick={props.onCancel}><div className="dialog job-dialog" role="dialog" aria-modal="true" aria-labelledby="create-job-title" onClick={(e) => e.stopPropagation()}><div className="dialog__header job-dialog__header"><div><div id="create-job-title" className="job-dialog__title"><Plus size={16} /> Create Job</div><div className="job-dialog__subtitle">Lên lịch chạy script cho các profile đã chọn.</div></div><button className="btn btn--ghost btn--icon" type="button" onClick={props.onCancel} disabled={props.saving}><X size={16} /></button></div><div className="job-dialog__body"><JobForm {...props} showFooter={false} submitLabel="Create Job" /></div><div className="dialog__footer job-dialog__footer"><button className="btn btn--secondary" type="button" onClick={props.onCancel} disabled={props.saving}>Cancel</button><button className="btn btn--primary" type="button" onClick={props.onSave} disabled={props.saving}>{props.saving ? "Creating..." : "Create Job"}</button></div></div></div>; }

function JobForm(props: any) { const { form, setForm, scripts, onScriptChange, inputs, setInputs, schedule, setSchedule, profiles, openPicker, onCancel, onSave, validationErrors = [], saving = false, submitLabel = "Save Job", showFooter = true } = props; const previewProfiles = profiles.slice(0, 6); return <div className="job-form form-grid">{validationErrors.length > 0 && <div className="form-error" role="alert"><strong>Thiếu thông tin bắt buộc</strong><div>{validationErrors.join(" ")}</div></div>}<section className="job-form-section"><div className="job-form-section__header"><div className="job-form-section__title">Basics</div><div className="job-form-section__hint">Tên, script và runtime limit.</div></div><div className="form-row"><div className="field"><label className="field__label" htmlFor="job-name">Job name *</label><input id="job-name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Morning checkout run" /></div><div className="field"><label className="field__label" htmlFor="job-script">Script *</label><select id="job-script" className="select" value={form.script_id} onChange={(e) => void onScriptChange(e.target.value)}><option value="">Select script</option>{scripts.map((s: Script) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div></div><div className="form-row"><div className="field"><label className="field__label" htmlFor="job-description">Description</label><textarea id="job-description" className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional note" /></div><div className="field"><label className="field__label" htmlFor="job-timeout">Timeout seconds</label><input id="job-timeout" className="input" type="number" min={1} value={form.timeout_seconds} onChange={(e) => setForm({ ...form, timeout_seconds: Number(e.target.value) || 300 })} /></div></div></section><section className="job-form-section"><div className="job-form-section__header"><div className="job-form-section__title">Profiles *</div><div className="job-form-section__hint">Target profiles chạy job này.</div></div><div className="job-profile-picker-row"><button className="btn btn--secondary" type="button" onClick={openPicker}><Users size={14} /> Select Profiles</button><span className="job-profile-count">{profiles.length} selected</span></div>{profiles.length > 0 ? <div className="job-profile-chips">{previewProfiles.map((p: SelectedJobProfile) => <span className="job-profile-chip" key={`${p.manager}-${p.id}`}><ManagerBadge manager={p.manager} /> {p.name}</span>)}{profiles.length > previewProfiles.length && <span className="job-profile-chip job-profile-chip--muted">+{profiles.length - previewProfiles.length} more</span>}</div> : <div className="empty-inline">No profiles selected</div>}</section><section className="job-form-section"><div className="job-form-section__header"><div className="job-form-section__title">Script Inputs</div><div className="job-form-section__hint">Load từ script defaults/cache.</div></div>{inputs.length > 0 ? <DefaultInputs inputs={inputs} onChange={setInputs} /> : <div className="empty-inline">No script inputs</div>}<div className="field"><label className="field__label" htmlFor="job-cli-args">CLI args</label><textarea id="job-cli-args" className="textarea" value={form.cli_args} onChange={(e) => setForm({ ...form, cli_args: e.target.value })} placeholder="--headless --input key=value" /><div className="field__hint">Plain CLI args, not JSON. Saved as input cache for this script.</div></div></section><section className="job-form-section"><div className="job-form-section__header"><div className="job-form-section__title">Schedule</div><div className="job-form-section__hint">Chọn mode, thời gian và ngày chạy.</div></div><ScheduleForm value={schedule} onChange={setSchedule} /></section>{showFooter && <div className="page__actions"><button className="btn btn--secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="btn btn--primary" type="button" onClick={onSave} disabled={saving}>{saving ? "Saving..." : submitLabel}</button></div>}</div>; }

function JobDetail({ job, states, runs, tab, setTab, scripts, onEdit, onDelete, onStop }: any) { const preview = getSchedulePreview(jsonToSchedule(job.schedule_json, job.random_json)); return <div><div className="page__actions" style={{ marginBottom: 12 }}><button className="btn btn--secondary" onClick={onEdit}><Pencil size={14} /> Edit</button><button className="btn btn--danger" onClick={onDelete}><Trash2 size={14} /> Delete</button></div><div className="card form-grid"><div>Script: {scripts.find((s: Script) => s.id === job.script_id)?.name || job.script_id}</div><div>Schedule: {preview}</div><div>Profiles: {parseProfilesCount(job.profile_ids_json)}</div><div>Timeout: {job.timeout_seconds}s</div></div><div className="tabs" style={{ marginTop: 12 }}><button className={`tab ${tab === "overview" ? "tab--active" : ""}`} onClick={() => setTab("overview")}>Overview</button><button className={`tab ${tab === "states" ? "tab--active" : ""}`} onClick={() => setTab("states")}>Today States</button><button className={`tab ${tab === "runs" ? "tab--active" : ""}`} onClick={() => setTab("runs")}>Run History</button></div>{tab === "overview" && <div className="metric-grid" style={{ marginTop: 12 }}><Metric label="Runs" value={states.reduce((a: number, s: JobProfileState) => a + s.run_count, 0)} /><Metric label="Success" value={states.reduce((a: number, s: JobProfileState) => a + s.success_count, 0)} /><Metric label="Failed" value={states.reduce((a: number, s: JobProfileState) => a + s.failed_count, 0)} /></div>}{tab === "states" && <table className="table"><tbody>{states.map((s: JobProfileState) => <tr key={s.id}><td>{s.profile_id}</td><td><StatusBadge status={s.status} /></td><td>{s.run_count}/{s.target_count}</td><td>{formatTime(s.next_run_at || "")}</td></tr>)}</tbody></table>}{tab === "runs" && <table className="table"><tbody>{runs.map((r: JobRun) => <tr key={r.id}><td><StatusBadge status={r.status} /></td><td>{r.profile_name}</td><td>{formatTime(r.started_at)}</td><td>{formatDuration(r.started_at, r.finished_at)}</td><td>{r.status === "running" && <button className="btn btn--sm btn--danger" onClick={() => void onStop(r.id)}><Square size={12} /></button>}</td></tr>)}</tbody></table>}</div>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="card metric-card"><div className="metric-card__value">{value}</div><div className="metric-card__label">{label}</div></div>; }
