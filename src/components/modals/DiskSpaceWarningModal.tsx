// src/components/modals/DiskSpaceWarningModal.tsx — Minimalist modal for insufficient disk space.

import React, { useEffect } from "react";
import { HardDrive, X } from "lucide-react";
import { Button } from "../ui/Button";
import { formatBytes } from "../../services/tauri";

interface DiskSpaceWarningModalProps {
  open: boolean;
  errorMessage: string;
  onClose: () => void;
}

export const DiskSpaceWarningModal: React.FC<DiskSpaceWarningModalProps> = ({
  open,
  errorMessage,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const reqMatch = errorMessage.match(/required_bytes=(\d+)/);
  const availMatch = errorMessage.match(/available_bytes=(\d+)/);
  const requiredBytes = reqMatch ? Number(reqMatch[1]) : null;
  const availableBytes = availMatch ? Number(availMatch[1]) : null;
  const shortfallBytes =
    requiredBytes !== null &&
    availableBytes !== null &&
    requiredBytes > availableBytes
      ? requiredBytes - availableBytes
      : null;

  const cleanMessage = errorMessage.replace(/\s*\(required_bytes=.*\)$/, "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-semibold text-stone-100">
              Not Enough Disk Space
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 transition-colors p-1 rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-300 leading-relaxed">
            There is not enough free space on the target drive to complete this
            operation. No files were imported or modified.
          </p>

          {requiredBytes !== null && availableBytes !== null ? (
            <div className="rounded-xl bg-[#141211] border border-white/[0.06] p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-stone-400">Required Space</span>
                <span className="font-mono font-semibold text-stone-100">
                  {formatBytes(requiredBytes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-stone-400">Available on Drive</span>
                <span className="font-mono font-semibold text-amber-400">
                  {formatBytes(availableBytes)}
                </span>
              </div>
              {shortfallBytes !== null && (
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-rose-300 font-medium">
                    Additional Space Needed
                  </span>
                  <span className="font-mono font-semibold text-rose-400">
                    {formatBytes(shortfallBytes)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-rose-950/40 border border-rose-800/50 p-3.5 text-xs text-rose-200">
              {cleanMessage}
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <Button type="button" variant="primary" onClick={onClose}>
              Understood
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

