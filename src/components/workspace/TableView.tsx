// src/components/workspace/TableView.tsx — Minimalist table/list view for folders and files.

import React, { useState, useMemo, useRef } from "react";
import {
  Folder,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  Minus,
  CornerLeftUp,
} from "lucide-react";
import type { VirtualFolder, VirtualFile } from "../../types/vault";
import { formatBytes, formatDate } from "../../services/tauri";
import { getFileIcon } from "../../utils/fileIcons";

interface TableViewProps {
  folders: VirtualFolder[];
  files: VirtualFile[];
  selectedIds: Set<string>;
  canGoUp: boolean;
  hoveredDropFolderId?: string | null;
  onToggleSelect: (
    id: string,
    isFolder: boolean,
    isCheckboxClick: boolean,
    event: React.MouseEvent
  ) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
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

type SortKey = "name" | "size" | "type" | "created_at";
type SortDir = "asc" | "desc";

interface FolderTableRowProps {
  folder: VirtualFolder;
  isSelected: boolean;
  isDragOver: boolean;
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

const FolderTableRow = React.memo<FolderTableRowProps>(({
  folder,
  isSelected,
  isDragOver,
  onToggleSelect,
  onOpenFolder,
  onContextMenu,
  onItemMouseDown,
}) => {
  return (
    <tr
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
      className={`group cursor-pointer transition-colors ${
        isDragOver
          ? "bg-purple-950/40"
          : isSelected
          ? "bg-purple-950/20 hover:bg-purple-950/25"
          : "hover:bg-white/[0.04]"
      }`}
    >
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(folder.id, true, true, e);
          }}
          className={`w-4.5 h-4.5 rounded-lg flex items-center justify-center mx-auto transition-colors cursor-pointer ${
            isSelected
              ? "bg-purple-600 text-white border border-purple-400"
              : "bg-[#181514] border border-white/[0.12] hover:border-purple-400"
          }`}
        >
          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
        </button>
      </td>
      <td className="py-2.5 px-3 truncate">
        <div className="flex items-center gap-3 truncate">
          <Folder className="w-4.5 h-4.5 text-purple-400 fill-purple-500/20 shrink-0" />
          <span className="font-medium text-stone-100 truncate text-xs" title={folder.name}>
            {folder.name}
          </span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-xs text-stone-400 truncate">
        Folder ({folder.file_count} {folder.file_count === 1 ? "file" : "files"})
      </td>
      <td className="py-2.5 px-3 text-xs text-stone-400 font-mono truncate">
        {formatBytes(folder.size_bytes)}
      </td>
      <td className="py-2.5 px-4 text-xs text-stone-400 truncate">
        {formatDate(folder.created_at)}
      </td>
    </tr>
  );
});

FolderTableRow.displayName = "FolderTableRow";

interface FileTableRowProps {
  file: VirtualFile;
  isSelected: boolean;
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

const FileTableRow = React.memo<FileTableRowProps>(({
  file,
  isSelected,
  onToggleSelect,
  onPreviewFile,
  onContextMenu,
  onItemMouseDown,
}) => {
  return (
    <tr
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
      className={`group cursor-pointer transition-colors ${
        isSelected
          ? "bg-purple-950/20 hover:bg-purple-950/25"
          : "hover:bg-white/[0.04]"
      }`}
    >
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(file.id, false, true, e);
          }}
          className={`w-4.5 h-4.5 rounded-lg flex items-center justify-center mx-auto transition-colors cursor-pointer ${
            isSelected
              ? "bg-purple-600 text-white border border-purple-400"
              : "bg-[#181514] border border-white/[0.12] hover:border-purple-400"
          }`}
        >
          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
        </button>
      </td>
      <td className="py-2.5 px-3 truncate">
        <div className="flex items-center gap-3 truncate">
          <div className="shrink-0">
            {getFileIcon(file.mime_type, file.original_name, {
              className: "w-4.5 h-4.5",
            })}
          </div>
          <span className="font-medium text-stone-100 truncate text-xs" title={file.original_name}>
            {file.original_name}
          </span>
        </div>
      </td>
      <td className="py-2.5 px-3 text-xs text-stone-400 font-mono truncate">
        {file.mime_type}
      </td>
      <td className="py-2.5 px-3 text-xs text-stone-400 font-mono truncate">
        {formatBytes(file.size_bytes)}
      </td>
      <td className="py-2.5 px-4 text-xs text-stone-400 truncate">
        {formatDate(file.created_at)}
      </td>
    </tr>
  );
});

FileTableRow.displayName = "FileTableRow";

