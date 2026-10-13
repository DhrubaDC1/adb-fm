import React, { useState, useEffect, useCallback } from "react";
import type {
  DeviceInfo,
  FileEntry,
  RemoteShortcut,
  StandardPaths,
  TransferJob,
  AppSettings,
} from "./types";
import { api } from "./services/api";
import { TopToolbar } from "./components/layout/TopToolbar";
import { StatusBar } from "./components/layout/StatusBar";
import { FilePane, type ShortcutItem } from "./components/filesystem/FilePane";
import { TransferQueueDrawer } from "./components/transfer/TransferQueueDrawer";
import { WirelessAdbModal } from "./components/modals/WirelessAdbModal";
import { SettingsModal } from "./components/modals/SettingsModal";
import { DiagnosticsModal } from "./components/modals/DiagnosticsModal";
import { ConfirmDeleteModal } from "./components/modals/ConfirmDeleteModal";
import { InputPromptModal } from "./components/modals/InputPromptModal";
import {
  Home,
  Download,
  FileText,
  Image as ImageIcon,
  Music,
  Film,
  Camera,
  Folder,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

export const App: React.FC = () => {
  // Settings & Theme
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [currentTheme, setCurrentTheme] = useState<"system" | "dark" | "light">("system");

  // ADB & Devices
  const [adbVersion, setAdbVersion] = useState<string>("");
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);

  // Local filesystem
  const [localPath, setLocalPath] = useState<string>("/");
  const [localEntries, setLocalEntries] = useState<FileEntry[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [standardPaths, setStandardPaths] = useState<StandardPaths | null>(null);

  // Remote filesystem
  const [remotePath, setRemotePath] = useState<string>("/sdcard");
  const [remoteEntries, setRemoteEntries] = useState<FileEntry[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [remoteShortcuts, setRemoteShortcuts] = useState<RemoteShortcut[]>([]);

  // Transfers
  const [jobs, setJobs] = useState<TransferJob[]>([]);

  // Clipboard
  const [clipboard, setClipboard] = useState<{
    items: FileEntry[];
    isCut: boolean;
    isRemote: boolean;
  } | null>(null);

  // Modals
  const [isWirelessModalOpen, setIsWirelessModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);

  // Confirmation & Prompt Modals
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    isRemote: boolean;
    items: FileEntry[];
  }>({ isOpen: false, isRemote: false, items: [] });

  const [promptModal, setPromptModal] = useState<{
    isOpen: boolean;
    mode: "newFolder" | "rename";
    isRemote: boolean;
    targetItem?: FileEntry;
  }>({ isOpen: false, mode: "newFolder", isRemote: false });

  // 1. Initial Load: Settings, ADB Version, Standard Paths, Shortcuts
  useEffect(() => {
    // Load Settings
    api.getSettings().then((s) => {
      setSettings(s);
      setCurrentTheme(s.theme);
      if (s.default_local_dir) setLocalPath(s.default_local_dir);
      if (s.default_remote_dir) setRemotePath(s.default_remote_dir);
    });

    // Load ADB Version
    api.getAdbVersion().then((v) => {
      setAdbVersion(v.version);
    }).catch((e) => console.error("ADB Version check:", e));

    // Load Standard Paths
    api.getStandardPaths().then((paths) => {
      setStandardPaths(paths);
      if (paths.home) {
        setLocalPath(paths.home);
      }
    });

    // Load Remote Shortcuts
    api.getRemoteShortcuts().then((sc) => setRemoteShortcuts(sc));

    // Load initial transfers
    api.getTransfers().then((t) => setJobs(t));

    // Listen for transfer progress events
    let unlistenProgress: (() => void) | undefined;
    let unlistenQueue: (() => void) | undefined;

    api.onTransferProgress((prog) => {
      setJobs((prevJobs) =>
        prevJobs.map((j) => {
          if (j.id === prog.job_id) {
            return {
              ...j,
              current_file: prog.current_file,
              transferred_bytes: prog.transferred_bytes,
              total_bytes: prog.total_bytes > 0 ? prog.total_bytes : j.total_bytes,
              speed_bps: prog.speed_bps,
              eta_secs: prog.eta_secs,
              percentage: prog.percentage,
            };
          }
          return j;
        })
      );
    }).then((unlisten) => {
      unlistenProgress = unlisten;
    });

    api.onQueueUpdated((updatedJobs) => {
      setJobs(updatedJobs);
    }).then((unlisten) => {
      unlistenQueue = unlisten;
    });

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenQueue) unlistenQueue();
    };
  }, []);

  // 2. Theme synchronization
  useEffect(() => {
    const isDark =
      currentTheme === "dark" ||
      (currentTheme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [currentTheme]);

  const toggleTheme = () => {
    const next: "system" | "dark" | "light" =
      currentTheme === "system"
        ? "dark"
        : currentTheme === "dark"
        ? "light"
        : "system";
    setCurrentTheme(next);
    if (settings) {
      const updated = { ...settings, theme: next };
      setSettings(updated);
      api.saveSettings(updated);
    }
  };

  // 3. Device List Refresh
  const refreshDevices = useCallback(async () => {
    setIsRefreshingDevices(true);
    try {
      const devs = await api.listDevices();
      setDevices(devs);
      if (devs.length > 0) {
        if (!selectedSerial || !devs.some((d) => d.serial === selectedSerial)) {
          setSelectedSerial(devs[0].serial);
        }
      } else {
        setSelectedSerial(null);
      }
    } catch (e) {
      console.error("Failed to list devices:", e);
    } finally {
      setIsRefreshingDevices(false);
    }
  }, [selectedSerial]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  // Periodic device refresh if enabled in settings
  useEffect(() => {
    if (!settings?.auto_refresh_devices) return;
    const interval = setInterval(() => {
      refreshDevices();
    }, (settings.auto_refresh_interval_secs || 5) * 1000);
    return () => clearInterval(interval);
  }, [settings, refreshDevices]);

  // 4. Local Filesystem Loading
  const loadLocalDirectory = useCallback(async (path: string) => {
    setLocalLoading(true);
    setLocalError(null);
    try {
      const entries = await api.listLocalDirectory(
        path,
        settings?.show_hidden_files || false
      );
      setLocalEntries(entries);
      setLocalPath(path);
    } catch (err: unknown) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocalLoading(false);
    }
  }, [settings?.show_hidden_files]);

  useEffect(() => {
    if (localPath) {
      loadLocalDirectory(localPath);
    }
  }, [localPath, loadLocalDirectory]);

  // 5. Remote Filesystem Loading
  const loadRemoteDirectory = useCallback(async (serial: string, path: string) => {
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const entries = await api.listRemoteDirectory(
        serial,
        path,
        settings?.show_hidden_files || false
      );
      setRemoteEntries(entries);
      setRemotePath(path);
    } catch (err: unknown) {
      setRemoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoteLoading(false);
    }
  }, [settings?.show_hidden_files]);

  useEffect(() => {
    if (selectedSerial && remotePath) {
      loadRemoteDirectory(selectedSerial, remotePath);
    } else {
      setRemoteEntries([]);
    }
  }, [selectedSerial, remotePath, loadRemoteDirectory]);

  // 6. Transfer Actions
  const handleTransferToRemote = (items: FileEntry[]) => {
    if (!selectedSerial) return;
    const paths = items.map((i) => i.path);
    api.enqueueTransfer(
      selectedSerial,
      "local_to_remote",
      paths,
      remotePath,
      settings?.conflict_behavior || "ask"
    ).then(() => {
      api.getTransfers().then(setJobs);
    });
  };

  const handleTransferToLocal = (items: FileEntry[]) => {
    if (!selectedSerial) return;
    const paths = items.map((i) => i.path);
    api.enqueueTransfer(
      selectedSerial,
      "remote_to_local",
      paths,
      localPath,
      settings?.conflict_behavior || "ask"
    ).then(() => {
      api.getTransfers().then(setJobs);
    });
  };

  // 7. Local File Operations
  const handleLocalNewFolder = (folderName: string) => {
    const newPath = `${localPath.replace(/\/$/, "")}/${folderName}`;
    api.createLocalDirectory(newPath).then(() => {
      loadLocalDirectory(localPath);
    });
  };

  const handleLocalRename = (entry: FileEntry, newName: string) => {
    const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));
    const newPath = `${parentDir}/${newName}`;
    api.renameLocalItem(entry.path, newPath).then(() => {
      loadLocalDirectory(localPath);
    });
  };

  const handleLocalDelete = (items: FileEntry[]) => {
    const paths = items.map((i) => i.path);
    api.deleteLocalItems(paths).then(() => {
      loadLocalDirectory(localPath);
    });
  };

  // 8. Remote File Operations
  const handleRemoteNewFolder = (folderName: string) => {
    if (!selectedSerial) return;
    const newPath = `${remotePath.replace(/\/$/, "")}/${folderName}`;
    api.createRemoteDirectory(selectedSerial, newPath).then(() => {
      loadRemoteDirectory(selectedSerial, remotePath);
    });
  };

  const handleRemoteRename = (entry: FileEntry, newName: string) => {
    if (!selectedSerial) return;
    const parentDir = entry.path.substring(0, entry.path.lastIndexOf("/"));
    const newPath = `${parentDir}/${newName}`;
    api.renameRemoteItem(selectedSerial, entry.path, newPath).then(() => {
      loadRemoteDirectory(selectedSerial, remotePath);
    });
  };

  const handleRemoteDelete = (items: FileEntry[]) => {
    if (!selectedSerial) return;
    const paths = items.map((i) => i.path);
    api.deleteRemoteItems(selectedSerial, paths).then(() => {
      loadRemoteDirectory(selectedSerial, remotePath);
    });
  };

  // Clipboard Paste handler
  const handlePasteClipboard = (isRemotePane: boolean) => {
    if (!clipboard || clipboard.items.length === 0) return;

    if (clipboard.isRemote === isRemotePane) {
      // Same filesystem copy/move
      const sources = clipboard.items.map((i) => i.path);
      if (isRemotePane && selectedSerial) {
        if (clipboard.isCut) {
          api.moveRemoteItems(selectedSerial, sources, remotePath).then(() => {
            loadRemoteDirectory(selectedSerial, remotePath);
            setClipboard(null);
          });
        } else {
          api.copyRemoteItems(selectedSerial, sources, remotePath).then(() => {
            loadRemoteDirectory(selectedSerial, remotePath);
          });
        }
      } else {
        if (clipboard.isCut) {
          api.moveLocalItems(sources, localPath).then(() => {
            loadLocalDirectory(localPath);
            setClipboard(null);
          });
        } else {
          api.copyLocalItems(sources, localPath).then(() => {
            loadLocalDirectory(localPath);
          });
        }
      }
    } else {
      // Cross-filesystem transfer
      if (clipboard.isRemote && !isRemotePane) {
        // Remote to Local
        handleTransferToLocal(clipboard.items);
      } else if (!clipboard.isRemote && isRemotePane) {
        // Local to Remote
        handleTransferToRemote(clipboard.items);
      }
    }
  };

  // Generate shortcut lists
  const localShortcutItems: ShortcutItem[] = [];
  if (standardPaths) {
    if (standardPaths.home) {
      localShortcutItems.push({
        name: "Home",
        path: standardPaths.home,
        icon: <Home className="w-3.5 h-3.5 text-blue-500" />,
      });
    }
    if (standardPaths.downloads) {
      localShortcutItems.push({
        name: "Downloads",
        path: standardPaths.downloads,
        icon: <Download className="w-3.5 h-3.5 text-emerald-500" />,
      });
    }
    if (standardPaths.documents) {
      localShortcutItems.push({
        name: "Documents",
        path: standardPaths.documents,
        icon: <FileText className="w-3.5 h-3.5 text-amber-500" />,
      });
    }
    if (standardPaths.pictures) {
      localShortcutItems.push({
        name: "Pictures",
        path: standardPaths.pictures,
        icon: <ImageIcon className="w-3.5 h-3.5 text-pink-500" />,
      });
    }
    if (standardPaths.music) {
      localShortcutItems.push({
        name: "Music",
        path: standardPaths.music,
        icon: <Music className="w-3.5 h-3.5 text-purple-500" />,
      });
    }
    if (standardPaths.videos) {
      localShortcutItems.push({
        name: "Videos",
        path: standardPaths.videos,
        icon: <Film className="w-3.5 h-3.5 text-red-500" />,
      });
    }
  }

  const remoteShortcutItems: ShortcutItem[] = remoteShortcuts.map((sc) => {
    let icon = <Folder className="w-3.5 h-3.5" />;
    if (sc.icon === "download") icon = <Download className="w-3.5 h-3.5 text-emerald-500" />;
    if (sc.icon === "camera") icon = <Camera className="w-3.5 h-3.5 text-amber-500" />;
    if (sc.icon === "image") icon = <ImageIcon className="w-3.5 h-3.5 text-pink-500" />;
    if (sc.icon === "file-text") icon = <FileText className="w-3.5 h-3.5 text-blue-500" />;
    if (sc.icon === "music") icon = <Music className="w-3.5 h-3.5 text-purple-500" />;
    if (sc.icon === "film") icon = <Film className="w-3.5 h-3.5 text-red-500" />;

    return {
      name: sc.name,
      path: sc.path,
      icon,
    };
  });

  const selectedDevice = devices.find((d) => d.serial === selectedSerial);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans">
      {/* Top Toolbar */}
      <TopToolbar
        devices={devices}
        selectedSerial={selectedSerial}
        onSelectDevice={(s) => setSelectedSerial(s)}
        onRefreshDevices={refreshDevices}
        isRefreshing={isRefreshingDevices}
        onOpenWireless={() => setIsWirelessModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenDiagnostics={() => setIsDiagnosticsModalOpen(true)}
        theme={currentTheme}
        onToggleTheme={toggleTheme}
        adbVersion={adbVersion}
      />

      {/* Dual Pane Filesystem Area */}
      <main className="flex-1 flex overflow-hidden p-3 gap-3">
        {/* Left Pane: Local Computer */}
        <FilePane
          title="Local Filesystem"
          isRemote={false}
          currentPath={localPath}
          entries={localEntries}
          isLoading={localLoading}
          error={localError}
          shortcuts={localShortcutItems}
          onNavigate={(p) => setLocalPath(p)}
          onRefresh={() => loadLocalDirectory(localPath)}
          onNewFolder={() => {
            setPromptModal({
              isOpen: true,
              mode: "newFolder",
              isRemote: false,
            });
          }}
          onRename={(entry) => {
            setPromptModal({
              isOpen: true,
              mode: "rename",
              isRemote: false,
              targetItem: entry,
            });
          }}
          onDelete={(items) => {
            setDeleteModal({
              isOpen: true,
              isRemote: false,
              items,
            });
          }}
          onTransferToOtherPane={handleTransferToRemote}
          otherPaneName="Android Device"
          canTransfer={Boolean(selectedSerial)}
          clipboard={clipboard}
          onCopySelection={(items, isCut) => {
            setClipboard({ items, isCut, isRemote: false });
          }}
          onPasteClipboard={() => handlePasteClipboard(false)}
        />

        {/* Center Transfer Buttons Bar */}
        <div className="flex flex-col justify-center gap-2 shrink-0 self-center">
          <button
            disabled={!selectedSerial}
            onClick={() => {
              const selectedLocal = localEntries.filter((e) =>
                e.path.startsWith(localPath)
              );
              // Transfer first selected or prompt
              if (selectedLocal.length > 0) {
                handleTransferToRemote(selectedLocal.slice(0, 1));
              }
            }}
            title="Push selected files to Android"
            className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-30 disabled:hover:bg-[var(--bg-secondary)] disabled:hover:text-[var(--text-secondary)] transition-all shadow-xs"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            disabled={!selectedSerial}
            onClick={() => {
              const selectedRemote = remoteEntries.filter((e) =>
                e.path.startsWith(remotePath)
              );
              if (selectedRemote.length > 0) {
                handleTransferToLocal(selectedRemote.slice(0, 1));
              }
            }}
            title="Pull selected files to Local Computer"
            className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-30 disabled:hover:bg-[var(--bg-secondary)] disabled:hover:text-[var(--text-secondary)] transition-all shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>

        {/* Right Pane: Android Device */}
        <FilePane
          title={
            selectedDevice
              ? `Android: ${selectedDevice.model || selectedDevice.serial}`
              : "Android Device (Not Connected)"
          }
          isRemote={true}
          currentPath={remotePath}
          entries={remoteEntries}
          isLoading={remoteLoading}
          error={
            !selectedSerial
              ? "Connect an Android device via USB or Wireless ADB to browse storage."
              : remoteError
          }
          shortcuts={remoteShortcutItems}
          onNavigate={(p) => setRemotePath(p)}
          onRefresh={() => {
            if (selectedSerial) loadRemoteDirectory(selectedSerial, remotePath);
          }}
          onNewFolder={() => {
            setPromptModal({
              isOpen: true,
              mode: "newFolder",
              isRemote: true,
            });
          }}
          onRename={(entry) => {
            setPromptModal({
              isOpen: true,
              mode: "rename",
              isRemote: true,
              targetItem: entry,
            });
          }}
          onDelete={(items) => {
            setDeleteModal({
              isOpen: true,
              isRemote: true,
              items,
            });
          }}
          onTransferToOtherPane={handleTransferToLocal}
          otherPaneName="Local Computer"
          canTransfer={Boolean(selectedSerial)}
          clipboard={clipboard}
          onCopySelection={(items, isCut) => {
            setClipboard({ items, isCut, isRemote: true });
          }}
          onPasteClipboard={() => handlePasteClipboard(true)}
        />
      </main>

      {/* Persistent / Expandable Transfer Queue Drawer */}
      <TransferQueueDrawer
        jobs={jobs}
        onCancelJob={(id) => api.cancelTransfer(id)}
        onRetryJob={(id) => api.retryTransfer(id)}
        onClearFinished={() => {
          api.clearFinishedTransfers();
          api.getTransfers().then(setJobs);
        }}
      />

      {/* Status Bar */}
      <StatusBar
        device={selectedDevice}
        activeTransfersCount={
          jobs.filter((j) => j.status === "running" || j.status === "queued")
            .length
        }
      />

      {/* Modals */}
      <WirelessAdbModal
        isOpen={isWirelessModalOpen}
        onClose={() => setIsWirelessModalOpen(false)}
        onSuccess={() => {
          refreshDevices();
        }}
        selectedUsbSerial={selectedDevice?.connection_type === "usb" ? selectedDevice.serial : undefined}
        devices={devices}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSettingsSaved={(newSettings) => {
          setSettings(newSettings);
          setCurrentTheme(newSettings.theme);
        }}
      />

      <DiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        onClose={() => setIsDiagnosticsModalOpen(false)}
      />

      <ConfirmDeleteModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, isRemote: false, items: [] })}
        onConfirm={() => {
          if (deleteModal.isRemote) {
            handleRemoteDelete(deleteModal.items);
          } else {
            handleLocalDelete(deleteModal.items);
          }
        }}
        itemCount={deleteModal.items.length}
        itemNames={deleteModal.items.map((i) => i.name)}
      />

      <InputPromptModal
        isOpen={promptModal.isOpen}
        onClose={() => setPromptModal({ isOpen: false, mode: "newFolder", isRemote: false })}
        title={
          promptModal.mode === "newFolder"
            ? "Create New Directory"
            : `Rename "${promptModal.targetItem?.name}"`
        }
        label={
          promptModal.mode === "newFolder"
            ? "Directory Name"
            : "New File or Directory Name"
        }
        initialValue={
          promptModal.mode === "rename" ? promptModal.targetItem?.name : ""
        }
        confirmLabel={promptModal.mode === "newFolder" ? "Create" : "Rename"}
        onSubmit={(value) => {
          if (promptModal.mode === "newFolder") {
            if (promptModal.isRemote) {
              handleRemoteNewFolder(value);
            } else {
              handleLocalNewFolder(value);
            }
          } else if (promptModal.targetItem) {
            if (promptModal.isRemote) {
              handleRemoteRename(promptModal.targetItem, value);
            } else {
              handleLocalRename(promptModal.targetItem, value);
            }
          }
        }}
      />
    </div>
  );
};

export default App;
