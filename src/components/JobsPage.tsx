import { useEffect, useState } from "react";
import type { Script, JobDefinition, JobInput, SelectedJobProfile } from "../types";
import * as api from "../api";
import { useDialog } from "./DialogHost";
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

  return (
    <div>
      <h1>Jobs</h1>
      <ProfilePickerDialog
        open={profilePickerOpen}
        selected={selectedProfiles}
        onDone={(profiles) => {
          setSelectedProfiles(profiles);
          setProfilePickerOpen(false);
        }}
        onCancel={() => setProfilePickerOpen(false)}
      />

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

        <div className="card" style={{ background: "#0f1a30" }}>
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

        <div className="card" style={{ background: "#0f1a30" }}>
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
                  <label>Từ giờ</label>
                  <input type="time" value={scheduleUi.startTime} onChange={(e) => setScheduleUi({ ...scheduleUi, startTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Đến giờ</label>
                  <input type="time" value={scheduleUi.endTime} onChange={(e) => setScheduleUi({ ...scheduleUi, endTime: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Số lần chạy thành công</label>
                  <input type="number" min={1} value={scheduleUi.runsPerProfile} onChange={(e) => setScheduleUi({ ...scheduleUi, runsPerProfile: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Khoảng delay tối thiểu (phút)</label>
                  <input type="number" min={1} value={scheduleUi.minGap} onChange={(e) => setScheduleUi({ ...scheduleUi, minGap: parseInt(e.target.value) || 1 })} />
                </div>
                <div className="form-group">
                  <label>Khoảng delay tối đa (phút)</label>
                  <input type="number" min={1} value={scheduleUi.maxGap} onChange={(e) => setScheduleUi({ ...scheduleUi, maxGap: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
            </>
          )}

          {scheduleUi.mode === "fixed_interval" && (
            <div className="form-row">
              <div className="form-group">
                <label>Lặp lại mỗi</label>
                <input type="number" min={1} value={scheduleUi.intervalValue} onChange={(e) => setScheduleUi({ ...scheduleUi, intervalValue: parseInt(e.target.value) || 1 })} />
              </div>
              <div className="form-group">
                <label>Đơn vị</label>
                <select value={scheduleUi.intervalUnit} onChange={(e) => setScheduleUi({ ...scheduleUi, intervalUnit: e.target.value as "minutes" | "hours" })}>
                  <option value="minutes">phút</option>
                  <option value="hours">giờ</option>
                </select>
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
