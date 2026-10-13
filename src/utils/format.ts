export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeI = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, safeI)).toFixed(dm))} ${sizes[safeI]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return "0 B/s";
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const secs = Math.round(seconds);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) {
    return remSecs > 0 ? `${mins}m ${remSecs}s` : `${mins}m`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

export function formatTimestamp(ms?: number | null): string {
  if (!ms) return "--";
  const date = new Date(ms);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
}

export type FileCategory =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "document"
  | "apk"
  | "file";

export function getFileCategory(filename: string, isDir: boolean): FileCategory {
  if (isDir) return "folder";
  const ext = getFileExtension(filename);

  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "heic"].includes(ext)) {
    return "image";
  }
  if (["mp4", "mkv", "webm", "avi", "mov", "flv", "wmv"].includes(ext)) {
    return "video";
  }
  if (["mp3", "flac", "wav", "ogg", "m4a", "aac", "opus"].includes(ext)) {
    return "audio";
  }
  if (["zip", "tar", "gz", "7z", "rar", "bz2", "xz"].includes(ext)) {
    return "archive";
  }
  if (["apk", "apks", "xapk"].includes(ext)) {
    return "apk";
  }
  if (
    [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "md",
      "rtf",
      "csv",
    ].includes(ext)
  ) {
    return "document";
  }
  if (
    [
      "js",
      "ts",
      "jsx",
      "tsx",
      "rs",
      "py",
      "c",
      "cpp",
      "h",
      "java",
      "kt",
      "json",
      "xml",
      "html",
      "css",
      "sh",
    ].includes(ext)
  ) {
    return "code";
  }
  return "file";
}
