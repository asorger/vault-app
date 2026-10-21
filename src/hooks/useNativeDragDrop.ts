// src/hooks/useNativeDragDrop.ts — Native OS full-window file drag-and-drop handler with Win32 Shift-drag detection.

import { useState, useEffect, useRef } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isShiftKeyPressed, isOutboundDragging } from "../services/tauri";

interface UseNativeDragDropOptions {
  enabled: boolean;
  onDrop: (paths: string[], shiftPressed: boolean) => void;
}

export function useNativeDragDrop({ enabled, onDrop }: UseNativeDragDropOptions) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const onDropRef = useRef(onDrop);
  onDropRef.current = onDrop;

  // Poll hardware Shift key state while an OS drag is hovering over the window
  useEffect(() => {
    if (!isDraggingOver) {
      setIsShiftPressed(false);
      return;
    }

    let cancelled = false;
    const checkShift = async () => {
      try {
        const pressed = await isShiftKeyPressed();
        if (!cancelled) {
          setIsShiftPressed(pressed);
        }
      } catch {
        // ignore
      }
    };

    checkShift();
    const interval = window.setInterval(checkShift, 80);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isDraggingOver]);

  // Safety listeners to ensure DropOverlay can never get stuck on screen
  useEffect(() => {
    const clearOverlay = () => setIsDraggingOver(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsDraggingOver(false);
    };

    window.addEventListener("mouseup", clearOverlay);
    window.addEventListener("blur", clearOverlay);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mouseup", clearOverlay);
      window.removeEventListener("blur", clearOverlay);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsDraggingOver(false);
      return;
    }

    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const webview = getCurrentWebview();
        unlisten = await webview.onDragDropEvent(async (event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            const outbound = await isOutboundDragging().catch(() => false);
            if (!outbound) {
              setIsDraggingOver(true);
            } else {
              setIsDraggingOver(false);
            }
          } else if (event.payload.type === "leave") {
            setIsDraggingOver(false);
          } else if (event.payload.type === "drop") {
            setIsDraggingOver(false);
            const outbound = await isOutboundDragging().catch(() => false);
            if (outbound) return;

            if (event.payload.paths && event.payload.paths.length > 0) {
              const shiftHeld = await isShiftKeyPressed().catch(() => false);
              onDropRef.current(event.payload.paths, shiftHeld);
            }
          }
        });
      } catch (err) {
        console.error("Failed to register native drag-drop event:", err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
      setIsDraggingOver(false);
    };
  }, [enabled]);

  return { isDraggingOver, isShiftPressed };
}
