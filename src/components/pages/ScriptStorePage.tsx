import { useEffect, useMemo, useRef, useState } from "react";
import { Download, FileCode2, Pencil, Plus, RefreshCw, Search, Store, Trash2, X } from "lucide-react";
import {
  applyPendingScriptStoreUpdates,
  createScript,
  deleteScript,
  installScriptStore,
  listScripts,
  listScriptStore,
  openFileDialog,
  readFileContent,
  scriptStoreHasToken,
  scriptStoreSaveToken,
  updateScript,
  updateScriptStore,
} from "../../api";
import type { Script, ScriptInput, ScriptStoreCatalog, ScriptStoreScript } from "../../types";
import { parseDefaultInputsJson, type DefaultInput } from "../../utils/cliArgs";
import { formatDateTime } from "../../utils/format";
import { parseInputNodes } from "../../utils/scriptParser";
import { useInterval } from "../../hooks/useInterval";
import { useDialog } from "../common/Dialog";
import { useToast } from "../common/Toast";
import DefaultInputs from "../domain/DefaultInputs";
import EmptyState from "../common/EmptyState";

type Tab = "managed" | "store";
type ScriptDialogMode = "create" | "edit";
type StoreNotice = "loading" | "success" | null;

const emptyScriptForm: ScriptInput = {
  name: "",
  description: "",
  script_path: "",
  default_args: "",
  default_inputs_json: "[]",
};

