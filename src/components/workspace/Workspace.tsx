// src/components/workspace/Workspace.tsx — Streamlined, minimalist vault workspace coordinator.

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { AlertCircle, X, FolderInput } from "lucide-react";
import type {
  VaultInfo,
  DirectoryListing,
  SearchResults,
  ViewMode,
  GridSize,
  ContextMenuState,
  VirtualFile,
  ItemIdentifier,
  TransferProgressPayload,
  CompressionProgressPayload,
} from "../../types/vault";
import {
  listDirectory,
  searchVault,
  createVirtualFolder,
  renameVirtualItem,
  deleteVirtualItems,
  moveVirtualItems,
  ingestOsPaths,
  exportVirtualItems,
  startOsDragExport,
  lockVaultInstance,
  checkIsVaultPath,
  getVaultCompression,
  setVaultCompression,
} from "../../services/tauri";
import { useNativeDragDrop } from "../../hooks/useNativeDragDrop";
import { useWorkspaceNavigation } from "../../hooks/useWorkspaceNavigation";
import { useWorkspaceSelection } from "../../hooks/useWorkspaceSelection";
import { UnifiedHeader } from "./UnifiedHeader";
import { FloatingActionBar } from "./FloatingActionBar";
import { FileExplorer } from "./FileExplorer";
import { DropOverlay } from "./DropOverlay";
import { ContextMenu } from "./ContextMenu";
import { VaultSettingsModal } from "./VaultSettingsModal";
import {
  NamePromptModal,
  DeleteConfirmModal,
  ShredConfirmModal,
  DiskSpaceWarningModal,
  PreviewModal,
  CompressionConfirmModal,
  CompressionProgressModal,
} from "../modals";

interface WorkspaceProps {
  vaultInfo: VaultInfo;
  isActive: boolean;
  onCloseVault: (vaultId: string) => void;
  onOpenDroppedVault?: (vaultPath: string) => void;
}

interface PointerDragState {
  ids: string[];
  label: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  active: boolean;
  hoveredFolderId: string | null;
}

