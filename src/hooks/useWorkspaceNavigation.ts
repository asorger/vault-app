// src/hooks/useWorkspaceNavigation.ts — Navigation history stack & breadcrumbs management.

import { useState, useCallback } from "react";

export function useWorkspaceNavigation(initialFolderId: string | null = null) {
  const [history, setHistory] = useState<(string | null)[]>([initialFolderId]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const currentFolderId = history[historyIndex] ?? null;
  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex < history.length - 1;

  const navigateTo = useCallback(
    (folderId: string | null) => {
      if (folderId === currentFolderId) return;
      setHistory((prev) => {
        const nextHistory = prev.slice(0, historyIndex + 1);
        return [...nextHistory, folderId];
      });
      setHistoryIndex((prev) => prev + 1);
    },
    [currentFolderId, historyIndex]
  );

  const goBack = useCallback(() => {
    if (canGoBack) {
      setHistoryIndex((prev) => prev - 1);
    }
  }, [canGoBack]);

  const goForward = useCallback(() => {
    if (canGoForward) {
      setHistoryIndex((prev) => prev + 1);
    }
  }, [canGoForward]);

  const resetNavigation = useCallback((folderId: string | null = null) => {
    setHistory([folderId]);
    setHistoryIndex(0);
  }, []);

  return {
    currentFolderId,
    canGoBack,
    canGoForward,
    navigateTo,
    goBack,
    goForward,
    resetNavigation,
  };
}