export default function ScriptStorePage() {
  const [activeTab, setActiveTab] = useState<Tab>("managed");
  const [managedScripts, setManagedScripts] = useState<Script[]>([]);
  const [managedSelectedId, setManagedSelectedId] = useState<string | null>(null);
  const [managedQuery, setManagedQuery] = useState("");
  const [dialogMode, setDialogMode] = useState<ScriptDialogMode>("create");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScript, setEditingScript] = useState<Script | null>(null);
  const [scriptForm, setScriptForm] = useState<ScriptInput>(emptyScriptForm);
  const [scriptInputs, setScriptInputs] = useState<DefaultInput[]>([]);
  const [scriptErrors, setScriptErrors] = useState<string[]>([]);
  const [savingScript, setSavingScript] = useState(false);

  const [tokenReady, setTokenReady] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [catalog, setCatalog] = useState<ScriptStoreCatalog | null>(null);
  const [storeSelectedId, setStoreSelectedId] = useState<string | null>(null);
  const [storeQuery, setStoreQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [storeNotice, setStoreNotice] = useState<StoreNotice>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const storeFetchSeqRef = useRef(0);
  const storeNoticeClosedSeqRef = useRef(0);
  const { addToast } = useToast();
  const { showDialog } = useDialog();

  async function loadManaged() {
    const scripts = await listScripts();
    setManagedScripts(scripts);
    setManagedSelectedId((current) => current && scripts.some((script) => script.id === current) ? current : scripts[0]?.id ?? null);
  }

  async function loadStore(showNotice = false) {
    const seq = showNotice ? storeFetchSeqRef.current + 1 : storeFetchSeqRef.current;
    if (showNotice) {
      storeFetchSeqRef.current = seq;
      setStoreNotice("loading");
    }
    try {
      const hasToken = await scriptStoreHasToken();
      setTokenReady(hasToken);
      if (!hasToken) {
        if (showNotice && storeFetchSeqRef.current === seq && storeNoticeClosedSeqRef.current !== seq) setStoreNotice(null);
        return;
      }
      setCatalog(await listScriptStore());
      if (showNotice && storeFetchSeqRef.current === seq && storeNoticeClosedSeqRef.current !== seq) setStoreNotice("success");
    } catch (err) {
      if (showNotice && storeFetchSeqRef.current === seq && storeNoticeClosedSeqRef.current !== seq) setStoreNotice(null);
      addToast({ type: "error", title: "Store load failed", message: String(err) });
    }
  }

  async function loadAll() {
    await Promise.all([loadManaged(), loadStore(activeTab === "store")]);
  }

  useEffect(() => { void loadManaged().catch((err) => addToast({ type: "error", title: "Load failed", message: String(err) })); }, []);
  useEffect(() => {
    if (storeNotice !== "success") return undefined;
    const id = window.setTimeout(() => setStoreNotice(null), 10000);
    return () => window.clearTimeout(id);
  }, [storeNotice]);
  useInterval(() => { if (tokenReady) void applyPendingScriptStoreUpdates().then(() => loadStore(false)).catch(() => undefined); }, tokenReady ? 15000 : null);

  const filteredManaged = useMemo(() => {
    const q = managedQuery.toLowerCase();
    return managedScripts.filter((script) => {
      if (!q) return true;
      return `${script.name} ${script.description} ${script.script_path}`.toLowerCase().includes(q);
    });
  }, [managedScripts, managedQuery]);

  const filteredStore = useMemo(() => {
    const q = storeQuery.toLowerCase();
    return (catalog?.scripts || []).filter((script) => {
      if (q && !`${script.name} ${script.description}`.toLowerCase().includes(q)) return false;
      if (storeFilter === "installed" && !script.installed) return false;
      if (storeFilter === "available" && script.installed) return false;
      if (storeFilter === "updates" && !script.update_available) return false;
      return true;
    });
  }, [catalog, storeQuery, storeFilter]);

  const selectedManaged = managedScripts.find((script) => script.id === managedSelectedId) || filteredManaged[0] || null;
  const selectedStore = filteredStore.find((script) => script.id === storeSelectedId) || filteredStore[0] || null;
  const scriptsWithInputs = managedScripts.filter((script) => parseDefaultInputsJson(script.default_inputs_json).length > 0).length;

  async function saveToken() {
    try {
      await scriptStoreSaveToken(token);
      setToken("");
      await loadStore(true);
      addToast({ type: "success", title: "Token saved" });
    } catch (err) {
      addToast({ type: "error", title: "Token failed", message: String(err) });
    }
  }

  async function runStoreAction(script: ScriptStoreScript) {
    setBusyId(script.id);
    try {
      if (!script.installed) await installScriptStore(script.id);
      else await updateScriptStore(script.id);
      await Promise.all([loadManaged(), loadStore(true)]);
      addToast({ type: "success", title: script.installed ? "Update queued" : "Script installed", message: script.name });
    } catch (err) {
      addToast({ type: "error", title: "Action failed", message: String(err) });
    } finally {
      setBusyId(null);
    }
  }

  function openCreateDialog() {
    setDialogMode("create");
    setEditingScript(null);
    setScriptForm(emptyScriptForm);
    setScriptInputs([]);
    setScriptErrors([]);
    setDialogOpen(true);
  }

  function openEditDialog(script: Script) {
    setDialogMode("edit");
    setEditingScript(script);
    setScriptForm({
      name: script.name,
      description: script.description,
      script_path: script.script_path,
      default_args: script.default_args,
      default_inputs_json: script.default_inputs_json,
    });
    setScriptInputs(parseDefaultInputsJson(script.default_inputs_json));
    setScriptErrors([]);
    setDialogOpen(true);
  }

  async function chooseScriptFile() {
    try {
      const path = await openFileDialog("GScript", ["gscript"]);
      if (!path) return;
      const content = await readFileContent(path);
      const parsedInputs = parseInputNodes(content);
      const fileName = path.split(/[\\/]/).pop()?.replace(/\.gscript$/i, "") || "Script";
      setScriptForm((form) => ({
        ...form,
        name: form.name || fileName,
        script_path: path,
        default_inputs_json: JSON.stringify(parsedInputs),
      }));
      setScriptInputs(parsedInputs);
      setScriptErrors(parsedInputs.length === 0 ? ["No user inputs detected in selected .gscript."] : []);
    } catch (err) {
      setScriptErrors([String(err)]);
      addToast({ type: "error", title: "Read script failed", message: String(err) });
    }
  }

  async function saveScript() {
    const errors: string[] = [];
    if (!scriptForm.name.trim()) errors.push("Script name is required.");
    if (!scriptForm.script_path.trim()) errors.push("Script file is required.");
    setScriptErrors(errors);
    if (errors.length > 0) return;

    const input = { ...scriptForm, default_inputs_json: JSON.stringify(scriptInputs) };
    setSavingScript(true);
    try {
      const saved = dialogMode === "edit" && editingScript ? await updateScript(editingScript.id, input) : await createScript(input);
      await loadManaged();
      setManagedSelectedId(saved.id);
      setDialogOpen(false);
      addToast({ type: "success", title: dialogMode === "edit" ? "Script updated" : "Script added", message: saved.name });
    } catch (err) {
      addToast({ type: "error", title: "Save failed", message: String(err) });
    } finally {
      setSavingScript(false);
    }
  }

  async function removeScript(script: Script) {
    const confirmed = await showDialog({ title: "Delete script", message: `Delete ${script.name}? Jobs using this script may break.`, confirmLabel: "Delete", variant: "danger" });
    if (!confirmed) return;
    try {
      await deleteScript(script.id);
      await loadManaged();
      addToast({ type: "success", title: "Script deleted", message: script.name });
    } catch (err) {
      addToast({ type: "error", title: "Delete failed", message: String(err) });
    }
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab);
    if (tab === "store") void loadStore(true);
  }

  function closeStoreNotice() {
    storeNoticeClosedSeqRef.current = storeFetchSeqRef.current;
    setStoreNotice(null);
  }

  return <div className="page scripts-manager-page">
    <div className="page__header scripts-manager-hero">
      <div>
        <h1 className="page__title"><FileCode2 size={18} /> Scripts Manager</h1>
        <p className="scripts-manager-hero__subtitle">Manage local scripts and install updates from store.</p>
      </div>
      <div className="page__actions">
        <button className="btn btn--secondary" onClick={() => void loadAll()}><RefreshCw size={14} /> Refresh</button>
        <button className="btn btn--primary" onClick={openCreateDialog}><Plus size={14} /> Add Script</button>
      </div>
    </div>

    <div className="scripts-manager-tabs" role="tablist" aria-label="Scripts manager sections">
      <button className={`scripts-manager-tab ${activeTab === "managed" ? "scripts-manager-tab--active" : ""}`} role="tab" aria-selected={activeTab === "managed"} onClick={() => switchTab("managed")}>Scripts Manager</button>
      <button className={`scripts-manager-tab ${activeTab === "store" ? "scripts-manager-tab--active" : ""}`} role="tab" aria-selected={activeTab === "store"} onClick={() => switchTab("store")}>Scripts Store</button>
    </div>

    <div className="scripts-manager-tab-panel">
      {activeTab === "store" && storeNotice && <StoreFetchNotice state={storeNotice} onClose={closeStoreNotice} />}
      {activeTab === "managed" ? <ManagedScriptsTab scripts={filteredManaged} selected={selectedManaged} selectedId={managedSelectedId} query={managedQuery} total={managedScripts.length} withInputs={scriptsWithInputs} onQuery={setManagedQuery} onSelect={setManagedSelectedId} onAdd={openCreateDialog} onEdit={openEditDialog} onDelete={(script) => void removeScript(script)} /> : <StoreTab tokenReady={tokenReady} token={token} setToken={setToken} saveToken={() => void saveToken()} catalog={catalog} scripts={filteredStore} selected={selectedStore} selectedId={storeSelectedId} query={storeQuery} filter={storeFilter} busyId={busyId} onQuery={setStoreQuery} onFilter={setStoreFilter} onSelect={setStoreSelectedId} onRefresh={() => void loadStore(true)} onAction={(script) => void runStoreAction(script)} />}
    </div>

    {dialogOpen && <ScriptEditorDialog mode={dialogMode} form={scriptForm} setForm={setScriptForm} inputs={scriptInputs} setInputs={setScriptInputs} errors={scriptErrors} saving={savingScript} onChooseFile={() => void chooseScriptFile()} onCancel={() => { if (!savingScript) setDialogOpen(false); }} onSave={() => void saveScript()} />}
  </div>;
}

