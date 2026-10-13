import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { api } from "../../services/api";
import type { SystemDiagnosticsReport } from "../../types";
import { Copy, RefreshCw, Trash2, Check, Terminal } from "lucide-react";

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DiagnosticsModal: React.FC<DiagnosticsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [report, setReport] = useState<SystemDiagnosticsReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [restartingAdb, setRestartingAdb] = useState(false);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");

  const loadReport = async () => {
    try {
      const rep = await api.getDiagnosticsReport();
      setReport(rep);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadReport();
    }
  }, [isOpen]);

  const handleCopyReport = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClearLogs = async () => {
    await api.clearDiagnostics();
    await loadReport();
  };

  const handleRestartAdb = async () => {
    setRestartingAdb(true);
    try {
      await api.restartAdbServer();
      await loadReport();
    } catch (e) {
      console.error(e);
    } finally {
      setRestartingAdb(false);
    }
  };

  const filteredLogs = report?.logs.filter((log) => {
    if (filterCategory === "ALL") return true;
    return log.category === filterCategory;
  }) || [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="System Diagnostics & Logs"
      maxWidth="xl"
      footer={
        <div className="w-full flex items-center justify-between">
          <div className="flex gap-2">
            <button
              onClick={handleRestartAdb}
              disabled={restartingAdb}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${restartingAdb ? "animate-spin" : ""}`} />
              Restart ADB Server
            </button>
            <button
              onClick={handleClearLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Logs
            </button>
          </div>
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Copied JSON Report
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Full Report
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* System Details Box */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
            <span className="text-[var(--text-muted)] block">Host OS:</span>
            <span className="font-semibold text-[var(--text-primary)] capitalize">
              {report?.os || "Linux"} ({report?.arch || "x86_64"})
            </span>
          </div>
          <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)]">
            <span className="text-[var(--text-muted)] block">ADB Version:</span>
            <span className="font-semibold text-[var(--text-primary)] truncate block">
              {report?.adb_version || "Detecting..."}
            </span>
          </div>
          <div className="p-2.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] col-span-2">
            <span className="text-[var(--text-muted)] block">ADB Executable:</span>
            <span className="font-mono text-[var(--text-primary)] text-[11px] truncate block">
              {report?.adb_path || "/usr/bin/adb"}
            </span>
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Terminal className="w-4 h-4 text-[var(--text-muted)]" />
            <span className="text-xs font-semibold text-[var(--text-secondary)]">
              Event Log Stream ({filteredLogs.length})
            </span>
          </div>
          <div className="flex gap-1 text-[11px]">
            {["ALL", "ADB", "WIRELESS", "FS", "TRANSFER"].map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-2 py-0.5 rounded font-medium transition-colors ${
                  filterCategory === cat
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Log Console View */}
        <div className="h-64 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-slate-950 p-3 font-mono text-[11px] leading-relaxed text-slate-200">
          {filteredLogs.length === 0 ? (
            <div className="text-slate-500 italic py-8 text-center">
              No diagnostic logs recorded yet.
            </div>
          ) : (
            filteredLogs.map((log, i) => (
              <div key={i} className="flex gap-2 hover:bg-slate-900/60 py-0.5 px-1 rounded">
                <span className="text-slate-500 shrink-0">
                  {log.timestamp.slice(11, 19)}
                </span>
                <span
                  className={`font-semibold shrink-0 w-12 text-center text-[10px] rounded px-1 ${
                    log.level === "ERROR"
                      ? "bg-red-900/80 text-red-300"
                      : log.level === "WARN"
                      ? "bg-amber-900/80 text-amber-300"
                      : "bg-blue-900/80 text-blue-300"
                  }`}
                >
                  {log.level}
                </span>
                <span className="text-cyan-400 font-bold shrink-0">
                  [{log.category}]
                </span>
                <span className="text-slate-300 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
};
