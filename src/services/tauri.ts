// src/services/tauri.ts — Type-safe IPC wrapper functions for Tauri v2 backend commands.

import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  VaultInfo,
  RecentVaultEntry,
  DirectoryListing,
  VirtualFolder,
  ItemIdentifier,
  SearchResults,
  IngestReport,
} from "../types/vault";

const RECENT_VAULTS_KEY = "vault_recent_items_v1";
const MAX_RECENT_VAULTS = 8;

/**
 * Retrieve the list of recently opened vaults from localStorage.
 */
export function getRecentVaults(): RecentVaultEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_VAULTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RecentVaultEntry =>
        typeof item?.name === "string" &&
        typeof item?.vault_path === "string" &&
        typeof item?.last_opened === "number"
    );
  } catch {
    return [];
  }
}

/**
 * Add or bump a vault in the recently opened vaults list.
 */
export function saveRecentVault(info: { name: string; vault_path: string }): RecentVaultEntry[] {
  try {
    const existing = getRecentVaults();
    const normTarget = info.vault_path.toLowerCase();
    const filtered = existing.filter(
      (item) => item.vault_path.toLowerCase() !== normTarget
    );
    const updated: RecentVaultEntry[] = [
      {
        name: info.name,
        vault_path: info.vault_path,
        last_opened: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT_VAULTS);
    localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

/**
 * Remove a vault path from the recently opened vaults list.
 */
export function removeRecentVault(vaultPath: string): RecentVaultEntry[] {
  try {
    const existing = getRecentVaults();
    const normTarget = vaultPath.toLowerCase();
    const updated = existing.filter(
      (item) => item.vault_path.toLowerCase() !== normTarget
    );
    localStorage.setItem(RECENT_VAULTS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

/**
 * Format byte count into human-readable string (e.g., "14.2 MB").
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(k)),
    units.length - 1
  );
  const val = bytes / Math.pow(k, i);
  return `${val >= 10 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

/**
 * Format SQLite / ISO date string or timestamp into readable local date.
 */
export function formatDate(value: string | number): string {
  if (!value) return "—";
  if (typeof value === "string") {
    const legacyMatch = value.match(/\+(\d+)s$/);
    if (legacyMatch) {
      const secs = Number(legacyMatch[1]);
      if (!Number.isNaN(secs)) {
        const d = new Date(secs * 1000);
        if (!Number.isNaN(d.getTime())) {
          return d.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          });
        }
      }
    }
  }
  const d =
    typeof value === "number"
      ? new Date(value > 1e12 ? value : value * 1000)
      : new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Convert a vault file ID into a WebView-compatible streaming URL (`http://vault.localhost/...`).
 */
export function getVaultFileUrl(vaultId: string, fileId: string): string {
  return convertFileSrc(`file/${vaultId}/${fileId}`, "vault");
}

/**
 * Query OS hardware keyboard state to check if Shift is currently held down.
 */
export async function isShiftKeyPressed(): Promise<boolean> {
  return await invoke<boolean>("is_shift_key_pressed");
}

/**
 * Check if an outbound OS file drag from this app is currently active.
 */
export async function isOutboundDragging(): Promise<boolean> {
  return await invoke<boolean>("is_outbound_dragging");
}

/**
 * Check if the app was launched via CLI / file association with a `.vault` path.
 */
export async function getStartupVaultPath(): Promise<string | null> {
  return await invoke<string | null>("get_startup_vault_path");
}

/**
 * Check if an OS path is a `.vault` file or vault directory.
 */
export async function checkIsVaultPath(path: string): Promise<string | null> {
  return await invoke<string | null>("check_is_vault_path", { path });
}

/**
 * Create a new vault instance and return its session info.
 */
export async function createVaultInstance(
  parentDir: string,
  name: string,
  password: string
): Promise<VaultInfo> {
  return await invoke<VaultInfo>("create_vault_instance", {
    parentDir,
    name,
    password,
  });
}

/**
 * Open an existing vault (`.vault` file or vault directory) and return its session info.
 */
export async function openVaultInstance(
  vaultDir: string,
  password: string
): Promise<VaultInfo> {
  return await invoke<VaultInfo>("open_vault_instance", {
    vaultDir,
    password,
  });
}

/**
 * Safely close/lock a specific vault session (or all sessions if vaultId is omitted).
 */
export async function lockVaultInstance(vaultId?: string): Promise<void> {
  return await invoke<void>("lock_vault_instance", {
    vaultId: vaultId ?? null,
  });
}

/**
 * List files, subfolders (with recursive sizes), and breadcrumbs for a given virtual folder.
 */
export async function listDirectory(
  folderId: string | null = null,
  vaultId?: string
): Promise<DirectoryListing> {
  return await invoke<DirectoryListing>("list_directory", {
    folderId,
    vaultId: vaultId ?? null,
  });
}

/**
 * Create a new virtual folder inside the specified vault.
 */
export async function createVirtualFolder(
  parentId: string | null,
  name: string,
  vaultId?: string
): Promise<VirtualFolder> {
  return await invoke<VirtualFolder>("create_virtual_folder", {
    parentId,
    name,
    vaultId: vaultId ?? null,
  });
}

/**
 * Rename a virtual file or folder.
 */
export async function renameVirtualItem(
  id: string,
  isFolder: boolean,
  newName: string,
  vaultId?: string
): Promise<void> {
  return await invoke<void>("rename_virtual_item", {
    id,
    isFolder,
    newName,
    vaultId: vaultId ?? null,
  });
}

/**
 * Move virtual files and/or folders into another virtual folder (or root if targetFolderId is null).
 */
export async function moveVirtualItems(
  items: ItemIdentifier[],
  targetFolderId: string | null,
  vaultId?: string
): Promise<void> {
  return await invoke<void>("move_virtual_items", {
    items,
    targetFolderId,
    vaultId: vaultId ?? null,
  });
}

/**
 * Delete virtual files and/or folders permanently.
 */
export async function deleteVirtualItems(
  items: ItemIdentifier[],
  vaultId?: string
): Promise<void> {
  return await invoke<void>("delete_virtual_items", {
    items,
    vaultId: vaultId ?? null,
  });
}

/**
 * Ingest OS files/folders into the vault, optionally shredding originals.
 * Returns a summary of imported files and any unreadable/antivirus-skipped files.
 */
export async function ingestOsPaths(
  paths: string[],
  targetFolderId: string | null,
  shredOriginals: boolean,
  vaultId?: string,
  compress?: boolean
): Promise<IngestReport> {
  return await invoke<IngestReport>("ingest_os_paths", {
    paths,
    targetFolderId,
    shredOriginals,
    compress: compress ?? false,
    vaultId: vaultId ?? null,
  });
}

/**
 * Export virtual files or folders to an OS destination directory.
 */
export async function exportVirtualItems(
  items: ItemIdentifier[],
  destinationDir: string,
  vaultId?: string
): Promise<void> {
  return await invoke<void>("export_virtual_items", {
    items,
    destinationDir,
    vaultId: vaultId ?? null,
  });
}

/**
 * Start a native OS file drag-out operation for selected vault items.
 */
export async function startOsDragExport(
  items: ItemIdentifier[],
  vaultId?: string
): Promise<void> {
  return await invoke<void>("start_os_drag_export", {
    items,
    vaultId: vaultId ?? null,
  });
}

/**
 * Read a UTF-8 text preview of a file for in-app viewing.
 */
export async function readFileTextPreview(
  fileId: String,
  maxBytes = 512 * 1024,
  vaultId?: string
): Promise<string> {
  return await invoke<string>("read_file_text_preview", {
    fileId,
    maxBytes,
    vaultId: vaultId ?? null,
  });
}

/**
 * Search virtual folders and files by name substring (recursively inside `folderId` if provided, or across entire vault).
 */
export async function searchVault(
  query: string,
  vaultId?: string,
  folderId?: string | null
): Promise<SearchResults> {
  return await invoke<SearchResults>("search_vault", {
    query,
    folderId: folderId ?? null,
    vaultId: vaultId ?? null,
  });
}

/**
 * Open a native file picker filtered to `.vault` files.
 */
export async function selectVaultFile(
  title = "Select Vault (.vault)"
): Promise<string | null> {
  const selected = await open({
    directory: false,
    multiple: false,
    title,
    filters: [
      {
        name: "Vault File (.vault)",
        extensions: ["vault"],
      },
    ],
  });
  if (typeof selected === "string") {
    return selected;
  }
  return null;
}

/**
 * Open a native directory picker dialog.
 */
export async function selectDirectory(
  title = "Select Folder"
): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title,
  });
  if (typeof selected === "string") {
    return selected;
  }
  return null;
}

/**
 * Open a native file picker dialog (multiple files allowed).
 */
export async function selectFiles(
  title = "Select Files",
  multiple = true
): Promise<string[] | null> {
  const selected = await open({
    directory: false,
    multiple,
    title,
  });
  if (Array.isArray(selected)) {
    return selected;
  } else if (typeof selected === "string") {
    return [selected];
  }
  return null;
}
