import { useCallback } from "react";

export function useWindowDrag(appWindow: {
  startDragging: () => Promise<void>;
}) {
  const beginDrag = useCallback(async () => {
    try {
      await appWindow.startDragging();
    } catch {
      // Non-Tauri env
    }
  }, [appWindow]);

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

      void beginDrag();
    },
    [beginDrag]
  );

  const handleHeaderPointerMove = useCallback(() => undefined, []);
  const handleHeaderPointerEnd = useCallback(() => undefined, []);

  return {
    handleHeaderPointerDown,
    handleHeaderPointerMove,
    handleHeaderPointerEnd,
  };
}
