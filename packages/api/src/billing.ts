import { and, desc, eq, lte, lt } from "drizzle-orm";
import { invoicePaymentAttempts, invoices, planPricing, stores } from "@urp/db/schema";
import type { Database } from "./db.js";

export const completeInvoicePayment = async (
  db: Database,
  invoiceId: string,
  providerReference: string | null,
  rawPayload: unknown,
) => {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceId))
    .limit(1);
  if (!invoice) return null;

  const paidAt = new Date();
  const [updated] = await db
    .update(invoices)
    .set({ status: "paid", paidAt })
    .where(eq(invoices.id, invoiceId))
    .returning();
  if (providerReference) {
    await db
      .update(invoicePaymentAttempts)
      .set({ status: "confirmed", rawCallbackPayload: rawPayload })
      .where(eq(invoicePaymentAttempts.providerReference, providerReference));
  }
  await db
    .update(stores)
    .set({ isSuspended: false })
    .where(eq(stores.id, invoice.storeId));
  return updated ?? invoice;
};

export const markOverdueInvoices = async (db: Database, now = new Date()) => {
  const overdue = await db
    .select({ id: invoices.id, storeId: invoices.storeId })
    .from(invoices)
    .where(and(eq(invoices.status, "pending"), lt(invoices.dueDate, now)));
  for (const invoice of overdue) {
    await db
      .update(invoices)
      .set({ status: "overdue" })
      .where(eq(invoices.id, invoice.id));
    await db
      .update(stores)
      .set({ isSuspended: true })
      .where(eq(stores.id, invoice.storeId));
  }
  return overdue.length;
};

export const generateInvoices = async (db: Database, now = new Date()) => {
  const activeStores = await db
    .select()
    .from(stores)
    .where(eq(stores.isSuspended, false));
  let created = 0;
  for (const store of activeStores) {
    const [latest] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.storeId, store.id))
      .orderBy(desc(invoices.periodEnd))
      .limit(1);
    const periodStart = latest?.periodEnd && latest.periodEnd > now ? null : latest?.periodEnd ?? now;
    if (!periodStart) continue;
    const [pricing] = await db
      .select()
      .from(planPricing)
      .where(and(
        eq(planPricing.plan, store.billingPlan),
        eq(planPricing.billingCycle, store.billingCycle),
        eq(planPricing.isActive, true),
        lte(planPricing.effectiveFrom, now),
      ))
      .orderBy(desc(planPricing.effectiveFrom))
      .limit(1);
    if (!pricing) continue;
    const periodEnd = new Date(periodStart);
    if (store.billingCycle === "annual") periodEnd.setUTCFullYear(periodEnd.getUTCFullYear() + 1);
    else periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
    const dueDate = new Date(periodEnd);
    dueDate.setUTCDate(dueDate.getUTCDate() + 7);
    await db.insert(invoices).values({
      storeId: store.id,
      plan: store.billingPlan,
      billingCycle: store.billingCycle,
      amount: pricing.amount,
      currency: pricing.currency,
      periodStart,
      periodEnd,
      dueDate,
    });
    created += 1;
  }
  return created;
};
