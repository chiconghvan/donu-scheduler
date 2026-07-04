import { useCallback, useEffect, useRef } from "react";

const HOLD_MS = 150;
const DRAG_THRESHOLD_PX = 3;

export function useWindowDrag(appWindow: {
  startDragging: () => Promise<void>;
}) {
  const holdTimeoutRef = useRef<number | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartedRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);

  const clearHold = useCallback(() => {
    if (holdTimeoutRef.current !== null) {
      window.clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  }, []);

  const beginDrag = useCallback(async () => {
    if (dragStartedRef.current) return;
    dragStartedRef.current = true;
    clearHold();
    try {
      await appWindow.startDragging();
    } catch {
      // Non-Tauri env
    }
  }, [appWindow, clearHold]);

  useEffect(() => clearHold, [clearHold]);

  const handleHeaderPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          "button,input,select,textarea,a,[contenteditable=''],[contenteditable='true'],[data-no-drag]"
        )
      )
        return;

      dragStartedRef.current = false;
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      activePointerIdRef.current = event.pointerId;

      clearHold();
      holdTimeoutRef.current = window.setTimeout(() => {
        holdTimeoutRef.current = null;
        void beginDrag();
      }, HOLD_MS);
    },
    [beginDrag, clearHold]
  );

  const handleHeaderPointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (
        dragStartedRef.current ||
        dragStartRef.current === null ||
        activePointerIdRef.current !== event.pointerId
      )
        return;
      const dx = event.clientX - dragStartRef.current.x;
      const dy = event.clientY - dragStartRef.current.y;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) void beginDrag();
    },
    [beginDrag]
  );

  const handleHeaderPointerEnd = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (activePointerIdRef.current !== event.pointerId) return;
      clearHold();
      dragStartRef.current = null;
      activePointerIdRef.current = null;
      dragStartedRef.current = false;
    },
    [clearHold]
  );

  return {
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleHeaderPointerEnd,
  };
}
