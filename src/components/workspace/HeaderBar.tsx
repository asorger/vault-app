import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  X,
  LayoutGrid,
  List,
} from "lucide-react";
import { Breadcrumbs } from "./Breadcrumbs";
import { Button } from "../ui/Button";
import type { BreadcrumbItem, ViewMode, GridSize } from "../../types/vault";

interface HeaderBarProps {
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
  onCloseVault: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
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
  onCloseVault,
}) => {
  return (
    <header className="h-14 border-b border-neutral-800 bg-[#111115] px-4 flex items-center justify-between gap-4 select-none shrink-0 z-20">
      {/* Left: Back / Forward + Breadcrumbs (Vault Name is the first crumb) */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onGoBack}
            disabled={!canGoBack}
            title="Back (Mouse Back / Alt+Left)"
            className="p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onGoForward}
            disabled={!canGoForward}
            title="Forward (Mouse Forward / Alt+Right)"
            className="p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-neutral-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-neutral-800 shrink-0 mx-1" />

        <Breadcrumbs
          breadcrumbs={breadcrumbs}
          hoveredDropFolderId={hoveredDropFolderId}
          onNavigate={onNavigateBreadcrumb}
        />
      </div>

      {/* Right: Search + Grid Size + View Toggle + Close Button */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Search Input */}
        <div className="relative w-64 lg:w-76">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search files & folders..."
            className="w-full bg-[#17171c] text-sm text-neutral-100 placeholder-neutral-500 rounded-lg pl-9 pr-8 py-2 border border-neutral-800 hover:border-neutral-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-neutral-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Grid Size Customizer (shown in Grid view) */}
        {viewMode === "grid" && (
          <div className="flex items-center p-0.5 rounded-lg bg-[#17171c] border border-neutral-800 text-xs font-medium">
            {(["sm", "md", "lg"] as GridSize[]).map((sz) => (
              <button
                key={sz}
                type="button"
                onClick={() => onGridSizeChange(sz)}
                title={`Grid size: ${sz.toUpperCase()}`}
                className={`px-2.5 py-1.5 rounded-md uppercase transition-colors cursor-pointer ${
                  gridSize === sz
                    ? "bg-neutral-800 text-neutral-100 shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200"
                }`}
              >
                {sz}
              </button>
            ))}
          </div>
        )}

        {/* View Toggle (Grid vs List) */}
        <div className="flex items-center p-0.5 rounded-lg bg-[#17171c] border border-neutral-800">
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            title="Grid View"
            className={`p-2 rounded-md transition-colors cursor-pointer ${
              viewMode === "grid"
                ? "bg-neutral-800 text-neutral-100 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("table")}
            title="List View"
            className={`p-2 rounded-md transition-colors cursor-pointer ${
              viewMode === "table"
                ? "bg-neutral-800 text-neutral-100 shadow-sm"
                : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <List className="w-4 h-4" />
          </button>
        </div>

        <div className="h-5 w-[1px] bg-neutral-800" />

        {/* Close Vault Button */}
        <Button
          type="button"
          variant="danger"
          size="sm"
          icon={<X className="w-4 h-4" />}
          onClick={onCloseVault}
          title="Close this vault"
        >
          Close
        </Button>
      </div>
    </header>
  );
};
