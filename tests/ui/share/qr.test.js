import { describe, test, expect } from "vitest";
import { generateQrMatrix, qrSvg } from "../../../src/ui/share/qr.js";

describe("qr.js — inline SVG QR code generator", () => {
  describe("generateQrMatrix", () => {
    test("returns matrix, modSize and vNum for short text", () => {
      const r = generateQrMatrix("https://example.com/share/test-123");
      expect(r).toHaveProperty("matrix");
      expect(r).toHaveProperty("modSize");
      expect(r).toHaveProperty("vNum");
      expect(r.modSize).toBeGreaterThanOrEqual(21);
      expect(r.vNum).toBeGreaterThanOrEqual(1);
    });

    test("matrix is square with correct dimensions", () => {
      const r = generateQrMatrix("test");
      expect(r.matrix.length).toBe(r.modSize);
      expect(r.matrix[0].length).toBe(r.modSize);
    });

    test("matrix contains only 0 or 1 values", () => {
      const r = generateQrMatrix("Hello");
      for (let y = 0; y < r.modSize; y++) {
        for (let x = 0; x < r.modSize; x++) {
          expect([0, 1]).toContain(r.matrix[y][x]);
        }
      }
    });

    test("has finder patterns (7x7 dark blocks at corners)", () => {
      const r = generateQrMatrix("data");
      const corners = [[0, 0], [r.modSize - 7, 0], [0, r.modSize - 7]];
      for (const [ox, oy] of corners) {
        for (let y = 0; y < 7; y++) {
          for (let x = 0; x < 7; x++) {
            if (x === 0 || x === 6 || y === 0 || y === 6 ||
                (x >= 2 && x <= 4 && y >= 2 && y <= 4)) {
              expect(r.matrix[oy + y][ox + x]).toBe(1);
            }
          }
        }
      }
    });

    test("picks higher version for longer input", () => {
      const short = generateQrMatrix("short");
      const long = generateQrMatrix("A".repeat(50));
      expect(long.vNum).toBeGreaterThanOrEqual(short.vNum);
    });
  });

  describe("qrSvg", () => {
    test("returns SVG string with correct xmlns", () => {
      const svg = qrSvg("https://example.com", 200);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('width="200"');
      expect(svg).toContain('height="200"');
    });

    test("contains rect elements (QR modules)", () => {
      const svg = qrSvg("test-data");
      expect(svg).toContain("<rect");
    });

    test("accepts custom size parameter", () => {
      const svg = qrSvg("size-test", 400);
      expect(svg).toContain('width="400"');
      expect(svg).toContain('height="400"');
    });

    test("produces consistent output for same input", () => {
      const a = qrSvg("consistent");
      const b = qrSvg("consistent");
      expect(a).toBe(b);
    });

    test("produces different output for different input", () => {
      const a = qrSvg("input-a");
      const b = qrSvg("input-b");
      expect(a).not.toBe(b);
    });
  });
});
