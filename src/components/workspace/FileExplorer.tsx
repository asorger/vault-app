import React, { useState, useRef, useEffect } from "react";
import { Upload, FolderPlus, SearchX } from "lucide-react";
import type { VirtualFolder, VirtualFile, ViewMode, GridSize } from "../../types/vault";
import { GridView } from "./GridView";
import { TableView } from "./TableView";
import { Button } from "../ui/Button";

interface FileExplorerProps {
  vaultId: string;
  folders: VirtualFolder[];
  files: VirtualFile[];
  viewMode: ViewMode;
  gridSize: GridSize;
  selectedIds: Set<string>;
  searchQuery: string;
  loading: boolean;
  canGoUp: boolean;
  hoveredDropFolderId?: string | null;
  onToggleSelect: (
    id: string,
    isFolder: boolean,
    isCheckboxClick: boolean,
    event: React.MouseEvent
  ) => void;
  onSetSelectedIds: (ids: Set<string>) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onOpenFolder: (folderId: string) => void;
  onGoUp: () => void;
  onPreviewFile: (file: VirtualFile) => void;
  onContextMenu: (
    e: React.MouseEvent,
    type: "file" | "folder" | "parent" | null,
    id: string | null,
    name: string | null
  ) => void;
  onItemMouseDown: (
    e: React.MouseEvent,
    id: string,
    isFolder: boolean,
    name: string
  ) => void;
  onImportFiles: () => void;
  onNewFolder: () => void;
}

interface MarqueeBox {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({
  vaultId,
  folders,
  files,
  viewMode,
  gridSize,
  selectedIds,
  searchQuery,
  loading,
  canGoUp,
  hoveredDropFolderId,
  onToggleSelect,
  onSetSelectedIds,
  onSelectAll,
  onClearSelection,
  onOpenFolder,
  onGoUp,
  onPreviewFile,
  onContextMenu,
  onItemMouseDown,
  onImportFiles,
  onNewFolder,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<MarqueeBox | null>(null);
  const initialSelectionRef = useRef<Set<string>>(new Set());

  const isEmpty = folders.length === 0 && files.length === 0;

  useEffect(() => {
    if (!marquee) return;

    const handleMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const currentX = e.clientX - rect.left + container.scrollLeft;
      const currentY = e.clientY - rect.top + container.scrollTop;

      setMarquee((prev) =>
        prev ? { ...prev, currentX, currentY } : null
      );

      const boxLeft = Math.min(marquee.startX, currentX);
      const boxRight = Math.max(marquee.startX, currentX);
      const boxTop = Math.min(marquee.startY, currentY);
      const boxBottom = Math.max(marquee.startY, currentY);

      if (boxRight - boxLeft < 4 && boxBottom - boxTop < 4) return;

      const nextSelected = new Set<string>(initialSelectionRef.current);
      const itemNodes = container.querySelectorAll<HTMLElement>("[data-item-id]");

      itemNodes.forEach((node) => {
        const id = node.getAttribute("data-item-id");
        if (!id) return;
        const itemRect = node.getBoundingClientRect();
        const itemLeft = itemRect.left - rect.left + container.scrollLeft;
        const itemRight = itemRect.right - rect.left + container.scrollLeft;
        const itemTop = itemRect.top - rect.top + container.scrollTop;
        const itemBottom = itemRect.bottom - rect.top + container.scrollTop;

        const intersects =
          boxLeft < itemRight &&
          boxRight > itemLeft &&
          boxTop < itemBottom &&
          boxBottom > itemTop;

        if (intersects) {
          nextSelected.add(id);
        }
      });

      onSetSelectedIds(nextSelected);
    };

    const handleMouseUp = () => {
      setMarquee(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [marquee, onSetSelectedIds]);

  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const startX = e.clientX - rect.left + container.scrollLeft;
    const startY = e.clientY - rect.top + container.scrollTop;

    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      initialSelectionRef.current = new Set(selectedIds);
    } else {
      initialSelectionRef.current = new Set();
      onClearSelection();
    }

    setMarquee({
      startX,
      startY,
      currentX: startX,
      currentY: startY,
    });
  };

  if (loading && isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-y-auto select-none"
      onMouseDown={handleContainerMouseDown}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, null, null, null);
      }}
    >
      {(!isEmpty || canGoUp) &&
        (viewMode === "grid" ? (
          <GridView
            vaultId={vaultId}
            folders={folders}
            files={files}
            selectedIds={selectedIds}
            gridSize={gridSize}
            canGoUp={canGoUp}
            hoveredDropFolderId={hoveredDropFolderId}
            onToggleSelect={onToggleSelect}
            onOpenFolder={onOpenFolder}
            onGoUp={onGoUp}
            onPreviewFile={onPreviewFile}
            onContextMenu={onContextMenu}
            onItemMouseDown={onItemMouseDown}
          />
        ) : (
          <TableView
            folders={folders}
            files={files}
            selectedIds={selectedIds}
            canGoUp={canGoUp}
            hoveredDropFolderId={hoveredDropFolderId}
            onToggleSelect={onToggleSelect}
            onSelectAll={onSelectAll}
            onClearSelection={onClearSelection}
            onOpenFolder={onOpenFolder}
            onGoUp={onGoUp}
            onPreviewFile={onPreviewFile}
            onContextMenu={onContextMenu}
            onItemMouseDown={onItemMouseDown}
          />
        ))}

      {/* Empty State */}
      {isEmpty && (
        <div
          className={`flex flex-col items-center justify-center p-8 text-center ${
            canGoUp ? "mt-12" : "min-h-[75%]"
          }`}
        >
          {searchQuery.trim() ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mb-4 text-zinc-500">
                <SearchX className="w-7 h-7" />
              </div>
              <h3 className="text-base font-medium text-zinc-300 mb-1">
                No matching files or folders
              </h3>
              <p className="text-sm text-zinc-500 max-w-xs">
                No items match &ldquo;{searchQuery}&rdquo;.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-medium text-zinc-300 mb-1">
                This folder is empty
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm mb-5">
                Drag and drop files or folders here, or use the buttons below.
              </p>
              <div
                className="flex items-center gap-3"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Button variant="primary" size="md" onClick={onImportFiles}>
                  <Upload className="w-4 h-4" />
                  Import Files
                </Button>
                <Button variant="secondary" size="md" onClick={onNewFolder}>
                  <FolderPlus className="w-4 h-4" />
                  New Folder
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Rubber-band Marquee Selection Box */}
      {marquee &&
        (Math.abs(marquee.currentX - marquee.startX) > 4 ||
          Math.abs(marquee.currentY - marquee.startY) > 4) && (
          <div
            className="pointer-events-none absolute z-30 border border-indigo-400/80 bg-indigo-500/15 rounded-sm"
            style={{
              left: Math.min(marquee.startX, marquee.currentX),
              top: Math.min(marquee.startY, marquee.currentY),
              width: Math.abs(marquee.currentX - marquee.startX),
              height: Math.abs(marquee.currentY - marquee.startY),
            }}
          />
        )}
    </div>
  );
};