function ManagedScriptsTab(props: { scripts: Script[]; selected: Script | null; selectedId: string | null; query: string; total: number; withInputs: number; onQuery: (query: string) => void; onSelect: (id: string) => void; onAdd: () => void; onEdit: (script: Script) => void; onDelete: (script: Script) => void; }) {
  const { scripts, selected, selectedId, query, total, withInputs, onQuery, onSelect, onAdd, onEdit, onDelete } = props;
  return <>
    <div className="scripts-manager-stats">
      <StatCard label="Managed" value={total} />
      <StatCard label="With inputs" value={withInputs} />
      <StatCard label="No inputs" value={Math.max(total - withInputs, 0)} />
    </div>
    <div className="split-layout split-layout--40-60 scripts-manager-split">
      <section className="panel">
        <div className="panel__header"><div className="search-input scripts-manager-search"><Search className="search-input__icon" size={14} /><input className="input" placeholder="Search managed scripts" value={query} onChange={(event) => onQuery(event.target.value)} /></div></div>
        <div className="panel__body scripts-manager-list">{scripts.length === 0 ? <EmptyState title="No managed scripts" description="Add a .gscript file to use it in jobs and manual runs." action={<button className="btn btn--primary" onClick={onAdd}><Plus size={14} /> Add Script</button>} /> : scripts.map((script) => <ManagedScriptCard key={script.id} script={script} selected={selectedId === script.id} onClick={() => onSelect(script.id)} />)}</div>
      </section>
      <section className="panel">
        <div className="panel__header">Inspector</div>
        <div className="panel__body">{selected ? <ManagedScriptInspector script={selected} onEdit={() => onEdit(selected)} onDelete={() => onDelete(selected)} /> : <EmptyState title="Select script" description="Choose script from list or add a new one." />}</div>
      </section>
    </div>
  </>;
}

