import { useEffect, useState } from "react";
import { Cpu, Download, Moon, Monitor, RefreshCw, Save, Settings as SettingsIcon, Sun } from "lucide-react";
import { checkForAppUpdatesManual, downloadAndPrepareAppUpdate, getAppVersion, getPendingAppUpdate, getRuntimeStatus, getSettings, restartApplication, updateRuntime, updateSettings } from "../../api";
import type { ThemeMode } from "../../hooks/useTheme";
import type { AppUpdateInfo, AppUpdatePrepareResult, RuntimeStatus, Settings } from "../../types";
import { useToast } from "../common/Toast";

type SettingsPageProps = {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
};

export default function SettingsPage({ themeMode, onThemeModeChange }: SettingsPageProps) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);
  const [appVersion, setAppVersion] = useState("");
  const [appUpdate, setAppUpdate] = useState<AppUpdateInfo | null>(null);
  const [preparedUpdate, setPreparedUpdate] = useState<AppUpdatePrepareResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [checkingApp, setCheckingApp] = useState(false);
  const [downloadingApp, setDownloadingApp] = useState(false);
  const [checkingRuntime, setCheckingRuntime] = useState(false);
  const [updatingRuntime, setUpdatingRuntime] = useState(false);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  async function load() {
    setLoading(true);
    try {
      const [s, r, v, pendingAppUpdate] = await Promise.all([getSettings(), getRuntimeStatus(), getAppVersion(), getPendingAppUpdate()]);
      setSettings(s);
      setRuntime(r);
      setAppVersion(v);
      setPreparedUpdate(pendingAppUpdate);
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

  async function checkRuntimeUpdate() {
    setCheckingRuntime(true);
    try {
      const nextRuntime = await getRuntimeStatus();
      setRuntime(nextRuntime);
      addToast({
        key: "settings-runtime-check",
        type: nextRuntime.update_available ? "info" : "success",
        title: nextRuntime.update_available ? "Runtime update available" : "Runtime up to date",
        message: nextRuntime.update_available
          ? `${nextRuntime.latest_version} (${nextRuntime.latest_asset_name || "runtime"})`
          : nextRuntime.installed_version || undefined,
        action: nextRuntime.update_available ? {
          label: "Update Now",
          onClick: () => { void runRuntimeUpdate(nextRuntime); },
        } : undefined,
      });
    } catch (err) {
      addToast({ key: "settings-runtime-check", type: "error", title: "Runtime update check failed", message: String(err) });
    } finally {
      setCheckingRuntime(false);
    }
  }

  async function runRuntimeUpdate(targetRuntime = runtime) {
    if (!targetRuntime?.update_available) return;
    setUpdatingRuntime(true);
    try {
      await updateRuntime();
      await load();
    } catch (err) {
      addToast({ type: "error", title: "Runtime update failed", message: String(err) });
    } finally {
      setUpdatingRuntime(false);
    }
  }

  async function checkAppUpdate() {
    setCheckingApp(true);
    try {
      const update = await checkForAppUpdatesManual();
      setAppUpdate(update);
      setPreparedUpdate(null);
      addToast({ key: "settings-app-check", type: update ? "info" : "success", title: update ? "App update available" : "App up to date", message: update ? `${update.latest_version} (${update.asset_name})` : undefined });
    } catch (err) {
      addToast({ key: "settings-app-check", type: "error", title: "App update check failed", message: String(err) });
    } finally {
      setCheckingApp(false);
    }
  }

  async function downloadAppUpdate() {
    if (!appUpdate) return;
    setDownloadingApp(true);
    try {
      const prepared = await downloadAndPrepareAppUpdate(appUpdate);
      setPreparedUpdate(prepared);
    } catch (err) {
      addToast({ type: "error", title: "App update download failed", message: String(err) });
    } finally {
      setDownloadingApp(false);
    }
  }

  if (loading || !settings) return <div className="page settings-page"><div className="skeleton skeleton-card" /></div>;

  return <div className="page settings-page">
    <div className="page__header"><h1 className="page__title"><SettingsIcon size={18} /> Settings</h1><button className="btn btn--primary" onClick={save} disabled={saving}><Save size={14} /> Save</button></div>
    <div className="settings-page__body">
    <div className="card form-grid">
      <div className="section-title">Profile Managers</div>
      <Field label="GPMLogin API URL" value={settings.gpmlogin_api_base_url} onChange={(v) => setSettings({ ...settings, gpmlogin_api_base_url: v })} />
      <Field label="GPMGlobal API URL" value={settings.gpmglobal_api_base_url} onChange={(v) => setSettings({ ...settings, gpmglobal_api_base_url: v })} />
      <Field label="Donut Browser API URL" value={settings.donutbrowser_api_base_url} onChange={(v) => setSettings({ ...settings, donutbrowser_api_base_url: v })} />
      <Field label="Max Parallel Runtimes" type="number" value={String(settings.global_max_parallel_runtime)} onChange={(v) => setSettings({ ...settings, global_max_parallel_runtime: Number(v) || 1 })} />
    </div>
    <div className="card" style={{ marginTop: 16 }}>
      <div className="panel__header settings-card__header"><span>Storage</span></div>
      <div className="settings-option">
        <div className="settings-option__copy">
          <div className="settings-option__title">Log retention</div>
          <div className="settings-option__hint">Delete old log files after this many days. Run history and statistics stay in database. Set 0 to disable cleanup.</div>
        </div>
        <label className="field settings-number-field"><span className="field__label">Days</span><input className="input" type="number" min={0} value={String(settings.log_retention_days)} onChange={(e) => setSettings({ ...settings, log_retention_days: Math.max(0, Number(e.target.value) || 0) })} /></label>
      </div>
    </div>
    <div className="card" style={{ marginTop: 16 }}>
      <div className="panel__header settings-card__header"><span><Sun size={16} /> Appearance</span></div>
      <div className="settings-option">
        <div className="settings-option__copy">
          <div className="settings-option__title">Theme</div>
          <div className="settings-option__hint">Switch app chrome, panels, forms, tables, and status surfaces. Logs stay terminal-dark for readability.</div>
        </div>
        <div className="theme-choice" role="radiogroup" aria-label="Theme">
          <button className={`theme-choice__btn${themeMode === "dark" ? " theme-choice__btn--active" : ""}`} type="button" role="radio" aria-checked={themeMode === "dark"} onClick={() => onThemeModeChange("dark")}><Moon size={14} /> Dark</button>
          <button className={`theme-choice__btn${themeMode === "light" ? " theme-choice__btn--active" : ""}`} type="button" role="radio" aria-checked={themeMode === "light"} onClick={() => onThemeModeChange("light")}><Sun size={14} /> Light</button>
          <button className={`theme-choice__btn${themeMode === "system" ? " theme-choice__btn--active" : ""}`} type="button" role="radio" aria-checked={themeMode === "system"} onClick={() => onThemeModeChange("system")}><Monitor size={14} /> System</button>
        </div>
      </div>
    </div>
    <div className="card" style={{ marginTop: 16 }}>
      <div className="panel__header settings-card__header"><span><Download size={16} /> Application Update</span><div className="toolbar"><UpdateStatusPill available={Boolean(appUpdate || preparedUpdate)} /><button className="btn btn--secondary" onClick={checkAppUpdate} disabled={checkingApp}><RefreshCw size={14} /> Check Now</button>{appUpdate && !appUpdate.manual_update_required && !preparedUpdate && <button className="btn btn--primary" onClick={downloadAppUpdate} disabled={downloadingApp}><Download size={14} /> Download</button>}{preparedUpdate && <button className="btn btn--primary" onClick={() => { void restartApplication(); }}>Restart & Install</button>}</div></div>
      <div className="settings-option">
        <div className="settings-option__copy">
          <div className="settings-option__title">Auto check update</div>
          <div className="settings-option__hint">Automatically checks GitHub and downloads app updates in background. Installation starts only after Restart Now.</div>
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
      </div>
    </div>
    <div className="card" style={{ marginTop: 16 }}>
      <div className="panel__header settings-card__header"><span><Cpu size={16} /> Donumate Runtime</span><div className="toolbar"><UpdateStatusPill available={Boolean(runtime?.update_available)} /><button className="btn btn--secondary" onClick={checkRuntimeUpdate} disabled={checkingRuntime || !runtime}><RefreshCw size={14} /> Check Update</button>{runtime?.update_available && <button className="btn btn--primary" onClick={() => { void runRuntimeUpdate(); }} disabled={updatingRuntime}><Download size={14} /> Update Now</button>}</div></div>
      <div className="settings-option">
        <div className="settings-option__copy">
          <div className="settings-option__title">Auto check update</div>
          <div className="settings-option__hint">Automatically checks GitHub for new runtime versions every 30 minutes. Updates apply when no runtime is running.</div>
        </div>
        <label className="toggle" aria-label="Auto check runtime updates">
          <input type="checkbox" checked={!settings.disable_runtime_updates} onChange={(e) => setSettings({ ...settings, disable_runtime_updates: !e.target.checked })} />
          <span className="toggle__track" />
          <span className="toggle__thumb" />
        </label>
      </div>
      {runtime ? <div className="settings-version-grid">
        <div className="settings-meta-item"><span>Installed</span><strong>{runtime.installed_version || "None"} {runtime.installed_asset_name}</strong></div>
        <div className="settings-meta-item"><span>Latest</span><strong>{runtime.latest_version || "Unknown"}</strong></div>
        {runtime.pending_version && <div><span className="badge badge--pending">Pending {runtime.pending_version}</span></div>}
      </div> : <div className="skeleton skeleton-row" />}
    </div>
    </div>
  </div>;
}

function UpdateStatusPill({ available }: { available: boolean }) {
  return <span className={`status-pill${available ? " status-pill--warning" : " status-pill--success"}`} aria-live="polite"><span className="status-pill__dot" />{available ? "Update available" : "Up to date"}</span>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="field"><span className="field__label">{label}</span><input className="input" type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
