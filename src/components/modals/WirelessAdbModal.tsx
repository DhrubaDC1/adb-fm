import React, { useState, useEffect, useCallback } from "react";
import { Modal } from "../common/Modal";
import { api } from "../../services/api";
import type { DeviceInfo } from "../../types";
import {
  Wifi,
  Key,
  Cable,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  RefreshCw,
  Terminal,
  Check,
  Copy,
  ArrowRight,
} from "lucide-react";

interface WirelessAdbModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedUsbSerial?: string;
  devices?: DeviceInfo[];
}

export const WirelessAdbModal: React.FC<WirelessAdbModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  selectedUsbSerial,
  devices = [],
}) => {
  const [tab, setTab] = useState<"usb-to-wireless" | "direct" | "pair">("usb-to-wireless");

  // USB-to-Wireless (Legacy / No official pairing support)
  const usbDevices = devices.filter((d) => d.connection_type === "usb");
  const [activeUsbSerial, setActiveUsbSerial] = useState<string>(
    selectedUsbSerial || (usbDevices.length > 0 ? usbDevices[0].serial : "")
  );
  const [targetIp, setTargetIp] = useState("");
  const [targetPort, setTargetPort] = useState("5555");
  const [isDetectingIp, setIsDetectingIp] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [isResettingUsb, setIsResettingUsb] = useState(false);

  // Direct Connect (for devices with TCP/IP already open, Android 10, or Rooted)
  const [directIp, setDirectIp] = useState("192.168.1.");
  const [directPort, setDirectPort] = useState("5555");
  const [isConnectingDirect, setIsConnectingDirect] = useState(false);
  const [showRootHelp, setShowRootHelp] = useState(false);
  const [copiedRootCmd, setCopiedRootCmd] = useState(false);

  // Pair state (Modern Android 11+ with pairing code)
  const [pairIp, setPairIp] = useState("192.168.1.");
  const [pairPort, setPairPort] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [isPairing, setIsPairing] = useState(false);

  // Status notification
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Update active USB serial when devices or selectedUsbSerial changes
  useEffect(() => {
    if (selectedUsbSerial) {
      setActiveUsbSerial(selectedUsbSerial);
    } else if (usbDevices.length > 0 && !activeUsbSerial) {
      setActiveUsbSerial(usbDevices[0].serial);
    }
  }, [selectedUsbSerial, usbDevices, activeUsbSerial]);

  // Auto-detect IP when USB device is selected in the modal
  const detectDeviceIp = useCallback(async (serial: string) => {
    if (!serial) return;
    setIsDetectingIp(true);
    try {
      const ip = await api.getDeviceIp(serial);
      if (ip) {
        setTargetIp(ip);
        setStatusMsg({
          type: "info",
          text: `Auto-detected device Wi-Fi IP: ${ip}`,
        });
      } else {
        setStatusMsg({
          type: "info",
          text: "Could not auto-detect Wi-Fi IP. Ensure your phone is connected to Wi-Fi, or enter its IP address manually.",
        });
      }
    } catch {
      // Non-fatal, user can manually type IP
    } finally {
      setIsDetectingIp(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeUsbSerial && tab === "usb-to-wireless" && !targetIp) {
      detectDeviceIp(activeUsbSerial);
    }
  }, [isOpen, activeUsbSerial, tab, targetIp, detectDeviceIp]);

  // Handler: 1-Click Switch USB to Wireless (TCP/IP mode)
  const handleSwitchToWireless = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeUsbSerial) {
      setStatusMsg({
        type: "error",
        text: "Please connect an Android phone via USB first.",
      });
      return;
    }

    setStatusMsg(null);
    setIsSwitching(true);

    try {
      const portNum = parseInt(targetPort.trim(), 10) || 5555;
      const res = await api.switchToWireless(
        activeUsbSerial,
        portNum,
        targetIp.trim() || undefined
      );

      setStatusMsg({
        type: "success",
        text: `${res.message}`,
      });

      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({
        type: "error",
        text: `Failed to switch to wireless: ${msg}`,
      });
    } finally {
      setIsSwitching(false);
    }
  };

  // Handler: Reset device back to USB mode
  const handleResetUsb = async () => {
    if (!activeUsbSerial) return;
    setIsResettingUsb(true);
    setStatusMsg(null);
    try {
      const res = await api.resetToUsb(activeUsbSerial);
      setStatusMsg({
        type: "success",
        text: res.message,
      });
      onSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({ type: "error", text: `Reset to USB failed: ${msg}` });
    } finally {
      setIsResettingUsb(false);
    }
  };

  // Handler: Direct Connect (No Pairing Code)
  const handleDirectConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsConnectingDirect(true);

    try {
      const portNum = parseInt(directPort.trim(), 10) || 5555;
      const res = await api.wirelessConnect(directIp.trim(), portNum);
      setStatusMsg({ type: "success", text: res.message });
      onSuccess();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({
        type: "error",
        text: `Direct connection failed: ${msg}. Check that the phone's IP is reachable and TCP/IP mode is active.`,
      });
    } finally {
      setIsConnectingDirect(false);
    }
  };

  // Handler: Modern Pairing (Android 11+)
  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setIsPairing(true);

    try {
      const portNum = parseInt(pairPort.trim(), 10);
      if (isNaN(portNum) || portNum <= 0) {
        throw new Error("Invalid pairing port number");
      }
      const res = await api.wirelessPair(pairIp.trim(), portNum, pairingCode.trim());
      setStatusMsg({
        type: "success",
        text: `${res.message} Now switch to "Direct Connect" and connect!`,
      });
      setDirectIp(pairIp.trim());
      setTab("direct");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusMsg({
        type: "error",
        text: `Pairing failed: ${msg}. Make sure Wireless Debugging is enabled on the device and code is valid.`,
      });
    } finally {
      setIsPairing(false);
    }
  };

  const copyRootCommand = () => {
    navigator.clipboard.writeText("su -c 'setprop service.adb.tcp.port 5555 && stop adbd && start adbd'");
    setCopiedRootCmd(true);
    setTimeout(() => setCopiedRootCmd(false), 2000);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Android Wireless ADB Connection"
      maxWidth="lg"
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="grid grid-cols-3 border-b border-[var(--border-color)]">
          <button
            onClick={() => {
              setTab("usb-to-wireless");
              setStatusMsg(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              tab === "usb-to-wireless"
                ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/5"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Cable className="w-4 h-4" />
            <span>USB to Wireless (Any Android)</span>
          </button>
          <button
            onClick={() => {
              setTab("direct");
              setStatusMsg(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              tab === "direct"
                ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/5"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Wifi className="w-4 h-4" />
            <span>Direct Connect (No Pairing)</span>
          </button>
          <button
            onClick={() => {
              setTab("pair");
              setStatusMsg(null);
            }}
            className={`flex items-center justify-center gap-2 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
              tab === "pair"
                ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/5"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Key className="w-4 h-4" />
            <span>Official Pairing (Android 11+)</span>
          </button>
        </div>

        {/* Status Message */}
        {statusMsg && (
          <div
            className={`p-3 rounded-lg border text-xs flex items-center gap-2.5 ${
              statusMsg.type === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400"
                : statusMsg.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400"
                : "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400"
            }`}
          >
            {statusMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : statusMsg.type === "error" ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <Info className="w-4 h-4 shrink-0" />
            )}
            <span className="leading-relaxed">{statusMsg.text}</span>
          </div>
        )}

        {/* TAB 1: USB to Wireless (Devices without official wireless debugging support) */}
        {tab === "usb-to-wireless" && (
          <form onSubmit={handleSwitchToWireless} className="space-y-4">
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] space-y-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-[var(--text-primary)]">
                <Info className="w-4 h-4 text-[var(--accent)]" />
                <span>How to use Wireless ADB on devices without official pairing:</span>
              </div>
              <p>
                Older Android versions (Android 5.0 - 10) or customized ROMs that don't include the
                "Wireless debugging" menu can easily run wirelessly using standard ADB TCP/IP mode.
              </p>
              <div className="grid grid-cols-3 gap-2 pt-1 font-medium text-[var(--text-primary)]">
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[10px] flex items-center justify-center font-bold">1</span>
                  <span>Connect USB cable</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[10px] flex items-center justify-center font-bold">2</span>
                  <span>Click Switch & Connect</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[10px] flex items-center justify-center font-bold">3</span>
                  <span>Unplug USB cable!</span>
                </div>
              </div>
            </div>

            {/* USB Device Selection */}
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Connected USB Android Device
              </label>
              {usbDevices.length === 0 ? (
                <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>
                    No USB device detected. Please connect your Android phone with a USB cable and ensure USB Debugging is turned ON.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <select
                      value={activeUsbSerial}
                      onChange={(e) => {
                        setActiveUsbSerial(e.target.value);
                        detectDeviceIp(e.target.value);
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] outline-hidden cursor-pointer"
                    >
                      {usbDevices.map((dev) => (
                        <option key={dev.serial} value={dev.serial}>
                          {dev.model || "Android Device"} ({dev.serial}) - {dev.status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => detectDeviceIp(activeUsbSerial)}
                    disabled={isDetectingIp || !activeUsbSerial}
                    title="Auto-detect phone Wi-Fi IP address"
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isDetectingIp ? "animate-spin" : ""}`} />
                    <span>{isDetectingIp ? "Detecting..." : "Detect IP"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Wi-Fi IP and Port Configuration */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Device Wi-Fi IP Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.150"
                  value={targetIp}
                  onChange={(e) => setTargetIp(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-hidden"
                />
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                  Must be on the same Wi-Fi network as this computer.
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  TCP Port
                </label>
                <input
                  type="number"
                  required
                  placeholder="5555"
                  value={targetPort}
                  onChange={(e) => setTargetPort(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-hidden"
                />
                <span className="text-[10px] text-[var(--text-muted)] mt-1 block">
                  Default standard is 5555.
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between border-t border-[var(--border-color)]">
              <button
                type="button"
                onClick={handleResetUsb}
                disabled={isResettingUsb || !activeUsbSerial}
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors underline"
              >
                {isResettingUsb ? "Reverting..." : "Revert to USB Mode (adb usb)"}
              </button>

              <button
                type="submit"
                disabled={isSwitching || !activeUsbSerial}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors shadow-sm"
              >
                {isSwitching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Switching & Connecting...</span>
                  </>
                ) : (
                  <>
                    <Cable className="w-4 h-4" />
                    <span>Switch to Wireless & Connect</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 2: Direct Connect (No Pairing required) */}
        {tab === "direct" && (
          <form onSubmit={handleDirectConnect} className="space-y-4">
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] space-y-1">
              <p className="font-medium text-[var(--text-primary)]">
                Direct TCP/IP Connection:
              </p>
              <p>
                Use this to connect directly without a pairing code if the phone is already in TCP/IP mode,
                is a rooted device, was previously configured, or has a Wi-Fi ADB app running.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Device IP Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 192.168.1.105"
                  value={directIp}
                  onChange={(e) => setDirectIp(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Connection Port
                </label>
                <input
                  type="number"
                  required
                  placeholder="5555"
                  value={directPort}
                  onChange={(e) => setDirectPort(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-hidden"
                />
              </div>
            </div>

            {/* Rooted / Terminal Helper Accordion */}
            <div className="border border-[var(--border-color)] rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => setShowRootHelp(!showRootHelp)}
                className="w-full px-3 py-2 text-xs font-medium text-left bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] flex items-center justify-between text-[var(--text-secondary)] transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>How to enable Wireless ADB on Rooted devices (No USB Cable needed)</span>
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {showRootHelp ? "Hide" : "Show"}
                </span>
              </button>

              {showRootHelp && (
                <div className="p-3 bg-[var(--bg-primary)] border-t border-[var(--border-color)] text-xs text-[var(--text-secondary)] space-y-2">
                  <p>
                    If your phone is rooted, you can open Termux or any terminal emulator on your phone and run:
                  </p>
                  <div className="flex items-center justify-between p-2 rounded bg-black text-emerald-400 font-mono text-[11px]">
                    <code>su -c "setprop service.adb.tcp.port 5555 && stop adbd && start adbd"</code>
                    <button
                      type="button"
                      onClick={copyRootCommand}
                      className="ml-2 p-1 rounded hover:bg-neutral-800 text-neutral-300"
                      title="Copy command"
                    >
                      {copiedRootCmd ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    After running this on your phone, enter your phone's Wi-Fi IP above and click Connect.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isConnectingDirect}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors shadow-sm"
              >
                {isConnectingDirect ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Wifi className="w-4 h-4" />
                    Connect Wirelessly
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: Official Pairing (Android 11+) */}
        {tab === "pair" && (
          <form onSubmit={handlePair} className="space-y-4">
            <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs text-[var(--text-secondary)] space-y-1">
              <p className="font-medium text-[var(--text-primary)]">
                Android 11+ Pairing Instructions:
              </p>
              <ol className="list-decimal list-inside space-y-0.5 mt-1">
                <li>Go to <strong>Settings → Developer options → Wireless debugging</strong>.</li>
                <li>Tap <strong>Pair device with pairing code</strong>.</li>
                <li>Enter the pairing IP, Pairing Port, and 6-digit code shown on the screen below.</li>
              </ol>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Device IP Address
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 192.168.1.105"
                  value={pairIp}
                  onChange={(e) => setPairIp(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Pairing Port
                </label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 38459"
                  value={pairPort}
                  onChange={(e) => setPairPort(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-hidden"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                6-Digit Wi-Fi Pairing Code
              </label>
              <input
                type="text"
                required
                maxLength={6}
                placeholder="123456"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value)}
                className="w-full tracking-widest text-center font-mono font-bold px-3 py-2 text-base rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-hidden"
              />
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isPairing}
                className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors shadow-sm"
              >
                {isPairing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Pairing...
                  </>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    Pair Device
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};
