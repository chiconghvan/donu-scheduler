import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ToastProvider } from "./components/common/Toast";
import { DialogProvider } from "./components/common/Dialog";
import RuntimeToastHost from "./components/domain/RuntimeToastHost";
import ActivityPage from "./components/pages/ActivityPage";
import DashboardPage from "./components/pages/DashboardPage";
import JobsPage from "./components/pages/JobsPage";
import ScriptStorePage from "./components/pages/ScriptStorePage";
import SettingsPage from "./components/pages/SettingsPage";
import TestLabPage from "./components/pages/TestLabPage";
import Sidebar from "./components/shell/Sidebar";
import WindowControls from "./components/shell/WindowControls";
import { useWindowDrag } from "./hooks/useWindowDrag";

type Page = "dashboard" | "store" | "testlab" | "jobs" | "activity" | "settings";

const titles: Record<Page, string> = {
  dashboard: "Dashboard",
  store: "Script Store",
  testlab: "Test Lab",
  jobs: "Jobs",
  activity: "Activity",
  settings: "Settings",
};

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const drag = useWindowDrag(getCurrentWindow());

  return (
    <ToastProvider>
      <DialogProvider>
        <div className="app-shell">
          <header
            className="app-header"
            onPointerDown={drag.handleHeaderPointerDown}
            onPointerMove={drag.handleHeaderPointerMove}
            onPointerUp={drag.handleHeaderPointerEnd}
            onPointerCancel={drag.handleHeaderPointerEnd}
          >
            <div className="app-header__title" data-tauri-drag-region>
              DonuScheduler / {titles[page]}
            </div>
            <WindowControls />
          </header>
          <div className="app-body">
            <Sidebar activePage={page} onNavigate={(p) => setPage(p as Page)} />
            <main className="app-content">
              {page === "dashboard" && <DashboardPage onNavigate={(p) => setPage(p as Page)} />}
              {page === "store" && <ScriptStorePage />}
              {page === "testlab" && <TestLabPage />}
              {page === "jobs" && <JobsPage />}
              {page === "activity" && <ActivityPage />}
              {page === "settings" && <SettingsPage />}
            </main>
          </div>
        </div>
        <RuntimeToastHost />
      </DialogProvider>
    </ToastProvider>
  );
}
