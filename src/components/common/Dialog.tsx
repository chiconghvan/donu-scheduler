import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

interface DialogContextValue {
  showDialog: (options: DialogOptions) => Promise<boolean>;
  showError: (message: string) => Promise<void>;
}

interface DialogState extends DialogOptions {
  resolve: (value: boolean) => void;
  hideCancel?: boolean;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const close = useCallback((value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setDialog(null);
  }, []);

  const showDialog = useCallback(
    (options: DialogOptions): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        resolveRef.current = resolve;
        setDialog({ ...options, resolve });
      });
    },
    [],
  );

  const showError = useCallback(
    (message: string): Promise<void> => {
      return new Promise<void>((resolve) => {
        resolveRef.current = (v: boolean) => { void v; resolve(); };
        setDialog({
          title: "Error",
          message,
          confirmLabel: "OK",
          variant: "danger",
          hideCancel: true,
          resolve: () => resolve(),
        });
      });
    },
    [],
  );

  return (
    <DialogContext.Provider value={{ showDialog, showError }}>
      {children}
      {dialog &&
        createPortal(
          <div className="dialog-backdrop" onClick={() => close(false)}>
            <div className="dialog" onClick={(e) => e.stopPropagation()}>
              <div className="dialog__header">{dialog.title}</div>
              <div className="dialog__body">{dialog.message}</div>
              <div className="dialog__footer">
                {!dialog.hideCancel && (
                  <button className="btn btn--secondary" onClick={() => close(false)}>
                    {dialog.cancelLabel ?? "Cancel"}
                  </button>
                )}
                <button
                  className={`btn ${dialog.variant === "danger" ? "btn--danger" : "btn--primary"}`}
                  onClick={() => close(true)}
                >
                  {dialog.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </DialogContext.Provider>
  );
}
