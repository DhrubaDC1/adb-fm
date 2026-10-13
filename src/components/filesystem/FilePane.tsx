import React, { useState, useRef, useMemo } from "react";
import type { FileEntry } from "../../types";
import { BreadcrumbBar } from "./BreadcrumbBar";
import { FileIcon } from "../common/FileIcon";
import { ContextMenu, type ContextMenuItem } from "../common/ContextMenu";
import { formatBytes, formatTimestamp } from "../../utils/format";
import {
  Folder,
  ArrowUpDown,
  Send,
  Trash2,
  Edit2,
  Copy,
  Scissors,
  ClipboardPaste,
  Info,
} from "lucide-react";

export interface ShortcutItem {
  name: string;
  path: string;
  icon?: React.ReactNode;
}

interface FilePaneProps {
  title: string;
  isRemote?: boolean;
  currentPath: string;
  entries: FileEntry[];
  isLoading: boolean;
  error?: string | null;
  shortcuts: ShortcutItem[];
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onNewFolder: () => void;
  onRename: (entry: FileEntry) => void;
  onDelete: (entries: FileEntry[]) => void;
  onTransferToOtherPane?: (entries: FileEntry[]) => void;
  otherPaneName?: string;
  canTransfer?: boolean;
  clipboard: { items: FileEntry[]; isCut: boolean; isRemote: boolean } | null;
  onCopySelection: (items: FileEntry[], isCut: boolean) => void;
  onPasteClipboard: () => void;
}

type SortField = "name" | "size" | "date" | "type";
type SortOrder = "asc" | "desc";

