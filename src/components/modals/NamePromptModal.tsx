// src/components/modals/NamePromptModal.tsx — Minimalist prompt for creating folders or renaming items.

import React, { useState, useEffect } from "react";
import { FolderPlus, Edit3, X } from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

interface NamePromptModalProps {
  open: boolean;
  mode: "create-folder" | "rename";
  initialValue?: string;
  targetType?: "file" | "folder";
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

export const NamePromptModal: React.FC<NamePromptModalProps> = ({
  open,
  mode,
  initialValue = "",
  targetType = "folder",
  onClose,
  onSubmit,
}) => {
  const [name, setName] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialValue);
      setError(null);
      setLoading(false);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name cannot be empty.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            {mode === "create-folder" ? (
              <FolderPlus className="w-5 h-5 text-purple-400" />
            ) : (
              <Edit3 className="w-5 h-5 text-purple-400" />
            )}
            <h3 className="text-base font-semibold text-stone-100">
              {mode === "create-folder"
                ? "New Folder"
                : `Rename ${targetType === "folder" ? "Folder" : "File"}`}
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

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-5">
          <Input
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={mode === "create-folder" ? "Folder name" : "New name"}
            error={error || undefined}
            autoFocus
          />

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={loading}>
              {mode === "create-folder" ? "Create" : "Save"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