function ManagedScriptCard({ script, selected, onClick }: { script: Script; selected: boolean; onClick: () => void }) {
  const inputs = parseDefaultInputsJson(script.default_inputs_json);
  return <button className={`script-list-card ${selected ? "script-list-card--selected" : ""}`} onClick={onClick} type="button">
    <div className="script-list-card__top"><strong>{script.name}</strong><InputCountBadge count={inputs.length} /></div>
    <div className="script-list-card__description">{script.description || "No description"}</div>
    <div className="script-list-card__meta">Updated {formatDateTime(script.updated_at)}</div>
  </button>;
}

function ManagedScriptInspector({ script, onEdit, onDelete }: { script: Script; onEdit: () => void; onDelete: () => void }) {
  const inputs = parseDefaultInputsJson(script.default_inputs_json);
  return <div className="script-inspector">
    <div className="page__actions"><button className="btn btn--secondary" onClick={onEdit}><Pencil size={14} /> Edit</button><button className="btn btn--danger" onClick={onDelete}><Trash2 size={14} /> Delete</button></div>
    <div className="script-inspector__title"><h2>{script.name}</h2><InputCountBadge count={inputs.length} /></div>
    <p className="script-inspector__description">{script.description || "No description"}</p>
    <div className="script-detail-grid">
      <div><span>Path</span><strong className="script-path">{script.script_path}</strong></div>
      <div><span>Default args</span><strong>{script.default_args || "None"}</strong></div>
      <div><span>Created</span><strong>{formatDateTime(script.created_at)}</strong></div>
      <div><span>Updated</span><strong>{formatDateTime(script.updated_at)}</strong></div>
    </div>
    <div className="section-title">Default Inputs</div>
    {inputs.length === 0 ? <EmptyState title="No inputs" description="No user inputs parsed for this script." /> : <div className="script-input-list">{inputs.map((input, index) => <div className="script-input-item" key={`${input.name}-${index}`}><strong>{input.name}</strong><span>{input.value || "Empty"}</span><small>{input.comment || input.inputType}</small></div>)}</div>}
  </div>;
}

function StoreFetchNotice({ state, onClose }: { state: Exclude<StoreNotice, null>; onClose: () => void }) {
  return <div className={`store-fetch-notice store-fetch-notice--${state}`} role="status" aria-live="polite">
    <span>{state === "loading" ? "Đang tải dữ liệu mới nhất" : "Đã tải dữ liệu store mới nhất"}</span>
    <button className="store-fetch-notice__close" type="button" aria-label="Close store fetch status" onClick={onClose}><X size={12} /></button>
  </div>;
}

