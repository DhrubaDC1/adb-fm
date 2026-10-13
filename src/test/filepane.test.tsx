import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { FilePane } from "../components/filesystem/FilePane";
import type { FileEntry } from "../types";

const mockEntries: FileEntry[] = [
  {
    name: "Documents",
    path: "/sdcard/Documents",
    is_dir: true,
    is_symlink: false,
    size: 0,
    modified_ms: 1700000000000,
    is_hidden: false,
  },
  {
    name: "photo.jpg",
    path: "/sdcard/photo.jpg",
    is_dir: false,
    is_symlink: false,
    size: 2048576,
    modified_ms: 1700000000000,
    is_hidden: false,
  },
  {
    name: "notes.txt",
    path: "/sdcard/notes.txt",
    is_dir: false,
    is_symlink: false,
    size: 1024,
    modified_ms: 1700000000000,
    is_hidden: false,
  },
];

describe("FilePane component", () => {
  it("renders pane title and entries properly", () => {
    render(
      <FilePane
        title="Local Storage"
        currentPath="/sdcard"
        entries={mockEntries}
        isLoading={false}
        shortcuts={[]}
        onNavigate={vi.fn()}
        onRefresh={vi.fn()}
        onNewFolder={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        clipboard={null}
        onCopySelection={vi.fn()}
        onPasteClipboard={vi.fn()}
      />
    );

    expect(screen.getByText("Local Storage")).toBeInTheDocument();
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("photo.jpg")).toBeInTheDocument();
    expect(screen.getByText("notes.txt")).toBeInTheDocument();
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("handles double click navigation on directories", () => {
    const handleNavigate = vi.fn();
    render(
      <FilePane
        title="Local Storage"
        currentPath="/sdcard"
        entries={mockEntries}
        isLoading={false}
        shortcuts={[]}
        onNavigate={handleNavigate}
        onRefresh={vi.fn()}
        onNewFolder={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        clipboard={null}
        onCopySelection={vi.fn()}
        onPasteClipboard={vi.fn()}
      />
    );

    const folderElement = screen.getByText("Documents");
    fireEvent.doubleClick(folderElement);

    expect(handleNavigate).toHaveBeenCalledWith("/sdcard/Documents");
  });

  it("displays empty state when directory has no entries", () => {
    render(
      <FilePane
        title="Empty Folder"
        currentPath="/empty"
        entries={[]}
        isLoading={false}
        shortcuts={[]}
        onNavigate={vi.fn()}
        onRefresh={vi.fn()}
        onNewFolder={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        clipboard={null}
        onCopySelection={vi.fn()}
        onPasteClipboard={vi.fn()}
      />
    );

    expect(screen.getByText("This directory is empty")).toBeInTheDocument();
  });

  it("displays error message and recovery button when error occurs", () => {
    const handleNavigate = vi.fn();
    render(
      <FilePane
        title="Protected Folder"
        currentPath="/data"
        entries={[]}
        isLoading={false}
        error="Permission denied to access /data"
        shortcuts={[]}
        onNavigate={handleNavigate}
        onRefresh={vi.fn()}
        onNewFolder={vi.fn()}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        clipboard={null}
        onCopySelection={vi.fn()}
        onPasteClipboard={vi.fn()}
      />
    );

    expect(screen.getByText("Could not open location")).toBeInTheDocument();
    expect(screen.getByText("Permission denied to access /data")).toBeInTheDocument();
    const recoverBtn = screen.getByText(/Return to Safe Root/i);
    expect(recoverBtn).toBeInTheDocument();
    fireEvent.click(recoverBtn);
    expect(handleNavigate).toHaveBeenCalledWith("/");
  });
});
