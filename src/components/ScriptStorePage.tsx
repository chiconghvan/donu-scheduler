import { useEffect, useMemo, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import * as api from "../api";
import type { ScriptStoreScript } from "../types";
import { useDialog } from "./DialogHost";
import { FloatingInput, FloatingSelect } from "./FloatingField";

function formatVersion(script: ScriptStoreScript) {
  return script.version || "-";
}

export default function ScriptStorePage() {
  const dialog = useDialog();
  const [loading, setLoading] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);
  const [search, setSearch] = useState("");
  const [showDeprecated, setShowDeprecated] = useState(false);
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<ScriptStoreScript[]>([]);
  const [storeVersion, setStoreVersion] = useState("");
  const [token, setToken] = useState("");
  const [updateToastKeys, setUpdateToastKeys] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.listScriptStore();
      setCatalog(data.scripts);
      setStoreVersion(data.store_version);
      for (const script of data.scripts) {
        const key = `${script.id}:${script.version}:${script.installed_version ?? ""}`;
        if (script.update_available && !updateToastKeys.includes(key)) {
          await emit("script-store-update-available", {
            script_id: script.id,
            name: script.name,
            current_version: script.installed_version ?? script.version,
            latest_version: script.version,
          });
          setUpdateToastKeys((current) => [...current, key]);
        }
      }
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    (async () => {
      try {
        const hasToken = await api.scriptStoreHasToken();
        if (!alive) return;
        setTokenReady(hasToken);
        if (hasToken) {
          await load();
          timer = window.setInterval(async () => {
            try {
              await api.applyPendingScriptStoreUpdates();
              await load();
            } catch {
              // ignore background retry noise
            }
          }, 15000);
        }
      } catch (e: unknown) {
        await dialog.showError(String(e));
      }
    })();
    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
    };
  }, []);

  const visibleScripts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter((script) => {
      if (!showDeprecated && script.deprecated) return false;
      if (stateFilter === "installed" && !script.installed) return false;
      if (stateFilter === "updates" && !script.update_available) return false;
      if (stateFilter === "available" && script.installed) return false;
      if (!q) return true;
      return [script.name, script.description, script.version, script.runtime]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [catalog, search, showDeprecated, stateFilter]);

  const selectedScript = visibleScripts.find((script) => script.id === selectedScriptId) || visibleScripts[0] || null;

  useEffect(() => {
    if (visibleScripts.length > 0 && !visibleScripts.some((script) => script.id === selectedScriptId)) {
      setSelectedScriptId(visibleScripts[0].id);
    }
  }, [visibleScripts, selectedScriptId]);

  const onSaveToken = async () => {
    const value = token.trim();
    if (!value) return;
    try {
      await api.scriptStoreSaveToken(value);
      setToken("");
      setTokenReady(true);
      await load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  if (!tokenReady) {
    return (
      <div className="page">
        <div className="page-header">
          <div className="page-title-block">
            <h1>Script Store</h1>
            <div className="page-description">Private script catalog and automatic updates.</div>
          </div>
        </div>
        <div className="panel empty-state">
          <div className="empty-state-inner">
            <div className="empty-icon">S</div>
            <h2>Private catalog locked</h2>
            <p className="text-muted">Need GitHub token to read private script repository.</p>
            <div className="form-group" style={{ width: "min(420px, 100%)" }}>
              <FloatingInput label="Token" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ghp_xxx" />
            </div>
            <button className="btn btn-primary btn-sm" onClick={onSaveToken} disabled={!token.trim()}>Save Token</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Script Store</h1>
          <div className="page-description">Store version {storeVersion || "-"}. Install and update automation scripts.</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
      </div>

      <div className="split-grid">
      <div className="panel table-panel">
        <div className="panel-header">
          <h2>Catalog ({visibleScripts.length})</h2>
          <div className="toolbar-actions">
            <FloatingInput label="Search script" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search script" style={{ width: 240 }} />
            <FloatingSelect label="State filter" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} style={{ width: 130 }}>
              <option value="all">All states</option>
              <option value="installed">Installed</option>
              <option value="updates">Updates</option>
              <option value="available">Available</option>
            </FloatingSelect>
            <label className="flex-row" style={{ margin: 0 }}>
              <input type="checkbox" checked={showDeprecated} onChange={(e) => setShowDeprecated(e.target.checked)} style={{ width: 16, minHeight: 16 }} />
              <span className="text-muted">Deprecated</span>
            </label>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Script</th>
                <th>Runtime</th>
                <th>Version</th>
                <th>State</th>
                <th>Updated</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleScripts.length === 0 ? (
                <tr><td colSpan={6} className="text-muted">No scripts found.</td></tr>
              ) : visibleScripts.map((script) => (
                <tr key={script.id} className={selectedScript?.id === script.id ? "selected-row" : ""} onClick={() => setSelectedScriptId(script.id)} style={{ cursor: "pointer" }}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{script.name}</div>
                    <div className="text-muted">{script.description}</div>
                  </td>
                  <td>{script.runtime}</td>
                  <td className="mono">v{formatVersion(script)}</td>
                  <td>
                    <div className="flex-row">
                      {script.installed && <span className="store-badge">Installed</span>}
                      {script.update_available && <span className="store-badge store-badge-warn">Update</span>}
                      {script.deprecated && <span className="store-badge store-badge-muted">Deprecated</span>}
                      {!script.installed && !script.deprecated && <span className="status-badge status-pending">Available</span>}
                    </div>
                  </td>
                  <td className="mono text-muted">{script.updated_at}</td>
                  <td>
                    {!script.installed ? (
                      <button className="btn btn-primary btn-sm" onClick={async (e) => { e.stopPropagation(); try { await api.installScriptStore(script.id); await load(); } catch (err: unknown) { await dialog.showError(String(err)); } }}>Install</button>
                    ) : (
                      <button className="btn btn-secondary btn-sm" onClick={async (e) => { e.stopPropagation(); try { await api.updateScriptStore(script.id); await load(); } catch (err: unknown) { await dialog.showError(String(err)); } }} disabled={!script.update_available}>Update</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="panel inspector">
        <div className="panel-header"><h2>Script Detail</h2></div>
        {selectedScript ? (
          <>
            <div>
              <h2>{selectedScript.name}</h2>
              <p className="text-muted">{selectedScript.runtime} · v{formatVersion(selectedScript)}</p>
            </div>
            <p>{selectedScript.description || "No description."}</p>
            <div className="form-section">
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>State</span><span>{selectedScript.installed ? "Installed" : "Available"}</span></div>
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>Installed</span><span className="mono text-muted">{selectedScript.installed_version || "-"}</span></div>
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>Latest</span><span className="mono text-muted">{selectedScript.version || "-"}</span></div>
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>Source</span><span className="mono text-muted">{selectedScript.source_tag || "-"}</span></div>
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>Min app</span><span className="mono text-muted">{selectedScript.min_app_version || "-"}</span></div>
            </div>
            <div className="form-section">
              <label>Path</label>
              <div className="mono text-muted">{selectedScript.path || "-"}</div>
              <label>SHA256</label>
              <div className="mono text-muted" style={{ wordBreak: "break-all", whiteSpace: "normal" }}>{selectedScript.sha256 || "-"}</div>
            </div>
            {!selectedScript.installed ? (
              <button className="btn btn-primary" onClick={async () => { try { await api.installScriptStore(selectedScript.id); await load(); } catch (e: unknown) { await dialog.showError(String(e)); } }}>Install</button>
            ) : (
              <button className="btn btn-primary" onClick={async () => { try { await api.updateScriptStore(selectedScript.id); await load(); } catch (e: unknown) { await dialog.showError(String(e)); } }} disabled={!selectedScript.update_available}>Update</button>
            )}
          </>
        ) : <p className="text-muted">Select a script to inspect.</p>}
      </aside>
      </div>
    </div>
  );
}
