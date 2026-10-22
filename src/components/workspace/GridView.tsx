// src/components/workspace/GridView.tsx — Responsive grid view for vault folders and files.

import React from "react";
import { CornerLeftUp } from "lucide-react";
import type { VirtualFolder, VirtualFile, GridSize } from "../../types/vault";
import { FolderGridCard } from "./cards/FolderGridCard";
import { FileGridCard } from "./cards/FileGridCard";
import { getFileIcon as getSharedFileIcon } from "../../utils/fileIcons";

// Re-export getFileIcon for backwards compatibility
export const getFileIcon = (mimeType: string, name: string, className = "w-9 h-9") =>
  getSharedFileIcon(mimeType, name, { className });

interface GridViewProps {
  vaultId: string;
  folders: VirtualFolder[];
  files: VirtualFile[];
  selectedIds: Set<string>;
  gridSize: GridSize;
  canGoUp: boolean;
  hoveredDropFolderId?: string | null;
  onToggleSelect: (
    id: string,
    isFolder: boolean,
    isCheckboxClick: boolean,
    event: React.MouseEvent
  ) => void;
  onOpenFolder: (folderId: string) => void;
  onGoUp: () => void;
  onPreviewFile: (file: VirtualFile) => void;
  onContextMenu: (
    e: React.MouseEvent,
    type: "file" | "folder" | "parent",
    id: string,
    name: string
  ) => void;
  onItemMouseDown: (
    e: React.MouseEvent,
    id: string,
    isFolder: boolean,
    name: string
  ) => void;
}

export const GridView: React.FC<GridViewProps> = ({
  vaultId,
  folders,
  files,
  selectedIds,
  gridSize,
  canGoUp,
  hoveredDropFolderId,
  onToggleSelect,
  onOpenFolder,
  onGoUp,
  onPreviewFile,
  onContextMenu,
  onItemMouseDown,
}) => {
  const gridTemplateClass =
    gridSize === "sm"
      ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2.5"
      : gridSize === "lg"
      ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4"
      : "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3.5";

  const previewHeightClass =
    gridSize === "sm" ? "h-20" : gridSize === "lg" ? "h-36" : "h-28";

  const iconSizeClass =
    gridSize === "sm" ? "w-8 h-8" : gridSize === "lg" ? "w-14 h-14" : "w-11 h-11";

  return (
    <div className={`grid ${gridTemplateClass} p-4 select-none`}>
      {/* ".." Parent Directory Card */}
      {canGoUp && (
        <div
          data-drop-folder-id="__parent__"
          onMouseDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onGoUp();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, "parent", "__parent__", "..");
          }}
          className={`group relative rounded-2xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between ${
            hoveredDropFolderId === "__parent__"
              ? "bg-purple-950/40 border-purple-400 shadow-lg ring-2 ring-purple-500/50"
              : "bg-[#1a1716] border-white/[0.08] hover:bg-[#221e1d] hover:border-white/[0.14]"
          }`}
          title="Double-click to go to parent folder, or drop items here to move them up"
        >
          <div
            className={`w-full ${previewHeightClass} rounded-xl bg-[#131110] border border-white/[0.05] flex items-center justify-center mb-2.5`}
          >
            <CornerLeftUp
              className={`${iconSizeClass} text-stone-400 group-hover:text-stone-200 transition-transform group-hover:-translate-y-0.5`}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-stone-100 truncate">..</p>
            <p className="text-[11px] text-stone-400 mt-0.5">Parent Folder</p>
          </div>
        </div>
      )}

      {/* Virtual Folders */}
      {folders.map((folder) => (
        <FolderGridCard
          key={folder.id}
          folder={folder}
          isSelected={selectedIds.has(folder.id)}
          isDragOver={hoveredDropFolderId === folder.id}
          previewHeightClass={previewHeightClass}
          iconSizeClass={iconSizeClass}
          onToggleSelect={onToggleSelect}
          onOpenFolder={onOpenFolder}
          onContextMenu={onContextMenu}
          onItemMouseDown={onItemMouseDown}
        />
      ))}

      {/* Virtual Files */}
      {files.map((file) => (
        <FileGridCard
          key={file.id}
          file={file}
          vaultId={vaultId}
          isSelected={selectedIds.has(file.id)}
          previewHeightClass={previewHeightClass}
          iconSizeClass={iconSizeClass}
          onToggleSelect={onToggleSelect}
          onPreviewFile={onPreviewFile}
          onContextMenu={onContextMenu}
          onItemMouseDown={onItemMouseDown}
        />
      ))}
    </div>
  );
};
