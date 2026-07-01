import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

type DialogKind = "info" | "error" | "confirm";

type DialogOptions = {
  kind: DialogKind;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
};

type DialogState = DialogOptions & {
  resolve: (value: boolean) => void;
};

type DialogApi = {
  showDialog: (options: DialogOptions) => Promise<boolean>;
  showError: (message: string, title?: string) => Promise<void>;
};

const DialogContext = createContext<DialogApi | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;

    if (dialog && !el.open) {
      el.showModal();
      return;
    }

    if (!dialog && el.open) {
      el.close();
    }
  }, [dialog]);

  const api = useMemo<DialogApi>(
    () => ({
      showDialog: (options) =>
        new Promise<boolean>((resolve) => {
          setDialog({
            ...options,
            resolve,
          });
        }),
      showError: async (message, title = "Error") => {
        await new Promise<boolean>((resolve) => {
          setDialog({
            kind: "error",
            title,
            message,
            confirmText: "OK",
            cancelText: "",
            resolve,
          });
        });
      },
    }),
    []
  );

  const closeDialog = (value: boolean) => {
    if (!dialog) return;
    dialog.resolve(value);
    setDialog(null);
  };

  return (
    <DialogContext.Provider value={api}>
      {children}
      <dialog
        ref={dialogRef}
        className="app-dialog"
        onCancel={(e) => {
          e.preventDefault();
          closeDialog(false);
        }}
      >
        {dialog && (
          <div className="app-dialog-panel">
            <h2 className={`app-dialog-title app-dialog-${dialog.kind}`}>
              {dialog.title}
            </h2>
            <div className="app-dialog-message">{dialog.message}</div>
            <div className="app-dialog-actions">
              {dialog.kind === "confirm" && (
                <button
                  className="btn btn-secondary"
                  onClick={() => closeDialog(false)}
                >
                  {dialog.cancelText || "Cancel"}
                </button>
              )}
              <button
                className={dialog.kind === "confirm" ? "btn btn-danger" : "btn btn-primary"}
                onClick={() => closeDialog(true)}
              >
                {dialog.confirmText || (dialog.kind === "confirm" ? "Confirm" : "OK")}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used inside DialogProvider");
  }
  return ctx;
}
