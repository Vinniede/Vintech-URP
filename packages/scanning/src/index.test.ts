import { describe, expect, it, vi } from "vitest";
import { detectKeyboardWedgeBarcode } from "./index";

describe("detectKeyboardWedgeBarcode", () => {
  it("detects rapid scanner bursts as a single barcode", () => {
    const scan = detectKeyboardWedgeBarcode(
      [
        { key: "1", timestamp: 0 },
        { key: "2", timestamp: 10 },
        { key: "3", timestamp: 20 },
        { key: "4", timestamp: 30 },
        { key: "Enter", timestamp: 35 },
      ],
      50,
      3,
    );

    expect(scan).toBe("1234");
  });

  it("ignores ordinary slow typing as a barcode", () => {
    const scan = detectKeyboardWedgeBarcode(
      [
        { key: "1", timestamp: 0 },
        { key: "2", timestamp: 150 },
        { key: "3", timestamp: 300 },
        { key: "4", timestamp: 450 },
        { key: "Enter", timestamp: 480 },
      ],
      50,
      3,
    );

    expect(scan).toBeNull();
  });

  it("treats a scanner burst with short interval and Enter as valid even when letters are included", () => {
    const scan = detectKeyboardWedgeBarcode(
      [
        { key: "A", timestamp: 0 },
        { key: "B", timestamp: 12 },
        { key: "C", timestamp: 24 },
        { key: "Enter", timestamp: 30 },
      ],
      50,
      2,
    );

    expect(scan).toBe("ABC");
  });
});
