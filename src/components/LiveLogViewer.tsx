import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef, useState } from "react";
import * as api from "../api";
import type { LogEntry } from "../types";

const MAX_LOG_LINES = 2000;
const POLL_MS = 500;

interface LiveLogViewerProps {
  kind: "test" | "job";
  runId: string;
  running?: boolean;
  className?: string;
}

export default function LiveLogViewer({
  kind,
  runId,
  running = false,
  className = "log-box",
}: LiveLogViewerProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastSeqRef = useRef(0);
  const shouldAutoScrollRef = useRef(true);

  const appendEntries = (nextEntries: LogEntry[]) => {
    if (nextEntries.length === 0) return;
    setEntries((prev) => {
      const bySeq = new Map<number, LogEntry>();
      for (const entry of prev) bySeq.set(entry.seq, entry);
      for (const entry of nextEntries) bySeq.set(entry.seq, entry);
      const merged = Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq);
      const tail = merged.slice(-MAX_LOG_LINES);
      const last = tail[tail.length - 1];
      if (last) lastSeqRef.current = Math.max(lastSeqRef.current, last.seq);
      return tail;
    });
  };

  useEffect(() => {
    lastSeqRef.current = 0;
    setEntries([]);
    setError("");

    let cancelled = false;
    api
      .getRunLogTail(kind, runId, null, MAX_LOG_LINES)
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

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      api
        .getRunLogTail(kind, runId, lastSeqRef.current, MAX_LOG_LINES)
        .then(appendEntries)
        .catch(() => {});
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [kind, runId, running]);

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

  const text = entries
    .map((entry) => {
      const source = entry.source === "stdout" ? "" : `[${entry.source}] `;
      return `${source}${entry.line}`;
    })
    .join("\n");

  return (
    <div className={className} ref={containerRef} onScroll={handleScroll}>
      {text || (error ? `(log not available: ${error})` : "(loading...)")}
      <div ref={endRef} />
    </div>
  );
}
