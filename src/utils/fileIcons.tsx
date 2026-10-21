// src/utils/fileIcons.tsx — File type detection and Lucide icon mapping.

import React from 'react';
import {
  FileText,
  Image as ImageIcon,
  Video as VideoIcon,
  Music,
  Archive,
  FileCode,
  FileSpreadsheet,
  File,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
} from 'lucide-react';

interface FileIconProps {
  className?: string;
}

/**
 * Return an appropriate Lucide icon element styled according to file type or extension.
 */
export function getFileIcon(
  mimeType: string,
  filename: string,
  props: FileIconProps = {}
): React.ReactElement {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const defaultClass = props.className || 'w-5 h-5';

  if (mimeType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) {
    return <ImageIcon className={`${defaultClass} text-emerald-400`} />;
  }

  if (mimeType.startsWith('video/') || ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv'].includes(ext)) {
    return <VideoIcon className={`${defaultClass} text-violet-400`} />;
  }

  if (mimeType.startsWith('audio/') || ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) {
    return <Music className={`${defaultClass} text-pink-400`} />;
  }

  if (
    ['zip', 'tar', 'gz', 'bz2', '7z', 'rar', 'xz'].includes(ext) ||
    mimeType.includes('zip') ||
    mimeType.includes('tar') ||
    mimeType.includes('archive')
  ) {
    return <Archive className={`${defaultClass} text-amber-400`} />;
  }

  if (
    ['js', 'ts', 'jsx', 'tsx', 'py', 'rs', 'go', 'c', 'cpp', 'h', 'java', 'html', 'css', 'json', 'toml', 'yaml', 'yml', 'sh', 'sql'].includes(ext) ||
    mimeType.includes('json') ||
    mimeType.includes('javascript') ||
    mimeType.includes('python') ||
    mimeType.includes('rust')
  ) {
    return <FileCode className={`${defaultClass} text-sky-400`} />;
  }

  if (['csv', 'xlsx', 'xls'].includes(ext) || mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    return <FileSpreadsheet className={`${defaultClass} text-teal-400`} />;
  }

  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(ext) || mimeType.startsWith('text/')) {
    return <FileText className={`${defaultClass} text-rose-400`} />;
  }

  return <File className={`${defaultClass} text-neutral-400`} />;
}

export function getFolderIcon(isOpen = false, props: FileIconProps = {}): React.ReactElement {
  const defaultClass = props.className || 'w-5 h-5';
  if (isOpen) {
    return <FolderOpenIcon className={`${defaultClass} text-indigo-400`} />;
  }
  return <FolderIcon className={`${defaultClass} text-indigo-400`} />;
}

