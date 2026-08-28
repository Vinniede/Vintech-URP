import { and, eq, sql } from 'drizzle-orm';
import { auditLogs, products } from '@urp/db/schema';
import type { Database } from './db.js';

export const decrementStock = async (db: Database, input: {
  storeId: string;
  productId: string;
  quantity: string;
  userId?: string;
  entityId?: string;
}) => {
  const [product] = await db.select().from(products).where(and(
    eq(products.id, input.productId),
    eq(products.storeId, input.storeId),
  )).limit(1);
  if (!product) return { found: false, discrepancy: false } as const;

  const discrepancy = Number(product.stockQuantity) - Number(input.quantity) < 0;
  await db.update(products).set({
    stockQuantity: sql`${products.stockQuantity} - ${input.quantity}`,
    updatedAt: new Date(),
  }).where(and(eq(products.id, product.id), eq(products.storeId, input.storeId)));
  if (discrepancy) {
    await db.insert(auditLogs).values({
      storeId: input.storeId,
      userId: input.userId,
      action: 'stock.discrepancy',
      entityType: input.entityId ? 'sale' : 'order',
      entityId: input.entityId,
      metadata: { productId: product.id, stockBefore: product.stockQuantity, quantity: input.quantity },
    });
  }
  return { found: true, discrepancy } as const;
};