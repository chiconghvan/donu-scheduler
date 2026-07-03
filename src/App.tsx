import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import DashboardPage from "./components/DashboardPage";
import LegacyScriptsPage from "./components/ScriptsPage";
import ScriptStorePage from "./components/ScriptStorePage";
import JobsPage from "./components/JobsPage";
import JobDetailPage from "./components/JobDetailPage";
import TestRunPage from "./components/TestRunPage";
import RunningPage from "./components/RunningPage";
import RunHistoryPage from "./components/RunHistoryPage";
import SettingsPage from "./components/SettingsPage";
import { DialogProvider } from "./components/DialogHost";
import RuntimeToastHost from "./components/RuntimeToastHost";

type Theme = "dark" | "light";

type Page =
  | { kind: "dashboard" }
  | { kind: "scripts" }
  | { kind: "script_store" }
  | { kind: "jobs" }
  | { kind: "job_detail"; jobId: string }
  | { kind: "test_run" }
  | { kind: "running" }
  | { kind: "run_history" }
  | { kind: "settings" };

type IconProps = { className?: string };
const HOLD_MS = 150;
const DRAG_THRESHOLD_PX = 3;

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return <svg className={className || "rail-icon"} viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
}

const icons = {
  dashboard: (props: IconProps) => <Svg {...props}><path d="M4 4h7v7H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 13h7v7H4z" /></Svg>,
  store: (props: IconProps) => <Svg {...props}><path d="M4 7.5 12 3l8 4.5-8 4.5z" /><path d="M4 7.5v9L12 21l8-4.5v-9" /><path d="M12 12v9" /><path d="M9 15h6" /></Svg>,
  jobs: (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></Svg>,
  run: (props: IconProps) => <Svg {...props}><path d="M7 5v14l11-7z" /></Svg>,
  running: (props: IconProps) => <Svg {...props}><path d="M4 13h4l2-6 4 12 2-6h4" /></Svg>,
  history: (props: IconProps) => <Svg {...props}><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 5v5h5" /><path d="M12 8v5l3 2" /></Svg>,
  scripts: (props: IconProps) => <Svg {...props}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="m10 13-2 2 2 2" /><path d="m14 13 2 2-2 2" /></Svg>,
  settings: (props: IconProps) => <Svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3a7 7 0 0 0-1.7 1l-2.4-1-2 3.5L5.1 11a7 7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.3 3h5l.3-3a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5a7 7 0 0 0 .1-1z" /></Svg>,
  minimize: (props: IconProps) => <Svg {...props}><path d="M6 12h12" /></Svg>,
  maximize: (props: IconProps) => <Svg {...props}><path d="M7 7h10v10H7z" /></Svg>,
  close: (props: IconProps) => <Svg {...props}><path d="M7 7l10 10M17 7 7 17" /></Svg>,
};

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("ui_theme");
  return stored === "light" ? "light" : "dark";
}

