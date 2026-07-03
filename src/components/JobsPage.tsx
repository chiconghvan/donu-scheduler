import { useEffect, useState } from "react";
import type { Script, JobDefinition, JobInput, SelectedJobProfile } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";
import { FloatingInput, FloatingSelect } from "./FloatingField";
import ProfilePickerDialog from "./ProfilePickerDialog";

interface DefaultInput {
  name: string;
  comment: string;
  value: string;
  inputType: string;
  comboboxData: string;
}

const defaultSchedule = JSON.stringify(
  {
    type: "window_count",
    start_time: "07:00",
    end_time: "11:00",
    runs_per_profile: 8,
    active_days: [1, 2, 3, 4, 5, 6, 7],
    count_mode: "success",
  },
  null,
  2
);

const defaultRandom = JSON.stringify(
  { min_gap_minutes: 10, max_gap_minutes: 45 },
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

type ScheduleMode = "window_count" | "fixed_interval" | "daily_times";

interface ScheduleUiState {
  mode: ScheduleMode;
  startTime: string;
  endTime: string;
  runsPerProfile: number;
  intervalValue: number;
  intervalUnit: "minutes" | "hours";
  timesText: string;
  activeDays: number[];
  minGap: number;
  maxGap: number;
}

const defaultScheduleUi: ScheduleUiState = {
  mode: "window_count",
  startTime: "07:00",
  endTime: "11:00",
  runsPerProfile: 8,
  intervalValue: 2,
  intervalUnit: "hours",
  timesText: "08:00\n12:30\n20:00",
  activeDays: [1, 2, 3, 4, 5, 6, 7],
  minGap: 10,
  maxGap: 45,
};

const dayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function scheduleToJson(schedule: ScheduleUiState) {
  if (schedule.mode === "window_count") {
    return JSON.stringify(
      {
        type: "window_count",
        start_time: schedule.startTime,
        end_time: schedule.endTime,
        runs_per_profile: schedule.runsPerProfile,
        active_days: schedule.activeDays,
        count_mode: "success",
      },
      null,
      2
    );
  }
  if (schedule.mode === "fixed_interval") {
    return JSON.stringify(
      {
        type: "fixed_interval",
        interval_minutes:
          schedule.intervalUnit === "hours" ? schedule.intervalValue * 60 : schedule.intervalValue,
        active_days: schedule.activeDays,
        count_mode: "attempt",
      },
      null,
      2
    );
  }
  return JSON.stringify(
    {
      type: "daily_times",
      times: schedule.timesText
        .split(/[,\n]/)
        .map((time) => time.trim())
        .filter(Boolean),
      active_days: schedule.activeDays,
      count_mode: "attempt",
    },
    null,
    2
  );
}

function parseRandomJson(value: string) {
  try {
    const obj = JSON.parse(value);
    return { minGap: Number(obj.min_gap_minutes) || 10, maxGap: Number(obj.max_gap_minutes) || 45 };
  } catch {
    return { minGap: 10, maxGap: 45 };
  }
}

function randomToJson(schedule: ScheduleUiState) {
  return JSON.stringify(
    { min_gap_minutes: schedule.minGap, max_gap_minutes: schedule.maxGap },
    null,
    2
  );
}

function jsonToSchedule(value: string, randomJson?: string): ScheduleUiState {
  try {
    const parsed = JSON.parse(value);
    const rand = parseRandomJson(randomJson || "");
    if (parsed.type === "fixed_interval") {
      const minutes = Number(parsed.interval_minutes || 60);
      return {
        ...defaultScheduleUi,
        mode: "fixed_interval",
        intervalValue: minutes % 60 === 0 ? minutes / 60 : minutes,
        intervalUnit: minutes % 60 === 0 ? "hours" : "minutes",
        activeDays: parsed.active_days || defaultScheduleUi.activeDays,
      };
    }
    if (parsed.type === "daily_times") {
      return {
        ...defaultScheduleUi,
        mode: "daily_times",
        timesText: (parsed.times || []).join("\n"),
        activeDays: parsed.active_days || defaultScheduleUi.activeDays,
      };
    }
    return {
      ...defaultScheduleUi,
      mode: "window_count",
      startTime: parsed.start_time || defaultScheduleUi.startTime,
      endTime: parsed.end_time || defaultScheduleUi.endTime,
      runsPerProfile: Number(parsed.runs_per_profile || 1),
      activeDays: parsed.active_days || defaultScheduleUi.activeDays,
      minGap: rand.minGap,
      maxGap: rand.maxGap,
    };
  } catch {
    return defaultScheduleUi;
  }
}

function parseSelectedProfiles(value: string): SelectedJobProfile[] {
  try {
    return JSON.parse(value || "[]");
  } catch {
    return [];
  }
}

function getSchedulePreview(schedule: ScheduleUiState) {
  const days = schedule.activeDays.length === 7 ? "mỗi ngày" : `các ngày ${schedule.activeDays.map((d) => dayLabels[d - 1]).join(", ")}`;
  if (schedule.mode === "window_count") {
    return `Mỗi profile chạy đủ ${schedule.runsPerProfile} lần thành công từ ${schedule.startTime} đến ${schedule.endTime}, ${days}. Delay ngẫu nhiên ${schedule.minGap}-${schedule.maxGap} phút mỗi lần.`;
  }
  if (schedule.mode === "fixed_interval") {
    return `Mỗi profile chạy lại sau mỗi ${schedule.intervalValue} ${schedule.intervalUnit === "hours" ? "giờ" : "phút"} kể từ lúc lần trước kết thúc, bỏ qua ngày không active.`;
  }
  return `Mỗi profile chạy lúc ${schedule.timesText.split(/[,\n]/).map((t) => t.trim()).filter(Boolean).join(", ") || "(chưa nhập giờ)"}, ${days}.`;
}

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
  const [selectedProfiles, setSelectedProfiles] = useState<SelectedJobProfile[]>([]);
  const [profilePickerOpen, setProfilePickerOpen] = useState(false);
  const [scheduleUi, setScheduleUi] = useState<ScheduleUiState>(defaultScheduleUi);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [inspectorMode, setInspectorMode] = useState<"view" | "create" | "edit">("view");

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
      const input: JobInput = {
        ...form,
        profile_ids_json: JSON.stringify(selectedProfiles, null, 2),
        schedule_json: scheduleToJson(scheduleUi),
        random_json: randomToJson(scheduleUi),
      };
      if (editId) {
        await api.updateJob(editId, input);
      } else {
        await api.createJob(input);
      }
      // Save inputs to cache for next time
      if (form.script_id) {
        api
          .saveInputCache(form.script_id, form.cli_args, JSON.stringify(defaultInputs))
          .catch(() => {});
      }
      setForm(emptyInput);
      setSelectedProfiles([]);
      setScheduleUi(defaultScheduleUi);
      setDefaultInputs([]);
      setEditId(null);
      setInspectorMode("view");
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
    setSelectedJobId(j.id);
    setInspectorMode("edit");
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
    setSelectedProfiles(parseSelectedProfiles(j.profile_ids_json));
    setScheduleUi(jsonToSchedule(j.schedule_json, j.random_json));
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

  const selectedJob = jobs.find((job) => job.id === selectedJobId) || jobs[0] || null;
  const startCreate = () => {
    setSelectedJobId(null);
    setInspectorMode("create");
    setEditId(null);
    setForm(emptyInput);
    setSelectedProfiles([]);
    setScheduleUi(defaultScheduleUi);
    setDefaultInputs([]);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title-block">
          <h1>Jobs</h1>
          <div className="page-description">Create schedules, assign profiles, and monitor job definitions.</div>
        </div>
        <div className="page-actions">
          <button className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={startCreate}>+ New Job</button>
        </div>
      </div>
      <ProfilePickerDialog
        open={profilePickerOpen}
        selected={selectedProfiles}
        onDone={(profiles) => {
          setSelectedProfiles(profiles);
          setProfilePickerOpen(false);
        }}
        onCancel={() => setProfilePickerOpen(false)}
      />

      <div className="jobs-layout">
      <div className="panel inspector jobs-inspector">
        <h2>{inspectorMode === "view" ? "Inspector" : editId ? "Edit Job" : "New Job"}</h2>
        {inspectorMode === "view" && selectedJob ? (
          <>
            <div className="form-section">
              <h2>{selectedJob.name}</h2>
              <p className="text-muted">{selectedJob.description || "No description."}</p>
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>Status</span><span className={`status-badge ${selectedJob.enabled ? "status-success" : "status-pending"}`}>{selectedJob.enabled ? "Enabled" : "Disabled"}</span></div>
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>Script</span><span>{getScriptName(selectedJob.script_id)}</span></div>
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>Profiles</span><span>{parseSelectedProfiles(selectedJob.profile_ids_json).length}</span></div>
              <div className="flex-row" style={{ justifyContent: "space-between" }}><span>Timeout</span><span>{selectedJob.timeout_seconds}s</span></div>
            </div>
            <div className="form-section">
              <h3>Schedule</h3>
              <p className="text-muted">{getSchedulePreview(jsonToSchedule(selectedJob.schedule_json, selectedJob.random_json))}</p>
            </div>
            <div className="page-actions">
              <button className="btn btn-primary btn-sm" onClick={() => onOpenDetail(selectedJob.id)}>Detail</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(selectedJob)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(selectedJob.id)}>Delete</button>
            </div>
          </>
        ) : (
          <>
        <div className="form-row">
          <div className="form-group">
            <FloatingInput
              label="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Daily Post Job"
            />
          </div>
          <div className="form-group">
            <FloatingSelect
              label="Script"
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
            </FloatingSelect>
          </div>
        </div>
        <div className="form-group">
          <FloatingInput
            label="Description"
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
              <div key={input.name} className="script-input-row">
                {input.inputType === "ComboBox" ? (
                  <FloatingSelect
                    label={`${input.name} — ${input.comment}`}
                    value={input.value}
                    onChange={(e) => handleDefaultInputChange(idx, e.target.value)}
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
                  </FloatingSelect>
                ) : input.inputType === "File" ? (
                  <div className="flex-row">
                    <FloatingInput
                      label={`${input.name} — ${input.comment}`}
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
                  <FloatingInput
                    label={`${input.name} — ${input.comment}`}
                    value={input.value}
                    onChange={(e) => handleDefaultInputChange(idx, e.target.value)}
                    placeholder="enter value"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="form-section">
          <h3>Profiles</h3>
          <div className="flex-row">
            <button className="btn btn-secondary" onClick={() => setProfilePickerOpen(true)}>
              Choose Profiles
            </button>
            <span className="text-muted">{selectedProfiles.length} selected</span>
          </div>
          {selectedProfiles.length > 0 && (
            <p className="text-muted" style={{ marginTop: 8 }}>
              {selectedProfiles.slice(0, 5).map((p) => p.name).join(", ")}
              {selectedProfiles.length > 5 ? ` and ${selectedProfiles.length - 5} more` : ""}
            </p>
          )}
        </div>

        <div className="form-section">
          <h3>Schedule</h3>
          <div className="schedule-mode-grid">
            <button
              type="button"
              className={scheduleUi.mode === "window_count" ? "schedule-mode active" : "schedule-mode"}
              onClick={() => setScheduleUi({ ...scheduleUi, mode: "window_count" })}
            >
              <strong>Chạy đủ số lần</strong>
              <span>Trong khung giờ</span>
            </button>
            <button
              type="button"
              className={scheduleUi.mode === "fixed_interval" ? "schedule-mode active" : "schedule-mode"}
              onClick={() => setScheduleUi({ ...scheduleUi, mode: "fixed_interval" })}
            >
              <strong>Lặp lại</strong>
              <span>Sau mỗi khoảng thời gian</span>
            </button>
            <button
              type="button"
              className={scheduleUi.mode === "daily_times" ? "schedule-mode active" : "schedule-mode"}
              onClick={() => setScheduleUi({ ...scheduleUi, mode: "daily_times" })}
            >
              <strong>Giờ cố định</strong>
              <span>Chạy đúng mốc HH:mm</span>
            </button>
          </div>

          {scheduleUi.mode === "window_count" && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <FloatingInput label="Từ giờ" type="time" value={scheduleUi.startTime} onChange={(e) => setScheduleUi({ ...scheduleUi, startTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <FloatingInput label="Đến giờ" type="time" value={scheduleUi.endTime} onChange={(e) => setScheduleUi({ ...scheduleUi, endTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <FloatingInput label="Số lần chạy thành công" type="number" min={1} value={scheduleUi.runsPerProfile} onChange={(e) => setScheduleUi({ ...scheduleUi, runsPerProfile: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <FloatingInput label="Khoảng delay tối thiểu (phút)" type="number" min={1} value={scheduleUi.minGap} onChange={(e) => setScheduleUi({ ...scheduleUi, minGap: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="form-group">
                  <FloatingInput label="Khoảng delay tối đa (phút)" type="number" min={1} value={scheduleUi.maxGap} onChange={(e) => setScheduleUi({ ...scheduleUi, maxGap: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
            </>
          )}

          {scheduleUi.mode === "fixed_interval" && (
            <div className="form-row">
              <div className="form-group">
                <FloatingInput label="Lặp lại mỗi" type="number" min={1} value={scheduleUi.intervalValue} onChange={(e) => setScheduleUi({ ...scheduleUi, intervalValue: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="form-group">
                <FloatingSelect label="Đơn vị" value={scheduleUi.intervalUnit} onChange={(e) => setScheduleUi({ ...scheduleUi, intervalUnit: e.target.value as "minutes" | "hours" })}>
                  <option value="minutes">phút</option>
                  <option value="hours">giờ</option>
                </FloatingSelect>
              </div>
            </div>
          )}

          {scheduleUi.mode === "daily_times" && (
            <div className="form-group">
              <label>Mốc giờ chạy (mỗi dòng một giờ HH:mm)</label>
              <textarea rows={5} value={scheduleUi.timesText} onChange={(e) => setScheduleUi({ ...scheduleUi, timesText: e.target.value })} />
            </div>
          )}

          <div className="form-group">
            <label>Ngày chạy</label>
            <div className="day-picker">
              {dayLabels.map((label, index) => {
                const day = index + 1;
                const active = scheduleUi.activeDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={active ? "active" : ""}
                    onClick={() =>
                      setScheduleUi({
                        ...scheduleUi,
                        activeDays: active
                          ? scheduleUi.activeDays.filter((d) => d !== day)
                          : [...scheduleUi.activeDays, day].sort(),
                      })
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-muted">{getSchedulePreview(scheduleUi)}</p>
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
            <FloatingInput
              label="Timeout (seconds)"
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
        <div className="form-group">
          <button className="btn btn-secondary btn-sm" onClick={() => setShowJsonPreview(!showJsonPreview)}>
            {showJsonPreview ? "Hide" : "Show"} JSON Preview
          </button>
          {showJsonPreview && (
            <div className="form-row" style={{ marginTop: 8 }}>
              <textarea rows={8} readOnly value={JSON.stringify(selectedProfiles, null, 2)} />
              <textarea rows={8} readOnly value={scheduleToJson(scheduleUi)} />
            </div>
          )}
        </div>
        <div className="flex-row">
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={loading || !form.name || !form.script_id || selectedProfiles.length === 0}
          >
            {editId ? "Update" : "Create"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setEditId(null);
              setForm(emptyInput);
              setSelectedProfiles([]);
              setScheduleUi(defaultScheduleUi);
              setDefaultInputs([]);
            }}
          >
            Clear
          </button>
          {editId && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                setEditId(null);
                setForm(emptyInput);
                setSelectedProfiles([]);
                setScheduleUi(defaultScheduleUi);
                setDefaultInputs([]);
              }}
            >
              Cancel
            </button>
          )}
        </div>
          </>
        )}
      </div>

      <div className="panel table-panel jobs-list">
        <div className="panel-header"><h2>Job List ({jobs.length})</h2></div>
        {jobs.length === 0 ? (
          <div className="empty-state"><div className="empty-state-inner"><div className="empty-icon">J</div><p className="text-muted">No jobs yet.</p></div></div>
        ) : (
          <div className="table-wrap"><table>
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
                <tr key={j.id} className={(selectedJob?.id === j.id && inspectorMode === "view") ? "selected-row" : ""} onClick={() => { setSelectedJobId(j.id); setInspectorMode("view"); }} style={{ cursor: "pointer" }}>
                  <td>{j.name}</td>
                  <td>{getScriptName(j.script_id)}</td>
                  <td>
                    <label className="toggle" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={!!j.enabled}
                        onChange={(e) => { e.stopPropagation(); handleToggle(j); }}
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
                        onClick={(e) => { e.stopPropagation(); onOpenDetail(j.id); }}
                      >
                        Detail
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={(e) => { e.stopPropagation(); handleEdit(j); }}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={(e) => { e.stopPropagation(); handleDelete(j.id); }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      </div>
    </div>
  );
}
