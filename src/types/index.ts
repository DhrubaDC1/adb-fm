export type DeviceStatus =
  | "authorized"
  | "unauthorized"
  | "offline"
  | "no_permissions"
  | "recovery"
  | "bootloader"
  | string;

export type DeviceConnectionKind = "usb" | "wireless";

export interface DeviceInfo {
  serial: string;
  status: DeviceStatus;
  connection_type: DeviceConnectionKind;
  model: string;
  manufacturer: string;
  android_version: string;
  api_level: string;
  battery_level?: number | null;
  storage_free_bytes?: number | null;
  storage_total_bytes?: number | null;
}

export interface AdbVersionInfo {
  version: string;
  revision: string;
  path: string;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_symlink: boolean;
  symlink_target?: string | null;
  size: number;
  modified_ms?: number | null;
  permissions?: string | null;
  is_hidden: boolean;
}

export interface StandardPaths {
  home: string;
  desktop?: string | null;
  documents?: string | null;
  downloads?: string | null;
  pictures?: string | null;
  music?: string | null;
  videos?: string | null;
}

export interface RemoteShortcut {
  name: string;
  path: string;
  icon: string;
}

export type TransferDirection =
  | "local_to_remote"
  | "remote_to_local"
  | "remote_to_remote"
  | "local_to_local";

export type TransferStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type ConflictPolicy = "ask" | "overwrite" | "skip" | "rename" | "cancel";

export interface TransferProgress {
  job_id: string;
  current_file: string;
  transferred_bytes: number;
  total_bytes: number;
  speed_bps: number;
  eta_secs?: number | null;
  percentage: number;
}

export interface TransferJob {
  id: string;
  device_serial?: string | null;
  direction: TransferDirection;
  source_paths: string[];
  dest_dir: string;
  conflict_policy: ConflictPolicy;
  status: TransferStatus;
  current_file?: string | null;
  transferred_bytes: number;
  total_bytes: number;
  speed_bps: number;
  eta_secs?: number | null;
  percentage: number;
  error_message?: string | null;
  started_at?: number | null;
  completed_at?: number | null;
}

export interface TransferHistoryItem {
  id: string;
  device_serial?: string | null;
  source_path: string;
  dest_path: string;
  direction: string;
  total_bytes: number;
  status: string;
  error_message?: string | null;
  started_at: number;
  completed_at: number;
  duration_secs: number;
}

export interface AppSettings {
  theme: "system" | "dark" | "light";
  adb_executable_path?: string | null;
  default_local_dir?: string | null;
  default_remote_dir?: string | null;
  max_concurrency: number;
  conflict_behavior: ConflictPolicy;
  verify_transfers: boolean;
  show_hidden_files: boolean;
  auto_refresh_devices: boolean;
  auto_refresh_interval_secs: number;
  favorite_destinations_local: string[];
  favorite_destinations_remote: string[];
}

export interface DiagnosticLogEntry {
  timestamp: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  category: "ADB" | "WIRELESS" | "FS" | "TRANSFER" | "APP";
  message: string;
}

export interface SystemDiagnosticsReport {
  os: string;
  arch: string;
  adb_path: string;
  adb_version: string;
  logs: DiagnosticLogEntry[];
}

export interface WirelessOperationResult {
  success: boolean;
  message: string;
  endpoint: string;
}
