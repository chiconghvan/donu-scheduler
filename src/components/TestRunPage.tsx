import { useEffect, useState, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { Script, TestRun, ProfileSummary, Settings, ProfileSnapshot } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";

interface DefaultInput {
  name: string;
  comment: string;
  value: string;
  inputType: string;
  comboboxData: string;
}

export default function TestRunPage() {
  const dialog = useDialog();
  const [scripts, setScripts] = useState<Script[]>([]);
  const [testRuns, setTestRuns] = useState<TestRun[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scriptId, setScriptId] = useState("");
  const [cliArgs, setCliArgs] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [log, setLog] = useState("");

  const [managerTab, setManagerTab] = useState<"gpm" | "gpmglobal" | "donut">("gpm");
  const [gpmProfiles, setGpmProfiles] = useState<ProfileSummary[]>([]);
  const [gpmGlobalProfiles, setGpmGlobalProfiles] = useState<ProfileSummary[]>([]);
  const [donutProfiles, setDonutProfiles] = useState<ProfileSummary[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [groupFilter, setGroupFilter] = useState("all");
  const [managerStatus, setManagerStatus] = useState({
    gpm: { online: true, error: "" },
    gpmglobal: { online: true, error: "" },
    donut: { online: true, error: "" },
  });

  const [defaultInputs, setDefaultInputs] = useState<DefaultInput[]>([]);

  // Multi-select state
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(
    new Set()
  );
  const lastClickedIndex = useRef<number | null>(null);
  const isMouseDown = useRef(false);
  const isDragging = useRef(false);
  const dragStartIndex = useRef<number | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLPreElement>(null);

  const load = async () => {
    try {
      const [s, tr, st] = await Promise.all([
        api.listScripts(),
        api.listTestRuns(),
        api.getSettings(),
      ]);
      setScripts(s);
      setTestRuns(tr);
      setSettings(st);
      if (s.length > 0 && !scriptId) setScriptId(s[0].id);
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }

    await Promise.all([
      loadProfiles("gpm"),
      loadProfiles("gpmglobal"),
      loadProfiles("donut"),
    ]);
  };

  useEffect(() => {
    load();
  }, []);

  // Listen for real-time log stream events
  useEffect(() => {
    const unlisten = listen<{ run_id: string; line: string; source: string }>(
      "log-stream",
      (event) => {
        const { run_id, line, source } = event.payload;
        if (run_id === selectedRunId) {
          const prefix = source === "stderr" ? "[stderr] " : "";
          setLog((prev) => prev + prefix + line + "\n");
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [selectedRunId]);

  // Auto-scroll log box only if user is already at/near the bottom
  useEffect(() => {
    const container = logContainerRef.current;
    if (container && logEndRef.current) {
      const isNearBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      if (isNearBottom) {
        logEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, [log]);

  // When script changes, try to load cached inputs, otherwise fall back to defaults
  useEffect(() => {
    const loadCached = async () => {
      const selected = scripts.find((s) => s.id === scriptId);
      if (selected) {
        try {
          const cache = await api.getInputCache(scriptId);
          if (cache.cli_args || cache.default_inputs_json !== "[]") {
            setCliArgs(cache.cli_args);
            setDefaultInputs(JSON.parse(cache.default_inputs_json || "[]"));
            return;
          }
        } catch {
          // ignore, fall back to defaults
        }
        try {
          setDefaultInputs(JSON.parse(selected.default_inputs_json || "[]"));
        } catch {
          setDefaultInputs([]);
        }
        setCliArgs(selected.default_args || "");
      } else {
        setDefaultInputs([]);
        setCliArgs("");
      }
    };
    if (scriptId) loadCached();
  }, [scriptId, scripts]);

  const handleDefaultInputChange = (index: number, value: string) => {
    setDefaultInputs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], value };
      return updated;
    });
  };

  const buildCliArgs = () => {
    const inputArgs = defaultInputs
      .filter((d) => d.value.trim() !== "")
      .map((d) => `--input ${d.name}=${d.value}`)
      .join(" ");
    const extraArgs = cliArgs.trim();
    return [inputArgs, extraArgs].filter(Boolean).join(" ");
  };

  const loadProfiles = async (manager: "gpm" | "gpmglobal" | "donut") => {
    setLoadingProfiles(true);
    try {
      if (manager === "gpm") {
        setGpmProfiles(await api.listGpmProfiles());
        setManagerStatus((prev) => ({ ...prev, gpm: { online: true, error: "" } }));
      } else if (manager === "gpmglobal") {
        setGpmGlobalProfiles(await api.listGpmGlobalProfiles());
        setManagerStatus((prev) => ({ ...prev, gpmglobal: { online: true, error: "" } }));
      } else {
        setDonutProfiles(await api.listDonutProfiles());
        setManagerStatus((prev) => ({ ...prev, donut: { online: true, error: "" } }));
      }
    } catch (e: unknown) {
      if (manager === "gpm") {
        setGpmProfiles([]);
      } else if (manager === "gpmglobal") {
        setGpmGlobalProfiles([]);
      } else {
        setDonutProfiles([]);
      }
      setManagerStatus((prev) => ({
        ...prev,
        [manager]: { online: false, error: String(e) },
      }));
    }
    setLoadingProfiles(false);
  };

  useEffect(() => {
    setGroupFilter("all");
    setSelectedProfiles(new Set());
    loadProfiles(managerTab);
  }, [managerTab]);

  const profiles =
    managerTab === "gpm"
      ? gpmProfiles
      : managerTab === "gpmglobal"
        ? gpmGlobalProfiles
        : donutProfiles;

  const buildProfileSnapshots = (profileIds: string[]): ProfileSnapshot[] =>
    profileIds.map((profileId) => {
      const profile = profiles.find((p) => p.id === profileId);
      return {
        profile_id: profileId,
        profile_name: profile?.name || profileId,
        manager: managerTab,
        group_name: profile?.group_name || null,
      };
    });

  const currentStatus = managerStatus[managerTab];

  // Ensure profiles are loaded for name resolution
  useEffect(() => {
    if (gpmProfiles.length === 0) {
      api.listGpmProfiles().then(setGpmProfiles).catch(() => {});
    }
    if (gpmGlobalProfiles.length === 0) {
      api.listGpmGlobalProfiles().then(setGpmGlobalProfiles).catch(() => {});
    }
    if (donutProfiles.length === 0) {
      api.listDonutProfiles().then(setDonutProfiles).catch(() => {});
    }
  }, [testRuns]);

  // Unique group names for filter dropdown
  const groupNames = Array.from(
    new Set(profiles.map((p) => p.group_name).filter(Boolean))
  ).sort() as string[];

  // Filtered profiles by group
  const filteredProfiles =
    groupFilter === "all"
      ? profiles
      : profiles.filter((p) => p.group_name === groupFilter);

  // --- Profile multi-select handlers ---

  const toggleProfile = useCallback(
    (profileId: string) => {
      setSelectedProfiles((prev) => {
        const next = new Set(prev);
        if (next.has(profileId)) {
          next.delete(profileId);
        } else {
          next.add(profileId);
        }
        return next;
      });
    },
    []
  );

  const selectRange = useCallback(
    (fromIndex: number, toIndex: number) => {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      setSelectedProfiles((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(filteredProfiles[i].id);
        }
        return next;
      });
    },
    [filteredProfiles]
  );

  const handleRowMouseDown = useCallback(
    (_e: React.MouseEvent, index: number) => {
      isMouseDown.current = true;
      isDragging.current = false;
      dragStartIndex.current = index;
    },
    []
  );

  const handleRowMouseMove = useCallback(
    (_e: React.MouseEvent, index: number) => {
      if (!isMouseDown.current) return;
      if (dragStartIndex.current !== index) {
        isDragging.current = true;
      }
      if (isDragging.current && dragStartIndex.current !== null) {
        selectRange(dragStartIndex.current, index);
      }
    },
    [selectRange]
  );

  const handleRowMouseUp = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (!isMouseDown.current) return;
      isMouseDown.current = false;

      if (!isDragging.current) {
        if (e.shiftKey && lastClickedIndex.current !== null) {
          selectRange(lastClickedIndex.current, index);
        } else if (e.ctrlKey || e.metaKey) {
          toggleProfile(filteredProfiles[index].id);
        } else {
          const pid = filteredProfiles[index].id;
          setSelectedProfiles((prev) => {
            if (prev.has(pid) && prev.size === 1) {
              return new Set();
            }
            return new Set([pid]);
          });
        }
      }

      lastClickedIndex.current = index;
      isDragging.current = false;
      dragStartIndex.current = null;
    },
    [filteredProfiles, selectRange, toggleProfile]
  );

  // --- Run handlers ---

  const handleRun = async () => {
    if (selectedProfiles.size === 0) return;
    if (!currentStatus.online) {
      await dialog.showError(`${managerTab} is offline`);
      return;
    }
    setLoading(true);

    try {
      const combinedArgs = buildCliArgs();
      const profileIds = Array.from(selectedProfiles);
      const snapshots = buildProfileSnapshots(profileIds);

      // Save inputs to cache for next time
      api
        .saveInputCache(scriptId, cliArgs, JSON.stringify(defaultInputs))
        .catch(() => {});

      if (profileIds.length === 1) {
        const run = await api.runScriptTest(
          scriptId,
          profileIds[0],
          combinedArgs,
          managerTab,
          snapshots[0]
        );
        setTestRuns(await api.listTestRuns());
        await pollRun(run.id);
      } else {
        const runs = await api.runBatchTest(
          scriptId,
          profileIds,
          combinedArgs,
          managerTab,
          snapshots
        );
        setTestRuns(await api.listTestRuns());
        await pollBatchRuns(runs.map((r) => r.id));
      }
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
    setLoading(false);
  };

  const pollRun = async (runId: string) => {
    for (let i = 0; i < 300; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const updated = await api.listTestRuns();
        setTestRuns(updated);
        const run = updated.find((r) => r.id === runId);
        if (run && run.status !== "running" && run.status !== "pending") {
          return;
        }
      } catch {
        break;
      }
    }
  };

  const pollBatchRuns = async (runIds: string[]) => {
    for (let i = 0; i < 600; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const updated = await api.listTestRuns();
        setTestRuns(updated);
        const allDone = runIds.every((id) => {
          const run = updated.find((r) => r.id === id);
          return run && run.status !== "running" && run.status !== "pending";
        });
        if (allDone) {
          return;
        }
      } catch {
        break;
      }
    }
  };

  const handleStop = async (runId: string) => {
    try {
      await api.stopTestRun(runId);
      setTestRuns(await api.listTestRuns());
      setLoading(false);
      setSelectedRunId(null);
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  const handleStopBatch = async (batchId: string) => {
    try {
      await api.stopBatchTestRun(batchId);
      setTestRuns(await api.listTestRuns());
      setLoading(false);
      setSelectedRunId(null);
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  return (
    <div>
      <h1>Manual Run</h1>

      <div className="card">
        <h2>Run Configuration</h2>
        <div className="form-row">
          <div className="form-group">
            <label>Script</label>
            <select
              value={scriptId}
              onChange={(e) => setScriptId(e.target.value)}
            >
              <option value="">-- select script --</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.script_path})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Runtime Path (from Settings)</label>
            <input
              readOnly
              value={settings?.runtime_path || "(not configured)"}
              style={{ opacity: 0.6 }}
            />
          </div>
        </div>

        <div className="form-group">
          <label>CLI Args (plain text)</label>
          <textarea
            rows={3}
            value={cliArgs}
            onChange={(e) => setCliArgs(e.target.value)}
            placeholder="Auto-filled from script default_args when script is selected"
          />
        </div>

        {defaultInputs.length > 0 && (
          <div className="form-group">
            <label>Script Inputs</label>
            {defaultInputs.map((input, idx) => (
              <div
                key={input.name}
                className="flex-row"
                style={{ marginBottom: 6 }}
              >
                <span
                  style={{
                    minWidth: 200,
                    fontSize: 13,
                    color: "#8899b0",
                    lineHeight: "32px",
                  }}
                >
                  {input.name} — {input.comment}
                </span>
                {input.inputType === "ComboBox" ? (
                  <select
                    value={input.value}
                    onChange={(e) =>
                      handleDefaultInputChange(idx, e.target.value)
                    }
                    style={{ flex: 1 }}
                  >
                    <option value="">-- select --</option>
                    {input.comboboxData
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean)
                      .map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                  </select>
                ) : input.inputType === "File" ? (
                  <div className="flex-row" style={{ flex: 1 }}>
                    <input
                      value={input.value}
                      onChange={(e) =>
                        handleDefaultInputChange(idx, e.target.value)
                      }
                      placeholder="select a file"
                      style={{ flex: 1 }}
                      readOnly
                    />
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={async () => {
                        const path = await api.openFileDialog("All Files", ["*"]);
                        if (path) handleDefaultInputChange(idx, path);
                      }}
                      style={{ marginLeft: 4, whiteSpace: "nowrap" }}
                    >
                      Browse
                    </button>
                  </div>
                ) : (
                  <input
                    value={input.value}
                    onChange={(e) =>
                      handleDefaultInputChange(idx, e.target.value)
                    }
                    placeholder="enter value"
                    style={{ flex: 1 }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="card" style={{ background: "#0f1a30" }}>
          <h3>
            Profile Selection
            {selectedProfiles.size > 0 && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: "normal",
                  color: "#5de95d",
                  marginLeft: 8,
                }}
              >
                ({selectedProfiles.size} selected
                {selectedProfiles.size > 1
                  ? ` — max ${settings?.global_max_parallel_runtime || 3} parallel`
                  : ""}
                )
              </span>
            )}
          </h3>
          <div className="tabs">
            <button
              className={managerTab === "gpm" ? "active" : ""}
              onClick={() => setManagerTab("gpm")}
            >
            GPMLogin
            <span className={`manager-badge ${managerStatus.gpm.online ? "manager-online" : "manager-offline"}`} style={{ marginLeft: 8 }}>
              {managerStatus.gpm.online ? "Online" : "Offline"}
            </span>
          </button>
          <button
              className={managerTab === "gpmglobal" ? "active" : ""}
              onClick={() => setManagerTab("gpmglobal")}
            >
              GPMGlobal
              <span className={`manager-badge ${managerStatus.gpmglobal.online ? "manager-online" : "manager-offline"}`} style={{ marginLeft: 8 }}>
                {managerStatus.gpmglobal.online ? "Online" : "Offline"}
              </span>
          </button>
          <button
              className={managerTab === "donut" ? "active" : ""}
              onClick={() => setManagerTab("donut")}
            >
              Donut Browser
              <span className={`manager-badge ${managerStatus.donut.online ? "manager-online" : "manager-offline"}`} style={{ marginLeft: 8 }}>
                {managerStatus.donut.online ? "Online" : "Offline"}
              </span>
            </button>
          </div>

          <div className="flex-row mb-8">
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => loadProfiles(managerTab)}
              disabled={loadingProfiles}
            >
              {loadingProfiles ? "Loading..." : "Refresh Profiles"}
            </button>
            <span className="text-muted">
              {profiles.length} profiles loaded
            </span>
            {!currentStatus.online && (
              <span className="text-muted" style={{ color: "#e9a45d" }}>
                Offline{currentStatus.error ? `: ${currentStatus.error}` : ""}
              </span>
            )}
            {selectedProfiles.size > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectedProfiles(new Set())}
                style={{ marginLeft: 8 }}
              >
                Clear Selection
              </button>
            )}
          </div>

          {filteredProfiles.length > 0 ? (
            <div
              style={{ maxHeight: 300, overflow: "auto", marginBottom: 12 }}
              onMouseLeave={() => {
                isMouseDown.current = false;
                isDragging.current = false;
              }}
            >
              <table style={{ userSelect: "none", minWidth: "100%" }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, backgroundColor: "#0d1526", zIndex: 2 }}>
                    <th style={{ width: 36, textAlign: "center" }}>#</th>
                    <th
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                      }}
                    >
                      Name
                    </th>
                    <th>
                      <span style={{ position: "relative", display: "inline-block" }}>
                        Group ▾
                        <select
                          value={groupFilter}
                          onChange={(e) => setGroupFilter(e.target.value)}
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            width: "100%",
                            height: "100%",
                            opacity: 0,
                            cursor: "pointer",
                          }}
                        >
                          <option value="all">All</option>
                          {groupNames.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((p, index) => (
                    <tr
                      key={p.id}
                      onMouseDown={(e) => handleRowMouseDown(e, index)}
                      onMouseMove={(e) => handleRowMouseMove(e, index)}
                      onMouseUp={(e) => handleRowMouseUp(e, index)}
                      style={{
                        backgroundColor: selectedProfiles.has(p.id)
                          ? "rgba(93, 233, 93, 0.1)"
                          : undefined,
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ textAlign: "center", color: "#8899b0", fontSize: 12 }}>
                        {index + 1}
                      </td>
                      <td
                        style={{
                          position: "sticky",
                          left: 0,
                          backgroundColor: selectedProfiles.has(p.id)
                            ? "rgba(93, 233, 93, 0.15)"
                            : undefined,
                          zIndex: 1,
                        }}
                      >
                        {p.name}
                      </td>
                      <td>{p.group_name || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted" style={{ marginBottom: 12 }}>
              {currentStatus.online
                ? "No profiles loaded."
                : `${managerTab} offline. Check API URL or start manager app.`}
            </p>
          )}

          <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Click to select. Ctrl+Click to toggle. Shift+Click or drag to select
            range.
          </p>
        </div>

        <div className="flex-row">
          <button
            className="btn btn-primary"
            onClick={handleRun}
            disabled={loading || !scriptId || selectedProfiles.size === 0}
          >
            {loading
              ? "Running..."
              : selectedProfiles.size > 1
                ? `Run Batch (${selectedProfiles.size})`
                : "Run"}
          </button>
          {loading && selectedRunId && (
            <button
              className="btn btn-danger"
              onClick={() => {
                const run = testRuns.find((r) => r.id === selectedRunId);
                if (run?.batch_id) {
                  handleStopBatch(run.batch_id);
                } else {
                  handleStop(selectedRunId);
                }
              }}
            >
              Stop All
            </button>
          )}
        </div>
      </div>

      {selectedRunId && (
        <div className="card">
          <h2>Log Output</h2>
          <pre className="log-box" ref={logContainerRef}>
            {log || "(loading...)"}
            <div ref={logEndRef} />
          </pre>
        </div>
      )}
    </div>
  );
}
