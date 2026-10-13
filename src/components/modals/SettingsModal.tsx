import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";
import { api } from "../../services/api";
import type { AppSettings, ConflictPolicy } from "../../types";
import { RotateCcw, Save, Check } from "lucide-react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved: (settings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      api.getSettings().then((s) => {
        setSettings(s);
        setSavedSuccess(false);
      });
    }
  }, [isOpen]);

  if (!settings) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.saveSettings(settings);
      onSettingsSaved(settings);
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (confirm("Reset all settings to default values?")) {
      const def = await api.resetSettings();
      setSettings(def);
      onSettingsSaved(def);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Application Settings"
      maxWidth="lg"
      footer={
        <div className="w-full flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-sm"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  Saved!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSave} className="space-y-4">
        {/* Theme */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Interface Theme
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["system", "dark", "light"] as const).map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setSettings({ ...settings, theme: t })}
                className={`px-3 py-2 text-xs font-medium rounded-lg border capitalize transition-colors ${
                  settings.theme === t
                    ? "bg-[var(--accent)] text-white border-[var(--accent)]"
                    : "border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] hover:border-slate-400"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ADB Executable Path */}
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Custom ADB Executable Path (Leave blank to use system ADB)
          </label>
          <input
            type="text"
            placeholder="/usr/bin/adb or platform-tools/adb"
            value={settings.adb_executable_path || ""}
            onChange={(e) =>
              setSettings({
                ...settings,
                adb_executable_path: e.target.value.trim() || null,
              })
            }
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-hidden"
          />
        </div>

        {/* Transfer Concurrency */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              Max Concurrent Transfers
            </label>
            <select
              value={settings.max_concurrency}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  max_concurrency: parseInt(e.target.value, 10),
                })
              }
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] outline-hidden"
            >
              <option value={1}>1 (Safest for single USB)</option>
              <option value={2}>2 (Recommended)</option>
              <option value={4}>4 (Fast Wi-Fi / Multi-file)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
              File Conflict Behavior
            </label>
            <select
              value={settings.conflict_behavior}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  conflict_behavior: e.target.value as ConflictPolicy,
                })
              }
              className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] outline-hidden"
            >
              <option value="ask">Ask every time</option>
              <option value="overwrite">Overwrite existing</option>
              <option value="skip">Skip existing</option>
              <option value="rename">Auto-rename (copy 1)</option>
            </select>
          </div>
        </div>

        {/* Toggles */}
        <div className="space-y-2.5 pt-2 border-t border-[var(--border-color)]">
          <label className="flex items-center gap-2.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={settings.show_hidden_files}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  show_hidden_files: e.target.checked,
                })
              }
              className="rounded text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4"
            />
            <span className="font-medium text-[var(--text-primary)]">
              Show hidden files and dotfiles (.filename)
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={settings.verify_transfers}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  verify_transfers: e.target.checked,
                })
              }
              className="rounded text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4"
            />
            <span className="font-medium text-[var(--text-primary)]">
              Verify file transfer sizes upon completion
            </span>
          </label>

          <label className="flex items-center gap-2.5 cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={settings.auto_refresh_devices}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  auto_refresh_devices: e.target.checked,
                })
              }
              className="rounded text-[var(--accent)] focus:ring-[var(--accent)] w-4 h-4"
            />
            <span className="font-medium text-[var(--text-primary)]">
              Automatically refresh connected device state
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
};
