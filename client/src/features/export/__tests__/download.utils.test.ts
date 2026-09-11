import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sanitizeFilename, triggerBlobDownload } from "../utils/download.utils";

describe("download.utils (Slice 48)", () => {
  describe("sanitizeFilename", () => {
    it("should append the clean format extension", () => {
      expect(sanitizeFilename("my-board", "png")).toBe("my-board.png");
      expect(sanitizeFilename("drawing", ".jpeg")).toBe("drawing.jpeg");
      expect(sanitizeFilename("vector", "SVG")).toBe("vector.svg");
    });

    it("should prevent duplicate extensions (e.g. board.png.png)", () => {
      expect(sanitizeFilename("project.png", "png")).toBe("project.png");
      expect(sanitizeFilename("design.JPEG", "jpeg")).toBe("design.jpeg");
      expect(sanitizeFilename("sketch.svg", "svg")).toBe("sketch.svg");
    });

    it("should strip illegal characters and path traversals", () => {
      expect(sanitizeFilename("../../etc/passwd", "png")).toBe("etcpasswd.png");
      expect(sanitizeFilename('invalid:*"<>|name', "pdf")).toBe("invalidname.pdf");
      expect(sanitizeFilename("   spaced name   ", "png")).toBe("spaced name.png");
    });

    it("should fallback to canvasflow-export if input is empty or all illegal chars", () => {
      expect(sanitizeFilename("", "png")).toBe("canvasflow-export.png");
      expect(sanitizeFilename("   ", "jpeg")).toBe("canvasflow-export.jpeg");
      expect(sanitizeFilename("///", "svg")).toBe("canvasflow-export.svg");
    });
  });

  describe("triggerBlobDownload", () => {
    let mockCreateObjectURL: ReturnType<typeof vi.spyOn>;
    let mockRevokeObjectURL: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.useFakeTimers();
      mockCreateObjectURL = vi
        .spyOn(URL, "createObjectURL")
        .mockReturnValue("blob:http://localhost/test-uuid");
      mockRevokeObjectURL = vi
        .spyOn(URL, "revokeObjectURL")
        .mockImplementation(() => {});
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("should create an object URL, trigger click on a download anchor, and schedule revocation", () => {
      const clickSpy = vi.fn();
      const appendSpy = vi.fn();
      const removeSpy = vi.fn();

      const mockAnchor = {
        href: "",
        download: "",
        style: { display: "" },
        click: clickSpy,
      };

      const mockDoc = {
        createElement: vi.fn().mockReturnValue(mockAnchor),
        body: {
          appendChild: appendSpy,
          removeChild: removeSpy,
        },
      };

      vi.stubGlobal("document", mockDoc);
      vi.stubGlobal("window", {});

      const blob = new Blob(["test"], { type: "text/plain" });
      triggerBlobDownload(blob, "test-file.png");

      expect(mockCreateObjectURL).toHaveBeenCalledWith(blob);
      expect(mockDoc.createElement).toHaveBeenCalledWith("a");
      expect(appendSpy).toHaveBeenCalledWith(mockAnchor);
      expect(clickSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalledWith(mockAnchor);

      // Revocation should not have been called immediately
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();

      // Advance timers to trigger cleanup
      vi.advanceTimersByTime(150);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/test-uuid");
    });
  });
});
