import { describe, expect, it } from "vitest";
import { classifyActionResponse, getConfirmedSaleIds } from "./sync";
import { calculatePromotionPricing, sumPricedLines } from "@urp/shared-types";

describe("offline sale replay handling", () => {
  it("confirms both fresh and duplicate sales, leaving failures queued", () => {
    const confirmed = getConfirmedSaleIds([
      { deviceSaleId: "fresh-sale", status: "synced" },
      { deviceSaleId: "replayed-sale", status: "already_synced" },
      { deviceSaleId: "failed-sale", status: "failed" },
    ]);

    expect([...confirmed]).toEqual(["fresh-sale", "replayed-sale"]);
    expect(confirmed.has("failed-sale")).toBe(false);
  });

  it("classifies action sync outcomes without treating approval as failure", () => {
    expect(classifyActionResponse(200)).toBe("resolved");
    expect(classifyActionResponse(202)).toBe("pending_approval");
    expect(classifyActionResponse(409)).toBe("failed");
    expect(classifyActionResponse(503)).toBe("retry");
  });
});

describe("shared promotion pricing", () => {
  it("calculates server-compatible discounts for eligible lines", () => {
    const priced = calculatePromotionPricing(
      [
        {
          productId: "product-1",
          categoryId: "category-1",
          quantity: "2.5",
          unitPrice: "4.00",
        },
        {
          productId: "product-2",
          categoryId: null,
          quantity: "1",
          unitPrice: "10.00",
        },
      ],
      [
        {
          id: "promo-1",
          type: "percentage_discount",
          value: "10",
          appliesTo: "category",
          categoryId: "category-1",
          productIds: [],
          startAt: "2020-01-01T00:00:00Z",
          endAt: "2999-01-01T00:00:00Z",
          isActive: true,
        },
        {
          id: "promo-2",
          type: "fixed_discount",
          value: "2",
          appliesTo: "specific_products",
          productIds: ["product-2"],
          startAt: "2020-01-01T00:00:00Z",
          endAt: "2999-01-01T00:00:00Z",
          isActive: true,
        },
      ],
    );

    expect(priced[0]?.discountAmount).toBe("1.00");
    expect(priced[1]?.discountAmount).toBe("2.00");
    expect(sumPricedLines(priced)).toBe("17.00");
  });

  it("prices buy-X-get-Y promotions consistently", () => {
    const priced = calculatePromotionPricing(
      [{ productId: "product-1", quantity: "5", unitPrice: "5.00" }],
      [
        {
          id: "promo-buy-get",
          type: "buy_x_get_y",
          value: "0",
          appliesTo: "all",
          startAt: "2020-01-01T00:00:00Z",
          endAt: "2999-01-01T00:00:00Z",
          isActive: true,
          buyQuantity: "3",
          getQuantity: "2",
          getDiscountPercentage: "100",
        },
      ],
    );
    expect(priced[0]?.discountAmount).toBe("10.00");
    expect(sumPricedLines(priced)).toBe("15.00");
  });

  it("prices full bundles and leaves remaining units at normal price", () => {
    const priced = calculatePromotionPricing(
      [{ productId: "product-1", quantity: "4", unitPrice: "5.00" }],
      [
        {
          id: "promo-bundle",
          type: "bundle_price",
          value: "0",
          appliesTo: "all",
          startAt: "2020-01-01T00:00:00Z",
          endAt: "2999-01-01T00:00:00Z",
          isActive: true,
          bundleQuantity: "3",
          bundleTotalPrice: "10.00",
        },
      ],
    );
    expect(priced[0]?.discountAmount).toBe("5.00");
    expect(sumPricedLines(priced)).toBe("15.00");
  });
});
