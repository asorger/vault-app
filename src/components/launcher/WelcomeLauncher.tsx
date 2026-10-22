// src/components/launcher/WelcomeLauncher.tsx — Minimalist Blip-inspired two-pane launcher.

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield,
  Search,
  Plus,
  FolderOpen,
  Lock,
  HardDrive,
  Copy,
  Trash2,
  KeyRound,
  UploadCloud,
  X,
} from "lucide-react";
import { CreateVaultForm } from "./CreateVaultForm";
import { UnlockVaultForm } from "./UnlockVaultForm";
import { Button } from "../ui/Button";
import { useNativeDragDrop } from "../../hooks/useNativeDragDrop";
import { checkIsVaultPath, selectVaultFile } from "../../services/tauri";
import type { VaultInfo, RecentVaultEntry } from "../../types/vault";

interface WelcomeLauncherProps {
  recentVaults: RecentVaultEntry[];
  onRemoveRecent: (vaultPath: string) => void;
  onVaultReady: (info: VaultInfo) => void;
  onError: (msg: string) => void;
  autoLockNotice?: string | null;
  pendingVaultPath?: string | null;
  onClearPendingVaultPath?: () => void;
  enableDragDrop?: boolean;
}

type StageMode = "welcome" | "create" | "unlock";

export const WelcomeLauncher: React.FC<WelcomeLauncherProps> = ({
  recentVaults,
  onRemoveRecent,
  onVaultReady,
  onError,
  autoLockNotice,
  pendingVaultPath,
  onClearPendingVaultPath,
  enableDragDrop = true,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [stageMode, setStageMode] = useState<StageMode>("welcome");
  const [selectedVaultPath, setSelectedVaultPath] = useState<string | null>(null);
  const [recentMenu, setRecentMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    vaultPath: string | null;
  }>({ visible: false, x: 0, y: 0, vaultPath: null });

  // Handle external file opening or drop
  useEffect(() => {
    if (pendingVaultPath) {
      setSelectedVaultPath(pendingVaultPath);
      setStageMode("unlock");
      onClearPendingVaultPath?.();
    }
  }, [pendingVaultPath, onClearPendingVaultPath]);

  // Global click outside to dismiss recent context menu
  useEffect(() => {
    if (!recentMenu.visible) return;
    const handleOutside = () =>
      setRecentMenu((prev) => ({ ...prev, visible: false }));
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [recentMenu.visible]);

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      const firstPath = paths[0];
      const resolved = await checkIsVaultPath(firstPath);
      if (resolved) {
        setSelectedVaultPath(resolved);
        setStageMode("unlock");
      } else {
        onError("Dropped item is not a valid .vault file or directory.");
      }
    },
    [onError]
  );

  useNativeDragDrop({
    enabled: enableDragDrop,
    onDrop: handleDrop,
  });

  const handleSelectVaultFile = async () => {
    try {
      const selected = await selectVaultFile("Select Vault (.vault)");
      if (selected) {
        setSelectedVaultPath(selected);
        setStageMode("unlock");
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const filteredRecentVaults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return recentVaults;
    return recentVaults.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.vault_path.toLowerCase().includes(q)
    );
  }, [recentVaults, searchQuery]);

  // Extract avatar initials or use default
  const getInitials = (name: string) => {
    const clean = name.replace(/\.vault$/i, "");
    const parts = clean.split(/[\s_-]+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return clean.slice(0, 2).toUpperCase();
  };

  return (
    <div className="h-full w-full flex bg-[#121010] text-stone-100 select-none overflow-hidden">
      {/* ── Left Sidebar (Blip Master Pane) ── */}
      <div className="w-80 md:w-88 h-full bg-[#181514] border-r border-white/[0.06] flex flex-col shrink-0 select-none">
        {/* Sidebar Header */}
        <div className="p-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-stone-100">
              Vaults
            </h1>
          </div>
          <button
            type="button"
            onClick={() => setStageMode("create")}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Create New Vault"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Pill Search Input */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vaults..."
              className="w-full bg-[#121010] text-xs text-stone-200 placeholder-stone-400 rounded-full pl-9 pr-8 py-2 border border-white/[0.08] hover:border-white/[0.14] focus:border-purple-500/80 focus:ring-1 focus:ring-purple-500/40 focus:outline-none transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Recent Vaults List */}
        <div className="flex-1 overflow-y-auto px-2 space-y-1 scrollbar-none">
          {filteredRecentVaults.length === 0 ? (
            <div className="p-6 text-center text-xs text-stone-400 space-y-1">
              <p>{searchQuery ? "No matching vaults" : "No recent vaults"}</p>
              <p className="text-[11px] text-stone-500">
                Create or open a vault to get started
              </p>
            </div>
          ) : (
            filteredRecentVaults.map((vault, idx) => {
              const isSelected =
                stageMode === "unlock" && selectedVaultPath === vault.vault_path;
              const isFirst = idx === 0;

              return (
                <div
                  key={vault.vault_path}
                  onClick={() => {
                    setSelectedVaultPath(vault.vault_path);
                    setStageMode("unlock");
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setRecentMenu({
                      visible: true,
                      x: e.clientX,
                      y: e.clientY,
                      vaultPath: vault.vault_path,
                    });
                  }}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-2xl cursor-pointer transition-all border ${
                    isSelected
                      ? "bg-[#25201e] border-white/[0.12] text-stone-100 shadow-sm"
                      : "bg-transparent border-transparent hover:bg-white/[0.04] text-stone-300"
                  }`}
                >
                  {/* Circular Avatar Badge (Blip signature style) */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-semibold text-xs tracking-wider transition-transform group-hover:scale-105 ${
                      isFirst || isSelected
                        ? "bg-purple-600 text-white shadow-md shadow-purple-950/50"
                        : "bg-[#262220] border border-white/[0.08] text-stone-300"
                    }`}
                  >
                    {isFirst ? (
                      <KeyRound className="w-4 h-4" />
                    ) : (
                      getInitials(vault.name)
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <h4 className="text-xs font-semibold text-stone-100 truncate">
                        {vault.name.replace(/\.vault$/i, "")}
                      </h4>
                      <Lock className="w-3 h-3 text-stone-400 shrink-0" />
                    </div>
                    <p className="text-[11px] font-mono text-stone-400 truncate mt-0.5">
                      {vault.vault_path}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pinned Bottom Actions */}
        <div className="p-3 border-t border-white/[0.06] bg-[#151211] space-y-2">
          <Button
            type="button"
            variant="primary"
            size="md"
            pill
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setStageMode("create")}
            className="w-full text-xs font-semibold py-2.5"
          >
            Create New Vault
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            pill
            icon={<FolderOpen className="w-4 h-4 text-stone-300" />}
            onClick={handleSelectVaultFile}
            className="w-full text-xs font-semibold py-2.5"
          >
            Open .vault File
          </Button>
        </div>
      </div>

      {/* ── Right Stage (Blip Workspace Area) ── */}
      <div className="flex-1 h-full flex flex-col justify-center items-center p-8 bg-[#121010] relative overflow-y-auto">
        {autoLockNotice && (
          <div className="absolute top-6 max-w-md w-full p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2.5 shadow-lg">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{autoLockNotice}</span>
          </div>
        )}

        {stageMode === "create" && (
          <CreateVaultForm
            onBack={() => setStageMode("welcome")}
            onVaultCreated={onVaultReady}
            onError={onError}
          />
        )}

        {stageMode === "unlock" && selectedVaultPath && (
          <UnlockVaultForm
            vaultPath={selectedVaultPath}
            onBack={() => setStageMode("welcome")}
            onUnlocked={onVaultReady}
            onError={onError}
          />
        )}

        {stageMode === "welcome" && (
          <div className="max-w-md text-center space-y-7 animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-3xl bg-purple-600/15 border border-purple-500/25 flex items-center justify-center text-purple-400 mx-auto shadow-xl shadow-purple-950/40">
              <Shield className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight text-stone-100">
                Welcome to Vault
              </h2>
              <p className="text-sm text-stone-400 leading-relaxed max-w-sm mx-auto">
                100% offline, zero-knowledge encrypted file management for your private data.
              </p>
            </div>

            {/* Drag & Drop Hero Target */}
            <div
              onClick={handleSelectVaultFile}
              className="p-8 rounded-3xl border-2 border-dashed border-white/[0.1] hover:border-purple-500/50 bg-[#161312]/60 hover:bg-[#1b1716]/80 transition-all cursor-pointer group flex flex-col items-center gap-3 shadow-lg"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] group-hover:bg-purple-500/10 flex items-center justify-center text-stone-400 group-hover:text-purple-400 transition-colors">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-semibold text-stone-200">
                  Drop any .vault file here to open
                </p>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  or click to browse your drive
                </p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="secondary"
                size="sm"
                pill
                icon={<Plus className="w-3.5 h-3.5 text-purple-400" />}
                onClick={() => setStageMode("create")}
              >
                New Vault
              </Button>
              <Button
                variant="secondary"
                size="sm"
                pill
                icon={<HardDrive className="w-3.5 h-3.5 text-stone-400" />}
                onClick={handleSelectVaultFile}
              >
                Open Existing
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Vault Context Menu */}
      {recentMenu.visible && recentMenu.vaultPath && (
        <div
          style={{
            top: Math.min(recentMenu.y, window.innerHeight - 120),
            left: Math.min(recentMenu.x, window.innerWidth - 200),
          }}
          className="fixed z-50 w-48 rounded-2xl bg-[#1b1817]/95 backdrop-blur-md border border-white/[0.1] shadow-2xl py-1.5 text-xs text-stone-200 select-none animate-in fade-in duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              if (recentMenu.vaultPath) {
                navigator.clipboard?.writeText(recentMenu.vaultPath);
              }
              setRecentMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-white/[0.06] text-left transition-colors cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5 text-stone-400" />
            <span>Copy Path</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (recentMenu.vaultPath) {
                onRemoveRecent(recentMenu.vaultPath);
              }
              setRecentMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full px-3 py-2 flex items-center gap-2 text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 text-left transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove from Recent</span>
          </button>
        </div>
      )}
    </div>
  );
};
