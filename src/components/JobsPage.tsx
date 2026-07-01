import { useEffect, useState } from "react";
import type { Script, JobDefinition, JobInput } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";

interface DefaultInput {
  name: string;
  comment: string;
  value: string;
  inputType: string;
  comboboxData: string;
}

const defaultSchedule = JSON.stringify(
  {
    type: "adaptive_daily_window",
    start_time: "07:00",
    end_time: "11:00",
    posts_per_profile: 8,
    active_days: [1, 2, 3, 4, 5, 6, 7],
    count_mode: "attempt",
  },
  null,
  2
);

const defaultRandom = JSON.stringify(
  { min_gap_minutes: 5, max_delay_factor: 1.5 },
  null,
  2
);

const emptyInput: JobInput = {
  name: "",
  description: "",
  enabled: 1,
  script_id: "",
  profile_ids_json: "[]",
  schedule_json: defaultSchedule,
  random_json: defaultRandom,
  cli_args: "",
  timeout_seconds: 300,
};

export default function JobsPage({
  onOpenDetail,
}: {
  onOpenDetail: (id: string) => void;
}) {
  const dialog = useDialog();
  const [jobs, setJobs] = useState<JobDefinition[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [form, setForm] = useState<JobInput>(emptyInput);
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [defaultInputs, setDefaultInputs] = useState<DefaultInput[]>([]);

  const load = async () => {
    try {
      const [j, s] = await Promise.all([api.listJobs(), api.listScripts()]);
      setJobs(j);
      setScripts(s);
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const loadCached = async () => {
      const selected = scripts.find((s) => s.id === form.script_id);
      if (selected) {
        try {
          const cache = await api.getInputCache(form.script_id);
          if (cache.default_inputs_json && cache.default_inputs_json !== "[]") {
            setDefaultInputs(JSON.parse(cache.default_inputs_json));
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
      } else {
        setDefaultInputs([]);
      }
    };
    if (form.script_id) loadCached();
  }, [form.script_id, scripts]);

  const handleDefaultInputChange = (index: number, value: string) => {
    setDefaultInputs((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], value };
      return updated;
    });
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      if (editId) {
        await api.updateJob(editId, form);
      } else {
        await api.createJob(form);
      }
      // Save inputs to cache for next time
      if (form.script_id) {
        api
          .saveInputCache(form.script_id, form.cli_args, JSON.stringify(defaultInputs))
          .catch(() => {});
      }
      setForm(emptyInput);
      setDefaultInputs([]);
      setEditId(null);
      await load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const ok = await dialog.showDialog({
      kind: "confirm",
      title: "Delete job",
      message: "Delete this job?",
      confirmText: "Delete",
      cancelText: "Cancel",
    });
    if (!ok) return;
    try {
      await api.deleteJob(id);
      await load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  const handleEdit = (j: JobDefinition) => {
    setEditId(j.id);
    setForm({
      name: j.name,
      description: j.description,
      enabled: j.enabled,
      script_id: j.script_id,
      profile_ids_json: j.profile_ids_json,
      schedule_json: j.schedule_json,
      random_json: j.random_json,
      cli_args: j.cli_args,
      timeout_seconds: j.timeout_seconds,
    });
    const selected = scripts.find((s) => s.id === j.script_id);
    if (selected) {
      try {
        setDefaultInputs(JSON.parse(selected.default_inputs_json || "[]"));
      } catch {
        setDefaultInputs([]);
      }
    }
  };

  const handleToggle = async (j: JobDefinition) => {
    try {
      await api.setJobEnabled(j.id, !j.enabled);
      await load();
    } catch (e: unknown) {
      await dialog.showError(String(e));
    }
  };

  const getScriptName = (id: string) => {
    const s = scripts.find((s) => s.id === id);
    return s ? s.name : id.slice(0, 8);
  };

  return (
    <div>
      <h1>Jobs</h1>

      <div className="card">
        <h2>{editId ? "Edit Job" : "Add Job"}</h2>
        <div className="form-row">
          <div className="form-group">
            <label>Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Daily Post Job"
            />
          </div>
          <div className="form-group">
            <label>Script</label>
            <select
              value={form.script_id}
              onChange={(e) =>
                setForm({ ...form, script_id: e.target.value })
              }
            >
              <option value="">-- select script --</option>
              {scripts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>Description</label>
          <input
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
          />
        </div>

        {defaultInputs.length > 0 && (
          <div className="form-group">
            <label>Script Inputs (from selected script)</label>
            {defaultInputs.map((input, idx) => (
              <div key={input.name} className="flex-row" style={{ marginBottom: 6 }}>
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
                    onChange={(e) => handleDefaultInputChange(idx, e.target.value)}
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
                      onChange={(e) => handleDefaultInputChange(idx, e.target.value)}
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
                    onChange={(e) => handleDefaultInputChange(idx, e.target.value)}
                    placeholder="enter value"
                    style={{ flex: 1 }}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="form-group">
          <label>Profile IDs JSON (array of strings)</label>
          <textarea
            rows={2}
            value={form.profile_ids_json}
            onChange={(e) =>
              setForm({ ...form, profile_ids_json: e.target.value })
            }
          />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Schedule JSON</label>
            <textarea
              rows={8}
              value={form.schedule_json}
              onChange={(e) =>
                setForm({ ...form, schedule_json: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label>Random JSON</label>
            <textarea
              rows={8}
              value={form.random_json}
              onChange={(e) =>
                setForm({ ...form, random_json: e.target.value })
              }
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>CLI Args (plain text)</label>
            <textarea
              rows={3}
              value={form.cli_args}
              onChange={(e) =>
                setForm({ ...form, cli_args: e.target.value })
              }
            />
          </div>
          <div className="form-group">
            <label>Timeout (seconds)</label>
            <input
              type="number"
              value={form.timeout_seconds}
              onChange={(e) =>
                setForm({
                  ...form,
                  timeout_seconds: parseInt(e.target.value) || 300,
                })
              }
            />
          </div>
        </div>
        <div className="flex-row">
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !form.name || !form.script_id}
          >
            {editId ? "Update" : "Create"}
          </button>
          {editId && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setEditId(null);
                setForm(emptyInput);
                setDefaultInputs([]);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Job List ({jobs.length})</h2>
        {jobs.length === 0 ? (
          <p className="text-muted">No jobs yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Script</th>
                <th>Enabled</th>
                <th>Timeout</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td>{j.name}</td>
                  <td>{getScriptName(j.script_id)}</td>
                  <td>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={!!j.enabled}
                        onChange={() => handleToggle(j)}
                      />
                      <span className="slider"></span>
                    </label>
                  </td>
                  <td>{j.timeout_seconds}s</td>
                  <td>{new Date(j.created_at).toLocaleDateString()}</td>
                  <td>
                    <div className="flex-row">
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => onOpenDetail(j.id)}
                      >
                        Detail
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleEdit(j)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDelete(j.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
