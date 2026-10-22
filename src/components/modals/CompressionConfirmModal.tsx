// src/components/modals/CompressionConfirmModal.tsx — Minimalist modal confirming vault-wide retroactive compression.

import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { Button } from "../ui/Button";

interface CompressionConfirmModalProps {
  open: boolean;
  enable: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const CompressionConfirmModal: React.FC<CompressionConfirmModalProps> = ({
  open,
  enable,
  onClose,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-base font-semibold text-stone-100">
              {enable ? "Enable Vault Compression" : "Disable Vault Compression"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-200 transition-colors p-1 rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-300 leading-relaxed">
            {enable
              ? "Enabling vault compression will re-process and re-encrypt all existing files in this vault with Zstandard (zstd) compression."
              : "Disabling vault compression will re-process and re-encrypt all existing files in this vault to uncompressed format."}
          </p>

          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3.5 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-200/90 leading-relaxed font-medium">
              This process may take several minutes depending on vault size. Do not close the application or disconnect your storage drive during migration.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#141211]/50 border-t border-white/[0.08]">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {enable ? "Enable & Migrate" : "Disable & Decompress"}
          </Button>
        </div>
      </div>
    </div>
  );
};

