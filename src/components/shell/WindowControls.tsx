import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

export default function WindowControls() {
  const appWindow = getCurrentWindow();

  return (
    <div className="window-controls">
      <button className="window-btn" onClick={() => appWindow.minimize()} aria-label="Minimize">
        <Minus size={14} />
      </button>
      <button className="window-btn" onClick={() => appWindow.toggleMaximize()} aria-label="Maximize">
        <Square size={12} />
      </button>
      <button className="window-btn window-btn--close" onClick={() => appWindow.hide()} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}
