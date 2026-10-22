// src/components/workspace/VaultSettingsModal.tsx — Minimalist settings modal for vault-wide properties.

import React from "react";
import {
  Settings,
  Archive,
  X,
  FileBox,
  AlertCircle,
} from "lucide-react";
import { Button } from "../ui/Button";
import type { VaultInfo } from "../../types/vault";

interface VaultSettingsModalProps {
  open: boolean;
  vaultInfo: VaultInfo;
  isCompressed: boolean;
  onClose: () => void;
  onRequestChangeCompression: (enable: boolean) => void;
}

export const VaultSettingsModal: React.FC<VaultSettingsModalProps> = ({
  open,
  vaultInfo,
  isCompressed,
  onClose,
  onRequestChangeCompression,
}) => {
  if (!open) return null;

  const isSingleFile = vaultInfo.vault_path.toLowerCase().endsWith(".vault");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-3xl bg-[#1b1817] border border-white/[0.1] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <Settings className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-100">
                Vault Settings
              </h3>
              <p className="text-xs text-stone-400">
                Configuration and compression properties
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 transition-colors p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Vault Metadata Card */}
          <div className="rounded-2xl bg-[#141211] border border-white/[0.06] p-4 space-y-3">
            <div className="flex items-center gap-3">
              <FileBox className="w-5 h-5 text-purple-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-stone-200 truncate">
                  {vaultInfo.name}
                </div>
                <div className="text-[11px] text-stone-400 truncate font-mono mt-0.5">
                  {vaultInfo.vault_path}
                </div>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-[#201c1a] text-stone-300 shrink-0 border border-white/[0.08]">
                {isSingleFile ? "Single-File .vault" : "Directory Vault"}
              </span>
            </div>
          </div>

          {/* Compression Configuration Card */}
          <div className="rounded-2xl bg-[#141211] border border-white/[0.06] p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                    isCompressed
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      : "bg-[#201c1a] border-white/[0.08] text-stone-400"
                  }`}
                >
                  <Archive className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-stone-200">
                      Zstandard (zstd) Compression
                    </span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                        isCompressed
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : "bg-stone-800 text-stone-400 border-white/[0.06]"
                      }`}
                    >
                      {isCompressed ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-1 leading-relaxed">
                    Transparent chunk-level compression before encryption. Highly
                    compressible files (documents, text, code) consume significantly
                    less disk space.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <Button
                variant={isCompressed ? "outline" : "primary"}
                size="sm"
                pill
                onClick={() => {
                  onRequestChangeCompression(!isCompressed);
                }}
                className="shrink-0 text-xs"
              >
                {isCompressed ? "Disable..." : "Enable..."}
              </Button>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-stone-400 bg-black/20 p-2.5 rounded-xl border border-white/[0.04]">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400/80" />
              <span>
                Changing compression will re-encrypt all existing vault blobs safely
                in the background.
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-6 py-4 bg-[#141211]/50 border-t border-white/[0.06]">
          <Button variant="secondary" size="sm" pill onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
