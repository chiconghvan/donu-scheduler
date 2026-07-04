import { useCallback, useRef } from "react";

export function useMultiSelect<T extends { id: string }>(
  filteredItems: T[],
  selectedIds: Set<string>,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>
) {
  const lastClickedIndex = useRef<number | null>(null);
  const isMouseDown = useRef(false);
  const isDragging = useRef(false);
  const dragStartIndex = useRef<number | null>(null);

  const toggleItem = useCallback(
    (itemId: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(itemId)) next.delete(itemId);
        else next.add(itemId);
        return next;
      });
    },
    [setSelectedIds]
  );

  const selectRange = useCallback(
    (fromIndex: number, toIndex: number) => {
      const start = Math.min(fromIndex, toIndex);
      const end = Math.max(fromIndex, toIndex);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (let i = start; i <= end; i++) {
          next.add(filteredItems[i].id);
        }
        return next;
      });
    },
    [filteredItems, setSelectedIds]
  );

  const handleRowMouseDown = useCallback(
    (_e: React.MouseEvent, index: number) => {
      isMouseDown.current = true;
      isDragging.current = false;
      dragStartIndex.current = index;
    },
    []
  );

  const handleRowMouseMove = useCallback(
    (_e: React.MouseEvent, index: number) => {
      if (!isMouseDown.current) return;
      if (dragStartIndex.current !== index) isDragging.current = true;
      if (isDragging.current && dragStartIndex.current !== null) {
        selectRange(dragStartIndex.current, index);
      }
    },
    [selectRange]
  );

  const handleRowMouseUp = useCallback(
    (e: React.MouseEvent, index: number) => {
      if (!isMouseDown.current) return;
      isMouseDown.current = false;

      if (!isDragging.current) {
        if (e.shiftKey && lastClickedIndex.current !== null) {
          selectRange(lastClickedIndex.current, index);
        } else if (e.ctrlKey || e.metaKey) {
          toggleItem(filteredItems[index].id);
        } else {
          const pid = filteredItems[index].id;
          setSelectedIds((prev) => {
            if (prev.has(pid) && prev.size === 1) return new Set();
            return new Set([pid]);
          });
        }
      }

      lastClickedIndex.current = index;
      isDragging.current = false;
      dragStartIndex.current = null;
    },
    [filteredItems, selectRange, toggleItem, setSelectedIds]
  );

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredItems.map((i) => i.id)));
  }, [filteredItems, setSelectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, [setSelectedIds]);

  return {
    toggleItem,
    selectRange,
    selectAll,
    clearSelection,
    handleRowMouseDown,
    handleRowMouseMove,
    handleRowMouseUp,
    isSelected: (id: string) => selectedIds.has(id),
  };
}
