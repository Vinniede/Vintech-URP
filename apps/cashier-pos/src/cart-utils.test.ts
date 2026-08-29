import { describe, expect, it } from "vitest";
import { parseQuantityInput } from "./cart-utils";

describe("parseQuantityInput", () => {
  it("accepts decimal quantity for weighed items", () => {
    expect(parseQuantityInput("0.75", "kg")).toBe(0.75);
    expect(parseQuantityInput("1.5", "litre")).toBe(1.5);
  });

  it("rejects invalid or non-positive decimal values", () => {
    expect(parseQuantityInput("0", "kg")).toBeNull();
    expect(parseQuantityInput("abc", "kg")).toBeNull();
    expect(parseQuantityInput("-1", "litre")).toBeNull();
  });

  it("keeps countable items as whole numbers", () => {
    expect(parseQuantityInput("2", "piece")).toBe(2);
    expect(parseQuantityInput("2.5", "piece")).toBe(2);
  });
});
