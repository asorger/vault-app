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
    <nav className="flex items-center gap-1 text-sm text-neutral-300 select-none overflow-x-auto py-1 scrollbar-none">
      {breadcrumbs.map((crumb, idx) => {
        const isLast = idx === breadcrumbs.length - 1;
        const isRoot = idx === 0;
        const dropKey = crumb.id === null ? "__root__" : crumb.id;
        const isDropTarget = !isLast && hoveredDropFolderId === dropKey;

        return (
          <React.Fragment key={crumb.id || "vault-root"}>
            {idx > 0 && (
              <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
            )}
            <button
              type="button"
              data-drop-folder-id={!isLast ? dropKey : undefined}
              onClick={() => onNavigate(crumb.id)}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition-all shrink-0 ${
                isDropTarget
                  ? "bg-indigo-600/35 ring-2 ring-indigo-400 text-white"
                  : isLast
                  ? "text-neutral-100 font-semibold bg-neutral-800/80 cursor-default"
                  : "hover:text-white hover:bg-neutral-800/50 text-neutral-300 cursor-pointer"
              }`}
            >
              {isRoot && (
                <FolderLock className="w-4 h-4 text-indigo-400 shrink-0" />
              )}
              <span>{crumb.name}</span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
};
