// src/components/workspace/UnifiedHeader.tsx — Minimalist consolidated header (52px) replacing double toolbars.

import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  X,
  LayoutGrid,
  List,
  FolderPlus,
  Upload,
  FileUp,
  FolderUp,
  Settings,
  Lock,
  ChevronDown,
  CheckSquare,
  Flame,
} from "lucide-react";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "../ui/Button";
import type { BreadcrumbItem, ViewMode, GridSize } from "../../types/vault";

interface UnifiedHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  hoveredDropFolderId?: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  gridSize: GridSize;
  onGridSizeChange: (size: GridSize) => void;
  onNavigateBreadcrumb: (id: string | null) => void;
  onNewFolder: () => void;
  onImportFiles: () => void;
  onImportFolder: () => void;
  onOpenSettings: () => void;
  onCloseVault: () => void;
  shredOriginals: boolean;
  onToggleShred: () => void;
  totalCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export const UnifiedHeader: React.FC<UnifiedHeaderProps> = ({
  breadcrumbs,
  hoveredDropFolderId,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  gridSize,
  onGridSizeChange,
  onNavigateBreadcrumb,
  onNewFolder,
  onImportFiles,
  onImportFolder,
  onOpenSettings,
  onCloseVault,
  shredOriginals,
  onToggleShred,
  totalCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
}) => {
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <header className="h-[52px] border-b border-white/[0.06] bg-[#161312] px-4 flex items-center justify-between gap-3 select-none shrink-0 z-20">
      {/* ── Left: History Navigation + Breadcrumbs ── */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onGoBack}
            disabled={!canGoBack}
            title="Back (Alt+Left)"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-white/[0.06] disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onGoForward}
            disabled={!canGoForward}
            title="Forward (Alt+Right)"
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-100 hover:bg-white/[0.06] disabled:opacity-25 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="h-4 w-[1px] bg-white/[0.08] shrink-0 mx-1" />

        <Breadcrumbs
          breadcrumbs={breadcrumbs}
          hoveredDropFolderId={hoveredDropFolderId}
          onNavigate={onNavigateBreadcrumb}
        />
      </div>

      {/* ── Right: Search + View Controls + Actions ── */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Search Input (Pill with violet focus) */}
        <div className="relative w-56 lg:w-64">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files..."
            className="w-full bg-[#121010] text-xs text-stone-200 placeholder-stone-400 rounded-full pl-9 pr-8 py-1.5 border border-white/[0.08] hover:border-white/[0.14] focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/40 focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-stone-400 hover:text-stone-200 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* View Switcher Pills */}
        <div className="flex items-center bg-[#121010] p-0.5 rounded-xl border border-white/[0.08]">
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              viewMode === "grid"
                ? "bg-[#25201e] text-purple-400 shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
            title="Grid View"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("table")}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              viewMode === "table"
                ? "bg-[#25201e] text-purple-400 shadow-sm"
                : "text-stone-400 hover:text-stone-200"
            }`}
            title="List View"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Grid Size Selector (shown when in grid view) */}
        {viewMode === "grid" && (
          <div className="flex items-center bg-[#121010] p-0.5 rounded-xl border border-white/[0.08] text-[10px] font-medium">
            {(["sm", "md", "lg"] as GridSize[]).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => onGridSizeChange(sz)}
                title={`Grid Size: ${sz.toUpperCase()}`}
                className={`px-2 py-0.5 rounded-lg uppercase transition-colors cursor-pointer ${
                  gridSize === sz
                    ? "bg-[#25201e] text-purple-400 shadow-sm font-semibold"
                    : "text-stone-400 hover:text-stone-200"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        )}

        <div className="h-4 w-[1px] bg-white/[0.08]" />

        {/* Action: Select All / Deselect All */}
        {totalCount > 0 && (
          <button
            type="button"
            onClick={isAllSelected ? onClearSelection : onSelectAll}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
              isAllSelected
                ? "bg-purple-500/15 border-purple-500/30 text-purple-300 hover:bg-purple-500/25"
                : "bg-[#121010] border-white/[0.08] text-stone-300 hover:text-stone-100 hover:border-white/[0.16] hover:bg-[#1a1716]"
            }`}
            title={isAllSelected ? "Deselect all (Esc)" : "Select all (Ctrl+A)"}
          >
            <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
            <span>{isAllSelected ? "Deselect" : "Select All"}</span>
          </button>
        )}

        {/* Action: Shred Originals Toggle */}
        <button
          type="button"
          onClick={onToggleShred}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer border ${
            shredOriginals
              ? "bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25"
              : "bg-[#121010] border-white/[0.08] text-stone-400 hover:text-stone-200 hover:border-white/[0.16] hover:bg-[#1a1716]"
          }`}
          title={
            shredOriginals
              ? "Shred originals is ON (host files shredded after import)"
              : "Shred originals is OFF (host files preserved after import)"
          }
        >
          <Flame className={`w-3.5 h-3.5 ${shredOriginals ? "text-amber-400" : "text-stone-400"}`} />
          <span>Shred: {shredOriginals ? "On" : "Off"}</span>
        </button>

        <div className="h-4 w-[1px] bg-white/[0.08]" />

        {/* Action: New Folder */}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          pill
          icon={<FolderPlus className="w-3.5 h-3.5 text-purple-400" />}
          onClick={onNewFolder}
        >
          New Folder
        </Button>

        {/* Action: Import Dropdown */}
        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            pill
            icon={<Upload className="w-3.5 h-3.5 text-emerald-400" />}
            onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
          >
            <span>Import</span>
            <ChevronDown className="w-3 h-3 text-stone-400 ml-0.5" />
          </Button>

          {isImportMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setIsImportMenuOpen(false)}
              />
              <div className="absolute right-0 mt-1.5 w-44 rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl p-1.5 z-40 flex flex-col text-xs text-stone-200 animate-in fade-in duration-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    onImportFiles();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
                >
                  <FileUp className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Import Files...</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    onImportFolder();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
                >
                  <FolderUp className="w-3.5 h-3.5 text-purple-400" />
                  <span>Import Folder...</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Settings Button */}
        <button
          type="button"
          onClick={onOpenSettings}
          className="p-2 rounded-xl text-stone-400 hover:text-stone-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          title="Vault Settings"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* Lock Vault Button */}
        <button
          type="button"
          onClick={onCloseVault}
          className="p-2 rounded-xl text-stone-400 hover:text-rose-300 hover:bg-rose-950/30 transition-colors cursor-pointer"
          title="Lock Vault"
        >
          <Lock className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
