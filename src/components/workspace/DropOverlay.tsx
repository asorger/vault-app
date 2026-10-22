// src/components/workspace/DropOverlay.tsx — Minimalist drop overlay with warm dark styling.

import React from "react";
import { UploadCloud, Flame } from "lucide-react";

interface DropOverlayProps {
  visible: boolean;
  shredOriginals: boolean;
  isShiftPressed: boolean;
  currentFolderName: string;
}

export const DropOverlay: React.FC<DropOverlayProps> = ({
  visible,
  shredOriginals,
  isShiftPressed,
  currentFolderName,
}) => {
  if (!visible) return null;

  const willShred = shredOriginals || isShiftPressed;

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/80 backdrop-blur-md p-8 animate-in fade-in duration-150">
      <div
        className={`w-full h-full max-w-4xl max-h-[520px] rounded-3xl border-2 border-dashed ${
          willShred
            ? "border-amber-500/70 bg-amber-950/20 shadow-[0_0_80px_rgba(245,158,11,0.15)]"
            : "border-purple-500/70 bg-purple-950/20 shadow-[0_0_80px_rgba(168,85,247,0.18)]"
        } flex flex-col items-center justify-center text-center p-10 transition-all select-none`}
      >
        <div
          className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-6 ${
            willShred
              ? "bg-amber-500/15 border border-amber-500/40 text-amber-400"
              : "bg-purple-500/15 border border-purple-500/40 text-purple-400"
          }`}
        >
          {willShred ? (
            <Flame className="w-10 h-10 animate-pulse" />
          ) : (
            <UploadCloud className="w-10 h-10 animate-bounce" />
          )}
        </div>

        <h2 className="text-2xl font-bold text-stone-100 tracking-tight mb-2">
          {willShred
            ? `Drop to Import & Delete Originals into "${currentFolderName}"`
            : `Drop to Import into "${currentFolderName}"`}
        </h2>
        <p className="text-sm text-stone-400 max-w-md mb-6 leading-relaxed">
          {willShred
            ? "Original files on your computer will be permanently deleted after import."
            : "Hold Shift while dropping to also delete original files on your computer."}
        </p>

        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold border ${
            willShred
              ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
              : "bg-[#1b1817] border-white/[0.1] text-stone-300"
          }`}
        >
          {willShred ? (
            <>
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Delete Original Files: Active{" "}
                {isShiftPressed && !shredOriginals ? "(Shift held)" : ""}
              </span>
            </>
          ) : (
            <span>Original files will be kept on your computer</span>
          )}
        </div>
      </div>
    </div>
  );
};
