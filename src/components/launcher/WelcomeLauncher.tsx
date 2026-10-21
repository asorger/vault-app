import React, { useState, useEffect, useCallback } from "react";
import { Lock } from "lucide-react";
import { CreateVaultCard } from "./CreateVaultCard";
import { OpenVaultCard } from "./OpenVaultCard";
import { UnlockModal } from "./UnlockModal";
import { useNativeDragDrop } from "../../hooks/useNativeDragDrop";
import { checkIsVaultPath } from "../../services/tauri";
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
  const [droppedVaultDir, setDroppedVaultDir] = useState<string | null>(null);

  useEffect(() => {
    if (pendingVaultPath) {
      setDroppedVaultDir(pendingVaultPath);
      onClearPendingVaultPath?.();
    }
  }, [pendingVaultPath, onClearPendingVaultPath]);

  const handleDrop = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      const firstPath = paths[0];
      const resolved = await checkIsVaultPath(firstPath);
      if (resolved) {
        setDroppedVaultDir(resolved);
      } else {
        onError("Dropped item is not a valid .vault file.");
      }
    },
    [onError]
  );

  useNativeDragDrop({
    enabled: enableDragDrop,
    onDrop: handleDrop,
  });

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-[#0c0c0e] text-neutral-100 select-none relative overflow-y-auto">
      {autoLockNotice && (
        <div className="mb-6 max-w-xl w-full p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-sm flex items-center justify-center gap-2">
          <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{autoLockNotice}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-7 w-full max-w-4xl z-10">
        <CreateVaultCard onVaultCreated={onVaultReady} onError={onError} />
        <OpenVaultCard
          recentVaults={recentVaults}
          onRemoveRecent={onRemoveRecent}
          onVaultOpened={onVaultReady}
          onError={onError}
        />
      </div>

      <UnlockModal
        isOpen={droppedVaultDir !== null}
        vaultDir={droppedVaultDir}
        onClose={() => setDroppedVaultDir(null)}
        onUnlocked={(info) => {
          setDroppedVaultDir(null);
          onVaultReady(info);
        }}
      />
    </div>
  );
};
