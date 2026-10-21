import React, { useState, useEffect, useRef } from "react";
import {
  FolderOpen,
  FileLock2,
  Clock,
  X,
  Unlock,
  Copy,
  Trash2,
} from "lucide-react";
import { Button } from "../ui/Button";
import { UnlockModal } from "./UnlockModal";
import { selectVaultFile } from "../../services/tauri";
import type { VaultInfo, RecentVaultEntry } from "../../types/vault";

interface OpenVaultCardProps {
  recentVaults: RecentVaultEntry[];
  onRemoveRecent: (vaultPath: string) => void;
  onVaultOpened: (info: VaultInfo) => void;
  onError: (err: string) => void;
}

interface RecentMenuState {
  visible: boolean;
  x: number;
  y: number;
  entry: RecentVaultEntry | null;
}

export const OpenVaultCard: React.FC<OpenVaultCardProps> = ({
  recentVaults,
  onRemoveRecent,
  onVaultOpened,
  onError,
}) => {
  const [selectedVaultDir, setSelectedVaultDir] = useState<string | null>(null);
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [recentMenu, setRecentMenu] = useState<RecentMenuState>({
    visible: false,
    x: 0,
    y: 0,
    entry: null,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!recentMenu.visible) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setRecentMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setRecentMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [recentMenu.visible]);

  const handleSelectVaultFile = async () => {
    try {
      const selected = await selectVaultFile("Select Vault (.vault)");
      if (selected) {
        setSelectedVaultDir(selected);
        setIsUnlockModalOpen(true);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleUnlocked = (info: VaultInfo) => {
    setIsUnlockModalOpen(false);
    setSelectedVaultDir(null);
    onVaultOpened(info);
  };

  return (
    <>
      <div className="flex flex-col h-full bg-[#131317] border border-neutral-800 rounded-2xl p-7 shadow-xl">
        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <FolderOpen className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-100">
            Open Existing Vault
          </h2>
        </div>

        <div
          onClick={handleSelectVaultFile}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSelectVaultFile();
          }}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-800 hover:border-neutral-600 bg-[#16161b]/50 hover:bg-[#16161b] p-6 text-center cursor-pointer transition-all group"
        >
          <FileLock2 className="w-10 h-10 text-neutral-500 group-hover:text-emerald-400 transition-colors mb-2.5" />
          <span className="text-base font-medium text-neutral-200">
            Select a <span className="font-mono text-emerald-400">.vault</span>{" "}
            file
          </span>
          <span className="text-xs text-neutral-500 mt-1">
            Or drag and drop a .vault file onto this window
          </span>
        </div>

        {/* Recently Opened Vaults List */}
        {recentVaults.length > 0 && (
          <div className="mt-5 flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-2 text-xs font-medium text-neutral-400 mb-2.5">
              <Clock className="w-3.5 h-3.5 text-neutral-500" />
              <span>Recent Vaults</span>
            </div>
            <div className="flex flex-col gap-1.5 overflow-y-auto max-h-48 pr-1">
              {recentVaults.map((entry) => (
                <div
                  key={entry.vault_path}
                  onClick={() => {
                    setSelectedVaultDir(entry.vault_path);
                    setIsUnlockModalOpen(true);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRecentMenu({
                      visible: true,
                      x: e.clientX,
                      y: e.clientY,
                      entry,
                    });
                  }}
                  className="group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-[#18181e] hover:bg-neutral-800/80 border border-neutral-800/80 hover:border-neutral-700 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileLock2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-100 truncate">
                        {entry.name}
                      </p>
                      <p
                        className="text-xs font-mono text-neutral-500 truncate"
                        title={entry.vault_path}
                      >
                        {entry.vault_path}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveRecent(entry.vault_path);
                    }}
                    className="p-1 rounded-lg text-neutral-500 hover:text-neutral-200 hover:bg-neutral-700/60 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                    title="Remove from recent list"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-auto pt-5">
          <Button
            type="button"
            variant="secondary"
            size="lg"
            icon={<FolderOpen className="w-5 h-5 text-emerald-400" />}
            onClick={handleSelectVaultFile}
            className="w-full justify-center"
          >
            Browse .vault File...
          </Button>
        </div>
      </div>

      {/* Right-Click Context Menu for Recent Vault Entries */}
      {recentMenu.visible && recentMenu.entry && (
        <div
          ref={menuRef}
          style={{
            top: Math.min(recentMenu.y, window.innerHeight - 170),
            left: Math.min(recentMenu.x, window.innerWidth - 220),
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed z-50 w-52 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl py-1.5 text-xs text-zinc-200 select-none"
        >
          <div className="px-3 py-1.5 border-b border-zinc-800/80 mb-1">
            <p className="font-semibold text-zinc-200 truncate">
              {recentMenu.entry.name}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (recentMenu.entry) {
                setSelectedVaultDir(recentMenu.entry.vault_path);
                setIsUnlockModalOpen(true);
              }
              setRecentMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-emerald-500/15 hover:text-emerald-300 transition-colors text-left"
          >
            <Unlock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Unlock Vault...</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (recentMenu.entry) {
                navigator.clipboard?.writeText(recentMenu.entry.vault_path);
              }
              setRecentMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
          >
            <Copy className="w-3.5 h-3.5 text-zinc-400" />
            <span>Copy File Path</span>
          </button>
          <div className="my-1 border-t border-zinc-800/80" />
          <button
            type="button"
            onClick={() => {
              if (recentMenu.entry) {
                onRemoveRecent(recentMenu.entry.vault_path);
              }
              setRecentMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 text-red-400 hover:bg-red-950/50 hover:text-red-300 transition-colors text-left"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove from Recent List</span>
          </button>
        </div>
      )}

      <UnlockModal
        isOpen={isUnlockModalOpen}
        vaultDir={selectedVaultDir}
        onClose={() => {
          setIsUnlockModalOpen(false);
          setSelectedVaultDir(null);
        }}
        onUnlocked={handleUnlocked}
      />
    </>
  );
};
