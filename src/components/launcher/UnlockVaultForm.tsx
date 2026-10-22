// src/components/launcher/UnlockVaultForm.tsx — Minimalist inline unlock view for the launcher stage.

import React, { useState } from "react";
import { Lock, Eye, EyeOff, AlertTriangle, ArrowLeft, KeyRound } from "lucide-react";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
import { openVaultInstance } from "../../services/tauri";
import type { VaultInfo } from "../../types/vault";

interface UnlockVaultFormProps {
  vaultPath: string;
  onBack: () => void;
  onUnlocked: (info: VaultInfo) => void;
  onError: (err: string) => void;
}

export const UnlockVaultForm: React.FC<UnlockVaultFormProps> = ({
  vaultPath,
  onBack,
  onUnlocked,
  onError,
}) => {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rawName = vaultPath.split(/[/\\]/).filter(Boolean).pop() || "Vault";
  const displayName = rawName.replace(/\.vault$/i, "");

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;

    setLoading(true);
    setError(null);

    try {
      const info = await openVaultInstance(vaultPath, password);
      setPassword("");
      onUnlocked(info);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.toLowerCase().includes("password") ||
        msg.toLowerCase().includes("crypt")
      ) {
        setError("Incorrect password.");
      } else {
        setError(msg);
        onError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col justify-center animate-in fade-in duration-200">
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
            <KeyRound className="w-7 h-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-stone-100 truncate">
              {displayName}
            </h2>
            <p className="text-xs text-stone-400 font-mono truncate mt-0.5">
              {vaultPath}
            </p>
          </div>
        </div>

        <form onSubmit={handleUnlock} autoComplete="off" className="space-y-4">
          <Input
            label="Master Password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter vault password..."
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError(null);
            }}
            disabled={loading}
            autoFocus
            icon={<Lock className="w-4 h-4 text-stone-400" />}
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
          />

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              disabled={!password || loading}
              className="w-full text-sm font-semibold py-3"
            >
              Unlock Vault
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

