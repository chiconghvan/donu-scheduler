import { useEffect, useState } from "react";
import type { Settings } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";

export default function SettingsPage() {
  const dialog = useDialog();
  const [settings, setSettings] = useState<Settings>({
    runtime_path: "",
    gpmlogin_api_base_url: "http://127.0.0.1:19995",
    gpmglobal_api_base_url: "http://127.0.0.1:9495",
    donutbrowser_api_base_url: "http://127.0.0.1:10108",
    global_max_parallel_runtime: 3,
  });
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .getSettings()
      .then(setSettings)
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

  return (
    <div>
      <h1>Settings</h1>

      <div className="card">
        <h2>Runtime</h2>
        <div className="form-group">
          <label>Runtime Path (donumate .exe)</label>
          <input
            value={settings.runtime_path}
            onChange={(e) =>
              setSettings({ ...settings, runtime_path: e.target.value })
            }
            placeholder="E:\Code\DonuScheduler\donumate_v0.5.6.exe"
          />
          <p className="text-muted" style={{ marginTop: 4 }}>
            Path to the donumate runtime executable. Leave empty for fake
            execution.
          </p>
        </div>
      </div>

      <div className="card">
        <h2>Profile Manager APIs</h2>
        <div className="form-group">
          <label>GPMLogin API Base URL</label>
          <input
            value={settings.gpmlogin_api_base_url}
            onChange={(e) =>
              setSettings({
                ...settings,
                gpmlogin_api_base_url: e.target.value,
              })
            }
            placeholder="http://127.0.0.1:19995"
          />
        </div>
        <div className="form-group">
          <label>GPMGlobal API Base URL</label>
          <input
            value={settings.gpmglobal_api_base_url}
            onChange={(e) =>
              setSettings({
                ...settings,
                gpmglobal_api_base_url: e.target.value,
              })
            }
            placeholder="http://127.0.0.1:9495"
          />
        </div>
        <div className="form-group">
          <label>Donut Browser API Base URL</label>
          <input
            value={settings.donutbrowser_api_base_url}
            onChange={(e) =>
              setSettings({
                ...settings,
                donutbrowser_api_base_url: e.target.value,
              })
            }
            placeholder="http://127.0.0.1:10108"
          />
        </div>
      </div>

      <div className="card">
        <h2>Limits</h2>
        <div className="form-group">
          <label>Global Max Parallel Runtime</label>
          <input
            type="number"
            value={settings.global_max_parallel_runtime}
            onChange={(e) =>
              setSettings({
                ...settings,
                global_max_parallel_runtime: parseInt(e.target.value) || 3,
              })
            }
          />
          <p className="text-muted" style={{ marginTop: 4 }}>
            Maximum number of concurrent runtime processes.
          </p>
        </div>
      </div>

      {saved && (
        <p style={{ color: "#5de95d", marginBottom: 8 }}>Settings saved!</p>
      )}

      <button
        className="btn btn-primary"
        onClick={handleSave}
        disabled={loading}
      >
        Save Settings
      </button>
    </div>
  );
}
