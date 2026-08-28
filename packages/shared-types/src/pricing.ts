export type PromotionType =
  | "percentage_discount"
  | "fixed_discount"
  | "buy_x_get_y"
  | "bundle_price";
export type PromotionAppliesTo = "all" | "category" | "specific_products";

export type PromotionRule = {
  id: string;
  type: PromotionType;
  value: string;
  appliesTo: PromotionAppliesTo;
  categoryId?: string | null;
  productIds?: string[];
  buyQuantity?: string | null;
  getQuantity?: string | null;
  getDiscountPercentage?: string | null;
  bundleQuantity?: string | null;
  bundleTotalPrice?: string | null;
  startAt: string | Date;
  endAt: string | Date;
  isActive: boolean;
};

export type PricingLine = {
  productId: string;
  categoryId?: string | null;
  quantity: string;
  unitPrice: string;
};

export type PricedLine = PricingLine & {
  grossAmount: string;
  discountAmount: string;
  netAmount: string;
};

const roundCurrency = (value: number) =>
  Math.max(0, Math.round((value + Number.EPSILON) * 100) / 100);

const appliesToLine = (promotion: PromotionRule, line: PricingLine) => {
  if (promotion.appliesTo === "all") return true;
  if (promotion.appliesTo === "category")
    return promotion.categoryId === line.categoryId;
  return promotion.productIds?.includes(line.productId) ?? false;
};

export const calculatePromotionPricing = (
  lines: PricingLine[],
  promotions: PromotionRule[],
  now = new Date(),
) => {
  const active = promotions.filter(
    (promotion) =>
      promotion.isActive &&
      new Date(promotion.startAt) <= now &&
      new Date(promotion.endAt) > now,
  );
  return lines.map((line): PricedLine => {
    const gross = roundCurrency(Number(line.unitPrice) * Number(line.quantity));
    const eligible = active.filter((promotion) =>
      appliesToLine(promotion, line),
    );
    let discount = 0;
    for (const promotion of eligible) {
      if (promotion.type === "percentage_discount")
        discount += (gross * Number(promotion.value)) / 100;
      if (promotion.type === "fixed_discount")
        discount += Number(promotion.value);
      if (
        promotion.type === "buy_x_get_y" &&
        promotion.buyQuantity &&
        promotion.getQuantity &&
        promotion.getDiscountPercentage
      ) {
        const groupSize =
          Number(promotion.buyQuantity) + Number(promotion.getQuantity);
        const discountedUnits =
          Math.floor(Number(line.quantity) / groupSize) *
          Number(promotion.getQuantity);
        discount +=
          (discountedUnits *
            Number(line.unitPrice) *
            Number(promotion.getDiscountPercentage)) /
          100;
      }
      if (
        promotion.type === "bundle_price" &&
        promotion.bundleQuantity &&
        promotion.bundleTotalPrice
      ) {
        const bundleCount = Math.floor(
          Number(line.quantity) / Number(promotion.bundleQuantity),
        );
        const bundleGross =
          bundleCount *
          Number(promotion.bundleQuantity) *
          Number(line.unitPrice);
        const bundleDiscount =
          bundleGross - bundleCount * Number(promotion.bundleTotalPrice);
        discount += Math.max(0, bundleDiscount);
      }
    }
    discount = Math.min(gross, roundCurrency(discount));
    return {
      ...line,
      grossAmount: gross.toFixed(2),
      discountAmount: discount.toFixed(2),
      netAmount: (gross - discount).toFixed(2),
    };
  });
};

export const sumPricedLines = (lines: PricedLine[]) =>
  lines.reduce((total, line) => total + Number(line.netAmount), 0).toFixed(2);
export { roundCurrency };
