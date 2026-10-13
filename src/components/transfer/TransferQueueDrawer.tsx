import React, { useState, useEffect } from "react";
import type { TransferHistoryItem, TransferJob } from "../../types";
import { formatBytes, formatDuration, formatSpeed } from "../../utils/format";
import { api } from "../../services/api";
import {
  ChevronUp,
  ChevronDown,
  X,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Activity,
} from "lucide-react";

interface TransferQueueDrawerProps {
  jobs: TransferJob[];
  onCancelJob: (id: string) => void;
  onRetryJob: (id: string) => void;
  onClearFinished: () => void;
}

export const TransferQueueDrawer: React.FC<TransferQueueDrawerProps> = ({
  jobs,
  onCancelJob,
  onRetryJob,
  onClearFinished,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"queue" | "history">("queue");
  const [historyItems, setHistoryItems] = useState<TransferHistoryItem[]>([]);

  const activeJobs = jobs.filter(
    (j) => j.status === "running" || j.status === "queued"
  );
  const finishedJobs = jobs.filter(
    (j) =>
      j.status === "completed" ||
      j.status === "failed" ||
      j.status === "cancelled"
  );

  const loadHistory = async () => {
    try {
      const hist = await api.getTransferHistory(50, 0);
      setHistoryItems(hist);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === "history" && isExpanded) {
      loadHistory();
    }
  }, [activeTab, isExpanded]);

  const handleClearHistory = async () => {
    await api.clearTransferHistory();
    await loadHistory();
  };

  // If there are running jobs, calculate aggregate speed
  const totalSpeed = jobs
    .filter((j) => j.status === "running")
    .reduce((acc, curr) => acc + (curr.speed_bps || 0), 0);

  return (
    <div className="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] flex flex-col shrink-0 select-none shadow-md">
      {/* Header / Drawer Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            <Activity className={`w-4 h-4 ${activeJobs.length > 0 ? "text-[var(--accent)] animate-pulse" : "text-[var(--text-muted)]"}`} />
            <span>Transfers</span>
            {activeJobs.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-[var(--accent)] text-white font-bold">
                {activeJobs.length} active
              </span>
            )}
          </div>

          {activeJobs.length > 0 && totalSpeed > 0 && (
            <span className="text-xs font-mono font-medium text-[var(--accent)]">
              {formatSpeed(totalSpeed)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {finishedJobs.length > 0 && !isExpanded && (
            <span className="text-[11px] text-[var(--text-muted)]">
              {finishedJobs.length} finished
            </span>
          )}
          <button className="p-1 rounded text-[var(--text-secondary)]">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded Content Drawer */}
      {isExpanded && (
        <div className="border-t border-[var(--border-color)] bg-[var(--bg-primary)] h-64 flex flex-col">
          {/* Subtabs & Clear Buttons */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] text-xs">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("queue")}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === "queue"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Current Queue ({jobs.length})
              </button>
              <button
                onClick={() => {
                  setActiveTab("history");
                  loadHistory();
                }}
                className={`px-3 py-1 rounded font-medium transition-colors ${
                  activeTab === "history"
                    ? "bg-[var(--accent)] text-white"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                Transfer History
              </button>
            </div>

            {activeTab === "queue" && finishedJobs.length > 0 && (
              <button
                onClick={onClearFinished}
                className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Finished
              </button>
            )}

            {activeTab === "history" && historyItems.length > 0 && (
              <button
                onClick={handleClearHistory}
                className="flex items-center gap-1 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--danger)]"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear History
              </button>
            )}
          </div>

          {/* List Area */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
            {activeTab === "queue" ? (
              jobs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)] italic">
                  Transfer queue is empty. Drag files or select items to transfer.
                </div>
              ) : (
                jobs.map((job) => {
                  const isRunning = job.status === "running";
                  const isCompleted = job.status === "completed";
                  const isFailed = job.status === "failed";
                  const isCancelled = job.status === "cancelled";

                  return (
                    <div
                      key={job.id}
                      className="p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          ) : isFailed ? (
                            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                          ) : isCancelled ? (
                            <X className="w-4 h-4 text-slate-400 shrink-0" />
                          ) : (
                            <Clock className="w-4 h-4 text-[var(--accent)] shrink-0" />
                          )}
                          <span className="font-semibold text-[var(--text-primary)] truncate max-w-sm">
                            {job.current_file || job.source_paths[0]}
                          </span>
                          <span className="text-[10px] uppercase font-bold text-[var(--text-muted)]">
                            [{job.direction.replace(/_/g, " ")}]
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {isRunning && (
                            <button
                              onClick={() => onCancelJob(job.id)}
                              className="px-2 py-0.5 rounded text-[11px] font-medium text-[var(--danger)] hover:bg-red-500/10 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                          {(isFailed || isCancelled) && (
                            <button
                              onClick={() => onRetryJob(job.id)}
                              className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium text-[var(--accent)] hover:bg-blue-500/10 transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" />
                              Retry
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div className="w-full bg-[var(--bg-tertiary)] rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isCompleted
                              ? "bg-emerald-500"
                              : isFailed
                              ? "bg-red-500"
                              : isCancelled
                              ? "bg-slate-400"
                              : "bg-[var(--accent)]"
                          }`}
                          style={{ width: `${Math.min(job.percentage, 100)}%` }}
                        />
                      </div>

                      {/* Progress Stats */}
                      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--text-secondary)]">
                        <div>
                          <span>
                            {formatBytes(job.transferred_bytes)} /{" "}
                            {formatBytes(job.total_bytes)}
                          </span>
                          <span className="ml-2 font-bold text-[var(--text-primary)]">
                            {job.percentage.toFixed(0)}%
                          </span>
                        </div>

                        <div className="flex items-center gap-3">
                          {isRunning && job.speed_bps > 0 && (
                            <span>{formatSpeed(job.speed_bps)}</span>
                          )}
                          {isRunning && job.eta_secs && (
                            <span>ETA: {formatDuration(job.eta_secs)}</span>
                          )}
                          {isFailed && job.error_message && (
                            <span className="text-[var(--danger)] truncate max-w-xs">
                              {job.error_message}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : historyItems.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-[var(--text-muted)] italic">
                No past transfer history.
              </div>
            ) : (
              historyItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]"
                >
                  <div className="min-w-0 pr-3">
                    <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)] truncate">
                      <span className="truncate">{item.source_path}</span>
                      <ArrowRight className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />
                      <span className="truncate text-[var(--text-secondary)]">{item.dest_path}</span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-mono">
                      {formatBytes(item.total_bytes)} • {item.duration_secs.toFixed(1)}s • {new Date(item.completed_at).toLocaleTimeString()}
                    </div>
                  </div>

                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                      item.status === "completed"
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : item.status === "failed"
                        ? "bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        : "bg-slate-500/10 text-slate-500 border border-slate-500/20"
                    }`}
                  >
                    {item.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
