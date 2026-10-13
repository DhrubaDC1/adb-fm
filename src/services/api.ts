import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  AdbVersionInfo,
  AppSettings,
  ConflictPolicy,
  DeviceInfo,
  FileEntry,
  RemoteShortcut,
  StandardPaths,
  SystemDiagnosticsReport,
  TransferDirection,
  TransferHistoryItem,
  TransferJob,
  TransferProgress,
  WirelessOperationResult,
} from "../types";

export const api = {
  // ADB
  getAdbVersion: async (): Promise<AdbVersionInfo> => {
    return await invoke<AdbVersionInfo>("get_adb_version");
  },
  startAdbServer: async (): Promise<string> => {
    return await invoke<string>("start_adb_server");
  },
  killAdbServer: async (): Promise<string> => {
    return await invoke<string>("kill_adb_server");
  },
  restartAdbServer: async (): Promise<string> => {
    return await invoke<string>("restart_adb_server");
  },
  listDevices: async (): Promise<DeviceInfo[]> => {
    return await invoke<DeviceInfo[]>("list_devices");
  },
  getDeviceStorage: async (
    serial: string
  ): Promise<[number | null, number | null]> => {
    return await invoke<[number | null, number | null]>("get_device_storage", {
      serial,
    });
  },

  // Wireless ADB
  wirelessPair: async (
    ip: string,
    port: number,
    pairingCode: string
  ): Promise<WirelessOperationResult> => {
    return await invoke<WirelessOperationResult>("wireless_pair", {
      req: { ip, port, pairing_code: pairingCode },
    });
  },
  wirelessConnect: async (
    ip: string,
    port: number
  ): Promise<WirelessOperationResult> => {
    return await invoke<WirelessOperationResult>("wireless_connect", {
      req: { ip, port },
    });
  },
  wirelessDisconnect: async (
    ip: string,
    port: number
  ): Promise<WirelessOperationResult> => {
    return await invoke<WirelessOperationResult>("wireless_disconnect", {
      ip,
      port,
    });
  },
  enableTcpip: async (
    serial: string,
    port: number
  ): Promise<WirelessOperationResult> => {
    return await invoke<WirelessOperationResult>("enable_tcpip", {
      serial,
      port,
    });
  },
  getDeviceIp: async (serial: string): Promise<string | null> => {
    return await invoke<string | null>("get_device_ip", { serial });
  },
  switchToWireless: async (
    serial: string,
    port: number,
    ip?: string
  ): Promise<WirelessOperationResult> => {
    return await invoke<WirelessOperationResult>("switch_to_wireless", {
      serial,
      port,
      ip: ip || null,
    });
  },
  resetToUsb: async (serial: string): Promise<WirelessOperationResult> => {
    return await invoke<WirelessOperationResult>("reset_to_usb", {
      serial,
    });
  },

  // Local Filesystem
  getStandardPaths: async (): Promise<StandardPaths> => {
    return await invoke<StandardPaths>("get_standard_paths");
  },
  listLocalDirectory: async (
    path: string,
    showHidden: boolean
  ): Promise<FileEntry[]> => {
    return await invoke<FileEntry[]>("list_local_directory", {
      path,
      showHidden,
    });
  },
  createLocalDirectory: async (path: string): Promise<void> => {
    await invoke("create_local_directory", { path });
  },
  renameLocalItem: async (oldPath: string, newPath: string): Promise<void> => {
    await invoke("rename_local_item", { oldPath, newPath });
  },
  deleteLocalItems: async (paths: string[]): Promise<void> => {
    await invoke("delete_local_items", { paths });
  },
  copyLocalItems: async (
    sources: string[],
    destDir: string
  ): Promise<void> => {
    await invoke("copy_local_items", { sources, destDir });
  },
  moveLocalItems: async (
    sources: string[],
    destDir: string
  ): Promise<void> => {
    await invoke("move_local_items", { sources, destDir });
  },
  openLocalPath: async (path: string): Promise<void> => {
    await invoke("open_local_path", { path });
  },

  // Remote Filesystem
  getRemoteShortcuts: async (): Promise<RemoteShortcut[]> => {
    return await invoke<RemoteShortcut[]>("get_remote_shortcuts");
  },
  listRemoteDirectory: async (
    serial: string,
    path: string,
    showHidden: boolean
  ): Promise<FileEntry[]> => {
    return await invoke<FileEntry[]>("list_remote_directory", {
      serial,
      path,
      showHidden,
    });
  },
  createRemoteDirectory: async (
    serial: string,
    path: string
  ): Promise<void> => {
    await invoke("create_remote_directory", { serial, path });
  },
  renameRemoteItem: async (
    serial: string,
    oldPath: string,
    newPath: string
  ): Promise<void> => {
    await invoke("rename_remote_item", { serial, oldPath, newPath });
  },
  deleteRemoteItems: async (
    serial: string,
    paths: string[]
  ): Promise<void> => {
    await invoke("delete_remote_items", { serial, paths });
  },
  copyRemoteItems: async (
    serial: string,
    sources: string[],
    destDir: string
  ): Promise<void> => {
    await invoke("copy_remote_items", { serial, sources, destDir });
  },
  moveRemoteItems: async (
    serial: string,
    sources: string[],
    destDir: string
  ): Promise<void> => {
    await invoke("move_remote_items", { serial, sources, destDir });
  },
  searchRemote: async (
    serial: string,
    basePath: string,
    query: string,
    recursive: boolean
  ): Promise<FileEntry[]> => {
    return await invoke<FileEntry[]>("search_remote", {
      serial,
      basePath,
      query,
      recursive,
    });
  },

  // Transfers
  enqueueTransfer: async (
    deviceSerial: string | null,
    direction: TransferDirection,
    sourcePaths: string[],
    destDir: string,
    conflictPolicy: ConflictPolicy
  ): Promise<string> => {
    return await invoke<string>("enqueue_transfer", {
      deviceSerial,
      direction,
      sourcePaths,
      destDir,
      conflictPolicy,
    });
  },
  cancelTransfer: async (jobId: string): Promise<void> => {
    await invoke("cancel_transfer", { jobId });
  },
  retryTransfer: async (jobId: string): Promise<void> => {
    await invoke("retry_transfer", { jobId });
  },
  clearFinishedTransfers: async (): Promise<void> => {
    await invoke("clear_finished_transfers");
  },
  getTransfers: async (): Promise<TransferJob[]> => {
    return await invoke<TransferJob[]>("get_transfers");
  },
  getTransferHistory: async (
    limit: number,
    offset: number
  ): Promise<TransferHistoryItem[]> => {
    return await invoke<TransferHistoryItem[]>("get_transfer_history", {
      limit,
      offset,
    });
  },
  clearTransferHistory: async (): Promise<void> => {
    await invoke("clear_transfer_history");
  },

  // Settings
  getSettings: async (): Promise<AppSettings> => {
    return await invoke<AppSettings>("get_settings");
  },
  saveSettings: async (settings: AppSettings): Promise<void> => {
    await invoke("save_settings", { settings });
  },
  resetSettings: async (): Promise<AppSettings> => {
    return await invoke<AppSettings>("reset_settings");
  },

  // Diagnostics
  getDiagnosticsReport: async (): Promise<SystemDiagnosticsReport> => {
    return await invoke<SystemDiagnosticsReport>("get_diagnostics_report");
  },
  logDiagnosticMessage: async (
    level: string,
    category: string,
    message: string
  ): Promise<void> => {
    await invoke("log_diagnostic_message", { level, category, message });
  },
  clearDiagnostics: async (): Promise<void> => {
    await invoke("clear_diagnostics");
  },

  // Event Listeners
  onTransferProgress: (
    callback: (progress: TransferProgress) => void
  ): Promise<UnlistenFn> => {
    return listen<TransferProgress>("transfer-progress", (event) => {
      callback(event.payload);
    });
  },
  onQueueUpdated: (
    callback: (jobs: TransferJob[]) => void
  ): Promise<UnlistenFn> => {
    return listen<TransferJob[]>("transfer-queue-updated", (event) => {
      callback(event.payload);
    });
  },
};
