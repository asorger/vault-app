// src/components/workspace/TabBar.tsx — Multi-vault tab bar for managing multiple open vaults.

import React from 'react';
import { FolderLock, Plus, X } from 'lucide-react';
import type { VaultInfo } from '../../types/vault';

interface TabBarProps {
  vaults: VaultInfo[];
  activeTabId: string; // vault.id or 'new-tab'
  showNewTab: boolean;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onOpenNewTab: () => void;
  onCloseNewTab: () => void;
}

export const TabBar: React.FC<TabBarProps> = ({
  vaults,
  activeTabId,
  showNewTab,
  onSelectTab,
  onCloseTab,
  onOpenNewTab,
  onCloseNewTab,
}) => {
  if (vaults.length === 0) return null;

  return (
    <div className="h-10 bg-[#09090b] border-b border-neutral-800 px-2 flex items-end gap-1 select-none shrink-0 overflow-x-auto scrollbar-none">
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
            className={`group flex items-center gap-2.5 px-3.5 py-2 rounded-t-lg border-t border-x text-sm font-medium transition-colors cursor-pointer max-w-[220px] shrink-0 ${
              isActive
                ? 'bg-[#111115] border-neutral-700/80 text-neutral-100'
                : 'bg-[#0c0c0f] border-transparent text-neutral-400 hover:text-neutral-200 hover:bg-[#111115]/50'
            }`}
          >
            <FolderLock
              className={`w-4 h-4 shrink-0 ${
                isActive ? 'text-indigo-400' : 'text-neutral-500'
              }`}
            />
            <span className="truncate">{vault.name}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseTab(vault.id);
              }}
              className="p-0.5 rounded hover:bg-neutral-700/70 text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer ml-1"
              title="Close Vault"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}

      {showNewTab && (
        <div
          onClick={() => onSelectTab('new-tab')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg border-t border-x text-sm font-medium transition-colors cursor-pointer shrink-0 ${
            activeTabId === 'new-tab'
              ? 'bg-[#111115] border-neutral-700/80 text-neutral-100'
              : 'bg-[#0c0c0f] border-transparent text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <span>Open Vault</span>
          {vaults.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCloseNewTab();
              }}
              className="p-0.5 rounded hover:bg-neutral-700/70 text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer ml-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      <button
        onClick={onOpenNewTab}
        className="mb-1 ml-1 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
        title="Open or create another vault"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

