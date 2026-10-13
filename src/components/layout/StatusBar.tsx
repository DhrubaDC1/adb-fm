import React from "react";
import type { DeviceInfo } from "../../types";
import { formatBytes } from "../../utils/format";
import { Battery, HardDrive, Smartphone } from "lucide-react";

interface StatusBarProps {
  device?: DeviceInfo;
  activeTransfersCount: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  device,
  activeTransfersCount,
}) => {
  return (
    <footer className="flex items-center justify-between px-3 py-1 border-t border-[var(--border-color)] bg-[var(--bg-secondary)] text-[11px] font-mono text-[var(--text-secondary)] select-none">
      {/* Device Info */}
      <div className="flex items-center gap-4">
        {device ? (
          <>
            <div className="flex items-center gap-1.5 text-[var(--text-primary)] font-semibold">
              <Smartphone className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <span>{device.model || device.serial}</span>
              {device.android_version && (
                <span className="text-[var(--text-muted)] font-normal">
                  (Android {device.android_version})
                </span>
              )}
            </div>

            {device.battery_level !== undefined && device.battery_level !== null && (
              <div className="flex items-center gap-1">
                <Battery className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>{device.battery_level}%</span>
              </div>
            )}

            {device.storage_free_bytes && device.storage_total_bytes && (
              <div className="flex items-center gap-1">
                <HardDrive className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>
                  {formatBytes(device.storage_free_bytes)} free of{" "}
                  {formatBytes(device.storage_total_bytes)}
                </span>
              </div>
            )}
          </>
        ) : (
          <span className="text-[var(--text-muted)] italic">
            No device selected
          </span>
        )}
      </div>

      {/* Right side info */}
      <div className="flex items-center gap-3">
        {activeTransfersCount > 0 && (
          <span className="text-[var(--accent)] font-bold animate-pulse">
            {activeTransfersCount} active operations
          </span>
        )}
        <span className="text-[var(--text-muted)]">
          DroidBridge v0.1.0
        </span>
      </div>
    </footer>
  );
};
