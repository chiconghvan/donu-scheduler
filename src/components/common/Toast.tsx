import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { X } from "lucide-react";

type ToastType = "info" | "success" | "warning" | "error";

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastOptions {
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  action?: ToastAction;
  key?: string;
  progress?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
}

interface ToastContextValue {
  addToast: (options: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<string | number, number>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (options: ToastOptions) => {
      const id = ++idRef.current;
      const duration = options.duration ?? 5000;
      const timerKey = options.key ?? id;
      const existingTimer = timersRef.current.get(timerKey);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
        timersRef.current.delete(timerKey);
      }

      setToasts((prev) => {
        if (!options.key) return [...prev, { ...options, id }];

        const existing = prev.find((toast) => toast.key === options.key);
        if (!existing) return [...prev, { ...options, id }];

        return prev.map((toast) => toast.key === options.key ? { ...toast, ...options } : toast);
      });
      if (duration > 0) {
        const timerId = window.setTimeout(() => {
          setToasts((prev) => prev.filter((toast) => options.key ? toast.key !== options.key : toast.id !== id));
          timersRef.current.delete(timerKey);
        }, duration);
        timersRef.current.set(timerKey, timerId);
      }
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast--${toast.type}`}>
            <div className="toast__content">
              <div className="toast__title">{toast.title}</div>
              {toast.message && <div className="toast__message">{toast.message}</div>}
              {typeof toast.progress === "number" && (
                <div className="toast__progress" aria-label={`Progress ${Math.round(toast.progress)}%`}>
                  <div className="toast__progress-fill" style={{ width: `${Math.max(0, Math.min(100, toast.progress))}%` }} />
                </div>
              )}
            </div>
            {toast.action && (
              <div className="toast__actions">
                <button
                  className="btn btn--secondary"
                  onClick={() => {
                    toast.action!.onClick();
                    removeToast(toast.id);
                  }}
                >
                  {toast.action.label}
                </button>
              </div>
            )}
            <button className="toast__close" onClick={() => removeToast(toast.id)} aria-label="Close">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
