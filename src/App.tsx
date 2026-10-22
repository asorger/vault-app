import React, { useState, useEffect, useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import type { VaultInfo, RecentVaultEntry } from "./types/vault";
import { WelcomeLauncher } from "./components/launcher/WelcomeLauncher";
import { Workspace } from "./components/workspace/Workspace";
import { TitleBar } from "./components/layout/TitleBar";
import { TransferQueueDrawer } from "./components/queue/TransferQueueDrawer";
import { UnlockModal } from "./components/launcher/UnlockModal";
import { Button } from "./components/ui/Button";
import {
  getStartupVaultPath,
  lockVaultInstance,
  getRecentVaults,
  saveRecentVault,
  removeRecentVault,
} from "./services/tauri";
import { useAutoLock } from "./hooks/useAutoLock";

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#121010] text-stone-100 p-8 text-center select-none">
          <div className="max-w-md rounded-3xl bg-[#1b1817] border border-white/[0.1] p-7 space-y-5 shadow-2xl">
            <h2 className="text-base font-semibold text-stone-100">
              Something went wrong
            </h2>
            <p className="text-xs font-mono text-stone-400 break-words leading-relaxed">
              {this.state.message}
            </p>
            <Button
              variant="primary"
              size="md"
              pill
              onClick={() => this.setState({ hasError: false, message: "" })}
            >
              Recover Workspace
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppContent() {
  const [openVaults, setOpenVaults] = useState<VaultInfo[]>([]);
  const [activeVaultId, setActiveVaultId] = useState<string | null>(null);
  const [showNewTab, setShowNewTab] = useState<boolean>(false);
  const [pendingVaultPath, setPendingVaultPath] = useState<string | null>(null);
  const [autoLockNotice, setAutoLockNotice] = useState<string | null>(null);
  const [recentVaults, setRecentVaults] = useState<RecentVaultEntry[]>(() =>
    getRecentVaults()
  );

  // Suppress the default WebView browser context menu ("Print", "Refresh", "Save as", etc.) everywhere
  useEffect(() => {
    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    window.addEventListener("contextmenu", handleGlobalContextMenu);
    return () => {
      window.removeEventListener("contextmenu", handleGlobalContextMenu);
    };
  }, []);

  // Check if app was launched via .vault file association / CLI argument on cold start
  useEffect(() => {
    getStartupVaultPath()
      .then((startupPath) => {
        if (startupPath) {
          setPendingVaultPath(startupPath);
        }
      })
      .catch(() => {
        // ignore
      });
  }, []);

  // Listen for single-instance handoff when user opens a .vault file while app is already running
  useEffect(() => {
    const unlistenPromise = listen<string>(
      "vault://open-vault-request",
      (event) => {
        const requestedPath = event.payload;
        if (!requestedPath) return;

        // If already open in a tab, switch directly to that tab
        const normReq = requestedPath.toLowerCase();
        const alreadyOpen = openVaults.find(
          (v) => v.vault_path.toLowerCase() === normReq
        );
        if (alreadyOpen) {
          setActiveVaultId(alreadyOpen.id);
          setShowNewTab(false);
          return;
        }

        // Otherwise prompt to unlock in a new tab
        setPendingVaultPath(requestedPath);
      }
    );

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [openVaults]);

  const handleVaultOpened = useCallback((info: VaultInfo) => {
    setRecentVaults(saveRecentVault(info));
    setOpenVaults((prev) => {
      const exists = prev.some((v) => v.id === info.id);
      if (exists) {
        return prev.map((v) => (v.id === info.id ? info : v));
      }
      return [...prev, info];
    });
    setActiveVaultId(info.id);
    setShowNewTab(false);
    setPendingVaultPath(null);
    setAutoLockNotice(null);
  }, []);

  const handleRemoveRecent = useCallback((vaultPath: string) => {
    setRecentVaults(removeRecentVault(vaultPath));
  }, []);

  const handleCloseVaultTab = useCallback(async (vaultId: string) => {
    try {
      await lockVaultInstance(vaultId);
    } catch {
      // ignore if already locked
    }

    setOpenVaults((prev) => {
      const remaining = prev.filter((v) => v.id !== vaultId);
      setActiveVaultId((currentActive) => {
        if (currentActive === vaultId) {
          return remaining.length > 0
            ? remaining[remaining.length - 1].id
            : null;
        }
        return currentActive;
      });
      if (remaining.length === 0) {
        setShowNewTab(false);
      }
      return remaining;
    });
  }, []);

  const handleCloseOtherTabs = useCallback(
    async (keepVaultId: string) => {
      const others = openVaults.filter((v) => v.id !== keepVaultId);
      for (const v of others) {
        try {
          await lockVaultInstance(v.id);
        } catch {
          // ignore
        }
      }
      setOpenVaults((prev) => prev.filter((v) => v.id === keepVaultId));
      setActiveVaultId(keepVaultId);
      setShowNewTab(false);
    },
    [openVaults]
  );

  // Auto-lock all vaults after 10 minutes of inactivity
  useAutoLock({
    enabled: openVaults.length > 0,
    onAutoLock: () => {
      setOpenVaults([]);
      setActiveVaultId(null);
      setShowNewTab(false);
      setAutoLockNotice("Vaults were closed automatically due to inactivity.");
    },
  });

  // Guarantee active tab ID is always valid when vaults are open
  const effectiveActiveVaultId = useMemo(() => {
    if (openVaults.length === 0) return null;
    if (activeVaultId && openVaults.some((v) => v.id === activeVaultId)) {
      return activeVaultId;
    }
    return openVaults[openVaults.length - 1].id;
  }, [openVaults, activeVaultId]);

  const isLauncherVisible = openVaults.length === 0 || showNewTab;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#121010] text-stone-100 overflow-hidden border border-white/[0.08]">
      {/* Custom Frameless Desktop Top Bar with Integrated Multi-Vault Tabs */}
      <TitleBar
        vaults={openVaults}
        activeTabId={showNewTab ? "new-tab" : effectiveActiveVaultId || ""}
        showNewTab={showNewTab}
        onSelectTab={(id) => {
          if (id === "new-tab") {
            setShowNewTab(true);
          } else {
            setActiveVaultId(id);
            setShowNewTab(false);
          }
        }}
        onCloseTab={handleCloseVaultTab}
        onCloseOtherTabs={handleCloseOtherTabs}
        onOpenNewTab={() => setShowNewTab(true)}
        onCloseNewTab={() => setShowNewTab(false)}
      />

      {/* Welcome Launcher (shown when no vault is open OR user clicked "+" tab) */}
      {isLauncherVisible && (
        <div className="flex-1 flex flex-col overflow-y-auto">
          <WelcomeLauncher
            recentVaults={recentVaults}
            onRemoveRecent={handleRemoveRecent}
            onVaultReady={handleVaultOpened}
            onError={() => {}}
            autoLockNotice={autoLockNotice}
            pendingVaultPath={pendingVaultPath}
            onClearPendingVaultPath={() => setPendingVaultPath(null)}
            enableDragDrop={isLauncherVisible}
          />
        </div>
      )}

      {/* Keep all open Vault Workspaces mounted so switching tabs is instant & preserves state */}
      {openVaults.map((vault) => (
        <Workspace
          key={vault.id}
          vaultInfo={vault}
          isActive={!showNewTab && effectiveActiveVaultId === vault.id}
          onCloseVault={handleCloseVaultTab}
          onOpenDroppedVault={(vaultPath) => {
            const norm = vaultPath.toLowerCase();
            const existing = openVaults.find(
              (v) => v.vault_path.toLowerCase() === norm
            );
            if (existing) {
              setActiveVaultId(existing.id);
              setShowNewTab(false);
            } else {
              setPendingVaultPath(vaultPath);
            }
          }}
        />
      ))}

      {/* Unlock Modal when opening a .vault via OS file association or drag-and-drop while in workspace */}
      {!isLauncherVisible && (
        <UnlockModal
          isOpen={pendingVaultPath !== null}
          vaultDir={pendingVaultPath}
          onClose={() => setPendingVaultPath(null)}
          onUnlocked={handleVaultOpened}
        />
      )}

      {/* Global Transfer Progress Drawer */}
      <TransferQueueDrawer />
    </div>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <AppContent />
    </AppErrorBoundary>
  );
}

export default App;
