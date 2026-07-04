import type { SelectedJobProfile, JobDefinition } from "../types";

export type ScheduleMode = "window_count" | "fixed_interval" | "daily_times";

export interface ScheduleUiState {
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

export const defaultScheduleUi: ScheduleUiState = {
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

export const dayLabels = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function scheduleToJson(schedule: ScheduleUiState): string {
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
          schedule.intervalUnit === "hours"
            ? schedule.intervalValue * 60
            : schedule.intervalValue,
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
        .map((t) => t.trim())
        .filter(Boolean),
      active_days: schedule.activeDays,
      count_mode: "attempt",
    },
    null,
    2
  );
}

export function parseRandomJson(value: string) {
  try {
    const obj = JSON.parse(value);
    return {
      minGap: Number(obj.min_gap_minutes) || 10,
      maxGap: Number(obj.max_gap_minutes) || 45,
    };
  } catch {
    return { minGap: 10, maxGap: 45 };
  }
}

export function randomToJson(schedule: ScheduleUiState): string {
  return JSON.stringify(
    { min_gap_minutes: schedule.minGap, max_gap_minutes: schedule.maxGap },
    null,
    2
  );
}

export function jsonToSchedule(
  value: string,
  randomJson?: string
): ScheduleUiState {
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

export function parseSelectedProfiles(value: string): SelectedJobProfile[] {
  try {
    const parsed = JSON.parse(value || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => ({
      id: String(p.id),
      manager: p.manager,
      name: String(p.name || p.id),
      group_name: p.group_name || null,
      browser_type: p.browser_type || null,
    }));
  } catch {
    return [];
  }
}

export function getSchedulePreview(schedule: ScheduleUiState): string {
  const days =
    schedule.activeDays.length === 7
      ? "every day"
      : `on ${schedule.activeDays.map((d) => dayLabels[d - 1]).join(", ")}`;
  if (schedule.mode === "window_count") {
    return `${schedule.runsPerProfile} runs/profile from ${schedule.startTime} to ${schedule.endTime}, ${days}. Random delay ${schedule.minGap}-${schedule.maxGap}min.`;
  }
  if (schedule.mode === "fixed_interval") {
    return `Run every ${schedule.intervalValue} ${schedule.intervalUnit === "hours" ? "hour(s)" : "min"}, ${days}.`;
  }
  const times = schedule.timesText
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
  return `Run at ${times.join(", ") || "(no times set)"}, ${days}.`;
}

export function getScheduleLabel(job: JobDefinition): string {
  try {
    const schedule = JSON.parse(job.schedule_json || "{}");
    if (schedule.type === "window_count") {
      return `${schedule.start_time || "--:--"}-${schedule.end_time || "--:--"}`;
    }
    if (schedule.type === "fixed_interval") {
      return `Every ${schedule.interval_minutes || "?"}m`;
    }
    if (schedule.type === "daily_times") {
      return Array.isArray(schedule.times)
        ? schedule.times.slice(0, 3).join(", ")
        : "Daily times";
    }
  } catch {
    return "Invalid";
  }
  return "Schedule";
}

export function getUpcomingTime(job: JobDefinition): string {
  try {
    const schedule = JSON.parse(job.schedule_json || "{}");
    if (schedule.type === "window_count" && schedule.start_time)
      return schedule.start_time;
    if (
      schedule.type === "daily_times" &&
      Array.isArray(schedule.times) &&
      schedule.times.length > 0
    ) {
      const now = new Date();
      const current = now.getHours() * 60 + now.getMinutes();
      const future = schedule.times
        .map((time: string) => {
          const [h, m] = String(time).split(":").map(Number);
          return { time, minutes: h * 60 + m };
        })
        .filter((item: { minutes: number }) => Number.isFinite(item.minutes))
        .sort(
          (a: { minutes: number }, b: { minutes: number }) =>
            a.minutes - b.minutes
        )
        .find((item: { minutes: number }) => item.minutes >= current);
      return future?.time || schedule.times[0];
    }
  } catch {
    return "--:--";
  }
  return "--:--";
}

export function parseProfilesCount(value: string): number {
  try {
    const profiles = JSON.parse(value || "[]");
    return Array.isArray(profiles) ? profiles.length : 0;
  } catch {
    return 0;
  }
}
