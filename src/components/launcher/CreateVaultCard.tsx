// src/components/launcher/CreateVaultCard.tsx — Clean, intuitive Create Vault card.

import React, { useState } from 'react';
import { FolderPlus, Folder, Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { PasswordStrengthMeter } from '../ui/PasswordStrengthMeter';
import { selectDirectory, createVaultInstance } from '../../services/tauri';
import type { VaultInfo } from '../../types/vault';

interface CreateVaultCardProps {
  onVaultCreated: (info: VaultInfo) => void;
  onError: (err: string) => void;
}

export const CreateVaultCard: React.FC<CreateVaultCardProps> = ({ onVaultCreated, onError }) => {
  const [vaultName, setVaultName] = useState('');
  const [parentDir, setParentDir] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSelectLocation = async () => {
    try {
      const selected = await selectDirectory('Select Location');
      if (selected) {
        setParentDir(selected);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const cleanName = vaultName.trim().replace(/\.vault$/i, '');
  const targetPathPreview =
    parentDir && cleanName
      ? `${parentDir.replace(/[\\/]$/, '')}\\${cleanName}.vault`
      : '';

  const canSubmit =
    cleanName.length > 0 &&
    parentDir.length > 0 &&
    password.length >= 8 &&
    password === confirmPassword &&
    !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    try {
      const info = await createVaultInstance(parentDir, cleanName, password);
      setPassword('');
      setConfirmPassword('');
      onVaultCreated(info);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#131317] border border-neutral-800 rounded-2xl p-7 shadow-xl">
      <div className="flex items-center gap-3.5 mb-6">
        <div className="w-11 h-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
          <FolderPlus className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-semibold text-neutral-100">New Vault</h2>
      </div>

      <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col gap-4 flex-1">
        <Input
          label="Name"
          placeholder="MyVault"
          value={vaultName}
          onChange={(e) => setVaultName(e.target.value)}
          disabled={loading}
          required
        />

        <div className="flex flex-col gap-1.5 text-left">
          <label className="text-sm font-medium text-neutral-200">Location</label>
          <div className="flex gap-2.5">
            <Button
              type="button"
              variant="secondary"
              size="md"
              icon={<Folder className="w-4 h-4 text-neutral-300" />}
              onClick={handleSelectLocation}
              disabled={loading}
              className="shrink-0"
            >
              Browse
            </Button>
            <div className="flex-1 px-3.5 py-2.5 rounded-lg bg-[#18181d] border border-neutral-800 text-sm text-neutral-300 truncate flex items-center">
              {parentDir || 'Select destination folder...'}
            </div>
          </div>
          {targetPathPreview && (
            <div className="text-xs text-neutral-400 truncate mt-0.5 font-mono">
              {targetPathPreview}
            </div>
          )}
        </div>

        <Input
          label="Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
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
          required
        />

        <Input
          label="Confirm Password"
          type={showPassword ? 'text' : 'password'}
          placeholder="Repeat password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
          icon={<Lock className="w-4 h-4" />}
          required
        />

        <PasswordStrengthMeter password={password} confirmPassword={confirmPassword} />

        <div className="mt-auto pt-4">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={!canSubmit}
            className="w-full justify-center"
          >
            {loading ? 'Creating Vault...' : 'Create Vault'}
          </Button>
        </div>
      </form>
    </div>
  );
};
