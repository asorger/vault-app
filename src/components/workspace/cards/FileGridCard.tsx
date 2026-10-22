// src/components/workspace/cards/FileGridCard.tsx — Minimalist file card for GridView.

import React from "react";
import { Check } from "lucide-react";
import type { VirtualFile } from "../../../types/vault";
import { formatBytes, getVaultFileUrl } from "../../../services/tauri";
import { getFileIcon } from "../../../utils/fileIcons";

export interface FileGridCardProps {
  file: VirtualFile;
  vaultId: string;
  isSelected: boolean;
  previewHeightClass: string;
  iconSizeClass: string;
  onToggleSelect: (
    id: string,
    isFolder: boolean,
    isCheckboxClick: boolean,
    event: React.MouseEvent
  ) => void;
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

export const FileGridCard = React.memo<FileGridCardProps>(
  ({
    file,
    vaultId,
    isSelected,
    previewHeightClass,
    iconSizeClass,
    onToggleSelect,
    onPreviewFile,
    onContextMenu,
    onItemMouseDown,
  }) => {
    const isImage =
      file.mime_type.startsWith("image/") && file.size_bytes < 25 * 1024 * 1024;

    return (
      <div
        data-item-id={file.id}
        onMouseDown={(e) => {
          e.stopPropagation();
          onItemMouseDown(e, file.id, false, file.original_name);
        }}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect(file.id, false, false, e);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onPreviewFile(file);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, "file", file.id, file.original_name);
        }}
        className={`group relative rounded-2xl p-3.5 border transition-all cursor-pointer flex flex-col justify-between select-none ${
          isSelected
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
            onToggleSelect(file.id, false, true, e);
          }}
          className={`absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
            isSelected
              ? "bg-purple-600 text-white border border-purple-400 opacity-100 shadow-sm"
              : "bg-[#181514]/90 border border-white/[0.14] opacity-0 group-hover:opacity-100 hover:border-purple-400"
          }`}
          title="Select item"
        >
          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </button>

        {/* Thumbnail Preview Area */}
        <div
          className={`w-full ${previewHeightClass} rounded-xl bg-[#131110] border border-white/[0.05] flex items-center justify-center overflow-hidden mb-2.5`}
        >
          {isImage ? (
            <img
              src={getVaultFileUrl(vaultId, file.id)}
              alt={file.original_name}
              loading="lazy"
              draggable={false}
              className="w-full h-full object-cover transition-transform group-hover:scale-105"
            />
          ) : (
            <div className="transition-transform group-hover:scale-105">
              {getFileIcon(file.mime_type, file.original_name, {
                className: iconSizeClass,
              })}
            </div>
          )}
        </div>

        <div>
          <p
            className="text-xs font-semibold text-stone-100 truncate"
            title={file.original_name}
          >
            {file.original_name}
          </p>
          <p className="text-[11px] text-stone-400 mt-1 font-mono">
            {formatBytes(file.size_bytes)}
          </p>
        </div>
      </div>
    );
  }
);

FileGridCard.displayName = "FileGridCard";

