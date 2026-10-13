import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RotateCw,
  FolderPlus,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";

interface BreadcrumbBarProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoUp: () => void;
  onRefresh: () => void;
  onNewFolder: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  viewMode: "list" | "grid";
  onToggleViewMode: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  isRemote?: boolean;
}

export const BreadcrumbBar: React.FC<BreadcrumbBarProps> = ({
  currentPath,
  onNavigate,
  onGoBack,
  onGoForward,
  onGoUp,
  onRefresh,
  onNewFolder,
  canGoBack,
  canGoForward,
  viewMode,
  onToggleViewMode,
  searchQuery,
  onSearchChange,
  isRemote = false,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputVal, setInputVal] = useState(currentPath);
  const [showSearch, setShowSearch] = useState(false);

  useEffect(() => {
    setInputVal(currentPath);
  }, [currentPath]);

  const handleInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditing(false);
    if (inputVal.trim() && inputVal.trim() !== currentPath) {
      onNavigate(inputVal.trim());
    }
  };

  // Generate path segments
  const segments = currentPath
    .split(isRemote ? "/" : /[/\\]/)
    .filter((s) => s.length > 0);

  return (
    <div className="flex flex-col gap-2 p-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)]">
      {/* Navigation Buttons + Address Bar */}
      <div className="flex items-center gap-1.5">
        {/* History buttons */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={onGoBack}
            disabled={!canGoBack}
            title="Back (Alt+Left)"
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onGoForward}
            disabled={!canGoForward}
            title="Forward (Alt+Right)"
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onGoUp}
            title="Up (Backspace / Alt+Up)"
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
          <button
            onClick={onRefresh}
            title="Refresh (F5)"
            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Address Bar */}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <form onSubmit={handleInputSubmit} className="w-full">
              <input
                type="text"
                autoFocus
                value={inputVal}
                onBlur={() => {
                  setIsEditing(false);
                  if (inputVal.trim() && inputVal.trim() !== currentPath) {
                    onNavigate(inputVal.trim());
                  }
                }}
                onChange={(e) => setInputVal(e.target.value)}
                className="w-full px-2.5 py-1 text-xs font-mono rounded border border-[var(--accent)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-hidden shadow-xs"
              />
            </form>
          ) : (
            <div
              onClick={() => setIsEditing(true)}
              title="Click to edit path directly"
              className="flex items-center px-2 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--bg-primary)] hover:border-slate-400 cursor-text overflow-x-auto whitespace-nowrap scrollbar-none transition-colors"
            >
              {/* Root item */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNavigate(isRemote ? "/sdcard" : "/");
                }}
                className="hover:underline font-semibold text-[var(--accent)] shrink-0"
              >
                {isRemote ? "/sdcard" : "/"}
              </button>

              {/* Segments */}
              {segments.map((seg, idx) => {
                // Ignore if it's the root sdcard in remote
                if (isRemote && idx === 0 && seg === "sdcard") return null;

                const targetPath = isRemote
                  ? "/" + segments.slice(0, idx + 1).join("/")
                  : (currentPath.startsWith("/") ? "/" : "") +
                    segments.slice(0, idx + 1).join("/");

                return (
                  <React.Fragment key={idx}>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0 mx-0.5" />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate(targetPath);
                      }}
                      className="hover:underline text-[var(--text-primary)] shrink-0 font-medium"
                    >
                      {seg}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions: Search, View Mode, New Folder */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setShowSearch(!showSearch)}
            title="Search files in directory"
            className={`p-1.5 rounded transition-colors ${
              showSearch || searchQuery
                ? "bg-[var(--accent)] text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`}
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleViewMode}
            title={viewMode === "list" ? "Switch to Grid View" : "Switch to List View"}
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            {viewMode === "list" ? (
              <LayoutGrid className="w-4 h-4" />
            ) : (
              <List className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={onNewFolder}
            title="New Folder"
            className="p-1.5 rounded text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter / Search input when opened */}
      {(showSearch || searchQuery) && (
        <div className="flex items-center gap-2 pt-1 animate-in slide-in-from-top-1 duration-100">
          <input
            type="text"
            autoFocus
            placeholder="Filter files by name..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="flex-1 px-2.5 py-1 text-xs rounded border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] outline-hidden focus:border-[var(--accent)]"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange("")}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
};
