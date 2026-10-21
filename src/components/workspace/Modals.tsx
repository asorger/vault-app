import React, { useState, useEffect } from "react";
import {
  FolderPlus,
  Edit3,
  Trash2,
  Flame,
  X,
  Download,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  HardDrive,
} from "lucide-react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { getFileIcon } from "./GridView";
import type { VirtualFile } from "../../types/vault";
import {
  formatBytes,
  formatDate,
  getVaultFileUrl,
  readFileTextPreview,
} from "../../services/tauri";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            {mode === "create-folder" ? (
              <FolderPlus className="w-5 h-5 text-indigo-400" />
            ) : (
              <Edit3 className="w-5 h-5 text-indigo-400" />
            )}
            <h3 className="text-base font-semibold text-zinc-100">
              {mode === "create-folder"
                ? "New Folder"
                : `Rename ${targetType === "folder" ? "Folder" : "File"}`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
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

          <div className="flex items-center justify-end gap-2.5">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <Trash2 className="w-5 h-5 text-red-400" />
            <h3 className="text-base font-semibold text-zinc-100">
              Delete {count === 1 ? "Item" : `${count} Items`}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Are you sure you want to permanently delete{" "}
            {count === 1 && singleName ? (
              <span className="font-semibold text-zinc-100">&ldquo;{singleName}&rdquo;</span>
            ) : (
              <span className="font-semibold text-zinc-100">{count} selected items</span>
            )}
            ? This action cannot be undone.
          </p>

          <div className="flex items-center justify-end gap-2.5">
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
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

interface ShredConfirmModalProps {
  open: boolean;
  paths: string[];
  onCancel: () => void;
  onImportKeepOriginals: () => Promise<void>;
  onImportAndShred: () => Promise<void>;
}

export const ShredConfirmModal: React.FC<ShredConfirmModalProps> = ({
  open,
  paths,
  onCancel,
  onImportKeepOriginals,
  onImportAndShred,
}) => {
  const [loadingMode, setLoadingMode] = useState<"shred" | "keep" | null>(null);

  useEffect(() => {
    if (!open) {
      setLoadingMode(null);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loadingMode) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, loadingMode, onCancel]);

  if (!open || paths.length === 0) return null;

  const fileNames = paths.map(
    (p) => p.split(/[/\\]/).filter(Boolean).pop() || p
  );

  const handleShred = async () => {
    setLoadingMode("shred");
    try {
      await onImportAndShred();
    } finally {
      setLoadingMode(null);
    }
  };

  const handleKeep = async () => {
    setLoadingMode("keep");
    try {
      await onImportKeepOriginals();
    } finally {
      setLoadingMode(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <Flame className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-semibold text-zinc-100">
              Delete Original {paths.length === 1 ? "File" : "Files"} Forever?
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loadingMode !== null}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Do you want to permanently delete{" "}
            {paths.length === 1 ? (
              <span className="font-semibold text-zinc-100">
                &ldquo;{fileNames[0]}&rdquo;
              </span>
            ) : (
              <span className="font-semibold text-zinc-100">
                {paths.length} items
              </span>
            )}{" "}
            from your computer after importing into this vault? Deleted original
            files cannot be recovered.
          </p>

          {paths.length > 1 && (
            <div className="max-h-28 overflow-y-auto rounded-lg bg-zinc-950/70 border border-zinc-800/80 px-3 py-2 text-xs font-mono text-zinc-400 space-y-1">
              {fileNames.map((name, idx) => (
                <div key={idx} className="truncate">
                  • {name}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onCancel}
              disabled={loadingMode !== null}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={loadingMode === "keep"}
              disabled={loadingMode !== null}
              onClick={handleKeep}
            >
              Import Only (Keep Originals)
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={loadingMode === "shred"}
              disabled={loadingMode !== null}
              onClick={handleShred}
            >
              Import & Delete Forever
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DiskSpaceWarningModalProps {
  open: boolean;
  errorMessage: string;
  onClose: () => void;
}

export const DiskSpaceWarningModal: React.FC<DiskSpaceWarningModalProps> = ({
  open,
  errorMessage,
  onClose,
}) => {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const reqMatch = errorMessage.match(/required_bytes=(\d+)/);
  const availMatch = errorMessage.match(/available_bytes=(\d+)/);
  const requiredBytes = reqMatch ? Number(reqMatch[1]) : null;
  const availableBytes = availMatch ? Number(availMatch[1]) : null;
  const shortfallBytes =
    requiredBytes !== null && availableBytes !== null && requiredBytes > availableBytes
      ? requiredBytes - availableBytes
      : null;

  const cleanMessage = errorMessage.replace(/\s*\(required_bytes=.*\)$/, "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-red-400" />
            <h3 className="text-base font-semibold text-zinc-100">
              Not Enough Disk Space
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-zinc-300 leading-relaxed">
            There is not enough free space on the target drive to complete this
            operation. No files were imported or modified.
          </p>

          {requiredBytes !== null && availableBytes !== null ? (
            <div className="rounded-xl bg-zinc-950/80 border border-zinc-800 p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Required Space</span>
                <span className="font-mono font-semibold text-zinc-100">
                  {formatBytes(requiredBytes)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400">Available on Drive</span>
                <span className="font-mono font-semibold text-amber-400">
                  {formatBytes(availableBytes)}
                </span>
              </div>
              {shortfallBytes !== null && (
                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                  <span className="text-red-300 font-medium">
                    Additional Space Needed
                  </span>
                  <span className="font-mono font-semibold text-red-400">
                    {formatBytes(shortfallBytes)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-red-950/40 border border-red-800/60 p-3.5 text-xs text-red-200">
              {cleanMessage}
            </div>
          )}

          <div className="flex items-center justify-end pt-1">
            <Button type="button" variant="primary" onClick={onClose}>
              Understood
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PreviewModalProps {
  vaultId: string;
  file: VirtualFile | null;
  files?: VirtualFile[];
  onSelectFile?: (file: VirtualFile) => void;
  onClose: () => void;
  onExport: (file: VirtualFile) => void;
}

function isTextPreviewable(mime: string, name: string): boolean {
  const lower = name.toLowerCase();
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    mime === "application/javascript" ||
    mime === "application/x-sh"
  ) {
    return true;
  }
  return /\.(txt|md|markdown|json|csv|log|ts|tsx|js|jsx|py|rs|go|c|cpp|h|hpp|cs|java|html|htm|css|scss|sh|bat|ps1|yaml|yml|toml|ini|cfg|conf|sql|xml|env|gitignore)$/.test(
    lower
  );
}

export const PreviewModal: React.FC<PreviewModalProps> = ({
  vaultId,
  file,
  files = [],
  onSelectFile,
  onClose,
  onExport,
}) => {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);

  const currentIndex = file ? files.findIndex((f) => f.id === file.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < files.length - 1;

  useEffect(() => {
    setZoomed(false);
    setTextContent(null);
    setTextError(null);

    if (!file) return;

    if (isTextPreviewable(file.mime_type, file.original_name)) {
      setTextLoading(true);
      readFileTextPreview(file.id, 524288, vaultId)
        .then((text) => {
          setTextContent(text);
        })
        .catch((err) => {
          setTextError(String(err));
        })
        .finally(() => {
          setTextLoading(false);
        });
    }
  }, [file, vaultId]);

  useEffect(() => {
    if (!file) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft" && hasPrev && onSelectFile) {
        const prev = files[currentIndex - 1];
        if (prev) onSelectFile(prev);
      } else if (e.key === "ArrowRight" && hasNext && onSelectFile) {
        const next = files[currentIndex + 1];
        if (next) onSelectFile(next);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [file, hasPrev, hasNext, currentIndex, files, onSelectFile, onClose]);

  if (!file) return null;

  const lower = file.original_name.toLowerCase();
  const isImage =
    file.mime_type.startsWith("image/") ||
    /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|avif)$/.test(lower);
  const isVideo =
    file.mime_type.startsWith("video/") ||
    /\.(mp4|webm|mov|mkv|m4v|avi|ogv)$/.test(lower);
  const isAudio =
    file.mime_type.startsWith("audio/") ||
    /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/.test(lower);
  const isPdf = file.mime_type === "application/pdf" || lower.endsWith(".pdf");
  const isText = isTextPreviewable(file.mime_type, file.original_name);

  const isRichMedia = isImage || isVideo || isPdf || isText;
  const fileUrl = getVaultFileUrl(vaultId, file.id);

  // Compact, well-proportioned File Inspector Card for binary/non-previewable & audio files
  if (!isRichMedia) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl bg-[#121217] border border-zinc-800/90 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Compact Top Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-950/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {isAudio ? "Audio Player" : "File Details"}
            </span>

            <div className="flex items-center gap-2">
              {files.length > 1 && onSelectFile && (
                <div className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-lg px-1.5 py-0.5 mr-1">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={() => {
                      const prev = files[currentIndex - 1];
                      if (hasPrev && prev) onSelectFile(prev);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="Previous file (Left Arrow)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-zinc-400 font-mono px-1.5">
                    {currentIndex + 1} / {files.length}
                  </span>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => {
                      const next = files[currentIndex + 1];
                      if (hasNext && next) onSelectFile(next);
                    }}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="Next file (Right Arrow)"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="text-zinc-400 hover:text-zinc-100 transition-colors p-1 rounded-lg hover:bg-zinc-800 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Card Content */}
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
              <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                {getFileIcon(file.mime_type, file.original_name, "w-6 h-6")}
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="text-base font-semibold text-zinc-100 truncate"
                  title={file.original_name}
                >
                  {file.original_name}
                </h3>
                <p className="text-xs text-zinc-400 font-mono truncate mt-0.5">
                  {file.mime_type}
                </p>
              </div>
            </div>

            {isAudio && (
              <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
                <audio
                  key={file.id}
                  src={fileUrl}
                  controls
                  autoPlay
                  className="w-full h-10"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-zinc-950/50 border border-zinc-800/70">
                <span className="text-zinc-500 block mb-1">File Size</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {formatBytes(file.size_bytes)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950/50 border border-zinc-800/70">
                <span className="text-zinc-500 block mb-1">Date Added</span>
                <span className="text-zinc-200 font-medium">
                  {formatDate(file.created_at)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <Button variant="ghost" size="md" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="primary"
                size="md"
                icon={<Download className="w-4 h-4" />}
                onClick={() => onExport(file)}
              >
                Export File
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-[#121217] border border-zinc-800 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 bg-zinc-950/70 gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
              {getFileIcon(file.mime_type, file.original_name, "w-4 h-4")}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-zinc-100 truncate">
                {file.original_name}
              </h3>
              <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                {formatBytes(file.size_bytes)} • {formatDate(file.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {files.length > 1 && onSelectFile && (
              <div className="flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-lg px-1.5 py-1 mr-1">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => {
                    const prev = files[currentIndex - 1];
                    if (hasPrev && prev) onSelectFile(prev);
                  }}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Previous file (Left Arrow)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-zinc-400 font-mono px-1.5">
                  {currentIndex + 1} / {files.length}
                </span>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => {
                    const next = files[currentIndex + 1];
                    if (hasNext && next) onSelectFile(next);
                  }}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Next file (Right Arrow)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {isImage && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setZoomed((z) => !z)}
                title={zoomed ? "Fit to window" : "Zoom in"}
              >
                {zoomed ? (
                  <ZoomOut className="w-4 h-4" />
                ) : (
                  <ZoomIn className="w-4 h-4" />
                )}
              </Button>
            )}

            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="w-4 h-4 text-emerald-400" />}
              onClick={() => onExport(file)}
            >
              Export
            </Button>

            <button
              type="button"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-100 transition-colors p-1.5 rounded-lg hover:bg-zinc-800 cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewer Body */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-5 bg-zinc-950/90">
          {isImage && (
            <img
              key={file.id}
              src={fileUrl}
              alt={file.original_name}
              onClick={() => setZoomed((z) => !z)}
              className={`rounded-lg shadow-lg transition-all cursor-zoom-in ${
                zoomed
                  ? "max-w-none scale-125 cursor-zoom-out"
                  : "max-w-full max-h-[72vh] object-contain"
              }`}
            />
          )}

          {isVideo && (
            <video
              key={file.id}
              src={fileUrl}
              controls
              autoPlay
              playsInline
              className="w-full max-h-[72vh] rounded-lg shadow-lg bg-black outline-none"
            />
          )}

          {isPdf && (
            <iframe
              key={file.id}
              src={fileUrl}
              title={file.original_name}
              className="w-full h-[72vh] rounded-lg border border-zinc-800 bg-zinc-900"
            />
          )}

          {!isImage && !isVideo && !isPdf && isText && (
            <div className="w-full h-[68vh] rounded-xl bg-zinc-900/90 border border-zinc-800 overflow-auto p-5">
              {textLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-zinc-400 gap-2.5">
                  <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading file...</span>
                </div>
              ) : textError ? (
                <div className="text-sm text-red-400">{textError}</div>
              ) : (
                <pre className="text-sm text-zinc-200 font-mono whitespace-pre-wrap break-words leading-relaxed select-text">
                  {textContent}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
