// src/components/modals/CompressionProgressModal.tsx — Minimalist progress modal for retroactive compression migration.

import React from "react";
import { Archive } from "lucide-react";
import type { CompressionProgressPayload } from "../../types/vault";
import { formatBytes } from "../../services/tauri";

interface CompressionProgressModalProps {
  open: boolean;
  progress: CompressionProgressPayload | null;
}

export const CompressionProgressModal: React.FC<CompressionProgressModalProps> = ({
  open,
  progress,
}) => {
  if (!open) return null;

  const totalFiles = progress?.total_files ?? 1;
  const completedFiles = progress?.files_completed ?? 0;
  const currentItem = progress?.current_file || "Processing files...";
  const percent =
    totalFiles > 0
      ? Math.min(100, Math.round((completedFiles / totalFiles) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
            <Archive className="w-5 h-5 text-purple-400 animate-pulse" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-stone-100">
              Migrating Vault Compression
            </h3>
            <p className="text-xs text-stone-400 truncate mt-0.5">{currentItem}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-stone-400">
            <span>
              Files: {completedFiles} / {totalFiles}
            </span>
            <span className="font-semibold text-stone-200">{percent}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-[#141211] overflow-hidden border border-white/[0.06]">
            <div
              className="h-full bg-purple-500 transition-all duration-200 rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>

          {progress && progress.total_bytes > 0 && (
            <div className="flex items-center justify-between text-[11px] text-stone-400 pt-1">
              <span>{formatBytes(progress.bytes_processed)} processed</span>
              <span>{formatBytes(progress.total_bytes)} total</span>
            </div>
          )}
        </div>

        <p className="text-[11px] text-stone-400 text-center">
          Please wait. Do not close the app or disconnect your storage device.
        </p>
      </div>
    </div>
  );
};

