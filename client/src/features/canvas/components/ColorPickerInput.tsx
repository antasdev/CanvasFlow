import React, { useState, useRef, useEffect } from "react";

export type ColorPickerInputProps = {
  label: string;
  title: string;
  value?: string;
  isMixed?: boolean;
  presets: readonly string[];
  allowTransparent?: boolean;
  onChange: (color: string) => void;
  onPreviewChange?: (color: string) => void;
  icon?: React.ReactNode;
};

export default function ColorPickerInput({
  label,
  title,
  value,
  isMixed = false,
  presets,
  allowTransparent = false,
  onChange,
  onPreviewChange,
  icon,
}: ColorPickerInputProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value ?? "#000000");
  const [prevValue, setPrevValue] = useState(value);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  if (value !== prevValue) {
    setPrevValue(value);
    if (value) {
      setHexInput(value);
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelectColor = (selected: string) => {
    setHexInput(selected);
    onChange(selected);
    setIsOpen(false);
  };

  const handleHexBlur = () => {
    let cleanHex = hexInput.trim();
    if (!cleanHex.startsWith("#") && /^[0-9A-Fa-f]{6}$/.test(cleanHex)) {
      cleanHex = `#${cleanHex}`;
    }
    if (/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(cleanHex) || cleanHex === "transparent") {
      onChange(cleanHex);
    } else if (value) {
      setHexInput(value);
    }
  };

  const displayColor = isMixed
    ? "linear-gradient(135deg, #ef4444, #3b82f6, #10b981)"
    : value === "transparent" || !value
    ? "transparent"
    : value;

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        title={title}
        aria-label={label}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded p-1.5 text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        {icon}
        <div
          className="h-4 w-4 rounded border border-gray-300 shadow-inner"
          style={{
            background: displayColor,
            backgroundImage:
              value === "transparent"
                ? "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)"
                : undefined,
            backgroundSize: value === "transparent" ? "6px 6px" : undefined,
            backgroundPosition: value === "transparent" ? "0 0, 0 3px, 3px -3px, -3px 0px" : undefined,
          }}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-xl backdrop-blur-sm">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {label} {isMixed && <span className="text-amber-600 normal-case">(Mixed)</span>}
          </div>

          <div className="mb-3 grid grid-cols-5 gap-1.5">
            {allowTransparent && (
              <button
                type="button"
                title="Transparent"
                onClick={() => handleSelectColor("transparent")}
                className={`relative h-6 w-6 rounded border ${
                  value === "transparent" ? "ring-2 ring-blue-500" : "border-gray-300"
                } overflow-hidden`}
              >
                <div
                  className="h-full w-full"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
                    backgroundSize: "6px 6px",
                  }}
                />
              </button>
            )}

            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                title={preset}
                onClick={() => handleSelectColor(preset)}
                onMouseEnter={() => onPreviewChange?.(preset)}
                className={`h-6 w-6 rounded border transition-transform hover:scale-110 ${
                  value === preset ? "ring-2 ring-blue-500" : "border-gray-300"
                }`}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 border-t border-gray-100 pt-2">
            <input
              type="color"
              value={value && value !== "transparent" ? value : "#000000"}
              onChange={(e) => {
                setHexInput(e.target.value);
                onPreviewChange?.(e.target.value);
              }}
              onBlur={(e) => onChange(e.target.value)}
              className="h-7 w-7 cursor-pointer rounded border border-gray-200 bg-transparent p-0"
              title="Custom Color Picker"
            />
            <input
              type="text"
              value={hexInput}
              onChange={(e) => {
                setHexInput(e.target.value);
                if (/^#([0-9A-Fa-f]{6})$/.test(e.target.value)) {
                  onPreviewChange?.(e.target.value);
                }
              }}
              onBlur={handleHexBlur}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleHexBlur();
                  setIsOpen(false);
                }
              }}
              className="w-full rounded border border-gray-300 px-2 py-1 text-xs font-mono text-gray-800 focus:border-blue-500 focus:outline-none"
              placeholder="#000000"
            />
          </div>
        </div>
      )}
    </div>
  );
}
