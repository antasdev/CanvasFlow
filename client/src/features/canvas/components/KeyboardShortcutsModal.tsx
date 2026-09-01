import { X, Keyboard } from "lucide-react";
import React, { useEffect } from "react";

export type KeyboardShortcutsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type ShortcutCategory = {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
};

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Tools",
    shortcuts: [
      { keys: ["V"], description: "Select tool" },
      { keys: ["H"], description: "Hand / Pan tool" },
      { keys: ["R"], description: "Rectangle tool" },
      { keys: ["O"], description: "Circle tool" },
      { keys: ["T"], description: "Text tool" },
      { keys: ["L"], description: "Line tool" },
      { keys: ["A"], description: "Arrow tool" },
      { keys: ["P"], description: "Draw / Freehand tool" },
      { keys: ["S"], description: "Sticky Note tool" },
      { keys: ["C"], description: "Toggle comments panel" },
    ],
  },
  {
    title: "Canvas Navigation",
    shortcuts: [
      { keys: ["Space", "Drag"], description: "Pan canvas" },
      { keys: ["Middle Click", "Drag"], description: "Pan canvas" },
      { keys: ["Two-Finger Scroll"], description: "Pan canvas" },
      { keys: ["Ctrl", "Scroll"], description: "Zoom towards cursor" },
      { keys: ["Ctrl", "+"], description: "Zoom in" },
      { keys: ["Ctrl", "-"], description: "Zoom out" },
      { keys: ["Ctrl", "0"], description: "Reset zoom to 100%" },
    ],
  },
  {
    title: "Selection & Manipulation",
    shortcuts: [
      { keys: ["Click"], description: "Select shape" },
      { keys: ["Shift", "Click"], description: "Add to selection" },
      { keys: ["Ctrl", "Click"], description: "Toggle selection" },
      { keys: ["Drag Empty"], description: "Marquee / Lasso select" },
      { keys: ["Arrow Keys"], description: "Nudge 1px" },
      { keys: ["Shift", "Arrows"], description: "Nudge 10px" },
      { keys: ["Ctrl", "A"], description: "Select all shapes" },
      { keys: ["Delete"], description: "Delete selected shapes" },
      { keys: ["Esc"], description: "Cancel / Deselect" },
    ],
  },
  {
    title: "History & Organization",
    shortcuts: [
      { keys: ["Ctrl", "Z"], description: "Undo" },
      { keys: ["Ctrl", "Y"], description: "Redo" },
      { keys: ["Ctrl", "C"], description: "Copy selected shapes" },
      { keys: ["Ctrl", "V"], description: "Paste copied shapes" },
      { keys: ["Ctrl", "D"], description: "Duplicate shapes" },
      { keys: ["Ctrl", "G"], description: "Group shapes" },
      { keys: ["Ctrl", "Shift", "G"], description: "Ungroup shapes" },
      { keys: ["Enter"], description: "Enter group edit mode" },
    ],
  },
];

export default function KeyboardShortcutsModal({
  isOpen,
  onClose,
}: KeyboardShortcutsModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl border border-gray-100 flex flex-col gap-5 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Keyboard className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="shortcuts-title"
                className="text-base font-semibold text-gray-900"
              >
                Keyboard Shortcuts
              </h2>
              <p className="text-xs text-gray-500">
                Speed up your workflow with standard canvas shortcuts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts dialog"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {SHORTCUT_CATEGORIES.map((category) => (
            <div key={category.title} className="flex flex-col gap-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {category.title}
              </h3>
              <div className="flex flex-col gap-2">
                {category.shortcuts.map((item) => (
                  <div
                    key={item.description}
                    className="flex items-center justify-between text-xs py-1"
                  >
                    <span className="text-gray-600">{item.description}</span>
                    <div className="flex items-center gap-1">
                      {item.keys.map((k) => (
                        <kbd
                          key={k}
                          className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-gray-700 shadow-2xs"
                        >
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 pt-3 border-t border-gray-100 text-center text-xs text-gray-400">
          Press <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">?</kbd> or <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">Esc</kbd> anytime to open or dismiss this cheatsheet
        </div>
      </div>
    </div>
  );
}
