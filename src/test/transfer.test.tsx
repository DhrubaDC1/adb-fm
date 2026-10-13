import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { TransferQueueDrawer } from "../components/transfer/TransferQueueDrawer";
import type { TransferJob } from "../types";

const mockJobs: TransferJob[] = [
  {
    id: "job-1",
    direction: "local_to_remote",
    source_paths: ["/home/user/movie.mkv"],
    dest_dir: "/sdcard/Movies",
    conflict_policy: "ask",
    status: "running",
    current_file: "movie.mkv",
    transferred_bytes: 524288000,
    total_bytes: 1048576000,
    speed_bps: 25000000,
    eta_secs: 20,
    percentage: 50.0,
  },
  {
    id: "job-2",
    direction: "remote_to_local",
    source_paths: ["/sdcard/DCIM/photo.jpg"],
    dest_dir: "/home/user/Pictures",
    conflict_policy: "ask",
    status: "completed",
    current_file: "photo.jpg",
    transferred_bytes: 2048000,
    total_bytes: 2048000,
    speed_bps: 0,
    eta_secs: null,
    percentage: 100.0,
  },
];

describe("TransferQueueDrawer component", () => {
  it("renders active transfers badge and summary", () => {
    render(
      <TransferQueueDrawer
        jobs={mockJobs}
        onCancelJob={vi.fn()}
        onRetryJob={vi.fn()}
        onClearFinished={vi.fn()}
      />
    );

    expect(screen.getByText("Transfers")).toBeInTheDocument();
    expect(screen.getByText("1 active")).toBeInTheDocument();
  });

  it("expands drawer and shows transfer progress details", () => {
    const handleCancel = vi.fn();
    render(
      <TransferQueueDrawer
        jobs={mockJobs}
        onCancelJob={handleCancel}
        onRetryJob={vi.fn()}
        onClearFinished={vi.fn()}
      />
    );

    // Expand drawer by clicking header
    fireEvent.click(screen.getByText("Transfers"));

    expect(screen.getByText("movie.mkv")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Cancel"));
    expect(handleCancel).toHaveBeenCalledWith("job-1");
  });
});
