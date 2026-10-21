// src/types/vault.ts — TypeScript interfaces matching Rust Tauri models.

export interface VaultInfo {
  id: string;
  name: string;
  vault_path: string;
}

export interface RecentVaultEntry {
  name: string;
  vault_path: string;
  last_opened: number;
}

export interface VirtualFolder {
  id: string;
  parent_id: string | null;
  name: string;
  size_bytes: number;
  file_count: number;
  created_at: string;
}

export interface VirtualFile {
  id: string;
  folder_id: string | null;
  blob_id: string;
  original_name: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
  compressed?: boolean;
}

export interface BreadcrumbItem {
  id: string | null;
  name: string;
}

export interface DirectoryListing {
  current_folder_id: string | null;
  folders: VirtualFolder[];
  files: VirtualFile[];
  breadcrumbs: BreadcrumbItem[];
}

export interface ItemIdentifier {
  id: string;
  is_folder: boolean;
}

export interface SearchResults {
  query: string;
  folders: VirtualFolder[];
  files: VirtualFile[];
}

export interface TransferProgressPayload {
  phase: "ingest" | "export" | "delete";
  current_item: string;
  items_completed: number;
  total_items: number;
  bytes_processed: number;
  total_bytes: number;
}

export interface SkippedFile {
  name: string;
  reason: string;
}

export interface IngestReport {
  imported_files: number;
  skipped_files: SkippedFile[];
}

export type ViewMode = "grid" | "table";
export type GridSize = "sm" | "md" | "lg";

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetType: "file" | "folder" | "parent" | null;
  targetId: string | null;
  targetName: string | null;
}
