import React from "react";
import { Modal } from "../common/Modal";
import { AlertTriangle } from "lucide-react";

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemCount: number;
  itemNames: string[];
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemCount,
  itemNames,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirm Permanent Deletion"
      maxWidth="sm"
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-[var(--danger)] text-white hover:opacity-90 transition-opacity shadow-sm"
          >
            Delete Permanently
          </button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-full bg-red-500/10 text-[var(--danger)] shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <p className="font-medium text-[var(--text-primary)]">
            Are you sure you want to delete {itemCount === 1 ? "this item" : `${itemCount} items`}?
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            This action cannot be undone. Files will be permanently deleted from the filesystem.
          </p>
          <div className="mt-2.5 max-h-24 overflow-y-auto rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] p-2 text-xs font-mono text-[var(--text-secondary)]">
            {itemNames.slice(0, 5).map((name, i) => (
              <div key={i} className="truncate">
                • {name}
              </div>
            ))}
            {itemNames.length > 5 && (
              <div className="text-[var(--text-muted)] italic">
                ...and {itemNames.length - 5} more
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
