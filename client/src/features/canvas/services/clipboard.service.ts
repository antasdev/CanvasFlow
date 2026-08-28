import type { Shape } from "../types";
import {
  CLIPBOARD_VERSION,
  MAX_CLIPBOARD_PAYLOAD_SIZE,
  type CanvasFlowClipboardData,
} from "../types/clipboard.types";
import { validateClipboardPayload } from "../utils/clipboard.utils";

export class ClipboardService {
  private inMemoryClipboard: CanvasFlowClipboardData | null = null;
  private consecutivePasteCount = 0;

  /**
   * Copies shapes to clipboard (in-memory and system clipboard).
   * Resets consecutive paste counter.
   */
  public async copy(shapes: Shape[], sourceCanvasId: string): Promise<void> {
    if (shapes.length === 0) {
      return;
    }

    const payload: CanvasFlowClipboardData = {
      version: CLIPBOARD_VERSION,
      sourceCanvasId,
      shapes,
      createdAt: Date.now(),
    };

    // Store in-memory
    this.inMemoryClipboard = payload;
    this.consecutivePasteCount = 0;

    // Attempt system clipboard write
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        const serialized = JSON.stringify(payload);
        if (serialized.length <= MAX_CLIPBOARD_PAYLOAD_SIZE) {
          await navigator.clipboard.writeText(serialized);
        }
      }
    } catch {
      // Non-fatal: browser clipboard access might be blocked or unavailable
    }
  }

  /**
   * Reads and validates clipboard payload from system clipboard with in-memory fallback.
   */
  public async read(): Promise<CanvasFlowClipboardData | null> {
    // 1. Try reading from system clipboard
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.readText === "function") {
        const text = await navigator.clipboard.readText();
        if (text && text.trim().startsWith("{")) {
          const parsed = JSON.parse(text);
          const validated = validateClipboardPayload(parsed);
          // If system clipboard has valid payload, update in-memory cache and return
          this.inMemoryClipboard = validated;
          return validated;
        }
      }
    } catch {
      // System clipboard read failed or was denied/invalid; fall through to in-memory fallback
    }

    // 2. Fall back to in-memory clipboard
    return this.inMemoryClipboard;
  }

  /**
   * Clears in-memory clipboard and resets consecutive paste count.
   */
  public clear(): void {
    this.inMemoryClipboard = null;
    this.consecutivePasteCount = 0;
  }

  /**
   * Gets current consecutive paste count.
   */
  public getConsecutivePasteCount(): number {
    return this.consecutivePasteCount;
  }

  /**
   * Increments and returns consecutive paste count.
   */
  public incrementConsecutivePasteCount(): number {
    this.consecutivePasteCount += 1;
    return this.consecutivePasteCount;
  }

  /**
   * Resets consecutive paste count to 0.
   */
  public resetConsecutivePasteCount(): void {
    this.consecutivePasteCount = 0;
  }
}

export const clipboardService = new ClipboardService();
