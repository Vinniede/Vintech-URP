import { and, eq, sql } from "drizzle-orm";
import {
  customerAccountTransactions,
  customerAccounts,
  products,
  saleItems,
  sales,
} from "@urp/db/schema";
import type { Database } from "./db.js";
import { decrementStock } from "./stock.js";

type SaleInput = {
  deviceSaleId: string;
  shiftId?: string | null;
  totalAmount: string;
  paymentMethod: "cash" | "card" | "mobile_money" | "split" | "credit";
};

type SaleItem = {
  productId: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
};
type Product = typeof products.$inferSelect;

export const completeSale = async (
  db: Database,
  input: {
    storeId: string;
    userId: string;
    sale: SaleInput;
    productRows: Array<{ item: SaleItem; product: Product }>;
    customerAccountId?: string | null;
  },
) => {
  const [sale] = await db
    .insert(sales)
    .values({
      storeId: input.storeId,
      cashierId: input.userId,
      shiftId: input.sale.shiftId,
      totalAmount: input.sale.totalAmount,
      paymentMethod: input.sale.paymentMethod,
      deviceSaleId: input.sale.deviceSaleId,
      syncedAt: new Date(),
    })
    .returning();
  if (!sale) return undefined;

  for (const { item, product } of input.productRows) {
    await db.insert(saleItems).values({
      storeId: input.storeId,
      saleId: sale.id,
      productId: product.id,
      quantity: item.quantity,
      unitPrice: product.sellingPrice,
      discountAmount: item.discountAmount,
    });
    await decrementStock(db, {
      storeId: input.storeId,
      productId: product.id,
      quantity: item.quantity,
      userId: input.userId,
      entityId: sale.id,
    });
  }

  if (input.customerAccountId) {
    await db
      .update(customerAccounts)
      .set({ balance: sql`${customerAccounts.balance} + ${sale.totalAmount}` })
      .where(
        and(
          eq(customerAccounts.id, input.customerAccountId),
          eq(customerAccounts.storeId, input.storeId),
        ),
      );
    await db.insert(customerAccountTransactions).values({
      storeId: input.storeId,
      customerAccountId: input.customerAccountId,
      saleId: sale.id,
      type: "charge",
      amount: sale.totalAmount,
      note: "POS credit sale",
    });
  }
  return sale;
};
