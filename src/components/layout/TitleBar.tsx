import React, { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Shield,
  FolderLock,
  Plus,
  X,
  Minus,
  Square,
  Copy,
  CopyCheck,
  Lock,
} from "lucide-react";
import type { VaultInfo } from "../../types/vault";

interface TitleBarProps {
  vaults: VaultInfo[];
  activeTabId: string; // vault.id or 'new-tab'
  showNewTab: boolean;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onCloseOtherTabs?: (keepId: string) => void;
  onOpenNewTab: () => void;
  onCloseNewTab: () => void;
}

interface TabContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  vault: VaultInfo | null;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  vaults,
  activeTabId,
  showNewTab,
  onSelectTab,
  onCloseTab,
  onCloseOtherTabs,
  onOpenNewTab,
  onCloseNewTab,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [tabMenu, setTabMenu] = useState<TabContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    vault: null,
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const appWin = getCurrentWindow();
    let unlistenResize: (() => void) | null = null;

    appWin
      .isMaximized()
      .then(setIsMaximized)
      .catch(() => {});

    appWin
      .onResized(async () => {
        try {
          const max = await appWin.isMaximized();
          setIsMaximized(max);
        } catch {
          // ignore
        }
      })
      .then((unlisten) => {
        unlistenResize = unlisten;
      })
      .catch(() => {});

    return () => {
      if (unlistenResize) unlistenResize();
    };
  }, []);

  useEffect(() => {
    if (!tabMenu.visible) return;
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setTabMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setTabMenu((prev) => ({ ...prev, visible: false }));
      }
    };
    window.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleKey);
    };
  }, [tabMenu.visible]);

  const handleMinimize = async () => {
    try {
      await getCurrentWindow().minimize();
    } catch {
      // ignore
    }
  };

  const handleToggleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      setIsMaximized(await win.isMaximized());
    } catch {
      // ignore
    }
  };

  const handleCloseWindow = async () => {
    try {
      await getCurrentWindow().close();
    } catch {
      // ignore
    }
  };

  const handleDragMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-drag]")) return;
    if (e.detail === 2) {
      handleToggleMaximize();
      return;
    }
    getCurrentWindow().startDragging().catch(() => {});
  };

  return (
    <>
      <div
        onMouseDown={handleDragMouseDown}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
        className="h-10 bg-[#09090d] border-b border-white/[0.06] flex items-center justify-between select-none shrink-0 z-40"
      >
        {/* Left: App Brand + Integrated Vault Tabs */}
        <div className="flex items-center h-full min-w-0 flex-1 pl-3 gap-2 overflow-hidden">
          {/* Brand Mark */}
          <div className="flex items-center gap-2 pr-2 shrink-0 pointer-events-none">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-indigo-500/25 to-indigo-600/10 border border-indigo-500/30 flex items-center justify-center shadow-inner">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <span className="text-xs font-semibold tracking-wide text-zinc-200">
              Vault
            </span>
          </div>

          {vaults.length > 0 && (
            <div className="h-4 w-[1px] bg-white/[0.07] shrink-0 mr-1" />
          )}

          {/* Integrated Multi-Vault Tabs */}
          {vaults.length > 0 && (
            <div
              data-no-drag
              className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1 min-w-0"
            >
              {vaults.map((vault) => {
                const isActive = activeTabId === vault.id;
                return (
                  <div
                    key={vault.id}
                    onClick={() => onSelectTab(vault.id)}
                    onAuxClick={(e) => {
                      if (e.button === 1) {
                        e.preventDefault();
                        onCloseTab(vault.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setTabMenu({
                        visible: true,
                        x: e.clientX,
                        y: e.clientY,
                        vault,
                      });
                    }}
                    className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer max-w-[210px] shrink-0 border ${
                      isActive
                        ? "bg-[#16161d] border-white/[0.1] text-zinc-100 shadow-sm"
                        : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                    }`}
                  >
                    <FolderLock
                      className={`w-3.5 h-3.5 shrink-0 ${
                        isActive ? "text-indigo-400" : "text-zinc-500"
                      }`}
                    />
                    <span className="truncate">{vault.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(vault.id);
                      }}
                      className="p-0.5 rounded-md hover:bg-white/[0.1] text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer ml-0.5"
                      title="Close Vault Tab"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}

              {showNewTab && (
                <div
                  onClick={() => onSelectTab("new-tab")}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer shrink-0 border ${
                    activeTabId === "new-tab"
                      ? "bg-[#16161d] border-white/[0.1] text-zinc-100 shadow-sm"
                      : "bg-transparent border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                  }`}
                >
                  <span>Open Vault</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseNewTab();
                    }}
                    className="p-0.5 rounded-md hover:bg-white/[0.1] text-zinc-500 hover:text-zinc-200 transition-colors cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onOpenNewTab}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer shrink-0"
                title="Open or create another vault"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Native-Style Window Controls */}
        <div data-no-drag className="flex items-center h-full shrink-0">
          <button
            type="button"
            onClick={handleMinimize}
            title="Minimize"
            className="w-11 h-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggleMaximize}
            title={isMaximized ? "Restore Down" : "Maximize"}
            className="w-11 h-full flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            {isMaximized ? (
              <Copy className="w-3.5 h-3.5 rotate-180" />
            ) : (
              <Square className="w-3 h-3" />
            )}
          </button>
          <button
            type="button"
            onClick={handleCloseWindow}
            title="Close"
            className="w-11 h-full flex items-center justify-center text-zinc-400 hover:bg-[#e81123] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tab Right-Click Context Menu */}
      {tabMenu.visible && tabMenu.vault && (
        <div
          ref={menuRef}
          style={{
            top: Math.min(tabMenu.y, window.innerHeight - 180),
            left: Math.min(tabMenu.x, window.innerWidth - 220),
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          className="fixed z-50 w-52 rounded-xl bg-zinc-900/95 backdrop-blur-md border border-zinc-800 shadow-2xl py-1.5 text-xs text-zinc-200 select-none"
        >
          <div className="px-3 py-1.5 border-b border-zinc-800/80 mb-1">
            <p className="font-semibold text-zinc-200 truncate">
              {tabMenu.vault.name}
            </p>
            <p className="text-[11px] font-mono text-zinc-500 truncate">
              {tabMenu.vault.vault_path}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              if (tabMenu.vault) {
                navigator.clipboard?.writeText(tabMenu.vault.vault_path);
                setCopiedId(tabMenu.vault.id);
                setTimeout(() => setCopiedId(null), 1500);
              }
              setTabMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
          >
            {copiedId === tabMenu.vault.id ? (
              <CopyCheck className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <span>Copy Vault File Path</span>
          </button>

          {vaults.length > 1 && onCloseOtherTabs && (
            <button
              type="button"
              onClick={() => {
                if (tabMenu.vault) {
                  onCloseOtherTabs(tabMenu.vault.id);
                }
                setTabMenu((prev) => ({ ...prev, visible: false }));
              }}
              className="w-full px-3 py-2 flex items-center gap-2.5 hover:bg-zinc-800 transition-colors text-left"
            >
              <X className="w-3.5 h-3.5 text-zinc-400" />
              <span>Close Other Vault Tabs</span>
            </button>
          )}

          <div className="my-1 border-t border-zinc-800/80" />

          <button
            type="button"
            onClick={() => {
              if (tabMenu.vault) {
                onCloseTab(tabMenu.vault.id);
              }
              setTabMenu((prev) => ({ ...prev, visible: false }));
            }}
            className="w-full px-3 py-2 flex items-center gap-2.5 text-red-400 hover:bg-red-950/50 hover:text-red-300 transition-colors text-left"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Close Vault</span>
          </button>
        </div>
      )}
    </>
  );
};