export const FilePane: React.FC<FilePaneProps> = ({
  title,
  isRemote = false,
  currentPath,
  entries,
  isLoading,
  error,
  shortcuts,
  onNavigate,
  onRefresh,
  onNewFolder,
  onRename,
  onDelete,
  onTransferToOtherPane,
  otherPaneName,
  canTransfer = false,
  clipboard,
  onCopySelection,
  onPasteClipboard,
}) => {
  // Navigation history
  const [history, setHistory] = useState<string[]>([currentPath]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // View state
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  // Selection
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [lastSelectedPath, setLastSelectedPath] = useState<string | null>(null);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Keep history updated when navigating
  const navigateTo = (path: string) => {
    if (path === currentPath) return;
    const newHist = history.slice(0, historyIdx + 1);
    newHist.push(path);
    setHistory(newHist);
    setHistoryIdx(newHist.length - 1);
    setSelectedPaths(new Set());
    onNavigate(path);
  };

  const handleGoBack = () => {
    if (historyIdx > 0) {
      const newIdx = historyIdx - 1;
      setHistoryIdx(newIdx);
      setSelectedPaths(new Set());
      onNavigate(history[newIdx]);
    }
  };

  const handleGoForward = () => {
    if (historyIdx < history.length - 1) {
      const newIdx = historyIdx + 1;
      setHistoryIdx(newIdx);
      setSelectedPaths(new Set());
      onNavigate(history[newIdx]);
    }
  };

  const handleGoUp = () => {
    if (currentPath === "/" || currentPath === "/sdcard") return;
    const separator = isRemote ? "/" : currentPath.includes("\\") ? "\\" : "/";
    const parts = currentPath.split(separator).filter(Boolean);
    if (parts.length <= 1) {
      navigateTo(isRemote ? "/sdcard" : "/");
    } else {
      parts.pop();
      const parent = (currentPath.startsWith("/") ? "/" : "") + parts.join(separator);
      navigateTo(parent || (isRemote ? "/sdcard" : "/"));
    }
  };

  // Filtered & sorted entries
  const processedEntries = useMemo(() => {
    let result = entries;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }

    return [...result].sort((a, b) => {
      // Folders first
      if (a.is_dir !== b.is_dir) {
        return b.is_dir ? 1 : -1;
      }

      let cmp = 0;
      if (sortField === "name") {
        cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      } else if (sortField === "size") {
        cmp = a.size - b.size;
      } else if (sortField === "date") {
        cmp = (a.modified_ms || 0) - (b.modified_ms || 0);
      } else if (sortField === "type") {
        const extA = a.name.split(".").pop() || "";
        const extB = b.name.split(".").pop() || "";
        cmp = extA.localeCompare(extB);
      }

      return sortOrder === "asc" ? cmp : -cmp;
    });
  }, [entries, searchQuery, sortField, sortOrder]);

  const selectedEntries = useMemo(() => {
    return processedEntries.filter((e) => selectedPaths.has(e.path));
  }, [processedEntries, selectedPaths]);

  // Click selection handlers
  const handleItemClick = (entry: FileEntry, e: React.MouseEvent) => {
    e.stopPropagation();

    if (e.shiftKey && lastSelectedPath) {
      // Range selection
      const lastIdx = processedEntries.findIndex((i) => i.path === lastSelectedPath);
      const currIdx = processedEntries.findIndex((i) => i.path === entry.path);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        const newSet = new Set(selectedPaths);
        for (let i = start; i <= end; i++) {
          newSet.add(processedEntries[i].path);
        }
        setSelectedPaths(newSet);
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle selection
      const newSet = new Set(selectedPaths);
      if (newSet.has(entry.path)) {
        newSet.delete(entry.path);
      } else {
        newSet.add(entry.path);
      }
      setSelectedPaths(newSet);
      setLastSelectedPath(entry.path);
    } else {
      // Single selection
      setSelectedPaths(new Set([entry.path]));
      setLastSelectedPath(entry.path);
    }
  };

  const handleDoubleClick = (entry: FileEntry) => {
    if (entry.is_dir) {
      navigateTo(entry.path);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && selectedEntries.length === 1) {
      if (selectedEntries[0].is_dir) {
        navigateTo(selectedEntries[0].path);
      }
    } else if (e.key === "Backspace") {
      handleGoUp();
    } else if (e.key === "F5") {
      e.preventDefault();
      onRefresh();
    } else if (e.key === "F2" && selectedEntries.length === 1) {
      e.preventDefault();
      onRename(selectedEntries[0]);
    } else if (e.key === "Delete" && selectedEntries.length > 0) {
      e.preventDefault();
      onDelete(selectedEntries);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      setSelectedPaths(new Set(processedEntries.map((i) => i.path)));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && selectedEntries.length > 0) {
      e.preventDefault();
      onCopySelection(selectedEntries, false);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "x" && selectedEntries.length > 0) {
      e.preventDefault();
      onCopySelection(selectedEntries, true);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && clipboard) {
      e.preventDefault();
      onPasteClipboard();
    }
  };

  // Context menu trigger
  const handleContextMenu = (e: React.MouseEvent, clickedEntry?: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();

    let targetItems = selectedEntries;
    if (clickedEntry && !selectedPaths.has(clickedEntry.path)) {
      setSelectedPaths(new Set([clickedEntry.path]));
      targetItems = [clickedEntry];
    }

    const menuItems: ContextMenuItem[] = [];

    if (targetItems.length === 1 && targetItems[0].is_dir) {
      menuItems.push({
        label: "Open Directory",
        icon: <Folder className="w-4 h-4" />,
        onClick: () => navigateTo(targetItems[0].path),
      });
    }

    if (canTransfer && targetItems.length > 0 && onTransferToOtherPane) {
      menuItems.push({
        label: `Send to ${otherPaneName || "other pane"}`,
        icon: <Send className="w-4 h-4 text-[var(--accent)]" />,
        onClick: () => onTransferToOtherPane(targetItems),
      });
    }

    if (targetItems.length > 0) {
      menuItems.push({
        label: "Copy",
        icon: <Copy className="w-4 h-4" />,
        onClick: () => onCopySelection(targetItems, false),
      });
      menuItems.push({
        label: "Cut",
        icon: <Scissors className="w-4 h-4" />,
        onClick: () => onCopySelection(targetItems, true),
      });
    }

    if (clipboard) {
      menuItems.push({
        label: `Paste (${clipboard.items.length} items)`,
        icon: <ClipboardPaste className="w-4 h-4" />,
        onClick: onPasteClipboard,
      });
    }

    if (targetItems.length === 1) {
      menuItems.push({ separator: true, label: "", onClick: () => {} });
      menuItems.push({
        label: "Rename (F2)",
        icon: <Edit2 className="w-4 h-4" />,
        onClick: () => onRename(targetItems[0]),
      });
    }

    if (targetItems.length > 0) {
      menuItems.push({ separator: true, label: "", onClick: () => {} });
      menuItems.push({
        label: `Delete (${targetItems.length})`,
        icon: <Trash2 className="w-4 h-4 text-[var(--danger)]" />,
        danger: true,
        onClick: () => onDelete(targetItems),
      });
    }

    // Default context menu when clicking blank area
    if (targetItems.length === 0) {
      menuItems.push({
        label: "New Folder",
        icon: <Folder className="w-4 h-4" />,
        onClick: onNewFolder,
      });
      menuItems.push({
        label: "Refresh (F5)",
        onClick: onRefresh,
      });
      if (clipboard) {
        menuItems.push({
          label: "Paste",
          icon: <ClipboardPaste className="w-4 h-4" />,
          onClick: onPasteClipboard,
        });
      }
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: menuItems,
    });
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => setSelectedPaths(new Set())}
      onContextMenu={(e) => handleContextMenu(e)}
      className="flex-1 flex flex-col h-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-xl overflow-hidden focus:outline-hidden focus:ring-1 focus:ring-[var(--accent)] select-none shadow-sm"
    >
      {/* Pane Title Bar */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-[var(--bg-secondary)] border-b border-[var(--border-color)] text-xs font-semibold text-[var(--text-primary)]">
        <div className="flex items-center gap-2 truncate">
          <span className="truncate">{title}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
            {processedEntries.length} items
          </span>
        </div>

        {selectedEntries.length > 0 && canTransfer && onTransferToOtherPane && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTransferToOtherPane(selectedEntries);
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
            Transfer ({selectedEntries.length})
          </button>
        )}
      </div>

      {/* Breadcrumb & Search Bar */}
      <BreadcrumbBar
        currentPath={currentPath}
        onNavigate={navigateTo}
        onGoBack={handleGoBack}
        onGoForward={handleGoForward}
        onGoUp={handleGoUp}
        onRefresh={onRefresh}
        onNewFolder={onNewFolder}
        canGoBack={historyIdx > 0}
        canGoForward={historyIdx < history.length - 1}
        viewMode={viewMode}
        onToggleViewMode={() => setViewMode(viewMode === "list" ? "grid" : "list")}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isRemote={isRemote}
      />

      {/* Quick Access Shortcuts Bar */}
      {shortcuts.length > 0 && (
        <div className="flex items-center gap-1 px-2.5 py-1.5 border-b border-[var(--border-color)] bg-[var(--bg-primary)] overflow-x-auto scrollbar-none text-xs">
          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)] shrink-0 mr-1">
            Quick:
          </span>
          {shortcuts.map((sc, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                navigateTo(sc.path);
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            >
              {sc.icon}
              <span>{sc.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Main File Area */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoading && (
          <div className="absolute inset-0 bg-[var(--bg-primary)]/70 backdrop-blur-2xs flex items-center justify-center z-10 text-xs text-[var(--text-muted)]">
            Loading directory contents...
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-xs">
            <Info className="w-8 h-8 text-[var(--danger)] mb-2" />
            <p className="font-semibold text-[var(--danger)] mb-1">
              Could not open location
            </p>
            <p className="text-[var(--text-muted)] max-w-sm mb-3">
              {error}
            </p>
            <button
              onClick={() => navigateTo(isRemote ? "/sdcard" : "/")}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] font-medium"
            >
              Return to Safe Root ({isRemote ? "/sdcard" : "Root"})
            </button>
          </div>
        ) : processedEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-xs text-[var(--text-muted)] p-8">
            <Folder className="w-10 h-10 stroke-1 text-[var(--text-muted)]/50 mb-2" />
            <p>This directory is empty</p>
          </div>
        ) : viewMode === "list" ? (
          /* List View */
          <div className="min-w-full text-xs">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-3 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-[11px] font-semibold text-[var(--text-secondary)] sticky top-0 z-5">
              <button
                onClick={() => toggleSort("name")}
                className="col-span-6 flex items-center gap-1 hover:text-[var(--text-primary)] text-left"
              >
                <span>Name</span>
                <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
              <button
                onClick={() => toggleSort("size")}
                className="col-span-2 flex items-center gap-1 hover:text-[var(--text-primary)] text-right justify-end"
              >
                <span>Size</span>
                <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
              <button
                onClick={() => toggleSort("date")}
                className="col-span-4 flex items-center gap-1 hover:text-[var(--text-primary)] text-right justify-end"
              >
                <span>Modified</span>
                <ArrowUpDown className="w-3 h-3 text-[var(--text-muted)]" />
              </button>
            </div>

            {/* Table Rows */}
            <div className="divide-y divide-[var(--border-color)]/30">
              {processedEntries.map((entry) => {
                const isSelected = selectedPaths.has(entry.path);
                return (
                  <div
                    key={entry.path}
                    onClick={(e) => handleItemClick(entry, e)}
                    onDoubleClick={() => handleDoubleClick(entry)}
                    onContextMenu={(e) => handleContextMenu(e, entry)}
                    className={`grid grid-cols-12 gap-2 px-3 py-1.5 items-center cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[var(--accent)]/15 text-[var(--accent)] font-medium"
                        : "hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
                    }`}
                  >
                    {/* Name column */}
                    <div className="col-span-6 flex items-center gap-2 min-w-0">
                      <FileIcon filename={entry.name} isDir={entry.is_dir} className="w-4 h-4 shrink-0" />
                      <span className="truncate" title={entry.name}>
                        {entry.name}
                      </span>
                      {entry.is_symlink && (
                        <span className="text-[10px] text-[var(--text-muted)] italic truncate">
                          → {entry.symlink_target}
                        </span>
                      )}
                    </div>

                    {/* Size column */}
                    <div className="col-span-2 text-right font-mono text-[11px] text-[var(--text-secondary)]">
                      {entry.is_dir ? "--" : formatBytes(entry.size)}
                    </div>

                    {/* Modified column */}
                    <div className="col-span-4 text-right font-mono text-[11px] text-[var(--text-muted)]">
                      {formatTimestamp(entry.modified_ms)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2.5 p-3">
            {processedEntries.map((entry) => {
              const isSelected = selectedPaths.has(entry.path);
              return (
                <div
                  key={entry.path}
                  onClick={(e) => handleItemClick(entry, e)}
                  onDoubleClick={() => handleDoubleClick(entry)}
                  onContextMenu={(e) => handleContextMenu(e, entry)}
                  className={`flex flex-col items-center justify-center p-2.5 rounded-lg border text-center cursor-pointer transition-all ${
                    isSelected
                      ? "bg-[var(--accent)]/15 border-[var(--accent)]"
                      : "border-transparent hover:border-[var(--border-color)] hover:bg-[var(--bg-secondary)]"
                  }`}
                >
                  <FileIcon filename={entry.name} isDir={entry.is_dir} className="w-8 h-8 mb-1.5" />
                  <span className="text-xs text-[var(--text-primary)] truncate max-w-full font-medium" title={entry.name}>
                    {entry.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                    {entry.is_dir ? "Folder" : formatBytes(entry.size)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context Menu Component */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};
