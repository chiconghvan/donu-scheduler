import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useToast } from "../common/Toast";
import * as api from "../../api";
import type {
  RuntimeDownloadStartedPayload,
  RuntimeDownloadProgressPayload,
  RuntimeUpdateAvailablePayload,
  RuntimeUpdateSuccessPayload,
  RuntimeUpdateErrorPayload,
  AppUpdateAvailablePayload,
  AppUpdateDownloadStartedPayload,
  AppUpdateDownloadProgressPayload,
  AppUpdateReadyPayload,
  AppUpdateErrorPayload,
  ScriptStoreUpdateAvailablePayload,
  ScriptStoreUpdateSuccessPayload,
} from "../../types";

export default function RuntimeToastHost() {
  const { addToast } = useToast();

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<RuntimeDownloadStartedPayload>("runtime-download-started", (event) => {
      addToast({
        type: "info",
        title: "Runtime download",
        message: `Downloading ${event.payload.asset_name} (${event.payload.version})...`,
        duration: 0,
      });
    }).then((u) => unlisteners.push(u));

    listen<RuntimeDownloadProgressPayload>("runtime-download-progress", () => {}).then((u) => unlisteners.push(u));

    listen<RuntimeUpdateAvailablePayload>("runtime-update-available", (event) => {
      const { latest_version, asset_name } = event.payload;
      addToast({
        type: "info",
        title: "Runtime update available",
        message: `New runtime ${asset_name} (${latest_version}) available.`,
        duration: 0,
        action: {
          label: "Update",
          onClick: () => {
            if (!window.confirm(`Download and install runtime update ${latest_version}?`)) return;
            api.updateRuntime().catch(() => {
              addToast({
                type: "error",
                title: "Runtime update failed",
                duration: 10000,
              });
            });
          },
        },
      });
    }).then((u) => unlisteners.push(u));

    listen<RuntimeUpdateSuccessPayload>("runtime-update-success", (event) => {
      addToast({
        type: "success",
        title: "Runtime updated",
        message: `Runtime ${event.payload.asset_name} (${event.payload.version}) installed.`,
        duration: 10000,
      });
    }).then((u) => unlisteners.push(u));

    listen<RuntimeUpdateErrorPayload>("runtime-update-error", (event) => {
      addToast({
        type: "error",
        title: "Runtime update error",
        message: event.payload.message,
        duration: 10000,
      });
    }).then((u) => unlisteners.push(u));

    listen<ScriptStoreUpdateAvailablePayload>("script-store-update-available", (event) => {
      addToast({
        type: "info",
        title: "Script update available",
        message: `${event.payload.name}: ${event.payload.current_version} -> ${event.payload.latest_version}`,
        duration: 0,
        action: {
          label: "Update",
          onClick: () => {
            if (!window.confirm(`Update script ${event.payload.name} to ${event.payload.latest_version}?`)) return;
            api.updateScriptStore(event.payload.script_id).catch(() => {
              addToast({
                type: "error",
                title: "Script update failed",
                duration: 10000,
              });
            });
          },
        },
      });
    }).then((u) => unlisteners.push(u));

    listen<ScriptStoreUpdateSuccessPayload>("script-store-update-success", (event) => {
      addToast({
        type: "success",
        title: "Script updated",
        message: `${event.payload.name} updated to ${event.payload.version}.`,
        duration: 10000,
      });
    }).then((u) => unlisteners.push(u));

    listen<AppUpdateAvailablePayload>("app-update-available", (event) => {
      addToast({
        type: "info",
        title: "App update available",
        message: `${event.payload.current_version} -> ${event.payload.latest_version} (${event.payload.asset_name})`,
        duration: 0,
      });
    }).then((u) => unlisteners.push(u));

    listen<AppUpdateDownloadStartedPayload>("app-update-download-started", (event) => {
      addToast({
        type: "info",
        title: "App update download",
        message: `Downloading ${event.payload.asset_name} (${event.payload.latest_version})...`,
        duration: 0,
      });
    }).then((u) => unlisteners.push(u));

    listen<AppUpdateDownloadProgressPayload>("app-update-download-progress", () => {}).then((u) => unlisteners.push(u));

    listen<AppUpdateReadyPayload>("app-update-ready", (event) => {
      addToast({
        type: "success",
        title: "App update ready",
        message: `${event.payload.asset_name} downloaded. Restart to install.`,
        duration: 0,
        action: {
          label: "Install",
          onClick: () => {
            if (!window.confirm(`Install app update ${event.payload.latest_version} and restart now?`)) return;
            api.restartApplication(event.payload.installer_path).catch(() => {
              addToast({ type: "error", title: "App restart failed", duration: 10000 });
            });
          },
        },
      });
    }).then((u) => unlisteners.push(u));

    listen<AppUpdateErrorPayload>("app-update-error", (event) => {
      addToast({
        type: "error",
        title: "App update error",
        message: event.payload.message,
        duration: 10000,
      });
    }).then((u) => unlisteners.push(u));

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [addToast]);

  return null;
}
