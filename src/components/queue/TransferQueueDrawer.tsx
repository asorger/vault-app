import React, { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  X,
} from "lucide-react";
import type { TransferProgressPayload } from "../../types/vault";
import { formatBytes } from "../../services/tauri";

export const TransferQueueDrawer: React.FC = () => {
  const [progress, setProgress] = useState<TransferProgressPayload | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const unlistenPromise = listen<TransferProgressPayload>(
      "vault://transfer-progress",
      (event) => {
        const payload = event.payload;
        setProgress(payload);
        setVisible(true);

        if (hideTimeout) clearTimeout(hideTimeout);

        if (
          payload.total_items > 0 &&
          payload.items_completed >= payload.total_items &&
          payload.bytes_processed >= payload.total_bytes
        ) {
          hideTimeout = setTimeout(() => {
            setVisible(false);
          }, 3500);
        }
      }
    );

    return () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  if (!visible || !progress) return null;

  const isComplete =
    progress.total_items > 0 &&
    progress.items_completed >= progress.total_items &&
    progress.bytes_processed >= progress.total_bytes;

  const percent =
    progress.total_bytes > 0
      ? Math.min(
          100,
          Math.round((progress.bytes_processed / progress.total_bytes) * 100)
        )
      : progress.total_items > 0
      ? Math.min(
          100,
          Math.round((progress.items_completed / progress.total_items) * 100)
        )
      : isComplete
      ? 100
      : 0;

  const headerTitle = isComplete
    ? progress.phase === "delete"
      ? "Deletion Complete"
      : progress.phase === "export"
      ? "Export Complete"
      : "Import Complete"
    : progress.phase === "delete"
    ? "Deleting Items..."
    : progress.phase === "export"
    ? "Exporting Files..."
    : "Importing Files...";

  return (
    <div className="fixed bottom-5 right-5 z-40 w-80 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-950/70 border-b border-zinc-800/80">
        <div className="flex items-center gap-2.5">
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Loader2 className="w-4 h-4 text-indigo-400 animate-spin shrink-0" />
          )}
          <span className="text-xs font-semibold text-zinc-200">
            {headerTitle}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMinimized((m) => !m)}
            className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
          >
            {minimized ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
          {isComplete && (
            <button
              type="button"
              onClick={() => setVisible(false)}
              className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!minimized && (
        <div className="p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-300 font-medium truncate max-w-[180px]">
              {progress.current_item || "Done"}
            </span>
            <span className="text-zinc-400 font-mono">
              {progress.items_completed} / {progress.total_items}
            </span>
          </div>

          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-150 ${
                isComplete ? "bg-emerald-500" : "bg-indigo-500"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
            <span>
              {formatBytes(progress.bytes_processed)} /{" "}
              {formatBytes(progress.total_bytes)}
            </span>
            <span>{percent}%</span>
          </div>
        </div>
      )}
    </div>
  );
};