function StoreTab(props: { tokenReady: boolean | null; token: string; setToken: (token: string) => void; saveToken: () => void; catalog: ScriptStoreCatalog | null; scripts: ScriptStoreScript[]; selected: ScriptStoreScript | null; selectedId: string | null; query: string; filter: string; busyId: string | null; onQuery: (query: string) => void; onFilter: (filter: string) => void; onSelect: (id: string) => void; onRefresh: () => void; onAction: (script: ScriptStoreScript) => void; }) {
  const { tokenReady, token, setToken, saveToken, catalog, scripts, selected, selectedId, query, filter, busyId, onQuery, onFilter, onSelect, onRefresh, onAction } = props;
  if (tokenReady === false) {
    return <div className="card scripts-token-card"><h2><Store size={18} /> Script Store Access</h2><p>Save GitHub token before loading catalog.</p><div className="form-grid"><input className="input" placeholder="GitHub token" value={token} onChange={(event) => setToken(event.target.value)} /><button className="btn btn--primary" onClick={saveToken}>Save Token</button></div></div>;
  }

  return <>
    <div className="page__actions scripts-store-toolbar"><div className="search-input scripts-manager-search"><Search className="search-input__icon" size={14} /><input className="input" placeholder="Search store scripts" value={query} onChange={(event) => onQuery(event.target.value)} /></div><select className="select" value={filter} onChange={(event) => onFilter(event.target.value)}><option value="all">All</option><option value="installed">Installed</option><option value="available">Available</option><option value="updates">Updates</option></select><button className="btn btn--secondary" onClick={onRefresh}><RefreshCw size={14} /> Refresh</button></div>
    <div className="split-layout split-layout--40-60 scripts-manager-split">
      <section className="panel"><div className="panel__header">Catalog {catalog?.store_version}</div><div className="panel__body scripts-manager-list">{scripts.length === 0 ? <EmptyState title="No scripts" /> : scripts.map((script) => <StoreScriptCard key={script.id} script={script} selected={selectedId === script.id} busy={busyId === script.id} onSelect={() => onSelect(script.id)} onAction={() => onAction(script)} />)}</div></section>
      <section className="panel"><div className="panel__header">Store Inspector</div><div className="panel__body">{selected ? <StoreInspector script={selected} busy={busyId === selected.id} onAction={() => onAction(selected)} /> : <EmptyState title="Select script" />}</div></section>
    </div>
  </>;
}

function StoreScriptCard({ script, selected, busy, onSelect, onAction }: { script: ScriptStoreScript; selected: boolean; busy: boolean; onSelect: () => void; onAction: () => void }) {
  return <button className={`script-list-card ${selected ? "script-list-card--selected" : ""}`} onClick={onSelect} type="button">
    <div className="script-list-card__top"><strong>{script.name}</strong><StoreBadge script={script} /></div>
    <div className="script-list-card__description">{script.description}</div>
    <div className="script-list-card__meta">Version {script.version} · {script.runtime}</div>
    <div className="script-list-card__actions"><button className="btn btn--sm btn--primary" disabled={busy || (script.installed && !script.update_available)} onClick={(event) => { event.stopPropagation(); onAction(); }}><Download size={12} />{script.installed ? "Update" : "Install"}</button></div>
  </button>;
}

function StoreInspector({ script, busy, onAction }: { script: ScriptStoreScript; busy: boolean; onAction: () => void }) {
  return <div className="script-inspector">
    <div className="page__actions"><button className="btn btn--primary" disabled={busy || (script.installed && !script.update_available)} onClick={onAction}><Download size={14} /> {script.installed ? "Update" : "Install"}</button></div>
    <div className="script-inspector__title"><h2>{script.name}</h2><StoreBadge script={script} /></div>
    <p className="script-inspector__description">{script.description}</p>
    <div className="script-detail-grid">
      <div><span>Version</span><strong>{script.version}</strong></div>
      <div><span>Runtime</span><strong>{script.runtime}</strong></div>
      <div><span>Updated</span><strong>{script.updated_at || "Unknown"}</strong></div>
      <div><span>Installed</span><strong>{script.installed_version || "No"}</strong></div>
      <div><span>Asset</span><strong>{script.asset_name || "Default"}</strong></div>
      <div><span>Source</span><strong>{script.source_tag || "Latest"}</strong></div>
    </div>
    <div className="section-title">Integrity</div>
    <div className="script-path">SHA256: {script.sha256}</div>
  </div>;
}

