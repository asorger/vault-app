// src/components/workspace/FloatingActionBar.tsx — Sleek contextual floating capsule for selected items.

import React from "react";
import { Download, Trash2, X } from "lucide-react";
import { Button } from "../ui/Button";

interface FloatingActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onExportSelected: () => void;
  onDeleteSelected: () => void;
}

export const FloatingActionBar: React.FC<FloatingActionBarProps> = ({
  selectedCount,
  onClearSelection,
  onExportSelected,
  onDeleteSelected,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-full bg-[#1b1817]/95 backdrop-blur-md border border-white/[0.12] shadow-2xl shadow-black/60 animate-in fade-in slide-in-from-bottom-3 duration-150 select-none">
      {/* Selected Count Indicator */}
      <div className="flex items-center gap-2 pl-1 pr-2 border-r border-white/[0.08]">
        <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
        <span className="text-xs font-semibold text-stone-100">
          {selectedCount} {selectedCount === 1 ? "item" : "items"}
        </span>
      </div>

      {/* Export Button */}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        pill
        icon={<Download className="w-3.5 h-3.5 text-emerald-400" />}
        onClick={onExportSelected}
      >
        Export
      </Button>

      {/* Delete Button */}
      <Button
        type="button"
        variant="danger"
        size="sm"
        pill
        icon={<Trash2 className="w-3.5 h-3.5 text-rose-400" />}
        onClick={onDeleteSelected}
      >
        Delete
      </Button>

      {/* Clear / Dismiss Button */}
      <button
        type="button"
        onClick={onClearSelection}
        className="p-1 rounded-full text-stone-400 hover:text-stone-100 hover:bg-white/[0.08] transition-colors cursor-pointer ml-1"
        title="Clear selection (Esc)"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
