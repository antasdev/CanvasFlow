import React, { useState, useRef, useEffect } from "react";
import {
  Paintbrush,
  PenTool,
  Sun,
  Sliders,
  Group as GroupIcon,
  Ungroup as UngroupIcon,
  AlignLeft,
  AlignCenterHorizontal,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Copy,
  ClipboardPaste,
  CopyPlus,
} from "lucide-react";
import { toast } from "sonner";
import { socketClientService } from "@/services/socket";
import {
  useCanvasStore,
  type AlignmentAxis,
  type DistributionAxis,
} from "../store";
import type { Shape, ShapeStyle } from "../types";
import { getMultiShapeCapabilities } from "../utils/shape-style-capabilities.utils";
import {
  PRESET_FILL_COLORS,
  PRESET_STROKE_COLORS,
  PRESET_STROKE_WIDTHS,
  DEFAULT_SHADOW,
  getMixedStyleValue,
} from "../utils/shape-style.utils";
import ColorPickerInput from "./ColorPickerInput";

export type ShapeStyleToolbarProps = {
  selectedShapes: Shape[];
  pan: { x: number; y: number };
  zoom: number;
  canvasId?: string;
  canEditCanvas?: boolean;
  onUpdateStyle: (
    shapeIds: string[],
    style: Partial<ShapeStyle>,
    isLivePreview?: boolean
  ) => void;
  onCommitStyle: (
    shapeIds: string[],
    style: Partial<ShapeStyle>
  ) => Promise<void> | void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
};