export default function App() {
  const isDev = import.meta.env.DEV;
  const [page, setPage] = useState<Page>({ kind: "dashboard" });
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const holdTimeoutRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("ui_theme", theme);
  }, [theme]);

  const pageTitle =
    page.kind === "dashboard" ? "Dashboard" :
    page.kind === "scripts" ? "Scripts" :
    page.kind === "script_store" ? "Script Store" :
    page.kind === "jobs" ? "Jobs" :
    page.kind === "job_detail" ? "Job Detail" :
    page.kind === "test_run" ? "Manual Run" :
    page.kind === "running" ? "Running" :
    page.kind === "run_history" ? "Run History" : "Settings";

  const railItem = (kind: Page["kind"], label: string, Icon: (props: IconProps) => React.ReactNode, onClick?: () => void) => (
    <button
      className={page.kind === kind ? "rail-item active" : "rail-item"}
      onClick={onClick || (() => setPage({ kind } as Page))}
      title={label}
      aria-label={label}
      aria-current={page.kind === kind ? "page" : undefined}
    >
      <Icon />
    </button>
  );

  const appWindow = getCurrentWindow();
  const minimize = () => appWindow.minimize();
  const toggleMaximize = () => appWindow.toggleMaximize();
  const hideToTray = () => appWindow.hide();

  const clearHold = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  const beginDrag = useCallback(async () => {
    if (dragStartedRef.current) return;
    dragStartedRef.current = true;
    clearHold();
    try {
      await appWindow.startDragging();
    } catch {
      // Non-Tauri browser preview cannot drag native window.
    }
  }, [appWindow, clearHold]);

  useEffect(() => clearHold, [clearHold]);

  const handleHeaderPointerDown = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("button,input,select,textarea,a,[contenteditable=''],[contenteditable='true'],[data-no-drag]")) return;

    dragStartedRef.current = false;
    dragStartRef.current = { x: event.clientX, y: event.clientY };
    activePointerIdRef.current = event.pointerId;

    clearHold();
    holdTimeoutRef.current = window.setTimeout(() => {
      holdTimeoutRef.current = null;
      void beginDrag();
    }, HOLD_MS);
  }, [beginDrag, clearHold]);

  const handleHeaderPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (dragStartedRef.current || dragStartRef.current === null || activePointerIdRef.current !== event.pointerId) return;
    const dx = event.clientX - dragStartRef.current.x;
    const dy = event.clientY - dragStartRef.current.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) void beginDrag();
  }, [beginDrag]);

  const handleHeaderPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    clearHold();
    dragStartRef.current = null;
    activePointerIdRef.current = null;
    dragStartedRef.current = false;
  }, [clearHold]);

  return (
    <DialogProvider>
      <div className="app-shell">
        <header
          className="app-header"
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerEnd}
          onPointerCancel={handleHeaderPointerEnd}
        >
          <div className="app-brand" data-tauri-drag-region>
            <div className="app-brand-mark" data-tauri-drag-region>DS</div>
            <span data-tauri-drag-region>DonuScheduler</span>
          </div>
          <div className="app-header-title" data-tauri-drag-region>{pageTitle}</div>
          <div className="app-header-spacer" data-tauri-drag-region />
          <div className="app-header-status" data-tauri-drag-region>
            <span className="pill health-ok">Runtime</span>
            <span>Scheduler cockpit</span>
          </div>
          <div className="app-window-controls" data-no-drag>
            <button className="window-control" onClick={minimize} aria-label="Minimize"><icons.minimize className="window-icon" /></button>
            <button className="window-control" onClick={toggleMaximize} aria-label="Maximize"><icons.maximize className="window-icon" /></button>
            <button className="window-control close" onClick={hideToTray} aria-label="Hide to tray"><icons.close className="window-icon" /></button>
          </div>
        </header>
        <div className="app-body">
          <nav className="rail-nav" aria-label="Main navigation">
            {railItem("dashboard", "Dashboard", icons.dashboard)}
            <div className="rail-divider" />
            {railItem("script_store", "Script Store", icons.store)}
            {railItem("jobs", "Jobs", icons.jobs)}
            {railItem("test_run", "Manual Run", icons.run)}
            {railItem("running", "Running", icons.running)}
            {railItem("run_history", "Run History", icons.history)}
            <div className="rail-spacer" />
            {isDev && railItem("scripts", "Scripts Dev", icons.scripts)}
            {railItem("settings", "Settings", icons.settings)}
          </nav>
          <main className="app-content">
            {page.kind === "dashboard" && (
              <DashboardPage
                onOpenJobs={() => setPage({ kind: "jobs" })}
                onOpenRunning={() => setPage({ kind: "running" })}
                onOpenHistory={() => setPage({ kind: "run_history" })}
                onOpenStore={() => setPage({ kind: "script_store" })}
                onOpenSettings={() => setPage({ kind: "settings" })}
              />
            )}
            {page.kind === "scripts" && isDev && <LegacyScriptsPage />}
            {page.kind === "script_store" && <ScriptStorePage />}
            {page.kind === "jobs" && <JobsPage onOpenDetail={(id) => setPage({ kind: "job_detail", jobId: id })} />}
            {page.kind === "job_detail" && <JobDetailPage jobId={page.jobId} onBack={() => setPage({ kind: "jobs" })} />}
            {page.kind === "test_run" && <TestRunPage />}
            {page.kind === "running" && <RunningPage />}
            {page.kind === "run_history" && <RunHistoryPage />}
            {page.kind === "settings" && <SettingsPage theme={theme} onThemeChange={setTheme} />}
          </main>
        </div>
      </div>
      <RuntimeToastHost />
    </DialogProvider>
  );
}
