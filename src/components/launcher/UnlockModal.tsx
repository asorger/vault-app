// src/components/launcher/UnlockModal.tsx — Clean password prompt modal to open a vault.

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { openVaultInstance } from '../../services/tauri';
import type { VaultInfo } from '../../types/vault';

interface UnlockModalProps {
  isOpen: boolean;
  vaultDir: string | null;
  onClose: () => void;
  onUnlocked: (info: VaultInfo) => void;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({
  isOpen,
  vaultDir,
  onClose,
  onUnlocked,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawFolderName = vaultDir
    ? vaultDir.split(/[/\\]/).filter(Boolean).pop() || 'Vault'
    : 'Vault';
  const displayName = rawFolderName.replace(/\.vault$/i, '');

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultDir || !password || loading) return;

    setLoading(true);
    setError(null);

    try {
      const info = await openVaultInstance(vaultDir, password);
      setPassword('');
      onUnlocked(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('password') || msg.toLowerCase().includes('crypt')) {
        setError('Incorrect password.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Open "${displayName}"`}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleUnlock} autoComplete="off" className="flex flex-col gap-4 text-left">
        <div className="px-3.5 py-2.5 rounded-lg bg-[#18181d] border border-neutral-800 text-xs font-mono text-neutral-400 truncate">
          {vaultDir}
        </div>

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Enter password..."
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (error) setError(null);
          }}
          disabled={loading}
          autoFocus
          icon={<Lock className="w-4 h-4" />}
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="p-1 text-neutral-400 hover:text-neutral-200 cursor-pointer"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          }
        />

        {error && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-500/30 text-sm text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 mt-2">
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={loading}
            disabled={!password || loading}
          >
            {loading ? 'Opening...' : 'Open Vault'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
