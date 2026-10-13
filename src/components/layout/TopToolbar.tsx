import React from "react";
import type { DeviceInfo } from "../../types";
import {
  Smartphone,
  Wifi,
  RotateCw,
  Settings,
  Activity,
  Sun,
  Moon,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  Radio,
} from "lucide-react";

interface TopToolbarProps {
  devices: DeviceInfo[];
  selectedSerial: string | null;
  onSelectDevice: (serial: string) => void;
  onRefreshDevices: () => void;
  isRefreshing: boolean;
  onOpenWireless: () => void;
  onOpenSettings: () => void;
  onOpenDiagnostics: () => void;
  theme: "system" | "dark" | "light";
  onToggleTheme: () => void;
  adbVersion?: string;
}

export const TopToolbar: React.FC<TopToolbarProps> = ({
  devices,
  selectedSerial,
  onSelectDevice,
  onRefreshDevices,
  isRefreshing,
  onOpenWireless,
  onOpenSettings,
  onOpenDiagnostics,
  theme,
  onToggleTheme,
  adbVersion,
}) => {
  const selectedDevice = devices.find((d) => d.serial === selectedSerial);

  return (
    <header className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--border-color)] bg-[var(--bg-secondary)] select-none">
      {/* Left: App Logo & ADB Version */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white shadow-xs">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-[var(--text-primary)]">
              DroidBridge
            </h1>
          </div>
        </div>

        {adbVersion && (
          <span className="hidden sm:inline-block px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)] border border-[var(--border-color)]">
            ADB {adbVersion}
          </span>
        )}
      </div>

      {/* Middle: Active Device Selector */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xs">
          <Smartphone className="w-4 h-4 text-[var(--text-muted)]" />
          {devices.length === 0 ? (
            <span className="text-xs text-[var(--text-muted)] italic">
              No devices detected
            </span>
          ) : (
            <select
              value={selectedSerial || ""}
              onChange={(e) => onSelectDevice(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[var(--text-primary)] outline-hidden cursor-pointer"
            >
              {devices.map((dev) => (
                <option key={dev.serial} value={dev.serial}>
                  {dev.model || dev.serial} ({dev.connection_type === "wireless" ? "Wi-Fi" : "USB"})
                </option>
              ))}
            </select>
          )}

          {selectedDevice && (
            <span
              className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                selectedDevice.status === "authorized"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : selectedDevice.status === "unauthorized"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}
            >
              {selectedDevice.status === "authorized" ? (
                <CheckCircle2 className="w-3 h-3" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              {selectedDevice.status}
            </span>
          )}
        </div>

        <button
          onClick={onRefreshDevices}
          disabled={isRefreshing}
          title="Refresh devices"
          className="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shadow-2xs"
        >
          <RotateCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </button>

        <button
          onClick={onOpenWireless}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] hover:bg-[var(--bg-tertiary)] text-xs font-semibold text-[var(--text-primary)] transition-colors shadow-2xs"
        >
          <Wifi className="w-4 h-4 text-[var(--accent)]" />
          <span>Wireless ADB</span>
        </button>
      </div>

      {/* Right: Settings, Diagnostics, Theme Toggle */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={onToggleTheme}
          title={`Theme: ${theme}`}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          {theme === "dark" ? (
            <Moon className="w-4 h-4" />
          ) : theme === "light" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Laptop className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={onOpenDiagnostics}
          title="Diagnostics & Logs"
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Activity className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenSettings}
          title="Settings"
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
