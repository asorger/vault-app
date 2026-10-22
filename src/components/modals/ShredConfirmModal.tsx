// src/components/modals/ShredConfirmModal.tsx — Confirmation modal for shredding original host files.

import React, { useState, useEffect } from "react";
import { Flame, X } from "lucide-react";
import { Button } from "../ui/Button";

interface ShredConfirmModalProps {
  open: boolean;
  paths: string[];
  onCancel: () => void;
  onImportKeepOriginals: () => Promise<void>;
  onImportAndShred: () => Promise<void>;
}

export const ShredConfirmModal: React.FC<ShredConfirmModalProps> = ({
  open,
  paths,
  onCancel,
  onImportKeepOriginals,
  onImportAndShred,
}) => {
  const [loadingMode, setLoadingMode] = useState<"shred" | "keep" | null>(null);

  useEffect(() => {
    if (!open) {
      setLoadingMode(null);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loadingMode) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loadingMode, onCancel]);

  if (!open || paths.length === 0) return null;

  const fileNames = paths.map(
    (p) => p.split(/[/\\]/).filter(Boolean).pop() || p
  );

  const handleShred = async () => {
    setLoadingMode("shred");
    try {
      await onImportAndShred();
    } finally {
      setLoadingMode(null);
    }
  };

  const handleKeep = async () => {
    setLoadingMode("keep");
    try {
      await onImportKeepOriginals();
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-stone-100">
              Delete Original {paths.length === 1 ? "File" : "Files"} Forever?
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loadingMode !== null}
            className="text-stone-400 hover:text-stone-200 transition-colors p-1 rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-300 leading-relaxed">
            Do you want to permanently delete{" "}
            {paths.length === 1 ? (
              <span className="font-semibold text-stone-100">
                &ldquo;{fileNames[0]}&rdquo;
              </span>
            ) : (
              <span className="font-semibold text-stone-100">
                {paths.length} items
              </span>
            )}{" "}
            from your computer after importing into this vault? Deleted original
            files cannot be recovered.
          </p>

          {paths.length > 1 && (
            <div className="max-h-28 overflow-y-auto rounded-xl bg-[#141211] border border-white/[0.06] px-3.5 py-2.5 text-xs font-mono text-stone-400 space-y-1">
              {fileNames.map((name, idx) => (
                <div key={idx} className="truncate">
                  • {name}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={loadingMode !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={loadingMode === "keep"}
              disabled={loadingMode !== null}
              onClick={handleKeep}
            >
              Import Only (Keep Originals)
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={loadingMode === "shred"}
              disabled={loadingMode !== null}
              onClick={handleShred}
            >
              Import & Delete Forever
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

