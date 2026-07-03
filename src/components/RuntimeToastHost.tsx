import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../api";
import type {
  RuntimeDownloadStartedPayload,
  RuntimeDownloadProgressPayload,
  RuntimeUpdateAvailablePayload,
  RuntimeUpdateErrorPayload,
  RuntimeUpdateSuccessPayload,
  ScriptStoreUpdateAvailablePayload,
  ScriptStoreUpdateSuccessPayload,
} from "../types";

type ToastPosition = "top-left" | "bottom-right";
type ToastKind = "info" | "success" | "error" | "update";

type RuntimeToast = {
  id: number;
  position: ToastPosition;
  title: string;
  message: string;
  kind: ToastKind;
  action?: {
    label: string;
    onClick: () => void;
  };
  cancelLabel?: string;
  autoCloseMs?: number;
  stacked?: boolean;
  stackKey?: string;
};

const TOAST_TTL_MS = 120000;

export default function RuntimeToastHost() {
  const [toasts, setToasts] = useState<RuntimeToast[]>([]);
  const [expandedTopLeft, setExpandedTopLeft] = useState(false);
  const [expandedBottomRight, setExpandedBottomRight] = useState(false);
  const lastRuntimeSuccessRef = useRef<string | null>(null);

  const upsertToast = (key: string, toast: Omit<RuntimeToast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => {
      const next = current.filter((item) => item.stackKey !== key);
      return [...next, { ...toast, id, stackKey: key }];
    });
    if (toast.autoCloseMs !== 0) {
      window.setTimeout(() => closeToast(id), toast.autoCloseMs ?? TOAST_TTL_MS);
    }
  };

  const closeToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const pushToast = (toast: Omit<RuntimeToast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    if (toast.autoCloseMs !== 0) {
      window.setTimeout(() => closeToast(id), toast.autoCloseMs ?? TOAST_TTL_MS);
    }
  };

  useEffect(() => {
    const unlisteners: Array<() => void> = []; 

    listen<RuntimeDownloadStartedPayload>("runtime-download-started", (event) => {
      upsertToast("runtime-download", {
        position: "bottom-right",
        kind: "info",
        title: "Runtime download",
        message: `Đang tải runtime ${event.payload.asset_name}... 0%`,
        autoCloseMs: 0,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<RuntimeDownloadProgressPayload>("runtime-download-progress", (event) => {
      const { asset_name, downloaded_bytes, total_bytes } = event.payload;
      const percent = total_bytes && total_bytes > 0 ? Math.min(100, Math.floor((downloaded_bytes / total_bytes) * 100)) : null;
      upsertToast("runtime-download", {
        position: "bottom-right",
        kind: "info",
        title: "Runtime download",
        message: percent === null ? `Đang tải runtime ${asset_name}... ${downloaded_bytes} bytes` : `Đang tải runtime ${asset_name}... ${percent}%`,
        autoCloseMs: 0,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<RuntimeUpdateAvailablePayload>("runtime-update-available", (event) => {
      const { latest_version, asset_name } = event.payload;
      pushToast({
        position: "top-left",
        kind: "update",
        title: "Runtime update",
        message: `Có runtime mới ${asset_name} (${latest_version}).`,
        action: {
          label: "Update",
          onClick: async () => {
            try {
              await api.updateRuntime();
            } catch (e) {
              pushToast({
                position: "top-left",
                kind: "error",
                title: "Runtime update failed",
                message: String(e),
                autoCloseMs: 10000,
              });
            }
          },
        },
        cancelLabel: "Cancel",
        stacked: true,
        stackKey: "runtime",
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<RuntimeUpdateSuccessPayload>("runtime-update-success", (event) => {
      if (lastRuntimeSuccessRef.current === event.payload.version) return;
      lastRuntimeSuccessRef.current = event.payload.version;
      setToasts((current) => current.filter((toast) => toast.stackKey !== "runtime-download"));
      pushToast({
        position: "top-left",
        kind: "success",
        title: "Runtime updated",
        message: `Đã update runtime ${event.payload.asset_name} thành công.`,
        autoCloseMs: 10000,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<ScriptStoreUpdateAvailablePayload>("script-store-update-available", (event) => {
      pushToast({
        position: "top-left",
        kind: "update",
        title: "Script update",
        message: `Có update script ${event.payload.name} (${event.payload.latest_version}).`,
        action: {
          label: "Update",
          onClick: async () => {
            try {
              await api.updateScriptStore(event.payload.script_id);
            } catch (e) {
              pushToast({
                position: "top-left",
                kind: "error",
                title: "Script update failed",
                message: String(e),
                autoCloseMs: 10000,
              });
            }
          },
        },
        cancelLabel: "Cancel",
        stacked: true,
        stackKey: `script-${event.payload.script_id}`,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<ScriptStoreUpdateSuccessPayload>("script-store-update-success", (event) => {
      pushToast({
        position: "top-left",
        kind: "success",
        title: "Script updated",
        message: `Đã update script ${event.payload.name} ${event.payload.version} thành công.`,
        autoCloseMs: 10000,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<RuntimeUpdateErrorPayload>("runtime-update-error", (event) => {
      pushToast({
        position: "top-left",
        kind: "error",
        title: "Runtime update error",
        message: event.payload.message,
        autoCloseMs: 10000,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const topLeft = useMemo(() => toasts.filter((toast) => toast.position === "top-left"), [toasts]);
  const bottomRight = useMemo(() => toasts.filter((toast) => toast.position === "bottom-right"), [toasts]);

  return (
    <>
      <ToastStack
        position="top-left"
        toasts={topLeft}
        onClose={closeToast}
        expanded={expandedTopLeft}
        onToggleExpanded={() => setExpandedTopLeft((value) => !value)}
      />
      <ToastStack
        position="bottom-right"
        toasts={bottomRight}
        onClose={closeToast}
        expanded={expandedBottomRight}
        onToggleExpanded={() => setExpandedBottomRight((value) => !value)}
      />
    </>
  );
}

function ToastStack({
  position,
  toasts,
  onClose,
  expanded,
  onToggleExpanded,
}: {
  position: ToastPosition;
  toasts: RuntimeToast[];
  onClose: (id: number) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  if (toasts.length === 0) return null;

  const stacked = position === "top-left" && toasts.some((toast) => toast.stacked);

  return (
    <div
      className={`runtime-toast-stack runtime-toast-${position} ${stacked && !expanded ? "runtime-toast-stack-collapsed" : ""}`}
      onClick={() => {
        if (stacked && !expanded) {
          onToggleExpanded();
        }
      }}
    >
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          className={`runtime-toast runtime-toast-${toast.kind}`}
          style={stacked && !expanded ? { transform: `translate(${index * 8}px, ${index * 8}px)`, zIndex: 1000 + index } : undefined}
        >
          <button
            className="runtime-toast-x"
            onClick={(e) => {
              e.stopPropagation();
              onClose(toast.id);
            }}
          >
            x
          </button>
          <div className="runtime-toast-title">{toast.title}</div>
          <div className="runtime-toast-message">{toast.message}</div>
          {(toast.action || toast.cancelLabel) && (
            <div className="runtime-toast-actions">
              {toast.action && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.action?.onClick();
                  }}
                >
                  {toast.action.label}
                </button>
              )}
              {toast.cancelLabel && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(toast.id);
                  }}
                >
                  {toast.cancelLabel}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
