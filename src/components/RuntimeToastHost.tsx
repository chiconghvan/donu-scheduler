import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import * as api from "../api";
import type {
  RuntimeDownloadStartedPayload,
  RuntimeUpdateAvailablePayload,
  RuntimeUpdateErrorPayload,
  RuntimeUpdateSuccessPayload,
} from "../types";

type ToastPosition = "top-left" | "bottom-right";

type RuntimeToast = {
  id: number;
  position: ToastPosition;
  title: string;
  message: string;
  kind: "info" | "success" | "error";
  action?: {
    label: string;
    onClick: () => void;
  };
  closeLabel?: string;
};

const TOAST_TTL_MS = 120000;

export default function RuntimeToastHost() {
  const [toasts, setToasts] = useState<RuntimeToast[]>([]);

  const closeToast = (id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const pushToast = (toast: Omit<RuntimeToast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { ...toast, id }]);
    window.setTimeout(() => closeToast(id), TOAST_TTL_MS);
  };

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    listen<RuntimeDownloadStartedPayload>("runtime-download-started", (event) => {
      pushToast({
        position: "bottom-right",
        kind: "info",
        title: "Runtime",
        message: `Đang tải runtime ${event.payload.asset_name}`,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<RuntimeUpdateAvailablePayload>("runtime-update-available", (event) => {
      const { latest_version, asset_name } = event.payload;
      pushToast({
        position: "top-left",
        kind: "info",
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
              });
            }
          },
        },
        closeLabel: "Close",
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<RuntimeUpdateSuccessPayload>("runtime-update-success", (event) => {
      pushToast({
        position: "top-left",
        kind: "success",
        title: "Runtime updated",
        message: `Đã update runtime ${event.payload.asset_name} thành công.`,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    listen<RuntimeUpdateErrorPayload>("runtime-update-error", (event) => {
      pushToast({
        position: "top-left",
        kind: "error",
        title: "Runtime update error",
        message: event.payload.message,
      });
    }).then((unlisten) => unlisteners.push(unlisten));

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  const topLeft = toasts.filter((toast) => toast.position === "top-left");
  const bottomRight = toasts.filter((toast) => toast.position === "bottom-right");

  return (
    <>
      <ToastStack position="top-left" toasts={topLeft} onClose={closeToast} />
      <ToastStack position="bottom-right" toasts={bottomRight} onClose={closeToast} />
    </>
  );
}

function ToastStack({
  position,
  toasts,
  onClose,
}: {
  position: ToastPosition;
  toasts: RuntimeToast[];
  onClose: (id: number) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className={`runtime-toast-stack runtime-toast-${position}`}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`runtime-toast runtime-toast-${toast.kind}`}>
          <button className="runtime-toast-x" onClick={() => onClose(toast.id)}>
            x
          </button>
          <div className="runtime-toast-title">{toast.title}</div>
          <div className="runtime-toast-message">{toast.message}</div>
          {(toast.action || toast.closeLabel) && (
            <div className="runtime-toast-actions">
              {toast.action && (
                <button className="btn btn-primary btn-sm" onClick={toast.action.onClick}>
                  {toast.action.label}
                </button>
              )}
              {toast.closeLabel && (
                <button className="btn btn-secondary btn-sm" onClick={() => onClose(toast.id)}>
                  {toast.closeLabel}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