export default function ShapeStyleToolbar({
  selectedShapes,
  pan,
  zoom,
  canvasId,
  canEditCanvas = true,
  onUpdateStyle,
  onCommitStyle,
  onCopy,
  onPaste,
  onDuplicate,
}: ShapeStyleToolbarProps): React.JSX.Element | null {
  const groupShapes = useCanvasStore((state) => state.groupShapes);
  const ungroupShapes = useCanvasStore((state) => state.ungroupShapes);
  const alignShapes = useCanvasStore((state) => state.alignShapes);
  const distributeShapes = useCanvasStore((state) => state.distributeShapes);

  const [isShadowPopoverOpen, setIsShadowPopoverOpen] = useState(false);
  const [isOpacityPopoverOpen, setIsOpacityPopoverOpen] = useState(false);
  const shadowPopoverRef = useRef<HTMLDivElement | null>(null);
  const opacityPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        shadowPopoverRef.current &&
        !shadowPopoverRef.current.contains(event.target as Node)
      ) {
        setIsShadowPopoverOpen(false);
      }
      if (
        opacityPopoverRef.current &&
        !opacityPopoverRef.current.contains(event.target as Node)
      ) {
        setIsOpacityPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!canEditCanvas || !selectedShapes || selectedShapes.length === 0) {
    return null;
  }

  // Capability matrix across all selected shapes
  const capabilities = getMultiShapeCapabilities(selectedShapes);
  const shapeIds = selectedShapes.map((s) => s.id);
  const firstParentId = selectedShapes[0]?.parentId ?? null;
  const canGroup =
    canEditCanvas &&
    selectedShapes.length >= 2 &&
    selectedShapes.every((s) => (s.parentId ?? null) === firstParentId);

  const canUngroup =
    canEditCanvas &&
    selectedShapes.length === 1 &&
    selectedShapes[0].type === "group";

  const canAlign = canEditCanvas && selectedShapes.length >= 2;
  const canDistribute = canEditCanvas && selectedShapes.length >= 3;

  const handleGroup = async (): Promise<void> => {
    if (!canGroup) return;
    const expectedVersions: Record<string, number> = {};
    for (const s of selectedShapes) {
      if (s.version) expectedVersions[s.id] = s.version;
    }
    const group = groupShapes(shapeIds);
    if (group && canvasId) {
      try {
        await socketClientService.groupShapes(canvasId, shapeIds, expectedVersions);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to group shapes.");
      }
    }
  };

  const handleUngroup = async (): Promise<void> => {
    if (!canUngroup) return;
    const groupToUngroup = selectedShapes[0];
    ungroupShapes(groupToUngroup.id);
    if (canvasId) {
      try {
        await socketClientService.ungroupShape(canvasId, groupToUngroup.id, groupToUngroup.version);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to ungroup shape.");
      }
    }
  };

  const handleAlign = async (alignment: AlignmentAxis): Promise<void> => {
    if (!canAlign) return;
    const expectedVersions: Record<string, number> = {};
    for (const s of selectedShapes) {
      if (s.version) expectedVersions[s.id] = s.version;
    }
    alignShapes(shapeIds, alignment);
    if (canvasId) {
      try {
        await socketClientService.alignShapes(canvasId, shapeIds, alignment, expectedVersions);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to align shapes.");
      }
    }
  };

  const handleDistribute = async (axis: DistributionAxis): Promise<void> => {
    if (!canDistribute) return;
    const expectedVersions: Record<string, number> = {};
    for (const s of selectedShapes) {
      if (s.version) expectedVersions[s.id] = s.version;
    }
    distributeShapes(shapeIds, axis);
    if (canvasId) {
      try {
        await socketClientService.distributeShapes(canvasId, shapeIds, axis, expectedVersions);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to distribute shapes.");
      }
    }
  };

  if (
    !canAlign &&
    !canDistribute &&
    !canGroup &&
    !canUngroup &&
    !capabilities.canFill &&
    !capabilities.canStroke &&
    !capabilities.canStrokeWidth &&
    !capabilities.canStrokeStyle &&
    !capabilities.canOpacity &&
    !capabilities.canShadow
  ) {
    return null;
  }

  // Position toolbar above the selection's bounding box
  const minX = Math.min(...selectedShapes.map((s) => s.x));
  const minY = Math.min(...selectedShapes.map((s) => s.y));
  const left = Math.max(16, minX * zoom + pan.x);
  const top = Math.max(16, minY * zoom + pan.y - 52);

  // Extract uniform or mixed values
  const fillState = getMixedStyleValue(selectedShapes, (s) => (s as any).fill);
  const strokeState = getMixedStyleValue(selectedShapes, (s) => (s as any).stroke);
  const strokeWidthState = getMixedStyleValue(
    selectedShapes,
    (s) => (s as any).strokeWidth
  );
  const strokeStyleState = getMixedStyleValue(
    selectedShapes,
    (s) => s.strokeStyle ?? "solid"
  );
  const opacityState = getMixedStyleValue(
    selectedShapes,
    (s) => s.opacity ?? 1
  );
  const shadowEnabledState = getMixedStyleValue(
    selectedShapes,
    (s) => s.shadow?.enabled ?? false
  );
  const shadowBlurState = getMixedStyleValue(
    selectedShapes,
    (s) => s.shadow?.blur ?? DEFAULT_SHADOW.blur
  );
  const shadowColorState = getMixedStyleValue(
    selectedShapes,
    (s) => s.shadow?.color ?? DEFAULT_SHADOW.color
  );

  const handleCommit = (style: Partial<ShapeStyle>) => {
    onUpdateStyle(shapeIds, style, false);
    void onCommitStyle(shapeIds, style);
  };

  return (
    <div
      className="absolute z-30 flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur-sm transition-all"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {/* 1. Fill Color Picker */}
      {capabilities.canFill && (
        <ColorPickerInput
          label="Fill"
          title="Fill Color"
          value={fillState.value}
          isMixed={fillState.isMixed}
          presets={PRESET_FILL_COLORS}
          allowTransparent={true}
          icon={<Paintbrush className="h-3.5 w-3.5" />}
          onPreviewChange={(color) => onUpdateStyle(shapeIds, { fill: color }, true)}
          onChange={(color) => handleCommit({ fill: color })}
        />
      )}

      {/* 2. Stroke Color Picker */}
      {capabilities.canStroke && (
        <ColorPickerInput
          label="Stroke"
          title="Stroke Color"
          value={strokeState.value}
          isMixed={strokeState.isMixed}
          presets={PRESET_STROKE_COLORS}
          allowTransparent={false}
          icon={<PenTool className="h-3.5 w-3.5" />}
          onPreviewChange={(color) => onUpdateStyle(shapeIds, { stroke: color }, true)}
          onChange={(color) => handleCommit({ stroke: color })}
        />
      )}

      {/* 3. Stroke Width */}
      {capabilities.canStrokeWidth && (
        <div className="flex items-center gap-1 border-l border-gray-200 pl-1">
          <select
            title="Stroke Width"
            value={strokeWidthState.isMixed ? "mixed" : String(strokeWidthState.value ?? 2)}
            onChange={(e) => {
              const val = Number(e.target.value);
              if (!Number.isNaN(val)) {
                handleCommit({ strokeWidth: val });
              }
            }}
            className="h-7 rounded border border-gray-200 bg-transparent px-1.5 text-xs text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {strokeWidthState.isMixed && (
              <option value="mixed" disabled>
                Mixed
              </option>
            )}
            {PRESET_STROKE_WIDTHS.map((width) => (
              <option key={width} value={width}>
                {width}px
              </option>
            ))}
          </select>
        </div>
      )}

      {/* 4. Stroke Style (Solid / Dashed / Dotted) */}
      {capabilities.canStrokeStyle && (
        <div className="flex items-center rounded border border-gray-200 p-0.5 text-xs">
          {(["solid", "dashed", "dotted"] as const).map((style) => {
            const isSelected = !strokeStyleState.isMixed && strokeStyleState.value === style;
            return (
              <button
                key={style}
                type="button"
                title={`${style.charAt(0).toUpperCase() + style.slice(1)} Stroke`}
                onClick={() => handleCommit({ strokeStyle: style })}
                className={`rounded px-1.5 py-0.5 text-xs font-mono font-medium transition-colors ${
                  isSelected
                    ? "bg-gray-200 text-gray-900 shadow-sm"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                {style === "solid" && "—"}
                {style === "dashed" && "– –"}
                {style === "dotted" && "···"}
              </button>
            );
          })}
        </div>
      )}

      {/* 5. Opacity Popover */}
      {capabilities.canOpacity && (
        <div className="relative border-l border-gray-200 pl-1" ref={opacityPopoverRef}>
          <button
            type="button"
            title="Opacity"
            onClick={() => setIsOpacityPopoverOpen(!isOpacityPopoverOpen)}
            className="flex items-center gap-1 rounded p-1.5 text-xs text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="w-8 text-right font-mono">
              {opacityState.isMixed
                ? "Mix"
                : `${Math.round((opacityState.value ?? 1) * 100)}%`}
            </span>
          </button>

          {isOpacityPopoverOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-3 shadow-xl backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
                <span className="font-semibold uppercase tracking-wider">Opacity</span>
                <span className="font-mono text-gray-700">
                  {Math.round((opacityState.value ?? 1) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="100"
                step="5"
                value={Math.round((opacityState.value ?? 1) * 100)}
                onChange={(e) => {
                  const val = Number(e.target.value) / 100;
                  onUpdateStyle(shapeIds, { opacity: val }, true);
                }}
                onMouseUp={(e) => {
                  const val = Number((e.target as HTMLInputElement).value) / 100;
                  handleCommit({ opacity: val });
                }}
                onTouchEnd={(e) => {
                  const val = Number((e.target as HTMLInputElement).value) / 100;
                  handleCommit({ opacity: val });
                }}
                className="w-full cursor-pointer accent-blue-600"
              />
            </div>
          )}
        </div>
      )}

      {/* 6. Shadow Popover */}
      {capabilities.canShadow && (
        <div className="relative border-l border-gray-200 pl-1" ref={shadowPopoverRef}>
          <button
            type="button"
            title="Drop Shadow"
            onClick={() => setIsShadowPopoverOpen(!isShadowPopoverOpen)}
            className={`flex items-center gap-1 rounded p-1.5 text-xs transition-colors ${
              shadowEnabledState.value
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            <Sun className="h-3.5 w-3.5" />
            <span>Shadow</span>
          </button>

          {isShadowPopoverOpen && (
            <div className="absolute left-0 top-full z-50 mt-1 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-xl backdrop-blur-sm">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Shadow
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={Boolean(shadowEnabledState.value)}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      handleCommit({
                        shadow: {
                          enabled,
                          color: shadowColorState.value ?? DEFAULT_SHADOW.color,
                          blur: shadowBlurState.value ?? DEFAULT_SHADOW.blur,
                          offsetX: DEFAULT_SHADOW.offsetX,
                          offsetY: DEFAULT_SHADOW.offsetY,
                          opacity: DEFAULT_SHADOW.opacity,
                        },
                      });
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">Enabled</span>
                </label>
              </div>

              {shadowEnabledState.value && (
                <div className="space-y-2 border-t border-gray-100 pt-2 text-xs">
                  <div>
                    <div className="flex justify-between text-gray-500 mb-1">
                      <span>Blur</span>
                      <span className="font-mono">
                        {shadowBlurState.value ?? DEFAULT_SHADOW.blur}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={shadowBlurState.value ?? DEFAULT_SHADOW.blur}
                      onChange={(e) => {
                        const blur = Number(e.target.value);
                        onUpdateStyle(shapeIds, { shadow: { blur } }, true);
                      }}
                      onMouseUp={(e) => {
                        const blur = Number((e.target as HTMLInputElement).value);
                        handleCommit({ shadow: { blur } });
                      }}
                      onTouchEnd={(e) => {
                        const blur = Number((e.target as HTMLInputElement).value);
                        handleCommit({ shadow: { blur } });
                      }}
                      className="w-full cursor-pointer accent-blue-600"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-gray-500">Color</span>
                    <input
                      type="color"
                      value={shadowColorState.value ?? DEFAULT_SHADOW.color}
                      onChange={(e) => {
                        handleCommit({ shadow: { color: e.target.value } });
                      }}
                      className="h-6 w-6 cursor-pointer rounded border border-gray-200 p-0"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Group / Ungroup Actions */}
      {canEditCanvas && (canGroup || canUngroup) && (
        <div className="flex items-center gap-1 border-l border-gray-200 pl-1">
          {canGroup && (
            <button
              type="button"
              title="Group Shapes (Ctrl+G)"
              onClick={handleGroup}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <GroupIcon className="h-3.5 w-3.5" />
              <span>Group</span>
            </button>
          )}
          {canUngroup && (
            <button
              type="button"
              title="Ungroup (Ctrl+Shift+G)"
              onClick={handleUngroup}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <UngroupIcon className="h-3.5 w-3.5" />
              <span>Ungroup</span>
            </button>
          )}
        </div>
      )}

      {/* Alignment Actions */}
      {canEditCanvas && canAlign && (
        <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1">
          <button
            type="button"
            title="Align Left"
            onClick={() => handleAlign("left")}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <AlignLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Align Center Horizontally"
            onClick={() => handleAlign("center-horizontal")}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <AlignCenterHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Align Right"
            onClick={() => handleAlign("right")}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <AlignRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Align Top"
            onClick={() => handleAlign("top")}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <AlignStartVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Align Middle"
            onClick={() => handleAlign("center-vertical")}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <AlignCenterVertical className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Align Bottom"
            onClick={() => handleAlign("bottom")}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <AlignEndVertical className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Distribution Actions */}
      {canEditCanvas && canDistribute && (
        <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1">
          <button
            type="button"
            title="Distribute Horizontally"
            onClick={() => handleDistribute("horizontal")}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <AlignHorizontalDistributeCenter className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Distribute Vertically"
            onClick={() => handleDistribute("vertical")}
            className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <AlignVerticalDistributeCenter className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Clipboard Actions */}
      {canEditCanvas && (onCopy || onDuplicate || onPaste) && (
        <div className="flex items-center gap-0.5 border-l border-gray-200 pl-1">
          {onCopy && (
            <button
              type="button"
              title="Copy (Ctrl+C)"
              onClick={onCopy}
              disabled={selectedShapes.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Copy className="h-4 w-4" />
            </button>
          )}
          {onPaste && (
            <button
              type="button"
              title="Paste (Ctrl+V)"
              onClick={onPaste}
              className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <ClipboardPaste className="h-4 w-4" />
            </button>
          )}
          {onDuplicate && (
            <button
              type="button"
              title="Duplicate (Ctrl+D)"
              onClick={onDuplicate}
              disabled={selectedShapes.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <CopyPlus className="h-4 w-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
