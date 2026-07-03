import { useEffect, useState } from "react";
import type { RuntimeStatus, Settings } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";
import { FloatingInput } from "./FloatingField";

export default function SettingsPage({
  theme,
  onThemeChange,
}: {
  theme: "dark" | "light";
  onThemeChange: (theme: "dark" | "light") => void;
}) {
  const dialog = useDialog();
  const [settings, setSettings] = useState<Settings>({
    gpmlogin_api_base_url: "http://127.0.0.1:19995",
    gpmglobal_api_base_url: "http://127.0.0.1:9495",
    donutbrowser_api_base_url: "http://127.0.0.1:10108",
    global_max_parallel_runtime: 3,
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeSaving, setRuntimeSaving] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
      .catch(() => {});
    api
      .getRuntimeStatus()
      .then(setRuntimeStatus)
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    try {
      await api.updateSettings(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
    setLoading(false);
  };

  const refreshRuntimeStatus = async () => {
    setRuntimeLoading(true);
    try {
      setRuntimeStatus(await api.getRuntimeStatus());
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
    setRuntimeLoading(false);
  };

  const handleRuntimeUpdate = async () => {
    setRuntimeSaving(true);
    try {
      await api.updateRuntime();
      await refreshRuntimeStatus();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
    setRuntimeSaving(false);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Settings</h1>
          <div className="page-description">Appearance, profile manager endpoints, runtime state, and scheduler limits.</div>
        </div>
        <div className="page-actions">
          {saved && <span className="status-badge status-success">Saved</span>}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>

      <div className="settings-layout">
        <aside className="panel compact">
          <h2>Sections</h2>
          <button className="btn btn-secondary btn-sm" type="button">Appearance</button>
          <button className="btn btn-secondary btn-sm" type="button">API Endpoints</button>
          <button className="btn btn-secondary btn-sm" type="button">Runtime Limits</button>
          <button className="btn btn-secondary btn-sm" type="button">About</button>
        </aside>

        <div className="panel">
          <section className="form-section">
            <div>
              <h2>Appearance</h2>
              <p className="text-muted">Theme applies immediately and persists locally on this device.</p>
            </div>
            <div className="form-group">
              <label>UI Theme</label>
              <div className="segmented-control">
                <button className={theme === "dark" ? "active" : ""} type="button" onClick={() => onThemeChange("dark")}>Dark</button>
                <button className={theme === "light" ? "active" : ""} type="button" onClick={() => onThemeChange("light")}>Light</button>
              </div>
            </div>
          </section>

          <section className="form-section">
            <div>
              <h2>Profile Manager APIs</h2>
              <p className="text-muted">Local REST endpoints used to fetch profiles before manual or scheduled runs.</p>
            </div>
            <div className="form-group">
              <FloatingInput
                label="GPMLogin API Base URL"
                value={settings.gpmlogin_api_base_url}
                onChange={(e) => setSettings({ ...settings, gpmlogin_api_base_url: e.target.value })}
                placeholder="http://127.0.0.1:19995"
              />
            </div>
            <div className="form-group">
              <FloatingInput
                label="GPMGlobal API Base URL"
                value={settings.gpmglobal_api_base_url}
                onChange={(e) => setSettings({ ...settings, gpmglobal_api_base_url: e.target.value })}
                placeholder="http://127.0.0.1:9495"
              />
            </div>
            <div className="form-group">
              <FloatingInput
                label="Donut Browser API Base URL"
                value={settings.donutbrowser_api_base_url}
                onChange={(e) => setSettings({ ...settings, donutbrowser_api_base_url: e.target.value })}
                placeholder="http://127.0.0.1:10108"
              />
            </div>
          </section>

          <section className="form-section">
            <div>
              <h2>Runtime Limits</h2>
              <p className="text-muted">Controls scheduler concurrency across jobs and manual batch runs.</p>
            </div>
            <div className="form-group">
              <FloatingInput
                label="Global Max Parallel Runtime"
                type="number"
                min={1}
                value={settings.global_max_parallel_runtime}
                onChange={(e) => setSettings({ ...settings, global_max_parallel_runtime: parseInt(e.target.value) || 3 })}
              />
              <p className="text-muted" style={{ marginTop: 6 }}>Maximum number of concurrent runtime processes.</p>
            </div>
          </section>

          <section className="form-section">
            <div className="section-header-row">
              <div>
                <h2>Runtime</h2>
                <p className="text-muted">Installed runtime version, patch state, and latest release check.</p>
              </div>
              <div className="runtime-actions">
                <button className="btn btn-secondary btn-sm" type="button" onClick={refreshRuntimeStatus} disabled={runtimeLoading}>
                  {runtimeLoading ? "Checking..." : "Check Update"}
                </button>
                <button className="btn btn-primary btn-sm" type="button" onClick={handleRuntimeUpdate} disabled={runtimeSaving}>
                  {runtimeSaving ? "Updating..." : "Update Runtime"}
                </button>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>Installed version</td><td className="mono">{runtimeStatus?.installed_version || "-"}</td></tr>
                  <tr><td>Installed patch</td><td className="mono">{runtimeStatus?.installed_asset_name || "-"}</td></tr>
                  <tr><td>Downloaded at</td><td className="mono">{runtimeStatus?.downloaded_at || "-"}</td></tr>
                  <tr><td>Pending version</td><td className="mono">{runtimeStatus?.pending_version || "-"}</td></tr>
                  <tr><td>Pending patch</td><td className="mono">{runtimeStatus?.pending_asset_name || "-"}</td></tr>
                  <tr><td>Latest version</td><td className="mono">{runtimeStatus?.latest_version || "-"}</td></tr>
                  <tr><td>Latest patch</td><td className="mono">{runtimeStatus?.latest_asset_name || "-"}</td></tr>
                  <tr><td>Update available</td><td>{runtimeStatus ? <span className={runtimeStatus.update_available ? "status-badge status-pending" : "status-badge status-success"}>{runtimeStatus.update_available ? "Yes" : "No"}</span> : "-"}</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="form-section">
            <div>
              <h2>About</h2>
              <p className="text-muted">DonuScheduler desktop automation scheduler.</p>
            </div>
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>App</td><td>DonuScheduler</td></tr>
                  <tr><td>Version</td><td className="mono">0.2.0</td></tr>
                  <tr><td>Runtime check</td><td>{runtimeStatus ? <span className={runtimeStatus.update_available ? "status-badge status-pending" : "status-badge status-success"}>{runtimeStatus.update_available ? "Update available" : "Up to date"}</span> : "-"}</td></tr>
                  <tr><td>Database</td><td className="mono">%LOCALAPPDATA%/DonuScheduler/donu_scheduler.sqlite</td></tr>
                  <tr><td>Scheduler tick</td><td>20 seconds</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
