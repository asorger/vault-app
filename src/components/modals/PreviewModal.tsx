// src/components/modals/PreviewModal.tsx — Minimalist multimedia preview modal (images, videos, audio, text/code).

import React, { useState, useEffect } from "react";
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "../ui/Button";
import { getFileIcon } from "../../utils/fileIcons";
import type { VirtualFile } from "../../types/vault";
import {
  formatBytes,
  formatDate,
  getVaultFileUrl,
  readFileTextPreview,
} from "../../services/tauri";

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

  // Compact file inspector card for binary or audio files
  if (!isRichMedia) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6"
        onClick={onClose}
      >
        <div
          className="w-full max-w-lg rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.08] bg-[#141211]/60">
            <span className="text-xs font-semibold uppercase tracking-wider text-stone-400">
              {isAudio ? "Audio Player" : "File Details"}
            </span>

            <div className="flex items-center gap-2">
              {files.length > 1 && onSelectFile && (
                <div className="flex items-center gap-1 bg-[#201c1a] border border-white/[0.08] rounded-xl px-2 py-0.5 mr-1">
                  <button
                    type="button"
                    disabled={!hasPrev}
                    onClick={() => {
                      const prev = files[currentIndex - 1];
                      if (hasPrev && prev) onSelectFile(prev);
                    }}
                    className="p-1 rounded text-stone-400 hover:text-stone-100 hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="Previous file (Left Arrow)"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-xs text-stone-400 font-mono px-1.5">
                    {currentIndex + 1} / {files.length}
                  </span>
                  <button
                    type="button"
                    disabled={!hasNext}
                    onClick={() => {
                      const next = files[currentIndex + 1];
                      if (hasNext && next) onSelectFile(next);
                    }}
                    className="p-1 rounded text-stone-400 hover:text-stone-100 hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                    title="Next file (Right Arrow)"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="text-stone-400 hover:text-stone-100 transition-colors p-1 rounded-lg hover:bg-white/[0.06] cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-5">
            <div className="flex items-center gap-4 p-4 rounded-xl bg-[#141211] border border-white/[0.06]">
              <div className="w-12 h-12 rounded-xl bg-[#221e1d] border border-white/[0.08] flex items-center justify-center shrink-0">
                {getFileIcon(file.mime_type, file.original_name, {
                  className: "w-6 h-6",
                })}
              </div>
              <div className="min-w-0 flex-1">
                <h3
                  className="text-base font-semibold text-stone-100 truncate"
                  title={file.original_name}
                >
                  {file.original_name}
                </h3>
                <p className="text-xs text-stone-400 font-mono truncate mt-0.5">
                  {file.mime_type}
                </p>
              </div>
            </div>

            {isAudio && (
              <div className="p-3.5 rounded-xl bg-[#141211] border border-white/[0.06]">
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
              <div className="p-3.5 rounded-xl bg-[#141211]/60 border border-white/[0.06]">
                <span className="text-stone-400 block mb-1">File Size</span>
                <span className="text-stone-200 font-mono font-medium">
                  {formatBytes(file.size_bytes)}
                </span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#141211]/60 border border-white/[0.06]">
                <span className="text-stone-400 block mb-1">Date Added</span>
                <span className="text-stone-200 font-medium">
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
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-[#1b1817] border border-white/[0.1] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.08] bg-[#141211]/80 gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-[#221e1d] border border-white/[0.08] flex items-center justify-center shrink-0">
              {getFileIcon(file.mime_type, file.original_name, {
                className: "w-4 h-4",
              })}
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-stone-100 truncate">
                {file.original_name}
              </h3>
              <p className="text-xs text-stone-400 font-mono mt-0.5 truncate">
                {formatBytes(file.size_bytes)} • {formatDate(file.created_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {files.length > 1 && onSelectFile && (
              <div className="flex items-center gap-1 bg-[#201c1a] border border-white/[0.08] rounded-xl px-2 py-1 mr-1">
                <button
                  type="button"
                  disabled={!hasPrev}
                  onClick={() => {
                    const prev = files[currentIndex - 1];
                    if (hasPrev && prev) onSelectFile(prev);
                  }}
                  className="p-1 rounded text-stone-400 hover:text-stone-100 hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                  title="Previous file (Left Arrow)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-stone-400 font-mono px-1.5">
                  {currentIndex + 1} / {files.length}
                </span>
                <button
                  type="button"
                  disabled={!hasNext}
                  onClick={() => {
                    const next = files[currentIndex + 1];
                    if (hasNext && next) onSelectFile(next);
                  }}
                  className="p-1 rounded text-stone-400 hover:text-stone-100 hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
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
              className="text-stone-400 hover:text-stone-100 transition-colors p-1.5 rounded-lg hover:bg-white/[0.06] cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Viewer Body */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-5 bg-[#121010]/95">
          {isImage && (
            <img
              key={file.id}
              src={fileUrl}
              alt={file.original_name}
              onClick={() => setZoomed((z) => !z)}
              className={`rounded-xl shadow-xl transition-all cursor-zoom-in ${
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
              className="w-full max-h-[72vh] rounded-xl shadow-xl bg-black outline-none"
            />
          )}

          {isPdf && (
            <iframe
              key={file.id}
              src={fileUrl}
              title={file.original_name}
              className="w-full h-[72vh] rounded-xl border border-white/[0.08] bg-[#1a1716]"
            />
          )}

          {!isImage && !isVideo && !isPdf && isText && (
            <div className="w-full h-[68vh] rounded-xl bg-[#141211] border border-white/[0.08] overflow-auto p-5">
              {textLoading ? (
                <div className="h-full flex items-center justify-center text-sm text-stone-400 gap-2.5">
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                  <span>Loading file...</span>
                </div>
              ) : textError ? (
                <div className="text-sm text-rose-400">{textError}</div>
              ) : (
                <pre className="text-sm text-stone-200 font-mono whitespace-pre-wrap break-words leading-relaxed select-text">
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