export const Workspace: React.FC<WorkspaceProps> = ({
  vaultInfo,
  isActive,
  onCloseVault,
  onOpenDroppedVault,
}) => {
  // Navigation hook
  const {
    currentFolderId,
    canGoBack,
    canGoForward,
    navigateTo: navigateToFolder,
    goBack,
    goForward,
  } = useWorkspaceNavigation(null);

  const [listing, setListing] = useState<DirectoryListing>({
    current_folder_id: null,
    breadcrumbs: [{ id: null, name: vaultInfo.name }],
    folders: [],
    files: [],
  });
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [skippedWarning, setSkippedWarning] = useState<string | null>(null);
  const [diskSpaceError, setDiskSpaceError] = useState<string | null>(null);

  const reportError = useCallback((err: unknown) => {
    const msg = String(err);
    if (msg.includes("Insufficient disk space")) {
      setDiskSpaceError(msg);
    } else {
      setErrorBanner(msg);
    }
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [gridSize, setGridSize] = useState<GridSize>("md");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [shredOriginals, setShredOriginals] = useState(false);
  const [isCompressed, setIsCompressed] = useState<boolean>(
    vaultInfo.is_compressed ?? false
  );
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isCompressionConfirmOpen, setIsCompressionConfirmOpen] =
    useState(false);
  const [targetCompressionState, setTargetCompressionState] = useState(false);
  const [compressionProgress, setCompressionProgress] =
    useState<CompressionProgressPayload | null>(null);

  // Custom Pointer Drag state (internal move or edge OS drag)
  const [pointerDrag, setPointerDrag] = useState<PointerDragState | null>(null);
  const osDragTriggeredRef = useRef(false);

  // Context Menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    targetType: null,
    targetId: null,
    targetName: null,
  });

  // Modals state
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [renameModal, setRenameModal] = useState<{
    open: boolean;
    id: string;
    name: string;
    isFolder: boolean;
  }>({ open: false, id: "", name: "", isFolder: false });

  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    items: ItemIdentifier[];
    singleName?: string;
  }>({ open: false, items: [] });

  const [shredPromptPaths, setShredPromptPaths] = useState<string[] | null>(null);
  const [previewFile, setPreviewFile] = useState<VirtualFile | null>(null);

  // Map IDs to item identifiers
  const toItemIdentifiers = useCallback(
    (explicitIds?: string[]): ItemIdentifier[] => {
      const targetIds = explicitIds || Array.from(new Set<string>());
      const folderSet = new Set(listing.folders.map((f) => f.id));
      return targetIds.map((id) => ({
        id,
        is_folder: folderSet.has(id),
      }));
    },
    [listing.folders]
  );

  // Refresh current folder listing
  const refreshDirectory = useCallback(
    async (folderId: string | null = currentFolderId, silent = false) => {
      if (!silent) setLoading(true);
      setErrorBanner(null);
      try {
        const data = await listDirectory(folderId, vaultInfo.id);
        setListing(data);
      } catch (err) {
        reportError(err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [currentFolderId, vaultInfo.id, reportError]
  );

  useEffect(() => {
    refreshDirectory(currentFolderId);
  }, [currentFolderId, refreshDirectory]);

  // Real-time silent refresh on background file transfer progress
  useEffect(() => {
    let lastSilent = 0;
    const unlistenPromise = listen<TransferProgressPayload>(
      "vault://transfer-progress",
      (event) => {
        const payload = event.payload;
        if (payload.phase === "ingest" || payload.phase === "delete") {
          const now = Date.now();
          if (now - lastSilent >= 120) {
            lastSilent = now;
            refreshDirectory(currentFolderId, true);
          }
        }
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [currentFolderId, refreshDirectory]);

  // Initial vault compression setting
  useEffect(() => {
    let cancelled = false;
    getVaultCompression(vaultInfo.id)
      .then((val) => {
        if (!cancelled) setIsCompressed(val);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vaultInfo.id]);

  // Listen for compression progress events
  useEffect(() => {
    const unlistenPromise = listen<CompressionProgressPayload>(
      "vault://compression-progress",
      (event) => {
        const payload = event.payload;
        setCompressionProgress(payload);
        if (payload.is_complete) {
          setIsCompressed(targetCompressionState);
          setTimeout(() => {
            setCompressionProgress(null);
            refreshDirectory(currentFolderId);
          }, 600);
        }
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [targetCompressionState, currentFolderId, refreshDirectory]);

  const handleRequestChangeCompression = useCallback((enable: boolean) => {
    setTargetCompressionState(enable);
    setIsSettingsModalOpen(false);
    setIsCompressionConfirmOpen(true);
  }, []);

  const handleConfirmCompressionChange = useCallback(async () => {
    setIsCompressionConfirmOpen(false);
    setCompressionProgress({
      current_file: "Preparing migration...",
      files_completed: 0,
      total_files: 1,
      bytes_processed: 0,
      total_bytes: 0,
      is_complete: false,
    });
    try {
      await setVaultCompression(targetCompressionState, vaultInfo.id);
      setIsCompressed(targetCompressionState);
    } catch (err) {
      reportError(err);
      setCompressionProgress(null);
    }
  }, [targetCompressionState, vaultInfo.id, reportError]);

  const canGoUp = currentFolderId !== null;

  const parentFolderId = useMemo(() => {
    if (listing.breadcrumbs.length >= 2) {
      return listing.breadcrumbs[listing.breadcrumbs.length - 2].id;
    }
    return null;
  }, [listing.breadcrumbs]);

  const goUp = useCallback(() => {
    if (currentFolderId !== null) {
      navigateToFolder(parentFolderId);
    }
  }, [currentFolderId, parentFolderId, navigateToFolder]);

  // Move items internally
  const handleMoveItemsToFolder = useCallback(
    async (targetFolderId: string | null, draggedIds: string[]) => {
      if (targetFolderId === currentFolderId) return;
      const validIds = draggedIds.filter((id) => id !== targetFolderId);
      if (validIds.length === 0) return;

      const items = toItemIdentifiers(validIds);
      setErrorBanner(null);
      try {
        await moveVirtualItems(items, targetFolderId, vaultInfo.id);
        await refreshDirectory(currentFolderId);
      } catch (err) {
        setErrorBanner(String(err));
      }
    },
    [currentFolderId, toItemIdentifiers, vaultInfo.id, refreshDirectory]
  );

  // Search vault
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      searchVault(q, vaultInfo.id, currentFolderId)
        .then((res) => {
          if (!cancelled) {
            setSearchResults(res);
          }
        })
        .catch(() => {});
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, vaultInfo.id, currentFolderId]);

  // Filtered lists
  const filteredFolders = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return listing.folders;
    const lower = q.toLowerCase();
    if (searchResults) {
      return searchResults.folders.filter((f) =>
        f.name.toLowerCase().includes(lower)
      );
    }
    return listing.folders.filter((f) => f.name.toLowerCase().includes(lower));
  }, [listing.folders, searchQuery, searchResults]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return listing.files;
    const lower = q.toLowerCase();
    if (searchResults) {
      return searchResults.files.filter((f) =>
        f.original_name.toLowerCase().includes(lower)
      );
    }
    return listing.files.filter((f) =>
      f.original_name.toLowerCase().includes(lower)
    );
  }, [listing.files, searchQuery, searchResults]);

  // Selection hook
  const {
    selectedIds,
    setSelectedIds,
    toggleSelect: handleToggleSelect,
    selectAll: handleSelectAll,
    clearSelection: handleClearSelection,
  } = useWorkspaceSelection(filteredFolders, filteredFiles);

  // Pointer drag controller
  useEffect(() => {
    if (!pointerDrag) return;

    const handleMouseMove = (e: MouseEvent) => {
      if ((e.buttons & 1) === 0) {
        setPointerDrag(null);
        return;
      }

      const dx = e.clientX - pointerDrag.startX;
      const dy = e.clientY - pointerDrag.startY;
      const dist = Math.hypot(dx, dy);
      const isNowActive = pointerDrag.active || dist >= 6;

      if (!isNowActive) return;

      const edgeThreshold = 14;
      const nearWindowEdge =
        e.clientX <= edgeThreshold ||
        e.clientY <= edgeThreshold ||
        e.clientX >= window.innerWidth - edgeThreshold ||
        e.clientY >= window.innerHeight - edgeThreshold;

      if (nearWindowEdge && !osDragTriggeredRef.current) {
        osDragTriggeredRef.current = true;
        const itemsToExport = toItemIdentifiers(pointerDrag.ids);
        setPointerDrag(null);
        if (itemsToExport.length > 0) {
          startOsDragExport(itemsToExport, vaultInfo.id).catch((err) => {
            reportError(err);
          });
        }
        return;
      }

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const dropTargetEl = el?.closest<HTMLElement>("[data-drop-folder-id]");
      const rawDropId = dropTargetEl?.getAttribute("data-drop-folder-id") ?? null;
      const validHoverId =
        rawDropId && !pointerDrag.ids.includes(rawDropId) ? rawDropId : null;

      setPointerDrag((prev) =>
        prev
          ? {
              ...prev,
              active: true,
              x: e.clientX,
              y: e.clientY,
              hoveredFolderId: validHoverId,
            }
          : null
      );
    };

    const handleMouseUp = () => {
      if (pointerDrag.active && pointerDrag.hoveredFolderId) {
        const rawTarget = pointerDrag.hoveredFolderId;
        const resolvedFolderId =
          rawTarget === "__parent__"
            ? parentFolderId
            : rawTarget === "__root__"
            ? null
            : rawTarget;
        handleMoveItemsToFolder(resolvedFolderId, pointerDrag.ids);
      }
      setPointerDrag(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    pointerDrag,
    parentFolderId,
    toItemIdentifiers,
    vaultInfo.id,
    handleMoveItemsToFolder,
    reportError,
  ]);

  const handleItemMouseDown = useCallback(
    (e: React.MouseEvent, id: string, _isFolder: boolean, name: string) => {
      if (e.button !== 0) return;
      osDragTriggeredRef.current = false;
      const ids = selectedIds.has(id) ? Array.from(selectedIds) : [id];
      const label = ids.length > 1 ? `${ids.length} items` : name;
      setPointerDrag({
        ids,
        label,
        startX: e.clientX,
        startY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        active: false,
        hoveredFolderId: null,
      });
    },
    [selectedIds]
  );

  // Keyboard Shortcuts (Delete, Backspace, Ctrl+A, Alt+Left/Right)
  useEffect(() => {
    if (!isActive) return;

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isInput) return;

      const anyModalOpen =
        Boolean(previewFile) ||
        createFolderOpen ||
        renameModal.open ||
        deleteModal.open ||
        Boolean(shredPromptPaths) ||
        Boolean(diskSpaceError);

      if (anyModalOpen) return;

      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        goForward();
      } else if (e.key === "Backspace") {
        e.preventDefault();
        goUp();
      } else if (e.key === "Delete" && selectedIds.size > 0) {
        e.preventDefault();
        const items = toItemIdentifiers(Array.from(selectedIds));
        let singleName: string | undefined;
        if (items.length === 1) {
          const single = items[0];
          singleName = single.is_folder
            ? listing.folders.find((f) => f.id === single.id)?.name
            : listing.files.find((f) => f.id === single.id)?.original_name;
        }
        setDeleteModal({
          open: true,
          items,
          singleName,
        });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        handleSelectAll();
      } else if (e.key === "Escape" && selectedIds.size > 0) {
        e.preventDefault();
        handleClearSelection();
      }
    };

    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    isActive,
    goBack,
    goForward,
    goUp,
    previewFile,
    createFolderOpen,
    renameModal.open,
    deleteModal.open,
    shredPromptPaths,
    diskSpaceError,
    selectedIds,
    toItemIdentifiers,
    listing.folders,
    listing.files,
    handleSelectAll,
    handleClearSelection,
  ]);

  const handleCloseVault = useCallback(async () => {
    try {
      await lockVaultInstance(vaultInfo.id);
    } catch {
      // ignore
    } finally {
      onCloseVault(vaultInfo.id);
    }
  }, [vaultInfo.id, onCloseVault]);

  const runIngestPaths = useCallback(
    async (paths: string[], shouldShred: boolean) => {
      setErrorBanner(null);
      setSkippedWarning(null);
      try {
        const report = await ingestOsPaths(
          paths,
          currentFolderId,
          shouldShred,
          vaultInfo.id,
          isCompressed
        );
        await refreshDirectory(currentFolderId);

        if (report && report.skipped_files && report.skipped_files.length > 0) {
          const count = report.skipped_files.length;
          const first = report.skipped_files[0];
          if (count === 1) {
            setSkippedWarning(
              `Imported ${report.imported_files} file. Skipped "${first.name}" (${first.reason}).`
            );
          } else {
            const sampleNames = report.skipped_files
              .slice(0, 3)
              .map((s) => `"${s.name}"`)
              .join(", ");
            setSkippedWarning(
              `Imported ${report.imported_files} files. Skipped ${count} unreadable or antivirus-locked files (${sampleNames}${
                count > 3 ? ", ..." : ""
              } — ${first.reason}).`
            );
          }
        }
      } catch (err) {
        reportError(err);
      }
    },
    [currentFolderId, vaultInfo.id, isCompressed, refreshDirectory, reportError]
  );

  const handleOsDrop = useCallback(
    async (paths: string[], shiftPressed: boolean) => {
      if (!paths || paths.length === 0) return;
      setErrorBanner(null);

      if (paths.length === 1 && onOpenDroppedVault) {
        try {
          const detected = await checkIsVaultPath(paths[0]);
          if (detected) {
            onOpenDroppedVault(detected);
            return;
          }
        } catch {
          // ignore
        }
      }

      if (shiftPressed || shredOriginals) {
        setShredPromptPaths(paths);
        return;
      }

      await runIngestPaths(paths, false);
    },
    [shredOriginals, onOpenDroppedVault, runIngestPaths]
  );

  const { isDraggingOver, isShiftPressed } = useNativeDragDrop({
    enabled: isActive && !pointerDrag?.active,
    onDrop: handleOsDrop,
  });

  const handleImportFiles = async () => {
    const selected = await open({
      multiple: true,
      directory: false,
      title: "Select Files to Import",
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await handleOsDrop(paths, false);
  };

  const handleImportDirectory = async () => {
    const selected = await open({
      multiple: true,
      directory: true,
      title: "Select Folders to Import",
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    await handleOsDrop(paths, false);
  };

  const handleExportItems = async (items: ItemIdentifier[]) => {
    if (items.length === 0) return;

    const dest = await open({
      directory: true,
      multiple: false,
      title: "Select Destination Folder to Export",
    });
    if (!dest || typeof dest !== "string") return;

    setErrorBanner(null);
    try {
      await exportVirtualItems(items, dest, vaultInfo.id);
    } catch (err) {
      reportError(err);
    }
  };

  const handleContextMenu = (
    e: React.MouseEvent,
    type: "file" | "folder" | "parent" | null,
    id: string | null,
    name: string | null
  ) => {
    if (id && type !== "parent" && !selectedIds.has(id)) {
      setSelectedIds(new Set([id]));
    }

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      targetType: type,
      targetId: id,
      targetName: name,
    });
  };

  const currentFolderName =
    listing.breadcrumbs[listing.breadcrumbs.length - 1]?.name || vaultInfo.name;

  return (
    <div
      className={`flex-1 flex flex-col bg-[#121010] text-stone-100 overflow-hidden select-none relative ${
        isActive ? "flex" : "hidden"
      } ${pointerDrag?.active ? "cursor-grabbing" : ""}`}
    >
      {/* Unified 52px Minimalist Header */}
      <UnifiedHeader
        breadcrumbs={listing.breadcrumbs}
        hoveredDropFolderId={pointerDrag?.active ? pointerDrag.hoveredFolderId : null}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onGoBack={goBack}
        onGoForward={goForward}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        gridSize={gridSize}
        onGridSizeChange={setGridSize}
        onNavigateBreadcrumb={navigateToFolder}
        onNewFolder={() => setCreateFolderOpen(true)}
        onImportFiles={handleImportFiles}
        onImportFolder={handleImportDirectory}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onCloseVault={handleCloseVault}
        shredOriginals={shredOriginals}
        onToggleShred={() => setShredOriginals((prev) => !prev)}
        totalCount={filteredFolders.length + filteredFiles.length}
        selectedCount={selectedIds.size}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
      />

      {/* Error Banner */}
      {errorBanner && (
        <div className="px-5 py-2.5 bg-rose-950/70 border-b border-rose-800/60 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-400 hover:text-rose-200 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Skipped Files Warning Banner */}
      {skippedWarning && (
        <div className="px-5 py-2.5 bg-amber-950/50 border-b border-amber-700/50 flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{skippedWarning}</span>
          </div>
          <button
            type="button"
            onClick={() => setSkippedWarning(null)}
            className="text-amber-400 hover:text-amber-200 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main File Explorer Area */}
      <FileExplorer
        vaultId={vaultInfo.id}
        folders={filteredFolders}
        files={filteredFiles}
        viewMode={viewMode}
        gridSize={gridSize}
        selectedIds={selectedIds}
        searchQuery={searchQuery}
        loading={loading}
        canGoUp={canGoUp}
        hoveredDropFolderId={pointerDrag?.active ? pointerDrag.hoveredFolderId : null}
        onToggleSelect={handleToggleSelect}
        onSetSelectedIds={setSelectedIds}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onOpenFolder={navigateToFolder}
        onGoUp={goUp}
        onPreviewFile={(file) => setPreviewFile(file)}
        onContextMenu={handleContextMenu}
        onItemMouseDown={handleItemMouseDown}
        onImportFiles={handleImportFiles}
        onNewFolder={() => setCreateFolderOpen(true)}
      />

      {/* Sleek Floating Capsule for Selection Actions */}
      <FloatingActionBar
        selectedCount={selectedIds.size}
        onClearSelection={handleClearSelection}
        onExportSelected={() =>
          handleExportItems(toItemIdentifiers(Array.from(selectedIds)))
        }
        onDeleteSelected={() => {
          const items = toItemIdentifiers(Array.from(selectedIds));
          let singleName: string | undefined;
          if (items.length === 1) {
            const single = items[0];
            singleName = single.is_folder
              ? listing.folders.find((f) => f.id === single.id)?.name
              : listing.files.find((f) => f.id === single.id)?.original_name;
          }
          setDeleteModal({
            open: true,
            items,
            singleName,
          });
        }}
      />

      {/* Floating Pointer Drag Badge */}
      {pointerDrag?.active && (
        <div
          style={{
            left: pointerDrag.x + 14,
            top: pointerDrag.y + 14,
          }}
          className="pointer-events-none fixed z-50 flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-purple-600/95 text-white text-xs font-medium shadow-2xl border border-purple-400/50 backdrop-blur-md"
        >
          <FolderInput className="w-4 h-4 shrink-0" />
          <span className="truncate max-w-[200px]">{pointerDrag.label}</span>
          {pointerDrag.hoveredFolderId && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px]">
              Move
            </span>
          )}
        </div>
      )}

      {/* Drag & Drop Overlay */}
      <DropOverlay
        visible={isDraggingOver}
        shredOriginals={shredOriginals}
        isShiftPressed={isShiftPressed}
        currentFolderName={currentFolderName}
      />

      {/* Context Menu */}
      <ContextMenu
        menu={contextMenu}
        selectedCount={selectedIds.size}
        totalCount={filteredFolders.length + filteredFiles.length}
        canGoUp={canGoUp}
        viewMode={viewMode}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
        onOpenTarget={() => {
          if (contextMenu.targetType === "folder" && contextMenu.targetId) {
            navigateToFolder(contextMenu.targetId);
          } else if (contextMenu.targetType === "file" && contextMenu.targetId) {
            const file =
              filteredFiles.find((f) => f.id === contextMenu.targetId) ||
              listing.files.find((f) => f.id === contextMenu.targetId);
            if (file) setPreviewFile(file);
          }
        }}
        onExportTarget={() => {
          if (selectedIds.size > 1) {
            handleExportItems(toItemIdentifiers(Array.from(selectedIds)));
          } else if (contextMenu.targetId && contextMenu.targetType) {
            handleExportItems([
              {
                id: contextMenu.targetId,
                is_folder: contextMenu.targetType === "folder",
              },
            ]);
          }
        }}
        onMoveToParent={() => {
          const ids =
            selectedIds.size > 1
              ? Array.from(selectedIds)
              : contextMenu.targetId
              ? [contextMenu.targetId]
              : [];
          if (ids.length > 0) {
            handleMoveItemsToFolder(parentFolderId, ids);
          }
        }}
        onGoUp={goUp}
        onRenameTarget={() => {
          if (
            contextMenu.targetId &&
            contextMenu.targetName &&
            contextMenu.targetType
          ) {
            setRenameModal({
              open: true,
              id: contextMenu.targetId,
              name: contextMenu.targetName,
              isFolder: contextMenu.targetType === "folder",
            });
          }
        }}
        onDeleteTarget={() => {
          if (selectedIds.size > 1) {
            setDeleteModal({
              open: true,
              items: toItemIdentifiers(Array.from(selectedIds)),
            });
          } else if (contextMenu.targetId && contextMenu.targetType) {
            setDeleteModal({
              open: true,
              items: [
                {
                  id: contextMenu.targetId,
                  is_folder: contextMenu.targetType === "folder",
                },
              ],
              singleName: contextMenu.targetName || undefined,
            });
          }
        }}
        onNewFolder={() => setCreateFolderOpen(true)}
        onImportFiles={handleImportFiles}
        onImportDirectory={handleImportDirectory}
        onRefresh={() => refreshDirectory(currentFolderId)}
        onSelectAll={handleSelectAll}
        onViewModeChange={setViewMode}
      />

      {/* Modal: New Folder */}
      <NamePromptModal
        open={createFolderOpen}
        mode="create-folder"
        onClose={() => setCreateFolderOpen(false)}
        onSubmit={async (name) => {
          await createVirtualFolder(currentFolderId, name, vaultInfo.id);
          await refreshDirectory(currentFolderId);
        }}
      />

      {/* Modal: Rename */}
      <NamePromptModal
        open={renameModal.open}
        mode="rename"
        initialValue={renameModal.name}
        targetType={renameModal.isFolder ? "folder" : "file"}
        onClose={() => setRenameModal((prev) => ({ ...prev, open: false }))}
        onSubmit={async (newName) => {
          await renameVirtualItem(
            renameModal.id,
            renameModal.isFolder,
            newName,
            vaultInfo.id
          );
          await refreshDirectory(currentFolderId);
        }}
      />

      {/* Modal: Delete */}
      <DeleteConfirmModal
        open={deleteModal.open}
        count={deleteModal.items.length}
        singleName={deleteModal.singleName}
        onClose={() => setDeleteModal((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          const itemsToDelete = deleteModal.items;
          setDeleteModal((prev) => ({ ...prev, open: false }));
          deleteVirtualItems(itemsToDelete, vaultInfo.id)
            .then(() => refreshDirectory(currentFolderId))
            .catch((err) => reportError(err));
        }}
      />

      {/* Modal: Shred Confirm */}
      <ShredConfirmModal
        open={shredPromptPaths !== null}
        paths={shredPromptPaths || []}
        onCancel={() => setShredPromptPaths(null)}
        onImportKeepOriginals={async () => {
          const paths = shredPromptPaths;
          setShredPromptPaths(null);
          if (paths) void runIngestPaths(paths, false);
        }}
        onImportAndShred={async () => {
          const paths = shredPromptPaths;
          setShredPromptPaths(null);
          if (paths) void runIngestPaths(paths, true);
        }}
      />

      {/* Modal: Disk Space Warning */}
      <DiskSpaceWarningModal
        open={diskSpaceError !== null}
        errorMessage={diskSpaceError || ""}
        onClose={() => setDiskSpaceError(null)}
      />

      {/* Modal: Media Preview */}
      <PreviewModal
        vaultId={vaultInfo.id}
        file={previewFile}
        files={filteredFiles}
        onSelectFile={(f) => setPreviewFile(f)}
        onClose={() => setPreviewFile(null)}
        onExport={(file) =>
          handleExportItems([{ id: file.id, is_folder: false }])
        }
      />

      {/* Modal: Vault Settings */}
      <VaultSettingsModal
        open={isSettingsModalOpen}
        vaultInfo={vaultInfo}
        isCompressed={isCompressed}
        onClose={() => setIsSettingsModalOpen(false)}
        onRequestChangeCompression={handleRequestChangeCompression}
      />

      {/* Modal: Compression Confirmation */}
      <CompressionConfirmModal
        open={isCompressionConfirmOpen}
        enable={targetCompressionState}
        onClose={() => setIsCompressionConfirmOpen(false)}
        onConfirm={handleConfirmCompressionChange}
      />

      {/* Modal: Compression Progress */}
      <CompressionProgressModal
        open={compressionProgress !== null}
        progress={compressionProgress}
      />
    </div>
  );
};
