import React, { useState } from "react";
import {
  FolderPlus,
  Upload,
  FolderUp,
  FileUp,
  Download,
  Trash2,
  Flame,
  Archive,
  Square,
  ChevronDown,
} from "lucide-react";
import { Button } from "../ui/Button";

interface ToolbarProps {
  shredOriginals: boolean;
  onToggleShred: (value: boolean) => void;
  compressFiles: boolean;
  onToggleCompress: (value: boolean) => void;
  onImportFiles: () => void;
  onImportFolder: () => void;
  onNewFolder: () => void;
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onExportSelected: () => void;
  onDeleteSelected: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  shredOriginals,
  onToggleShred,
  compressFiles,
  onToggleCompress,
  onImportFiles,
  onImportFolder,
  onNewFolder,
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onExportSelected,
  onDeleteSelected,
}) => {
  const [isImportMenuOpen, setIsImportMenuOpen] = useState(false);

  return (
    <div className="h-12 border-b border-neutral-800/80 bg-[#0e0e12] px-4 flex items-center justify-between gap-4 select-none shrink-0 z-10">
      {/* Left: Actions */}
      <div className="flex items-center gap-2.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<FolderPlus className="w-4 h-4 text-indigo-400" />}
          onClick={onNewFolder}
        >
          New Folder
        </Button>

        <div className="relative">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Upload className="w-4 h-4 text-emerald-400" />}
            onClick={() => setIsImportMenuOpen(!isImportMenuOpen)}
          >
            <span>Import</span>
            <ChevronDown className="w-3.5 h-3.5 text-neutral-400 ml-0.5" />
          </Button>

          {isImportMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setIsImportMenuOpen(false)}
              />
              <div className="absolute left-0 mt-1.5 w-48 rounded-xl bg-[#16161b] border border-neutral-700/80 shadow-2xl p-1.5 z-30 flex flex-col text-sm text-neutral-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    onImportFiles();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-neutral-800 text-left transition-colors cursor-pointer"
                >
                  <FileUp className="w-4 h-4 text-emerald-400" />
                  <span>Import Files...</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportMenuOpen(false);
                    onImportFolder();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-neutral-800 text-left transition-colors cursor-pointer"
                >
                  <FolderUp className="w-4 h-4 text-indigo-400" />
                  <span>Import Folder...</span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="h-5 w-[1px] bg-neutral-800 mx-1" />

        <label
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/40 cursor-pointer group transition-colors"
          title="Delete original files from your computer after importing (or hold Shift while dragging files in)"
        >
          <input
            type="checkbox"
            checked={shredOriginals}
            onChange={(e) => onToggleShred(e.target.checked)}
            className="sr-only"
          />
          <div
            className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center p-0.5 ${
              shredOriginals ? "bg-rose-500" : "bg-neutral-700"
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                shredOriginals ? "translate-x-3.5" : "translate-x-0"
              }`}
            />
          </div>
          <span className="flex items-center gap-1.5 text-sm text-neutral-300 group-hover:text-neutral-100">
            <Flame
              className={`w-4 h-4 ${
                shredOriginals ? "text-rose-400" : "text-neutral-500"
              }`}
            />
            <span>Shred originals</span>
          </span>
        </label>

        <label
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/40 cursor-pointer group transition-colors"
          title="Transparently compress files using Zstandard (Zstd) before encryption to save disk space"
        >
          <input
            type="checkbox"
            checked={compressFiles}
            onChange={(e) => onToggleCompress(e.target.checked)}
            className="sr-only"
          />
          <div
            className={`w-8 h-4.5 rounded-full transition-colors relative flex items-center p-0.5 ${
              compressFiles ? "bg-indigo-500" : "bg-neutral-700"
            }`}
          >
            <div
              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform ${
                compressFiles ? "translate-x-3.5" : "translate-x-0"
              }`}
            />
          </div>
          <span className="flex items-center gap-1.5 text-sm text-neutral-300 group-hover:text-neutral-100">
            <Archive
              className={`w-4 h-4 ${
                compressFiles ? "text-indigo-400" : "text-neutral-500"
              }`}
            />
            <span>Compress</span>
          </span>
        </label>
      </div>

      {/* Right: Selection Actions */}
      <div className="flex items-center gap-2.5">
        {selectedCount > 0 ? (
          <div className="flex items-center gap-2.5 bg-[#16161b] border border-neutral-700/70 rounded-lg px-3 py-1.5">
            <span className="text-sm font-medium text-neutral-100">
              {selectedCount} selected
            </span>

            <div className="h-4 w-[1px] bg-neutral-700" />

            <button
              type="button"
              onClick={onExportSelected}
              className="flex items-center gap-1.5 text-sm text-neutral-200 hover:text-emerald-400 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-neutral-800"
              title="Export selected items to a folder"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>

            <button
              type="button"
              onClick={onDeleteSelected}
              className="flex items-center gap-1.5 text-sm text-rose-400 hover:text-rose-300 transition-colors cursor-pointer px-2 py-0.5 rounded hover:bg-rose-500/15"
              title="Delete selected items (Delete)"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete</span>
            </button>

            <button
              type="button"
              onClick={onClearSelection}
              className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors ml-1 cursor-pointer"
            >
              Clear
            </button>
          </div>
        ) : (
          totalCount > 0 && (
            <button
              type="button"
              onClick={onSelectAll}
              className="flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-200 px-2.5 py-1.5 rounded-lg hover:bg-neutral-800/50 transition-colors cursor-pointer"
            >
              <Square className="w-4 h-4" />
              <span>Select all</span>
            </button>
          )
        )}
      </div>
    </div>
  );
};
