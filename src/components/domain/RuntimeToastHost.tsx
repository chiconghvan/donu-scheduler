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

    listen<RuntimeDownloadProgressPayload>("runtime-download-progress", (event) => {
      const { asset_name, downloaded_bytes, total_bytes } = event.payload;
      const percent =
        total_bytes && total_bytes > 0
          ? Math.min(100, Math.floor((downloaded_bytes / total_bytes) * 100))
          : null;
      addToast({
        type: "info",
        title: "Runtime download",
        message:
          percent !== null
            ? `Downloading ${asset_name}... ${percent}%`
            : `Downloading ${asset_name}... ${downloaded_bytes} bytes`,
        duration: 0,
      });
    }).then((u) => unlisteners.push(u));

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

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [addToast]);

  return null;
}