function ScriptEditorDialog(props: { mode: ScriptDialogMode; form: ScriptInput; setForm: (form: ScriptInput) => void; inputs: DefaultInput[]; setInputs: (inputs: DefaultInput[]) => void; errors: string[]; saving: boolean; onChooseFile: () => void; onCancel: () => void; onSave: () => void; }) {
  const { mode, form, setForm, inputs, setInputs, errors, saving, onChooseFile, onCancel, onSave } = props;
  return <div className="dialog-backdrop" onClick={onCancel}><div className="dialog script-dialog" role="dialog" aria-modal="true" aria-labelledby="script-dialog-title" onClick={(event) => event.stopPropagation()}>
    <div className="dialog__header script-dialog__header"><div><div id="script-dialog-title" className="job-dialog__title"><FileCode2 size={16} /> {mode === "edit" ? "Edit Script" : "Add Script"}</div><div className="job-dialog__subtitle">Choose .gscript, parse inputs, then save defaults.</div></div><button className="btn btn--ghost btn--icon" type="button" onClick={onCancel} disabled={saving}><X size={16} /></button></div>
    <div className="script-dialog__body form-grid">
      {errors.length > 0 && <div className="form-error" role="alert"><strong>Check script details</strong><div>{errors.join(" ")}</div></div>}
      <section className="job-form-section"><div className="job-form-section__header"><div className="job-form-section__title">Script File</div><div className="job-form-section__hint">Select .gscript from disk.</div></div><div className="form-row"><label className="field"><span className="field__label">Script path *</span><input className="input" value={form.script_path} readOnly placeholder="No file selected" /></label><div className="field script-file-action"><span className="field__label">File</span><button className="btn btn--secondary" type="button" onClick={onChooseFile}>Choose .gscript</button></div></div></section>
      <section className="job-form-section"><div className="job-form-section__header"><div className="job-form-section__title">Metadata</div><div className="job-form-section__hint">Name and defaults used by jobs/manual runs.</div></div><div className="form-row"><label className="field"><span className="field__label">Script name *</span><input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Script name" /></label><label className="field"><span className="field__label">Default args</span><input className="input" value={form.default_args} onChange={(event) => setForm({ ...form, default_args: event.target.value })} placeholder="--headless" /></label></div><label className="field"><span className="field__label">Description</span><textarea className="textarea" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Optional note" /></label></section>
      <section className="job-form-section"><div className="job-form-section__header"><div className="job-form-section__title">Default Inputs</div><div className="job-form-section__hint">Parsed from user-input nodes. Edit defaults before saving.</div></div>{inputs.length === 0 ? <EmptyState title="No inputs parsed" description="Choose .gscript or save script without default inputs." /> : <DefaultInputs inputs={inputs} onChange={setInputs} />}</section>
    </div>
    <div className="dialog__footer script-dialog__footer"><button className="btn btn--secondary" type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="btn btn--primary" type="button" onClick={onSave} disabled={saving}>{saving ? "Saving..." : mode === "edit" ? "Save Changes" : "Add Script"}</button></div>
  </div></div>;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return <div className="card scripts-stat-card"><strong>{value}</strong><span>{label}</span></div>;
}

function InputCountBadge({ count }: { count: number }) {
  return count > 0 ? <span className="badge badge--success">Inputs: {count}</span> : <span className="badge badge--stopped">No inputs</span>;
}

function StoreBadge({ script }: { script: ScriptStoreScript }) {
  if (script.pending_update) return <span className="badge badge--pending">Pending</span>;
  if (script.update_available) return <span className="badge badge--queued">Update</span>;
  if (script.installed) return <span className="badge badge--success">Installed</span>;
  return <span className="badge badge--scheduled">Available</span>;
}
