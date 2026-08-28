import { and, eq, gt, lte } from "drizzle-orm";
import { products, promotionProducts, promotions } from "@urp/db/schema";
import {
  calculatePromotionPricing,
  sumPricedLines,
  type PricingLine,
  type PromotionRule,
} from "@urp/shared-types";
import type { Database } from "./db.js";

export const getActivePromotionRules = async (
  db: Database,
  storeId: string,
  now = new Date(),
): Promise<PromotionRule[]> => {
  const rows = await db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.storeId, storeId),
        eq(promotions.isActive, true),
        lte(promotions.startAt, now),
        gt(promotions.endAt, now),
      ),
    );
  const links = await db
    .select()
    .from(promotionProducts)
    .where(eq(promotionProducts.storeId, storeId));
  return rows.map((promotion) => ({
    id: promotion.id,
    type: promotion.type,
    value: promotion.value,
    appliesTo: promotion.appliesTo,
    categoryId: promotion.categoryId,
    buyQuantity: promotion.buyQuantity,
    getQuantity: promotion.getQuantity,
    getDiscountPercentage: promotion.getDiscountPercentage,
    bundleQuantity: promotion.bundleQuantity,
    bundleTotalPrice: promotion.bundleTotalPrice,
    productIds: links
      .filter((link) => link.promotionId === promotion.id)
      .map((link) => link.productId),
    startAt: promotion.startAt,
    endAt: promotion.endAt,
    isActive: promotion.isActive,
  }));
};

export const priceLines = async (
  db: Database,
  storeId: string,
  lines: PricingLine[],
) => {
  const rules = await getActivePromotionRules(db, storeId);
  const priced = calculatePromotionPricing(lines, rules);
  return { lines: priced, total: sumPricedLines(priced) };
};

export const productIsCountable = async (
  db: Database,
  storeId: string,
  productId: string,
) => {
  const [product] = await db
    .select({ unitOfMeasure: products.unitOfMeasure })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.storeId, storeId)))
    .limit(1);
  return product?.unitOfMeasure === "piece";
};
