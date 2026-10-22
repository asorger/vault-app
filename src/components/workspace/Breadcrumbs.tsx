// src/components/workspace/Breadcrumbs.tsx — Minimalist pill breadcrumb trail for vault folder navigation.

import React from "react";
import { ChevronRight, FolderLock } from "lucide-react";
import type { BreadcrumbItem } from "../../types/vault";

interface BreadcrumbsProps {
  breadcrumbs: BreadcrumbItem[];
  hoveredDropFolderId?: string | null;
  onNavigate: (folderId: string | null) => void;
}

export const Breadcrumbs: React.FC<BreadcrumbsProps> = ({
  breadcrumbs,
  hoveredDropFolderId,
  onNavigate,
}) => {
  return (
    <nav className="flex items-center gap-1 text-xs select-none overflow-x-auto py-1 scrollbar-none">
      {breadcrumbs.map((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        const isRoot = idx === 0;
        const dropKey = crumb.id === null ? "__root__" : crumb.id;
        const isDropTarget = !isLast && hoveredDropFolderId === dropKey;

        return (
          <React.Fragment key={crumb.id || "vault-root"}>
            {idx > 0 && (
              <ChevronRight className="w-3.5 h-3.5 text-stone-600 shrink-0" />
            )}
            <button
              type="button"
              data-drop-folder-id={!isLast ? dropKey : undefined}
              onClick={() => onNavigate(crumb.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl transition-all shrink-0 border ${
                isDropTarget
                  ? "bg-purple-950/40 ring-2 ring-purple-400 text-white border-purple-400"
                  : isLast
                  ? "text-stone-100 font-semibold bg-[#221e1d] border-white/[0.08] shadow-sm cursor-default"
                  : "hover:text-stone-100 hover:bg-white/[0.04] text-stone-400 border-transparent cursor-pointer"
              }`}
            >
              {isRoot && (
                <FolderLock className="w-3.5 h-3.5 text-purple-400 shrink-0" />
              )}
              <span className="truncate max-w-[140px]">{crumb.name}</span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};
