import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import * as api from "../../api";
import type { LogEntry } from "../../types";

const MAX_LOG_LINES = 2000;
const POLL_MS = 500;

interface LogViewerProps {
  kind: "test" | "job";
  runId: string;
  running?: boolean;
  className?: string;
}

export default function LogViewer({
  kind,
  runId,
  running = false,
  className,
}: LogViewerProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastSeqRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);

  const appendEntries = (next: LogEntry[]) => {
    if (next.length === 0) return;
    setEntries((prev) => {
      const bySeq = new Map<number, LogEntry>();
      for (const e of prev) bySeq.set(e.seq, e);
      for (const e of next) bySeq.set(e.seq, e);
      const merged = Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
      const tail = merged.slice(-MAX_LOG_LINES);
      const last = tail[tail.length - 1];
      if (last) lastSeqRef.current = Math.max(lastSeqRef.current, last.seq);
      return tail;
    });
  };

  // Initial load
  useEffect(() => {
    lastSeqRef.current = 0;
    setEntries([]);
    setError("");

    let cancelled = false;
    api
      .getRunLogTail(kind, runId, null, 500)
      .then((tail) => {
        if (!cancelled) appendEntries(tail);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(String(e));
      });

    return () => {
      cancelled = true;
    };
  }, [kind, runId]);

  // Real-time event listener
  useEffect(() => {
    const unlisten = listen<LogEntry>("log-stream", (event) => {
      const entry = event.payload;
      if (entry.run_id !== runId || entry.seq <= lastSeqRef.current) return;
      appendEntries([entry]);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [runId]);

  // Polling when running
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      api
        .getRunLogTail(kind, runId, lastSeqRef.current, 500)
        .then(appendEntries)
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [kind, runId, running]);

  // Auto-scroll
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [entries]);

  const handleScroll = () => {
    const container = containerRef.current;
    if (!container) return;
    shouldAutoScrollRef.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < 80;
  };

  return (
    <div
      className={["log-viewer", className].filter(Boolean).join(" ")}
      ref={containerRef}
      onScroll={handleScroll}
    >
      {entries.length === 0 && (
        <div className="log-viewer__line log-viewer__line--raw">
          {error ? `(log not available: ${error})` : "(loading...)"}
        </div>
      )}
      {entries.map((entry) => (
        <div
          key={entry.seq}
          className={`log-viewer__line log-viewer__line--${entry.source}`}
        >
          {entry.line}
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
