import { useEffect, useState } from "react";
import { Cpu, Download, RefreshCw, Save, Settings as SettingsIcon } from "lucide-react";
import { checkForAppUpdatesManual, downloadAndPrepareAppUpdate, getAppVersion, getRuntimeStatus, getSettings, restartApplication, updateRuntime, updateSettings } from "../../api";
import type { AppUpdateInfo, AppUpdatePrepareResult, RuntimeStatus, Settings } from "../../types";
import { useToast } from "../common/Toast";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);
  const [preparedUpdate, setPreparedUpdate] = useState<AppUpdatePrepareResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingApp, setCheckingApp] = useState(false);
  const [downloadingApp, setDownloadingApp] = useState(false);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [s, r, v] = await Promise.all([getSettings(), getRuntimeStatus(), getAppVersion()]);
      setSettings(s);
      setRuntime(r);
      setAppVersion(v);
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

  async function checkAppUpdate() {
    setCheckingApp(true);
    try {
      const update = await checkForAppUpdatesManual();
      setAppUpdate(update);
      setPreparedUpdate(null);
      addToast({ type: update ? "info" : "success", title: update ? "App update available" : "App up to date", message: update ? `${update.latest_version} (${update.asset_name})` : undefined });
    } catch (err) {
      addToast({ type: "error", title: "App update check failed", message: String(err) });
    } finally {
      setCheckingApp(false);
    }
  }

  async function downloadAppUpdate() {
    if (!appUpdate) return;
    if (!window.confirm(`Download app update ${appUpdate.latest_version}?`)) return;
    setDownloadingApp(true);
    try {
      const prepared = await downloadAndPrepareAppUpdate(appUpdate);
      setPreparedUpdate(prepared);
      addToast({ type: "success", title: "App update ready", message: prepared.asset_name });
    } catch (err) {
      addToast({ type: "error", title: "App update download failed", message: String(err) });
    } finally {
      setDownloadingApp(false);
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
      <div className="panel__header settings-card__header"><span><Download size={16} /> Application Update</span><div className="toolbar"><button className="btn btn--secondary" onClick={checkAppUpdate} disabled={checkingApp}><RefreshCw size={14} /> Check Now</button>{appUpdate && !preparedUpdate && <button className="btn btn--primary" onClick={downloadAppUpdate} disabled={downloadingApp}><Download size={14} /> Download</button>}{preparedUpdate && <button className="btn btn--primary" onClick={() => { if (window.confirm(`Install app update ${preparedUpdate.latest_version} and restart now?`)) void restartApplication(preparedUpdate.installer_path); }}>Install & Restart</button>}</div></div>
      <div className="settings-option">
        <div className="settings-option__copy">
          <div className="settings-option__title">Auto check on startup</div>
          <div className="settings-option__hint">Checks GitHub for new app versions after launch. Downloads and installs still require confirmation.</div>
        </div>
        <label className="toggle" aria-label="Auto check app updates">
          <input type="checkbox" checked={!settings.disable_auto_updates} onChange={(e) => setSettings({ ...settings, disable_auto_updates: !e.target.checked })} />
          <span className="toggle__track" />
          <span className="toggle__thumb" />
        </label>
      </div>
      <div className="settings-version-grid">
        <div className="settings-meta-item"><span>Current</span><strong>{appVersion || "Unknown"}</strong></div>
        <div className="settings-meta-item"><span>Latest</span><strong>{appUpdate?.latest_version || "Unknown"}</strong></div>
        {preparedUpdate && <div><span className="badge badge--success">Ready {preparedUpdate.latest_version}</span></div>}
        {appUpdate ? <span className="badge badge--pending">Update available</span> : appVersion.startsWith("dev-") ? <span className="badge badge--queued">Dev build</span> : <span className="badge badge--success">Up to date</span>}
      </div>
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
