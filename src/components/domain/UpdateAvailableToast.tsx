import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import * as api from "../../api";
import type {
  AppUpdateAvailablePayload,
  RuntimeUpdateAvailablePayload,
} from "../../types";

interface UpdateInfo {
  type: "app" | "runtime";
  currentVersion: string;
  latestVersion: string;
  assetName: string;
}

export default function UpdateAvailableToast() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<AppUpdateAvailablePayload>("app-update-available", (event) => {
      setUpdate({
        type: "app",
        currentVersion: event.payload.current_version,
        latestVersion: event.payload.latest_version,
        assetName: event.payload.asset_name,
      });
    }).then((u) => unlisteners.push(u));

    listen<RuntimeUpdateAvailablePayload>("runtime-update-available", (event) => {
      setUpdate({
        type: "runtime",
        currentVersion: event.payload.current_version,
        latestVersion: event.payload.latest_version,
        assetName: event.payload.asset_name,
      });
    }).then((u) => unlisteners.push(u));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  const handleUpdate = async () => {
    if (!update) return;
    try {
      if (update.type === "app") {
        const info = await api.checkForAppUpdates();
        if (info) {
          await api.downloadAndPrepareAppUpdate(info);
        }
      } else {
        await api.updateRuntime();
      }
      setUpdate(null);
    } catch {
      // Error will be handled by RuntimeToastHost
    }
  };

  const handleDismiss = () => {
    setUpdate(null);
  };

  if (!update) return null;

  return (
    <div className="update-available-toast">
      <div className="update-available-toast__content">
        <div className="update-available-toast__icon">
          {update.type === "app" ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          )}
        </div>
        <div className="update-available-toast__text">
          <div className="update-available-toast__title">
            {update.type === "app" ? "App Update Available" : "Runtime Update Available"}
          </div>
          <div className="update-available-toast__version">
            {update.currentVersion} → {update.latestVersion}
          </div>
        </div>
      </div>
      <div className="update-available-toast__actions">
        <button className="btn btn--primary btn--sm" onClick={handleUpdate}>
          Update
        </button>
        <button className="btn btn--secondary btn--sm" onClick={handleDismiss}>
          Cancel
        </button>
      </div>
      <button className="update-available-toast__close" onClick={handleDismiss} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}
