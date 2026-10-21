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
      className="fixed z-50 w-60 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl py-1.5 text-sm text-zinc-200 select-none"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {menu.targetType === "parent" ? (
        <>
          <div className="px-3 py-1.5 border-b border-zinc-800/80 mb-1">
            <p className="text-xs font-medium text-zinc-400 truncate">
              Parent Folder (..)
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onGoUp();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-indigo-600/20 hover:text-indigo-300 transition-colors text-left"
          >
            <CornerLeftUp className="w-4 h-4 text-indigo-400" />
            <span>Open Parent Folder (..)</span>
          </button>
        </>
      ) : menu.targetType ? (
        <>
          <div className="px-3 py-1.5 border-b border-zinc-800/80 mb-1">
            <p className="text-xs font-medium text-zinc-400 truncate">
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
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-indigo-600/20 hover:text-indigo-300 transition-colors text-left"
            >
              {menu.targetType === "folder" ? (
                <>
                  <FolderInput className="w-4 h-4 text-indigo-400" />
                  <span>Open Folder</span>
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4 text-indigo-400" />
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
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
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
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
            >
              <CornerLeftUp className="w-4 h-4 text-zinc-400" />
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
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
            >
              <Edit3 className="w-4 h-4 text-zinc-400" />
              <span>Rename</span>
            </button>
          )}

          <div className="my-1 border-t border-zinc-800/80" />

          <button
            type="button"
            onClick={() => {
              onDeleteTarget();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 text-red-400 hover:bg-red-950/50 hover:text-red-300 transition-colors text-left"
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
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
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
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
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
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
          >
            <FolderPlus className="w-4 h-4 text-indigo-400" />
            <span>New Folder</span>
          </button>

          <div className="my-1 border-t border-zinc-800/80" />

          {totalCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onSelectAll();
                onClose();
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
            >
              <CheckSquare className="w-4 h-4 text-zinc-400" />
              <span>Select All ({totalCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              onRefresh();
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
          >
            <RefreshCw className="w-4 h-4 text-zinc-400" />
            <span>Refresh Folder</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onViewModeChange(viewMode === "grid" ? "table" : "grid");
              onClose();
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
          >
            {viewMode === "grid" ? (
              <>
                <List className="w-4 h-4 text-zinc-400" />
                <span>Switch to List View</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-4 h-4 text-zinc-400" />
                <span>Switch to Grid View</span>
              </>
            )}
          </button>

          {canGoUp && (
            <>
              <div className="my-1 border-t border-zinc-800/80" />
              <button
                type="button"
                onClick={() => {
                  onGoUp();
                  onClose();
                }}
                className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
              >
                <CornerLeftUp className="w-4 h-4 text-zinc-400" />
                <span>Go to Parent Folder (..)</span>
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
};
