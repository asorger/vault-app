import React from "react";
import {
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  FileSpreadsheet,
  File as FileIcon,
  Check,
  CornerLeftUp,
} from "lucide-react";
import type { VirtualFolder, VirtualFile, GridSize } from "../../types/vault";
import { formatBytes, getVaultFileUrl } from "../../services/tauri";

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

export function getFileIcon(mimeType: string, name: string, className = "w-9 h-9") {
  const lower = name.toLowerCase();
  if (mimeType.startsWith("image/")) {
    return <FileImage className={`${className} text-emerald-400`} />;
  }
  if (mimeType.startsWith("video/") || /\.(mp4|webm|mov|mkv|avi|m4v)$/.test(lower)) {
    return <FileVideo className={`${className} text-purple-400`} />;
  }
  if (mimeType.startsWith("audio/") || /\.(mp3|wav|flac|ogg|m4a|aac)$/.test(lower)) {
    return <FileAudio className={`${className} text-pink-400`} />;
  }
  if (
    mimeType.includes("zip") ||
    mimeType.includes("compressed") ||
    /\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(lower)
  ) {
    return <FileArchive className={`${className} text-amber-400`} />;
  }
  if (
    mimeType.includes("json") ||
    mimeType.includes("javascript") ||
    mimeType.includes("xml") ||
    /\.(ts|tsx|js|jsx|py|rs|go|c|cpp|h|cs|java|html|css|sh|yaml|yml|toml|sql)$/.test(lower)
  ) {
    return <FileCode className={`${className} text-sky-400`} />;
  }
  if (mimeType.includes("csv") || /\.(csv|xls|xlsx|ods)$/.test(lower)) {
    return <FileSpreadsheet className={`${className} text-teal-400`} />;
  }
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("pdf") ||
    /\.(txt|md|pdf|doc|docx|rtf)$/.test(lower)
  ) {
    return <FileText className={`${className} text-blue-400`} />;
  }
  return <FileIcon className={`${className} text-zinc-400`} />;
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
          className={`group relative rounded-xl p-3 border transition-all cursor-pointer flex flex-col justify-between ${
            hoveredDropFolderId === "__parent__"
              ? "bg-indigo-600/25 border-indigo-400 shadow-lg ring-2 ring-indigo-500/40"
              : "bg-zinc-900/40 border-zinc-800/70 hover:bg-zinc-900/80 hover:border-zinc-700"
          }`}
          title="Double-click to go to parent folder, or drop items here to move them up"
        >
          <div
            className={`w-full ${previewHeightClass} rounded-lg bg-zinc-950/50 border border-zinc-800/50 flex items-center justify-center mb-2.5`}
          >
            <CornerLeftUp
              className={`${iconSizeClass} text-zinc-400 group-hover:text-zinc-200 transition-transform group-hover:-translate-y-0.5`}
            />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-200 truncate">..</p>
            <p className="text-xs text-zinc-500 mt-0.5">Parent Folder</p>
          </div>
        </div>
      )}

      {/* Virtual Folders */}
      {folders.map((folder) => {
        const isSelected = selectedIds.has(folder.id);
        const isDragOver = hoveredDropFolderId === folder.id;
        return (
          <div
            key={folder.id}
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
            className={`group relative rounded-xl p-3 border transition-all cursor-pointer flex flex-col justify-between ${
              isDragOver
                ? "bg-indigo-600/25 border-indigo-400 ring-2 ring-indigo-500/40"
                : isSelected
                ? "bg-indigo-600/15 border-indigo-500/60 shadow-sm"
                : "bg-zinc-900/50 border-zinc-800/70 hover:bg-zinc-900 hover:border-zinc-700/80"
            }`}
          >
            {/* Additive Checkbox */}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(folder.id, true, true, e);
              }}
              className={`absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                isSelected
                  ? "bg-indigo-600 text-white border border-indigo-400 opacity-100"
                  : "bg-zinc-900/85 border border-zinc-700 opacity-0 group-hover:opacity-100 hover:border-zinc-400"
              }`}
              title="Select item"
            >
              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </button>

            <div
              className={`w-full ${previewHeightClass} rounded-lg bg-zinc-950/60 border border-zinc-800/50 flex items-center justify-center mb-2.5`}
            >
              <Folder
                className={`${iconSizeClass} text-indigo-400 fill-indigo-500/20 transition-transform group-hover:scale-105`}
              />
            </div>

            <div>
              <p
                className="text-sm font-medium text-zinc-200 truncate"
                title={folder.name}
              >
                {folder.name}
              </p>
              <div className="flex items-center justify-between text-xs text-zinc-500 mt-0.5">
                <span className="font-mono">{formatBytes(folder.size_bytes)}</span>
                <span>
                  {folder.file_count} {folder.file_count === 1 ? "file" : "files"}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Virtual Files */}
      {files.map((file) => {
        const isSelected = selectedIds.has(file.id);
        const isImage =
          file.mime_type.startsWith("image/") && file.size_bytes < 25 * 1024 * 1024;

        return (
          <div
            key={file.id}
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
            className={`group relative rounded-xl p-3 border transition-all cursor-pointer flex flex-col justify-between ${
              isSelected
                ? "bg-indigo-600/15 border-indigo-500/60 shadow-sm"
                : "bg-zinc-900/50 border-zinc-800/70 hover:bg-zinc-900 hover:border-zinc-700/80"
            }`}
          >
            {/* Additive Checkbox */}
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect(file.id, false, true, e);
              }}
              className={`absolute top-2.5 left-2.5 z-10 w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                isSelected
                  ? "bg-indigo-600 text-white border border-indigo-400 opacity-100"
                  : "bg-zinc-900/85 border border-zinc-700 opacity-0 group-hover:opacity-100 hover:border-zinc-400"
              }`}
              title="Select item"
            >
              {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
            </button>

            <div
              className={`w-full ${previewHeightClass} rounded-lg bg-zinc-950/60 border border-zinc-800/50 flex items-center justify-center overflow-hidden mb-2.5`}
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
                  {getFileIcon(file.mime_type, file.original_name, iconSizeClass)}
                </div>
              )}
            </div>

            <div>
              <p
                className="text-sm font-medium text-zinc-200 truncate"
                title={file.original_name}
              >
                {file.original_name}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                {formatBytes(file.size_bytes)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
};
