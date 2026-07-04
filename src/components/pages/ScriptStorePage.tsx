import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCw, Search, Store } from "lucide-react";
import { applyPendingScriptStoreUpdates, installScriptStore, listScriptStore, scriptStoreHasToken, scriptStoreSaveToken, updateScriptStore } from "../../api";
import type { ScriptStoreCatalog, ScriptStoreScript } from "../../types";
import { useInterval } from "../../hooks/useInterval";
import { useToast } from "../common/Toast";
import EmptyState from "../common/EmptyState";

export default function ScriptStorePage() {
  const [tokenReady, setTokenReady] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [catalog, setCatalog] = useState<ScriptStoreCatalog | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const { addToast } = useToast();

  async function load() {
    try {
      const hasToken = await scriptStoreHasToken();
      setTokenReady(hasToken);
      if (hasToken) setCatalog(await listScriptStore());
    } catch (err) {
      addToast({ type: "error", title: "Store load failed", message: String(err) });
    }
  }

  useEffect(() => { void load(); }, []);
  useInterval(() => { if (tokenReady) void applyPendingScriptStoreUpdates().then(load).catch(() => undefined); }, tokenReady ? 15000 : null);

  async function saveToken() {
    try {
      await scriptStoreSaveToken(token);
      setToken("");
      await load();
      addToast({ type: "success", title: "Token saved" });
    } catch (err) {
      addToast({ type: "error", title: "Token failed", message: String(err) });
    }
  }

  async function runAction(script: ScriptStoreScript) {
    setBusyId(script.id);
    try {
      if (!script.installed) await installScriptStore(script.id);
      else await updateScriptStore(script.id);
      await load();
      addToast({ type: "success", title: script.installed ? "Update queued" : "Script installed", message: script.name });
    } catch (err) {
      addToast({ type: "error", title: "Action failed", message: String(err) });
    } finally {
      setBusyId(null);
    }
  }

  const scripts = useMemo(() => {
    const q = query.toLowerCase();
    return (catalog?.scripts || []).filter((s) => {
      if (q && !`${s.name} ${s.description}`.toLowerCase().includes(q)) return false;
      if (filter === "installed" && !s.installed) return false;
      if (filter === "available" && s.installed) return false;
      if (filter === "updates" && !s.update_available) return false;
      return true;
    });
  }, [catalog, query, filter]);

  const selected = scripts.find((s) => s.id === selectedId) || scripts[0];

  if (tokenReady === false) {
    return <div className="page"><div className="card" style={{ maxWidth: 520, margin: "80px auto" }}><h1 className="page__title"><Store size={18} /> Script Store Token</h1><div className="form-grid" style={{ marginTop: 16 }}><input className="input" placeholder="GitHub token" value={token} onChange={(e) => setToken(e.target.value)} /><button className="btn btn--primary" onClick={saveToken}>Save Token</button></div></div></div>;
  }

  return <div className="page">
    <div className="page__header"><h1 className="page__title"><Store size={18} /> Script Store</h1><button className="btn btn--secondary" onClick={load}><RefreshCw size={14} /> Refresh</button></div>
    <div className="page__actions" style={{ marginBottom: 12 }}><div className="search-input"><Search className="search-input__icon" size={14} /><input className="input" placeholder="Search scripts" value={query} onChange={(e) => setQuery(e.target.value)} /></div><select className="select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 180 }}><option value="all">All</option><option value="installed">Installed</option><option value="available">Available</option><option value="updates">Updates</option></select></div>
    <div className="split-layout">
      <section className="panel"><div className="panel__header">Catalog {catalog?.store_version}</div><div className="panel__body panel__body--flush">{scripts.length === 0 ? <EmptyState title="No scripts" /> : <table className="table"><tbody>{scripts.map((s) => <tr key={s.id} className={selected?.id === s.id ? "table-row--selected" : ""} onClick={() => setSelectedId(s.id)} style={{ cursor: "pointer" }}><td>{s.name}</td><td>{s.version}</td><td><StoreBadge script={s} /></td><td><button className="btn btn--sm btn--primary" disabled={busyId === s.id || (s.installed && !s.update_available)} onClick={(e) => { e.stopPropagation(); void runAction(s); }}><Download size={12} />{s.installed ? "Update" : "Install"}</button></td></tr>)}</tbody></table>}</div></section>
      <section className="panel"><div className="panel__header">Inspector</div><div className="panel__body">{selected ? <div className="form-grid"><h2>{selected.name}</h2><p style={{ color: "var(--fg-secondary)" }}>{selected.description}</p><StoreBadge script={selected} /><div>Version: {selected.version}</div><div>Runtime: {selected.runtime}</div><div style={{ wordBreak: "break-all" }}>SHA256: {selected.sha256}</div></div> : <EmptyState title="Select script" />}</div></section>
    </div>
  </div>;
}

function StoreBadge({ script }: { script: ScriptStoreScript }) {
  if (script.pending_update) return <span className="badge badge--pending">Pending</span>;
  if (script.update_available) return <span className="badge badge--queued">Update</span>;
  if (script.installed) return <span className="badge badge--success">Installed</span>;
  return <span className="badge badge--scheduled">Available</span>;
}
