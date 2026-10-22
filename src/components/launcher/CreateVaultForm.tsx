// src/components/launcher/CreateVaultForm.tsx — Minimalist inline create vault view for the launcher stage.

import React, { useState } from "react";
import { FolderPlus, Folder, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { PasswordStrengthMeter } from "../ui/PasswordStrengthMeter";
import { selectDirectory, createVaultInstance } from "../../services/tauri";
import type { VaultInfo } from "../../types/vault";

interface CreateVaultFormProps {
  onBack: () => void;
  onVaultCreated: (info: VaultInfo) => void;
  onError: (err: string) => void;
}

export const CreateVaultForm: React.FC<CreateVaultFormProps> = ({
  onBack,
  onVaultCreated,
  onError,
}) => {
  const [vaultName, setVaultName] = useState("");
  const [parentDir, setParentDir] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSelectLocation = async () => {
    try {
      const selected = await selectDirectory("Select Location");
      if (selected) {
        setParentDir(selected);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  };

  const cleanName = vaultName.trim().replace(/\.vault$/i, "");
  const targetPathPreview =
    parentDir && cleanName
      ? `${parentDir.replace(/[\\/]$/, "")}\\${cleanName}.vault`
      : "";

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
      setPassword("");
      setConfirmPassword("");
      onVaultCreated(info);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto flex flex-col justify-center animate-in fade-in duration-200">
      <button
        type="button"
        onClick={onBack}
        className="self-start flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-200 mb-6 transition-colors cursor-pointer group"
      >
        <ArrowLeft className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to Welcome</span>
      </button>

      <div className="p-8 rounded-3xl bg-[#1a1716] border border-white/[0.08] shadow-2xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0 shadow-lg shadow-purple-950/40">
            <FolderPlus className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-100">
              Create New Vault
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Self-contained offline encrypted archive (.vault)
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
          <Input
            label="Vault Name"
            placeholder="e.g. PersonalDocuments"
            value={vaultName}
            onChange={(e) => setVaultName(e.target.value)}
            disabled={loading}
            autoFocus
            required
          />

          <div className="flex flex-col gap-1.5 text-left">
            <label className="text-xs font-medium tracking-wide text-stone-300">
              Storage Location
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="md"
                icon={<Folder className="w-4 h-4 text-stone-300" />}
                onClick={handleSelectLocation}
                disabled={loading}
                className="shrink-0"
              >
                Browse
              </Button>
              <div className="flex-1 px-3.5 py-2 rounded-xl bg-[#141211] border border-white/[0.08] text-xs text-stone-300 truncate flex items-center">
                {parentDir || "Select directory on disk..."}
              </div>
            </div>
            {targetPathPreview && (
              <p className="text-[11px] font-mono text-stone-400 truncate">
                Target: {targetPathPreview}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Input
              label="Master Password"
              type={showPassword ? "text" : "password"}
              placeholder="Minimum 8 characters..."
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-stone-400 hover:text-stone-200 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              }
              required
            />
            {password.length > 0 && (
              <PasswordStrengthMeter password={password} />
            )}
          </div>

          <Input
            label="Confirm Password"
            type={showPassword ? "text" : "password"}
            placeholder="Re-enter password..."
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            error={
              confirmPassword && password !== confirmPassword
                ? "Passwords do not match"
                : undefined
            }
            required
          />

          <div className="pt-3">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={!canSubmit}
              className="w-full text-sm font-semibold py-3"
            >
              Create Vault
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

