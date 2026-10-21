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
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-zinc-950/85 backdrop-blur-md p-8 animate-fade-in">
      <div
        className={`w-full h-full max-w-4xl max-h-[520px] rounded-2xl border-2 border-dashed ${
          willShred
            ? "border-amber-500/70 bg-amber-950/15 shadow-[0_0_60px_rgba(245,158,11,0.15)]"
            : "border-indigo-500/70 bg-indigo-950/15 shadow-[0_0_60px_rgba(99,102,241,0.15)]"
        } flex flex-col items-center justify-center text-center p-10 transition-all`}
      >
        <div
          className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-6 ${
            willShred
              ? "bg-amber-500/15 border border-amber-500/40 text-amber-400"
              : "bg-indigo-500/15 border border-indigo-500/40 text-indigo-400"
          }`}
        >
          {willShred ? (
            <Flame className="w-10 h-10 animate-pulse" />
          ) : (
            <UploadCloud className="w-10 h-10 animate-bounce" />
          )}
        </div>

        <h2 className="text-2xl font-semibold text-zinc-100 tracking-tight mb-2">
          {willShred
            ? `Drop to Import & Delete Originals into "${currentFolderName}"`
            : `Drop to Import into "${currentFolderName}"`}
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mb-6">
          {willShred
            ? "Original files on your computer will be permanently shredded after import."
            : "Hold Shift while dropping to also shred original files on your computer."}
        </p>

        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border ${
            willShred
              ? "bg-amber-950/60 border-amber-500/40 text-amber-300"
              : "bg-zinc-900/90 border-zinc-800 text-zinc-300"
          }`}
        >
          {willShred ? (
            <>
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Shred Original Files: Active {isShiftPressed && !shredOriginals ? "(Shift held)" : ""}</span>
            </>
          ) : (
            <span>Original files will be kept on your computer</span>
          )}
        </div>
      </div>
    </div>
  );
};
