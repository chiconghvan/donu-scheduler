import { useState } from "react";
import ScriptsPage from "./components/ScriptsPage";
import JobsPage from "./components/JobsPage";
import JobDetailPage from "./components/JobDetailPage";
import TestRunPage from "./components/TestRunPage";
import RunningPage from "./components/RunningPage";
import RunHistoryPage from "./components/RunHistoryPage";
import SettingsPage from "./components/SettingsPage";
import { DialogProvider } from "./components/DialogHost";
import RuntimeToastHost from "./components/RuntimeToastHost";

type Page =
  | { kind: "scripts" }
  | { kind: "jobs" }
  | { kind: "job_detail"; jobId: string }
  | { kind: "test_run" }
  | { kind: "running" }
  | { kind: "run_history" }
  | { kind: "settings" };

export default function App() {
  const [page, setPage] = useState<Page>({ kind: "scripts" });

  const nav = (
    <nav className="top-nav">
      <button
        className={page.kind === "scripts" ? "active" : ""}
        onClick={() => setPage({ kind: "scripts" })}
      >
        Scripts
      </button>
      <button
        className={page.kind === "jobs" ? "active" : ""}
        onClick={() => setPage({ kind: "jobs" })}
      >
        Jobs
      </button>
      <button
        className={page.kind === "test_run" ? "active" : ""}
        onClick={() => setPage({ kind: "test_run" })}
      >
        Manual Run
      </button>
      <button
        className={page.kind === "running" ? "active" : ""}
        onClick={() => setPage({ kind: "running" })}
      >
        Running
      </button>
      <button
        className={page.kind === "run_history" ? "active" : ""}
        onClick={() => setPage({ kind: "run_history" })}
      >
        Run History
      </button>
      <button
        className={page.kind === "settings" ? "active" : ""}
        onClick={() => setPage({ kind: "settings" })}
      >
        Settings
      </button>
    </nav>
  );

  return (
    <DialogProvider>
      <div className="app">
        {nav}
        <main className="content">
          {page.kind === "scripts" && <ScriptsPage />}
          {page.kind === "jobs" && (
            <JobsPage onOpenDetail={(id) => setPage({ kind: "job_detail", jobId: id })} />
          )}
          {page.kind === "job_detail" && (
            <JobDetailPage
              jobId={page.jobId}
              onBack={() => setPage({ kind: "jobs" })}
            />
          )}
          {page.kind === "test_run" && <TestRunPage />}
          {page.kind === "running" && <RunningPage />}
          {page.kind === "run_history" && <RunHistoryPage />}
          {page.kind === "settings" && <SettingsPage />}
        </main>
      </div>
      <RuntimeToastHost />
    </DialogProvider>
  );
}
