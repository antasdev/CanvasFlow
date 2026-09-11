/**
 * Sanitizes a user-provided or generated filename and ensures the correct extension is appended.
 * Prevents path traversal, invalid characters, and duplicate extensions (e.g. "board.png.png").
 */
export function sanitizeFilename(input: string, extension: string): string {
  const cleanExt = extension.replace(/^\.+/, "").toLowerCase();

  // Strip path traversal and invalid filename characters across OS platforms: / \ : * ? " < > |
  let sanitized = input
    .replace(/\.\.+[/\\]/g, "")
    .replace(/[/\\]/g, "")
    .replace(/[:*?"<>|]/g, "")
    .replace(/^\.+/, "")
    .trim();

  // Strip duplicate extension if user typed it (e.g. "my-drawing.png" when exporting as png)
  const extRegex = new RegExp(`\\.${cleanExt}$`, "i");
  sanitized = sanitized.replace(extRegex, "").trim();

  // Fallback if sanitized string became empty
  if (!sanitized) {
    sanitized = "canvasflow-export";
  }

  return `${sanitized}.${cleanExt}`;
}

/**
 * Initiates an in-browser file download from an in-memory Blob and schedules object URL cleanup.
 *
 * Guarantees that:
 * 1. The anchor element is detached after click.
 * 2. The created object URL is revoked after download dispatch to prevent memory leaks.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";

    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    // Schedule revocation asynchronously to give browser download thread time to access the Blob URL
    setTimeout(() => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // Safe no-op if already revoked
      }
    }, 100);
  }
}
