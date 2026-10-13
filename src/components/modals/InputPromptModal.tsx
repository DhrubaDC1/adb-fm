import React, { useState, useEffect } from "react";
import { Modal } from "../common/Modal";

interface InputPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (val: string) => void;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel?: string;
}

export const InputPromptModal: React.FC<InputPromptModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
  label,
  initialValue = "",
  confirmLabel = "Save",
}) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      maxWidth="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!value.trim()}
            onClick={handleSubmit}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors shadow-sm"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-xs font-medium text-[var(--text-secondary)]">
          {label}
        </label>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-primary)] focus:outline-hidden focus:ring-2 focus:ring-[var(--accent)]"
        />
      </form>
    </Modal>
  );
};
