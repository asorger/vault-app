// src/components/workspace/ContextMenu.tsx — Minimalist context menu with warm obsidian surfaces.

import React, { useEffect, useRef } from "react";
import {
  FolderPlus,
  Download,
  Edit3,
  Trash2,
  Eye,
  Upload,
  FolderInput,
  CornerLeftUp,
  RefreshCw,
  CheckSquare,
  LayoutGrid,
  List,
} from "lucide-react";
import type { ContextMenuState, ViewMode } from "../../types/vault";

interface ContextMenuProps {
  menu: ContextMenuState;
  selectedCount: number;
  totalCount: number;
  canGoUp: boolean;
  viewMode: ViewMode;
  onClose: () => void;
  onOpenTarget: () => void;
  onExportTarget: () => void;
  onMoveToParent: () => void;
  onGoUp: () => void;
  onRenameTarget: () => void;
  onDeleteTarget: () => void;
  onNewFolder: () => void;
  onImportFiles: () => void;
  onImportDirectory: () => void;
  onRefresh: () => void;
  onSelectAll: () => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  menu,
  selectedCount,
  totalCount,
  canGoUp,
  viewMode,
  onClose,
  onOpenTarget,
  onExportTarget,
  onMoveToParent,
  onGoUp,
  onRenameTarget,
  onDeleteTarget,
  onNewFolder,
  onImportFiles,
  onImportDirectory,
  onRefresh,
  onSelectAll,
  onViewModeChange,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (menu.visible) {
      window.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu.visible, onClose]);

  if (!menu.visible) return null;

  const clampedX = Math.min(menu.x, window.innerWidth - 248);
  const clampedY = Math.min(menu.y, window.innerHeight - 340);

  const isMultiSelect = selectedCount > 1;

  return (
    <div
      ref={menuRef}
      style={{ top: Math.max(44, clampedY), left: Math.max(8, clampedX) }}
      className="fixed z-50 w-60 rounded-2xl bg-[#1b1817]/95 backdrop-blur-md border border-white/[0.1] shadow-2xl py-1.5 text-xs text-stone-200 select-none animate-in fade-in duration-100"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {menu.targetType === "parent" ? (
        <>
          <div className="px-3.5 py-1.5 border-b border-white/[0.06] mb-1">
            <p className="text-[11px] font-medium text-stone-400 truncate">
              Parent Folder (..)
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onGoUp();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] text-purple-300 transition-colors text-left cursor-pointer"
          >
            <CornerLeftUp className="w-4 h-4 text-purple-400" />
            <span>Open Parent Folder (..)</span>
          </button>
        </>
      ) : menu.targetType ? (
        <>
          <div className="px-3.5 py-1.5 border-b border-white/[0.06] mb-1">
            <p className="text-[11px] font-medium text-stone-400 truncate">
              {isMultiSelect
                ? `${selectedCount} items selected`
                : menu.targetName}
            </p>
          </div>

          {!isMultiSelect && (
            <button
              type="button"
              onClick={() => {
                onOpenTarget();
                onClose();
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] text-purple-300 transition-colors text-left cursor-pointer"
            >
              {menu.targetType === "folder" ? (
                <>
                  <FolderInput className="w-4 h-4 text-purple-400" />
                  <span>Open Folder</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-purple-400" />
                  <span>View / Play File</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onExportTarget();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>
              {isMultiSelect
                ? `Export ${selectedCount} Items...`
                : "Export to PC..."}
            </span>
          </button>

          {canGoUp && (
            <button
              type="button"
              onClick={() => {
                onMoveToParent();
                onClose();
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <CornerLeftUp className="w-4 h-4 text-stone-400" />
              <span>Move to Parent Folder (..)</span>
            </button>
          )}

          {!isMultiSelect && (
            <button
              type="button"
              onClick={() => {
                onRenameTarget();
                onClose();
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <Edit3 className="w-4 h-4 text-stone-400" />
              <span>Rename</span>
            </button>
          )}

          <div className="my-1 border-t border-white/[0.06]" />

          <button
            type="button"
            onClick={() => {
              onDeleteTarget();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 transition-colors text-left cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>
              {isMultiSelect ? `Delete ${selectedCount} Items` : "Delete"}
            </span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              onImportFiles();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
          >
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>Import Files...</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onImportDirectory();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
          >
            <FolderInput className="w-4 h-4 text-emerald-400" />
            <span>Import Folder...</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onNewFolder();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
          >
            <FolderPlus className="w-4 h-4 text-purple-400" />
            <span>New Folder</span>
          </button>

          <div className="my-1 border-t border-white/[0.06]" />

          {totalCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onSelectAll();
                onClose();
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
            >
              <CheckSquare className="w-4 h-4 text-stone-400" />
              <span>Select All ({totalCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onRefresh();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
          >
            <RefreshCw className="w-4 h-4 text-stone-400" />
            <span>Refresh Folder</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onViewModeChange(viewMode === "grid" ? "table" : "grid");
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
          >
            {viewMode === "grid" ? (
              <>
                <List className="w-4 h-4 text-stone-400" />
                <span>Switch to List View</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-4 h-4 text-stone-400" />
                <span>Switch to Grid View</span>
              </>
            )}
          </button>

          {canGoUp && (
            <>
              <div className="my-1 border-t border-white/[0.06]" />
              <button
                type="button"
                onClick={() => {
                  onGoUp();
                  onClose();
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
              >
                <CornerLeftUp className="w-4 h-4 text-stone-400" />
                <span>Go to Parent Folder (..)</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
};
