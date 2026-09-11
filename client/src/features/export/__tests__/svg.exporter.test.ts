import { describe, it, expect } from "vitest";
import type { RectangleShape, TextShape, ArrowShape } from "@/features/canvas/types";
import { prepareExportScene } from "../utils/export-geometry.utils";
import {
  svgExporter,
  escapeXmlText,
  escapeXmlAttr,
} from "../processors/svg.exporter";
import { ExportError } from "../utils/export-validation.utils";

describe("SvgExporter (Slice 47)", () => {
  const baseRect: RectangleShape = {
    id: "rect-1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#3b82f6",
    stroke: "#1d4ed8",
    strokeWidth: 2,
  };

  it("should escape special XML characters in text content and attributes", () => {
    const maliciousText = '<script>alert("XSS & injection")</script>';
    const escapedText = escapeXmlText(maliciousText);
    expect(escapedText).not.toContain("<");
    expect(escapedText).not.toContain(">");
    expect(escapedText).toContain("&lt;script&gt;");
    expect(escapedText).toContain("&amp;");

    const attrValue = '"><svg onload=alert(1)>';
    const escapedAttr = escapeXmlAttr(attrValue);
    expect(escapedAttr).not.toContain('"');
    expect(escapedAttr).not.toContain("<");
    expect(escapedAttr).toContain("&quot;&gt;&lt;svg");
  });

  it("should generate a valid standalone SVG Blob with correct MIME type and viewBox", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "svg",
      scope: "canvas",
      padding: 20,
    });

    const result = await svgExporter.process(scene);

    expect(result.format).toBe("svg");
    expect(result.mimeType).toBe("image/svg+xml");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("image/svg+xml");
    expect(result.width).toBe(scene.logicalDimensions.width);
    expect(result.height).toBe(scene.logicalDimensions.height);
    expect(result.pixelWidth).toBe(scene.pixelDimensions.width);
    expect(result.pixelHeight).toBe(scene.pixelDimensions.height);

    const svgText = await result.blob.text();
    expect(svgText).toContain("<svg");
    expect(svgText).toContain("xmlns=\"http://www.w3.org/2000/svg\"");
    expect(svgText).toContain(`viewBox="0 0 ${result.width} ${result.height}"`);
    expect(svgText).toContain("<rect");
    expect(svgText).toContain("</svg>");
  });

  it("should render background rect when background is solid or canvas, but not when transparent", async () => {
    const solidScene = prepareExportScene([baseRect], {
      format: "svg",
      scope: "canvas",
      background: "solid",
      backgroundColor: "#ff0000",
      padding: 0,
    });
    const solidResult = await svgExporter.process(solidScene);
    const solidSvg = await solidResult.blob.text();
    expect(solidSvg).toContain('fill="#ff0000"');

    const transparentScene = prepareExportScene([baseRect], {
      format: "svg",
      scope: "canvas",
      background: "transparent",
      padding: 0,
    });
    const transResult = await svgExporter.process(transparentScene);
    const transSvg = await transResult.blob.text();
    // First rect should be the shape itself, no background rect
    expect(transSvg).not.toContain('fill="transparent" width="200"');
  });

  it("should render text shapes securely without allowing tag breakout", async () => {
    const textShape: TextShape = {
      id: "text-1",
      type: "text",
      x: 50,
      y: 50,
      width: 300,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 2,
      text: "Normal text with <evil> & 'quotes'",
      fontSize: 20,
      fontFamily: "Inter",
      fontWeight: "bold",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "left",
      verticalAlign: "top",
      fill: "#000000",
      padding: 5,
      lineHeight: 1.2,
    };

    const scene = prepareExportScene([textShape], {
      format: "svg",
      scope: "canvas",
    });

    const result = await svgExporter.process(scene);
    const svgText = await result.blob.text();

    expect(svgText).toContain("<text");
    expect(svgText).toContain("&lt;evil&gt;");
    expect(svgText).toContain("&amp;");
    expect(svgText).not.toContain("<evil>");
  });

  it("should render arrowheads and point-based geometry", async () => {
    const arrow: ArrowShape = {
      id: "arrow-1",
      type: "arrow",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      points: [10, 10, 90, 90],
      stroke: "#ef4444",
      strokeWidth: 3,
      arrowHeadEnd: true,
    };

    const scene = prepareExportScene([arrow], {
      format: "svg",
      scope: "canvas",
    });

    const result = await svgExporter.process(scene);
    const svgText = await result.blob.text();

    expect(svgText).toContain("<polyline");
    expect(svgText).toContain("<polygon"); // arrowhead polygon
    expect(svgText).toContain('stroke="#ef4444"');
  });

  it("should respect scale factors in output dimensions", async () => {
    const sceneScale2 = prepareExportScene([baseRect], {
      format: "svg",
      scope: "canvas",
      scale: 2,
      padding: 0,
    });

    const result = await svgExporter.process(sceneScale2);
    expect(result.pixelWidth).toBe(sceneScale2.logicalDimensions.width * 2);
    expect(result.pixelHeight).toBe(sceneScale2.logicalDimensions.height * 2);

    const svgText = await result.blob.text();
    expect(svgText).toContain(`width="${result.pixelWidth}"`);
    expect(svgText).toContain(`height="${result.pixelHeight}"`);
  });

  it("should abort processing if AbortSignal is already aborted", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "svg",
      scope: "canvas",
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      svgExporter.process(scene, { signal: controller.signal })
    ).rejects.toThrow(ExportError);
  });
});
