import type { RunHistoryItem } from "../types";

export interface HistoryTask {
  id: string;
  kind: string;
  title: string;
  script_id: string | null;
  script_name: string | null;
  job_id: string | null;
  job_name: string | null;
  started_at: string | null;
  finished_at: string | null;
  children: RunHistoryItem[];
}

export function groupHistory(runs: RunHistoryItem[]): HistoryTask[] {
  const taskMap = new Map<string, HistoryTask>();
  const singles: HistoryTask[] = [];

  for (const r of runs) {
    if (r.kind === "job" && r.job_id) {
      const key = `job-${r.job_id}`;
      const existing = taskMap.get(key);
      if (existing) {
        existing.children.push(r);
        if (!existing.started_at || r.started_at < existing.started_at)
          existing.started_at = r.started_at;
        if (
          !existing.finished_at ||
          (r.finished_at && r.finished_at > existing.finished_at!)
        )
          existing.finished_at = r.finished_at;
      } else {
        taskMap.set(key, {
          id: r.job_id,
          kind: "job",
          title: r.job_name || r.job_id,
          script_id: r.script_id,
          script_name: r.script_name,
          job_id: r.job_id,
          job_name: r.job_name,
          started_at: r.started_at,
          finished_at: r.finished_at,
          children: [r],
        });
      }
    } else if (r.kind === "test" && r.batch_id) {
      const key = `batch-${r.batch_id}`;
      const existing = taskMap.get(key);
      if (existing) {
        existing.children.push(r);
        if (!existing.started_at || r.started_at < existing.started_at)
          existing.started_at = r.started_at;
        if (
          !existing.finished_at ||
          (r.finished_at && r.finished_at > existing.finished_at!)
        )
          existing.finished_at = r.finished_at;
      } else {
        taskMap.set(key, {
          id: r.batch_id,
          kind: "test_batch",
          title: `Batch (${r.script_name || r.script_id.slice(0, 8)})`,
          script_id: r.script_id,
          script_name: r.script_name,
          job_id: null,
          job_name: null,
          started_at: r.started_at,
          finished_at: r.finished_at,
          children: [r],
        });
      }
    } else {
      singles.push({
        id: r.id,
        kind: "test_single",
        title: "Single",
        script_id: r.script_id,
        script_name: r.script_name,
        job_id: null,
        job_name: null,
        started_at: r.started_at,
        finished_at: r.finished_at,
        children: [r],
      });
    }
  }

  return [...singles, ...taskMap.values()].sort((a, b) => {
    const aStart = a.started_at || "";
    const bStart = b.started_at || "";
    return bStart.localeCompare(aStart);
  });
}
