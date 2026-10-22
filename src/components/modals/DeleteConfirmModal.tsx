// src/components/modals/DeleteConfirmModal.tsx — Minimalist delete confirmation modal.

import React, { useState, useEffect } from "react";
import { Trash2, X } from "lucide-react";
import { Button } from "../ui/Button";

interface DeleteConfirmModalProps {
  open: boolean;
  count: number;
  singleName?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  open,
  count,
  singleName,
  onClose,
  onConfirm,
}) => {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setLoading(false);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !loading) {
        e.preventDefault();
        setLoading(true);
        onConfirm()
          .then(() => onClose())
          .finally(() => setLoading(false));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loading, onClose, onConfirm]);

  if (!open) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <Trash2 className="w-5 h-5 text-rose-400" />
            <h3 className="text-base font-semibold text-stone-100">
              Delete {count === 1 ? "Item" : `${count} Items`}
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

        <div className="p-6 space-y-5">
          <p className="text-sm text-stone-300 leading-relaxed">
            Are you sure you want to permanently delete{" "}
            {count === 1 && singleName ? (
              <span className="font-semibold text-stone-100">
                &ldquo;{singleName}&rdquo;
              </span>
            ) : (
              <span className="font-semibold text-stone-100">
                {count} selected items
              </span>
            )}
            ? This action cannot be undone.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={loading}
              onClick={handleConfirm}
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