export const TableView: React.FC<TableViewProps> = ({
  folders,
  files,
  selectedIds,
  canGoUp,
  hoveredDropFolderId,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onOpenFolder,
  onGoUp,
  onPreviewFile,
  onContextMenu,
  onItemMouseDown,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [colWidths, setColWidths] = useState({
    name: 440,
    type: 190,
    size: 130,
    created_at: 190,
  });

  const resizingCol = useRef<{
    col: keyof typeof colWidths;
    startX: number;
    startWidth: number;
  } | null>(null);

  const startResize = (
    e: React.MouseEvent,
    col: keyof typeof colWidths
  ) => {
    e.preventDefault();
    e.stopPropagation();
    resizingCol.current = {
      col,
      startX: e.clientX,
      startWidth: colWidths[col],
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = moveEvent.clientX - resizingCol.current.startX;
      const nextWidth = Math.max(90, resizingCol.current.startWidth + delta);
      setColWidths((prev) => ({
        ...prev,
        [resizingCol.current!.col]: nextWidth,
      }));
    };

    const handleMouseUp = () => {
      resizingCol.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortedFolders = useMemo(() => {
    const copy = [...folders];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name" || sortKey === "type") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortKey === "size") {
        cmp = a.size_bytes - b.size_bytes;
      } else {
        cmp = a.created_at.localeCompare(b.created_at);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [folders, sortKey, sortDir]);

  const sortedFiles = useMemo(() => {
    const copy = [...files];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.original_name.localeCompare(b.original_name);
      else if (sortKey === "size") cmp = a.size_bytes - b.size_bytes;
      else if (sortKey === "type") cmp = a.mime_type.localeCompare(b.mime_type);
      else cmp = a.created_at.localeCompare(b.created_at);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [files, sortKey, sortDir]);

  const totalCount = folders.length + files.length;
  const allSelected = totalCount > 0 && selectedIds.size === totalCount;
  const someSelected = selectedIds.size > 0 && selectedIds.size < totalCount;

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3.5 h-3.5 text-stone-500" />;
    return sortDir === "asc" ? (
      <ArrowUp className="w-3.5 h-3.5 text-purple-400" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-purple-400" />
    );
  };

  return (
    <div className="w-full overflow-x-auto select-none">
      <table
        className="w-full text-left border-collapse"
        style={{ tableLayout: "fixed", minWidth: 700 }}
      >
        <thead className="sticky top-0 z-10 bg-[#161312]/95 backdrop-blur-md border-b border-white/[0.06] text-xs font-medium text-stone-400">
          <tr>
            {/* Master Select All Checkbox */}
            <th className="w-11 px-3 py-3 text-center">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (allSelected) onClearSelection();
                  else onSelectAll();
                }}
                className={`w-4.5 h-4.5 rounded-lg flex items-center justify-center mx-auto transition-colors cursor-pointer ${
                  allSelected || someSelected
                    ? "bg-purple-600 text-white border border-purple-400"
                    : "bg-[#181514] border border-white/[0.12] hover:border-purple-400"
                }`}
                title={allSelected ? "Deselect all" : "Select all"}
              >
                {allSelected ? (
                  <Check className="w-3 h-3 stroke-[3]" />
                ) : someSelected ? (
                  <Minus className="w-3 h-3 stroke-[3]" />
                ) : null}
              </button>
            </th>

            {/* Name Column */}
            <th
              style={{ width: colWidths.name }}
              className="relative py-3 px-3 cursor-pointer hover:text-stone-200 transition-colors"
              onClick={() => toggleSort("name")}
            >
              <div className="flex items-center gap-1.5">
                <span>Name</span>
                {renderSortIcon("name")}
              </div>
              <div
                onMouseDown={(e) => startResize(e, "name")}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-purple-500/50 transition-colors"
                title="Drag to resize column"
              />
            </th>

            {/* Type Column */}
            <th
              style={{ width: colWidths.type }}
              className="relative py-3 px-3 cursor-pointer hover:text-stone-200 transition-colors"
              onClick={() => toggleSort("type")}
            >
              <div className="flex items-center gap-1.5">
                <span>Type</span>
                {renderSortIcon("type")}
              </div>
              <div
                onMouseDown={(e) => startResize(e, "type")}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-purple-500/50 transition-colors"
                title="Drag to resize column"
              />
            </th>

            {/* Size Column */}
            <th
              style={{ width: colWidths.size }}
              className="relative py-3 px-3 cursor-pointer hover:text-stone-200 transition-colors"
              onClick={() => toggleSort("size")}
            >
              <div className="flex items-center gap-1.5">
                <span>Size</span>
                {renderSortIcon("size")}
              </div>
              <div
                onMouseDown={(e) => startResize(e, "size")}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-purple-500/50 transition-colors"
                title="Drag to resize column"
              />
            </th>

            {/* Created Column */}
            <th
              style={{ width: colWidths.created_at }}
              className="relative py-3 px-4 cursor-pointer hover:text-stone-200 transition-colors"
              onClick={() => toggleSort("created_at")}
            >
              <div className="flex items-center gap-1.5">
                <span>Date Added</span>
                {renderSortIcon("created_at")}
              </div>
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-white/[0.04] text-xs">
          {/* ".." Parent Directory Row */}
          {canGoUp && (
            <tr
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
              className={`group cursor-pointer transition-colors ${
                hoveredDropFolderId === "__parent__"
                  ? "bg-purple-950/40"
                  : "hover:bg-white/[0.04]"
              }`}
              title="Double-click to go to parent folder, or drop items here to move them up"
            >
              <td className="px-3 py-2 text-center" />
              <td className="py-2.5 px-3">
                <div className="flex items-center gap-3">
                  <CornerLeftUp className="w-4.5 h-4.5 text-stone-400 shrink-0" />
                  <span className="font-semibold text-stone-200">..</span>
                </div>
              </td>
              <td className="py-2.5 px-3 text-xs text-stone-400">Parent Folder</td>
              <td className="py-2.5 px-3 text-xs text-stone-500 font-mono">—</td>
              <td className="py-2.5 px-4 text-xs text-stone-500">—</td>
            </tr>
          )}

          {/* Folders */}
          {sortedFolders.map((folder) => (
            <FolderTableRow
              key={folder.id}
              folder={folder}
              isSelected={selectedIds.has(folder.id)}
              isDragOver={hoveredDropFolderId === folder.id}
              onToggleSelect={onToggleSelect}
              onOpenFolder={onOpenFolder}
              onContextMenu={onContextMenu}
              onItemMouseDown={onItemMouseDown}
            />
          ))}

          {/* Files */}
          {sortedFiles.map((file) => (
            <FileTableRow
              key={file.id}
              file={file}
              isSelected={selectedIds.has(file.id)}
              onToggleSelect={onToggleSelect}
              onPreviewFile={onPreviewFile}
              onContextMenu={onContextMenu}
              onItemMouseDown={onItemMouseDown}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};
