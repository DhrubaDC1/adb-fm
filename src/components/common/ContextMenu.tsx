import React, { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  items,
  onClose,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Adjust position so it doesn't overflow screen
  const menuStyle: React.CSSProperties = {
    top: Math.min(y, window.innerHeight - 250),
    left: Math.min(x, window.innerWidth - 220),
  };

  return (
    <div
      ref={menuRef}
      style={menuStyle}
      className="fixed z-50 min-w-48 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg shadow-xl py-1 text-sm text-[var(--text-primary)] select-none animate-in fade-in duration-75"
    >
      {items.map((item, index) => {
        if (item.separator) {
          return (
            <div
              key={index}
              className="my-1 border-t border-[var(--border-color)]"
            />
          );
        }

        return (
          <button
            key={index}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
                onClose();
              }
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-left text-xs font-medium transition-colors ${
              item.disabled
                ? "opacity-40 cursor-not-allowed"
                : item.danger
                ? "text-[var(--danger)] hover:bg-red-500/10"
                : "hover:bg-[var(--bg-secondary)] text-[var(--text-primary)]"
            }`}
          >
            {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};
