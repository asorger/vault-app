// src/hooks/useWorkspaceSelection.ts — Multi-item selection, Shift-range, and marquee selection.

import { useState, useCallback } from "react";
import type { VirtualFolder, VirtualFile } from "../types/vault";

export function useWorkspaceSelection(
  folders: VirtualFolder[],
  files: VirtualFile[]
) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setLastSelectedId(null);
  }, []);

  const selectAll = useCallback(() => {
    const all = new Set<string>();
    folders.forEach((f) => all.add(f.id));
    files.forEach((f) => all.add(f.id));
    setSelectedIds(all);
  }, [folders, files]);

  const toggleSelect = useCallback(
    (
      id: string,
      _isFolder: boolean,
      isCheckboxClick: boolean,
      event: React.MouseEvent
    ) => {
      const isShift = event.shiftKey;
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;

      if (isShift && lastSelectedId) {
        // Shift-select: select all items between lastSelectedId and id
        const allItems: string[] = [
          ...folders.map((f) => f.id),
          ...files.map((f) => f.id),
        ];
        const idxA = allItems.indexOf(lastSelectedId);
        const idxB = allItems.indexOf(id);

        if (idxA !== -1 && idxB !== -1) {
          const start = Math.min(idxA, idxB);
          const end = Math.max(idxA, idxB);
          const range = new Set(selectedIds);
          for (let i = start; i <= end; i++) {
            range.add(allItems[i]);
          }
          setSelectedIds(range);
          return;
        }
      }

      if (isCmdOrCtrl || isCheckboxClick) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          return next;
        });
        setLastSelectedId(id);
      } else {
        // Normal single click: clear others and select this item
        setSelectedIds(new Set([id]));
        setLastSelectedId(id);
      }
    },
    [folders, files, lastSelectedId, selectedIds]
  );

  return {
    selectedIds,
    setSelectedIds,
    lastSelectedId,
    toggleSelect,
    selectAll,
    clearSelection,
  };
}

