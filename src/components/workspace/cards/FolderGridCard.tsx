// src/components/workspace/cards/FolderGridCard.tsx — Minimalist folder card for GridView.

import React from "react";
import { Folder, Check } from "lucide-react";
import type { VirtualFolder } from "../../../types/vault";
import { formatBytes } from "../../../services/tauri";

export interface FolderGridCardProps {
  folder: VirtualFolder;
  isSelected: boolean;
  isDragOver: boolean;
  previewHeightClass: string;
  iconSizeClass: string;
  onToggleSelect: (
    id: string,
    isFolder: boolean,
    isCheckboxClick: boolean,
    event: React.MouseEvent
  ) => void;
  onOpenFolder: (folderId: string) => void;
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

export const FolderGridCard = React.memo<FolderGridCardProps>(
  ({
    folder,
    isSelected,
    isDragOver,
    previewHeightClass,
    iconSizeClass,
    onToggleSelect,
    onOpenFolder,
    onContextMenu,
    onItemMouseDown,
  }) => {
    return (
      <div
        data-item-id={folder.id}
        data-drop-folder-id={folder.id}
        onMouseDown={(e) => {
          e.stopPropagation();
          onItemMouseDown(e, folder.id, true, folder.name);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(folder.id, true, false, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onOpenFolder(folder.id);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, "folder", folder.id, folder.name);
        }}
        className={`group relative rounded-2xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between select-none ${
          isDragOver
            ? "bg-purple-950/40 border-purple-400 ring-2 ring-purple-500/50 shadow-lg"
            : isSelected
            ? "bg-purple-950/20 border-purple-500/80 ring-2 ring-purple-500/30 shadow-md"
            : "bg-[#1a1716] border-white/[0.08] hover:bg-[#221e1d] hover:border-white/[0.14]"
        }`}
      >
        {/* Selection Checkbox */}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(folder.id, true, true, e);
          }}
          className={`absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
            isSelected
              ? "bg-purple-600 text-white border border-purple-400 opacity-100 shadow-sm"
              : "bg-[#181514]/90 border border-white/[0.14] opacity-0 group-hover:opacity-100 hover:border-purple-400"
          }`}
          title="Select folder"
        >
          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </button>

        {/* Thumbnail area */}
        <div
          className={`w-full ${previewHeightClass} rounded-xl bg-[#131110] border border-white/[0.05] flex items-center justify-center mb-2.5`}
        >
          <Folder
            className={`${iconSizeClass} text-purple-400 fill-purple-500/20 transition-transform group-hover:scale-105`}
          />
        </div>

        <div>
          <p
            className="text-xs font-semibold text-stone-100 truncate"
            title={folder.name}
          >
            {folder.name}
          </p>
          <div className="flex items-center justify-between text-[11px] text-stone-400 mt-1">
            <span className="font-mono">{formatBytes(folder.size_bytes)}</span>
            <span>
              {folder.file_count} {folder.file_count === 1 ? "file" : "files"}
            </span>
          </div>
        </div>
      </div>
    );
  }
);

FolderGridCard.displayName = "FolderGridCard";

