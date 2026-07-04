import type { ScheduleUiState, ScheduleMode } from "../../utils/schedule";
import { dayLabels } from "../../utils/schedule";

const modeLabels: { key: ScheduleMode; label: string }[] = [
  { key: "window_count", label: "Window Count" },
  { key: "fixed_interval", label: "Fixed Interval" },
  { key: "daily_times", label: "Daily Times" },
];

interface ScheduleFormProps {
  value: ScheduleUiState;
  onChange: (value: ScheduleUiState) => void;
}

export default function ScheduleForm({ value, onChange }: ScheduleFormProps) {
  const set = <K extends keyof ScheduleUiState>(
    key: K,
    val: ScheduleUiState[K],
  ) => onChange({ ...value, [key]: val });

  const toggleDay = (day: number) => {
    const next = value.activeDays.includes(day)
      ? value.activeDays.filter((d) => d !== day)
      : [...value.activeDays, day].sort((a, b) => a - b);
    set("activeDays", next);
  };

  return (
    <div>
      {/* Mode tabs */}
      <div className="tabs">
        {modeLabels.map((m) => (
          <button
            key={m.key}
            className={`tab${value.mode === m.key ? " tab--active" : ""}`}
            onClick={() => set("mode", m.key)}
            type="button"
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Mode-specific fields */}
      {value.mode === "window_count" && (
        <div className="form-grid">
          <div className="field">
            <label className="field__label">Start Time</label>
            <input
              className="input"
              type="time"
              value={value.startTime}
              onChange={(e) => set("startTime", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">End Time</label>
            <input
              className="input"
              type="time"
              value={value.endTime}
              onChange={(e) => set("endTime", e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Runs / Profile</label>
            <input
              className="input"
              type="number"
              min={1}
              value={value.runsPerProfile}
              onChange={(e) => set("runsPerProfile", Number(e.target.value) || 1)}
            />
          </div>
          <div className="field">
            <label className="field__label">Min Gap (min)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={value.minGap}
              onChange={(e) => set("minGap", Number(e.target.value) || 0)}
            />
          </div>
          <div className="field">
            <label className="field__label">Max Gap (min)</label>
            <input
              className="input"
              type="number"
              min={0}
              value={value.maxGap}
              onChange={(e) => set("maxGap", Number(e.target.value) || 0)}
            />
          </div>
        </div>
      )}

      {value.mode === "fixed_interval" && (
        <div className="form-row">
          <div className="field">
            <label className="field__label">Interval</label>
            <input
              className="input"
              type="number"
              min={1}
              value={value.intervalValue}
              onChange={(e) => set("intervalValue", Number(e.target.value) || 1)}
            />
          </div>
          <div className="field">
            <label className="field__label">Unit</label>
            <select
              className="select"
              value={value.intervalUnit}
              onChange={(e) =>
                set("intervalUnit", e.target.value as "minutes" | "hours")
              }
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
            </select>
          </div>
        </div>
      )}

      {value.mode === "daily_times" && (
        <div className="field">
          <label className="field__label">Times (one per line)</label>
          <textarea
            className="textarea"
            rows={5}
            value={value.timesText}
            onChange={(e) => set("timesText", e.target.value)}
            placeholder={"08:00\n12:30\n20:00"}
          />
        </div>
      )}

      {/* Active days picker */}
      <div className="day-picker">
        {dayLabels.map((label, i) => {
          const day = i + 1;
          const active = value.activeDays.includes(day);
          return (
            <button
              key={day}
              type="button"
              className={`day-picker__btn${active ? " day-picker__btn--active" : ""}`}
              onClick={() => toggleDay(day)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
