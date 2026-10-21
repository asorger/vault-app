// src/utils/formatters.ts — Formatting helpers for file sizes, dates, and paths.

/**
 * Format bytes into human-readable strings (e.g. 1.25 MB).
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

/**
 * Format an ISO date string to a clean local string.
 */
export function formatDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Cleanly truncate a long path string with ellipsis in the middle.
 */
export function truncatePath(path: string, maxLength = 45): string {
  if (path.length <= maxLength) return path;
  const start = path.slice(0, Math.floor(maxLength / 2) - 3);
  const end = path.slice(-Math.floor(maxLength / 2));
  return `${start}...${end}`;
}

