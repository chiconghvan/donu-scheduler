import { useEffect, useState } from "react";
import { Cpu, RefreshCw, Save, Settings as SettingsIcon } from "lucide-react";
import { getRuntimeStatus, getSettings, updateRuntime, updateSettings } from "../../api";
import type { RuntimeStatus, Settings } from "../../types";
import { useToast } from "../common/Toast";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([getSettings(), getRuntimeStatus()]);
      setSettings(s);
      setRuntime(r);
    } catch (err) {
      addToast({ type: "error", title: "Load failed", message: String(err) });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await updateSettings(settings);
      addToast({ type: "success", title: "Settings saved" });
    } catch (err) {
      addToast({ type: "error", title: "Save failed", message: String(err) });
    } finally {
      setSaving(false);
    }
  }

  async function runUpdate() {
    try {
      await updateRuntime();
      addToast({ type: "info", title: "Runtime update started" });
      void load();
    } catch (err) {
      addToast({ type: "error", title: "Runtime update failed", message: String(err) });
    }
  }

  if (loading || !settings) return <div className="page"><div className="skeleton skeleton-card" /></div>;

  return <div className="page">
    <div className="page__header"><h1 className="page__title"><SettingsIcon size={18} /> Settings</h1><button className="btn btn--primary" onClick={save} disabled={saving}><Save size={14} /> Save</button></div>
    <div className="card form-grid">
      <div className="section-title">Profile Managers</div>
      <Field label="GPMLogin API URL" value={settings.gpmlogin_api_base_url} onChange={(v) => setSettings({ ...settings, gpmlogin_api_base_url: v })} />
      <Field label="GPMGlobal API URL" value={settings.gpmglobal_api_base_url} onChange={(v) => setSettings({ ...settings, gpmglobal_api_base_url: v })} />
      <Field label="Donut Browser API URL" value={settings.donutbrowser_api_base_url} onChange={(v) => setSettings({ ...settings, donutbrowser_api_base_url: v })} />
      <Field label="Max Parallel Runtimes" type="number" value={String(settings.global_max_parallel_runtime)} onChange={(v) => setSettings({ ...settings, global_max_parallel_runtime: Number(v) || 1 })} />
    </div>
    <div className="card" style={{ marginTop: 16 }}>
      <div className="panel__header" style={{ padding: 0, border: 0, marginBottom: 12 }}><span><Cpu size={16} /> Donumate Runtime</span><button className="btn btn--secondary" onClick={runUpdate}><RefreshCw size={14} /> Update Now</button></div>
      {runtime ? <div className="form-grid">
        <div>Installed: <strong>{runtime.installed_version || "None"}</strong> {runtime.installed_asset_name}</div>
        <div>Latest: <strong>{runtime.latest_version || "Unknown"}</strong></div>
        {runtime.pending_version && <div><span className="badge badge--pending">Pending {runtime.pending_version}</span></div>}
        {runtime.update_available ? <span className="badge badge--pending">Update available</span> : <span className="badge badge--success">Up to date</span>}
      </div> : <div className="skeleton skeleton-row" />}
    </div>
  </div>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="field"><span className="field__label">{label}</span><input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
