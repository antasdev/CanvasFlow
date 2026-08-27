import { useState, useCallback, useRef } from "react";
import type { TextShape } from "../types";
import { isEmptyText } from "../utils/text.utils";

export type TextCommitData = {
  text: string;
  isNew: boolean;
  shapeId?: string;
  worldPosition?: { x: number; y: number };
};

export type UseTextEditingOptions = {
  onCommit: (data: TextCommitData) => void | Promise<void>;
  onDiscard?: () => void;
};

export type TextEditingContext = {
  isEditing: boolean;
  isNew: boolean;
  shapeId: string | null;
  worldPosition: { x: number; y: number } | null;
  targetShape: TextShape | null;
  draftText: string;
  originalText: string;
  isComposing: boolean;
  startCreatingText: (worldPosition: { x: number; y: number }) => void;
  startEditingShape: (shape: TextShape) => void;
  setDraftText: (text: string) => void;
  handleCompositionStart: () => void;
  handleCompositionEnd: () => void;
  commit: () => void;
  discard: () => void;
  handleKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

export function useTextEditing({
  onCommit,
  onDiscard,
}: UseTextEditingOptions): TextEditingContext {
  const [isEditing, setIsEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [shapeId, setShapeId] = useState<string | null>(null);
  const [worldPosition, setWorldPosition] = useState<{ x: number; y: number } | null>(null);
  const [targetShape, setTargetShape] = useState<TextShape | null>(null);
  const [draftText, setDraftText] = useState("");
  const [originalText, setOriginalText] = useState("");

  const isComposingRef = useRef(false);
  const isCommittingRef = useRef(false);

  const startCreatingText = useCallback((pos: { x: number; y: number }): void => {
    setIsEditing(true);
    setIsNew(true);
    setShapeId(null);
    setWorldPosition(pos);
    setTargetShape(null);
    setDraftText("");
    setOriginalText("");
    isComposingRef.current = false;
    isCommittingRef.current = false;
  }, []);

  const startEditingShape = useCallback((shape: TextShape): void => {
    setIsEditing(true);
    setIsNew(false);
    setShapeId(shape.id);
    setWorldPosition({ x: shape.x, y: shape.y });
    setTargetShape(shape);
    setDraftText(shape.text || "");
    setOriginalText(shape.text || "");
    isComposingRef.current = false;
    isCommittingRef.current = false;
  }, []);

  const handleCompositionStart = useCallback((): void => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback((): void => {
    isComposingRef.current = false;
  }, []);

  const discard = useCallback((): void => {
    if (isCommittingRef.current) return;
    setIsEditing(false);
    setIsNew(false);
    setShapeId(null);
    setWorldPosition(null);
    setTargetShape(null);
    setDraftText("");
    setOriginalText("");
    onDiscard?.();
  }, [onDiscard]);

  const commit = useCallback((): void => {
    if (!isEditing || isCommittingRef.current) {
      return;
    }

    // Do not commit while IME composition is actively ongoing
    if (isComposingRef.current) {
      return;
    }

    isCommittingRef.current = true;

    if (isNew) {
      if (isEmptyText(draftText)) {
        // Discard empty text creation without persisting
        discard();
        return;
      }

      onCommit({
        text: draftText,
        isNew: true,
        worldPosition: worldPosition || { x: 0, y: 0 },
      });
    } else {
      if (draftText !== originalText && shapeId) {
        onCommit({
          text: draftText,
          isNew: false,
          shapeId,
        });
      }
    }

    setIsEditing(false);
    setIsNew(false);
    setShapeId(null);
    setWorldPosition(null);
    setTargetShape(null);
    setDraftText("");
    setOriginalText("");
    isCommittingRef.current = false;
  }, [isEditing, isNew, draftText, originalText, shapeId, worldPosition, onCommit, discard]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      // Isolate keydown from canvas listeners (prevent Delete, Backspace, Ctrl+A from deleting canvas shapes)
      event.stopPropagation();

      if (isComposingRef.current) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        discard();
        return;
      }

      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        commit();
        return;
      }
    },
    [commit, discard]
  );

  return {
    isEditing,
    isNew,
    shapeId,
    worldPosition,
    targetShape,
    draftText,
    originalText,
    isComposing: isComposingRef.current,
    startCreatingText,
    startEditingShape,
    setDraftText,
    handleCompositionStart,
    handleCompositionEnd,
    commit,
    discard,
    handleKeyDown,
  };
}
