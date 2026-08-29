import { zValidator } from "@hono/zod-validator";
import { cors } from "hono/cors";
import { Hono } from "hono";
import type { Context } from "hono";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { jwtVerify } from "jose";
import {
  auditLogs,
  invoicePaymentAttempts,
  invoices,
  planPricing,
  categories,
  customerAccountTransactions,
  customerAccounts,
  customerAddresses,
  customers,
  orderItems,
  orderStatusHistory,
  orders,
  pendingApprovals,
  paymentTransactions,
  platformPaymentConfig,
  printerProfiles,
  productImages,
  products,
  promotionProducts,
  promotions,
  purchaseOrderItems,
  purchaseOrders,
  saleItems,
  sales,
  shifts,
  storePaymentConfigs,
  stores,
  suppliers,
  users,
} from "@urp/db/schema";
import {
  categoryInputSchema,
  promotionSchema,
  promotionUpdateSchema,
  purchaseOrderReceiveSchema,
  purchaseOrderSchema,
  purchaseOrderUpdateSchema,
  supplierSchema,
  paymentConfigSchema,
  paymentInitiateSchema,
  bankPaymentSchema,
  mpesaCallbackSchema,
  paymentTransactionTargetSchema,
  printerProfileSchema,
  printerProfileUpdateSchema,
  customerAccountPaymentSchema,
  customerAccountSchema,
  customerAccountUpdateSchema,
  customerLoginSchema,
  customerRegisterSchema,
  productInputSchema,
  refreshTokenSchema,
  closeShiftSchema,
  openShiftSchema,
  approvalDecisionSchema,
  auditLogQuerySchema,
  invoiceCreateSchema,
  invoiceMpesaSchema,
  platformPaymentConfigSchema,
  planPricingSchema,
  reportDateSchema,
  salesListQuerySchema,
  salesBatchSchema,
  staffLoginSchema,
  staffCreateSchema,
  staffUpdateSchema,
  shiftListQuerySchema,
  addressSchema,
  createOrderSchema,
  orderStatusUpdateSchema,
  paymentSchema,
  storefrontProductQuerySchema,
} from "@urp/shared-types";
import {
  createRefreshToken,
  createToken,
  requireActiveStore,
  requireAuth,
  requireCustomer,
  requireRole,
  requireStaff,
  requireStoreAccess,
} from "./auth.js";
import { createDb } from "./db.js";
import { decrementStock } from "./stock.js";
import {
  getActivePromotionRules,
  priceLines,
  productIsCountable,
} from "./pricing.js";
import { completeSale } from "./sales.js";
import {
  decryptMpesaConfig,
  initiateCard,
  initiateMpesa,
  testMpesaConnection,
} from "./payments.js";
import {
  encryptCredentials,
  maskConfiguredCredentials,
} from "./payment-crypto.js";
import type { AppEnv } from "./types.js";
import { hashPassword, verifyPassword } from "./passwords.js";
import { bootstrapPlatformAdmin, createPlatformToken, requirePlatformAdmin } from "./platform-auth.js";
import { completeInvoicePayment, generateInvoices, markOverdueInvoices } from "./billing.js";
import { moduleToggleSchema, platformAdminLoginSchema, storeCreateSchema } from "@urp/shared-types";
import { platformAdmins } from "@urp/db/schema";

const app = new Hono<AppEnv>();

app.use("/api/*", cors({
  origin: (origin) => origin,
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  maxAge: 86400,
}));

app.post("/api/v1/platform/auth/login", zValidator("json", platformAdminLoginSchema), async (c) => {
  const input = c.req.valid("json");
  const db = createDb(c.env.DATABASE_URL);
  const defaultEmail = (c.env.PLATFORM_ADMIN_EMAIL ?? "system@urp.local").trim().toLowerCase();
  const normalizedEmail = input.email.trim().toLowerCase();

  if (!normalizedEmail || normalizedEmail === defaultEmail) {
    await bootstrapPlatformAdmin(db, c.env, normalizedEmail || defaultEmail);
  }

  const [admin] = await db.select().from(platformAdmins).where(and(eq(platformAdmins.email, normalizedEmail), eq(platformAdmins.isActive, true))).limit(1);
  if (!admin || !(await verifyPassword(input.password, admin.passwordHash))) return c.json({ error: "Invalid credentials" }, 401);
  return c.json({ accessToken: await createPlatformToken(admin.id, c.env.JWT_SECRET), admin: { id: admin.id, name: admin.name, email: admin.email } });
});

app.use("/api/v1/platform/*", requirePlatformAdmin);
app.use("/api/v1/platform/*", async (c, next) => {
  c.set("db", createDb(c.env.DATABASE_URL));
  await next();
});
app.get("/api/v1/platform/stores", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json({ stores: await db.select({ id: stores.id, name: stores.name, slug: stores.slug, currency: stores.currency, posEnabled: stores.posEnabled, storefrontEnabled: stores.storefrontEnabled, timezone: stores.timezone, createdAt: stores.createdAt }).from(stores).orderBy(desc(stores.createdAt)) });
});

app.get("/api/v1/platform/stores/:id/invoices", async (c) => {
  const rows = await createDb(c.env.DATABASE_URL)
    .select()
    .from(invoices)
    .where(eq(invoices.storeId, c.req.param("id")))
    .orderBy(desc(invoices.createdAt));
  return c.json({ invoices: rows });
});

app.get("/api/v1/platform/billing/config", async (c) => {
  const rows = await createDb(c.env.DATABASE_URL)
    .select({ provider: platformPaymentConfig.provider, environment: platformPaymentConfig.environment, isActive: platformPaymentConfig.isActive, credentialsEncrypted: platformPaymentConfig.credentialsEncrypted })
    .from(platformPaymentConfig);
  return c.json({ paymentConfigs: rows.map(({ credentialsEncrypted, ...config }) => ({ ...config, configured: Boolean(credentialsEncrypted) })) });
});

app.get("/api/v1/platform/billing/pricing", async (c) => {
  const rows = await createDb(c.env.DATABASE_URL).select().from(planPricing).orderBy(desc(planPricing.effectiveFrom));
  return c.json({ pricing: rows });
});

app.post("/api/v1/platform/billing/pricing", zValidator("json", planPricingSchema), async (c) => {
  const [pricing] = await createDb(c.env.DATABASE_URL).insert(planPricing).values(c.req.valid("json")).returning();
  return pricing ? c.json({ pricing }, 201) : c.json({ error: "Pricing could not be created" }, 500);
});

app.delete("/api/v1/platform/billing/pricing/:id", async (c) => {
  const [deleted] = await createDb(c.env.DATABASE_URL)
    .delete(planPricing)
    .where(eq(planPricing.id, c.req.param("id")))
    .returning({ id: planPricing.id });
  return deleted ? c.json({ deleted: deleted.id }) : c.json({ error: "Pricing not found" }, 404);
});

app.put("/api/v1/platform/billing/config", zValidator("json", platformPaymentConfigSchema), async (c) => {
  const input = c.req.valid("json");
  const db = createDb(c.env.DATABASE_URL);
  const encrypted = await encryptCredentials(JSON.stringify(input.credentials), c.env.PAYMENT_CREDENTIALS_KEY);
  const [config] = await db
    .insert(platformPaymentConfig)
    .values({ provider: input.provider, environment: input.environment, isActive: input.isActive, credentialsEncrypted: encrypted })
    .onConflictDoUpdate({ target: platformPaymentConfig.provider, set: { environment: input.environment, isActive: input.isActive, credentialsEncrypted: encrypted } })
    .returning({ provider: platformPaymentConfig.provider, environment: platformPaymentConfig.environment, isActive: platformPaymentConfig.isActive });
  return c.json({ paymentConfig: config });
});

app.delete("/api/v1/platform/billing/config/:provider", async (c) => {
  const provider = c.req.param("provider");
  if (provider !== "mpesa" && provider !== "bank") return c.json({ error: "Unsupported payment provider" }, 400);
  const [deleted] = await createDb(c.env.DATABASE_URL)
    .delete(platformPaymentConfig)
    .where(eq(platformPaymentConfig.provider, provider))
    .returning({ provider: platformPaymentConfig.provider });
  return deleted ? c.json({ deleted: deleted.provider }) : c.json({ error: "Payment configuration not found" }, 404);
});

app.post(
  "/api/v1/platform/stores/:id/invoices",
  zValidator("json", invoiceCreateSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const [store] = await db
      .select({ currency: stores.currency })
      .from(stores)
      .where(eq(stores.id, c.req.param("id")))
      .limit(1);
    if (!store) return c.json({ error: "Store not found" }, 404);
    const input = c.req.valid("json");
    const [invoice] = await db
      .insert(invoices)
      .values({ storeId: c.req.param("id"), currency: store.currency, ...input })
      .returning();
    return invoice ? c.json({ invoice }, 201) : c.json({ error: "Invoice could not be created" }, 500);
  },
);

app.post("/api/v1/platform/invoices/:id/mark-paid", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const body = (await c.req.json().catch(() => ({}))) as { providerReference?: string };
  const invoice = await completeInvoicePayment(db, c.req.param("id"), body.providerReference ?? null, { source: "platform-manual" });
  return invoice ? c.json({ invoice: { ...invoice, status: "paid" } }) : c.json({ error: "Invoice not found" }, 404);
});

app.post("/api/v1/platform/billing/mark-overdue", async (c) => {
  const count = await markOverdueInvoices(createDb(c.env.DATABASE_URL));
  return c.json({ markedOverdue: count });
});

app.post("/api/v1/platform/billing/generate", async (c) => {
  const count = await generateInvoices(createDb(c.env.DATABASE_URL));
  return c.json({ generated: count });
});

app.post("/api/v1/platform/stores", zValidator("json", storeCreateSchema), async (c) => {
  const { ownerName, ownerEmail, ownerPhone, ownerPassword, ...storeInput } = c.req.valid("json");
  const db = createDb(c.env.DATABASE_URL);
  const [existing] = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.slug, storeInput.slug))
    .limit(1);
  if (existing) return c.json({ error: "Store slug already exists" }, 409);
  let store;
  try {
    [store] = await db.insert(stores).values(storeInput).returning({ id: stores.id, name: stores.name, slug: stores.slug, currency: stores.currency, posEnabled: stores.posEnabled, storefrontEnabled: stores.storefrontEnabled, timezone: stores.timezone });
  } catch {
    return c.json({ error: "Store slug already exists" }, 409);
  }
  if (!store) return c.json({ error: "Store could not be created" }, 500);
  let owner;
  try {
    [owner] = await db.insert(users).values({ storeId: store.id, name: ownerName, email: ownerEmail.trim().toLowerCase(), phone: ownerPhone, role: "owner", passwordHash: await hashPassword(ownerPassword) }).returning({ id: users.id, name: users.name, email: users.email, role: users.role });
  } catch {
    await db.delete(stores).where(eq(stores.id, store.id));
    return c.json({ error: "Owner could not be created. Check that the owner email is not already in use." }, 409);
  }
  return owner ? c.json({ store, owner }, 201) : c.json({ error: "Owner could not be created" }, 500);
});

app.patch("/api/v1/platform/stores/:id/modules", zValidator("json", moduleToggleSchema), async (c) => {
  const [store] = await createDb(c.env.DATABASE_URL).update(stores).set(c.req.valid("json")).where(eq(stores.id, c.req.param("id"))).returning({ id: stores.id, posEnabled: stores.posEnabled, storefrontEnabled: stores.storefrontEnabled });
  return store ? c.json({ store }) : c.json({ error: "Store not found" }, 404);
});

app.delete("/api/v1/platform/stores/:id", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const storeId = c.req.param("id");
  const [store] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).limit(1);
  if (!store) return c.json({ error: "Store not found" }, 404);
  const deleteStatements = [
    sql`DELETE FROM invoice_payment_attempts WHERE invoice_id IN (SELECT id FROM invoices WHERE store_id = ${storeId})`,
    sql`DELETE FROM invoices WHERE store_id = ${storeId}`,
    sql`DELETE FROM audit_logs WHERE store_id = ${storeId}`,
    sql`DELETE FROM customer_addresses WHERE customer_id IN (SELECT id FROM customers WHERE store_id = ${storeId})`,
    sql`DELETE FROM customer_account_transactions WHERE store_id = ${storeId}`,
    sql`DELETE FROM customer_accounts WHERE store_id = ${storeId}`,
    sql`DELETE FROM order_status_history WHERE store_id = ${storeId}`,
    sql`DELETE FROM order_items WHERE store_id = ${storeId}`,
    sql`DELETE FROM orders WHERE store_id = ${storeId}`,
    sql`DELETE FROM customers WHERE store_id = ${storeId}`,
    sql`DELETE FROM payment_transactions WHERE store_id = ${storeId}`,
    sql`DELETE FROM pending_approvals WHERE store_id = ${storeId}`,
    sql`DELETE FROM product_images WHERE store_id = ${storeId}`,
    sql`DELETE FROM promotion_products WHERE store_id = ${storeId}`,
    sql`DELETE FROM promotions WHERE store_id = ${storeId}`,
    sql`DELETE FROM sale_items WHERE store_id = ${storeId}`,
    sql`DELETE FROM sales WHERE store_id = ${storeId}`,
    sql`DELETE FROM shifts WHERE store_id = ${storeId}`,
    sql`DELETE FROM store_payment_configs WHERE store_id = ${storeId}`,
    sql`DELETE FROM purchase_order_items WHERE store_id = ${storeId}`,
    sql`DELETE FROM purchase_orders WHERE store_id = ${storeId}`,
    sql`DELETE FROM categories WHERE store_id = ${storeId}`,
    sql`DELETE FROM products WHERE store_id = ${storeId}`,
    sql`DELETE FROM suppliers WHERE store_id = ${storeId}`,
    sql`DELETE FROM users WHERE store_id = ${storeId}`,
    sql`DELETE FROM stores WHERE id = ${storeId}`,
  ];
  for (const statement of deleteStatements) await db.execute(statement);
  return c.json({ deleted: storeId });
});

const orderTransitions: Record<
  import("@urp/shared-types").OrderStatus,
  readonly import("@urp/shared-types").OrderStatus[]
> = {
  pending: ["paid", "cancelled"],
  paid: ["packed", "cancelled"],
  packed: ["shipped", "ready_for_pickup"],
  shipped: ["completed"],
  ready_for_pickup: ["completed"],
  completed: [],
  cancelled: [],
};

app.get("/health", (c) => c.json({ ok: true, version: "v1" }));

app.post(
  "/api/v1/auth/staff-login",
  zValidator("json", staffLoginSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = createDb(c.env.DATABASE_URL);
    const [user] = await db
        .select()
      .from(users)
      .where(
        and(
          eq(users.storeId, input.storeId),
          eq(users.email, input.email.trim().toLowerCase()),
          eq(users.isActive, true),
        ),
      )
      .limit(1);
    const [staffStore] = await db.select({ isSuspended: stores.isSuspended }).from(stores).where(eq(stores.id, input.storeId)).limit(1);
    if (staffStore?.isSuspended) return c.json({ error: "Account suspended, contact support" }, 403);

    if (!user) return c.json({ error: "Invalid credentials" }, 401);
    const credential = input.password ?? input.pin;
    const hash = input.password ? user.passwordHash : user.pinHash;
    if (!credential || !(await verifyPassword(credential, hash))) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const token = await createToken(
      { id: user.id, storeId: user.storeId, role: user.role },
      c.env.JWT_SECRET,
    );
    const refreshToken = await createRefreshToken(
      { id: user.id, storeId: user.storeId, role: user.role },
      c.env.JWT_SECRET,
    );
    return c.json({
      accessToken: token,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        storeId: user.storeId,
      },
    });
  },
);

app.post(
  "/api/v1/auth/customer-login",
  zValidator("json", customerLoginSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = createDb(c.env.DATABASE_URL);
    const [customer] = await db
        .select()
      .from(customers)
      .where(
        and(
          eq(customers.storeId, input.storeId),
          eq(customers.email, input.email),
        ),
      )
      .limit(1);
    if (
      !customer ||
      !(await verifyPassword(input.password, customer.passwordHash))
    ) {
      return c.json({ error: "Invalid credentials" }, 401);
    }
    const [customerStore] = await db.select({ isSuspended: stores.isSuspended }).from(stores).where(eq(stores.id, customer.storeId)).limit(1);
    if (customerStore?.isSuspended) return c.json({ error: "Store temporarily unavailable" }, 403);

    const identity = {
      id: customer.id,
      storeId: customer.storeId,
      role: "fulfillment" as const,
      kind: "customer" as const,
    };
    return c.json({
      accessToken: await createToken(identity, c.env.JWT_SECRET),
      refreshToken: await createRefreshToken(identity, c.env.JWT_SECRET),
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        storeId: customer.storeId,
      },
    });
  },
);

app.post(
  "/api/v1/customers/register",
  zValidator("json", customerRegisterSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = createDb(c.env.DATABASE_URL);
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.storeId, input.storeId),
          eq(customers.email, input.email),
        ),
      )
      .limit(1);
    if (existing)
      return c.json(
        { error: "A customer with that email already exists" },
        409,
      );

    const [customer] = await db
      .insert(customers)
      .values({
        storeId: input.storeId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: await hashPassword(input.password),
      })
      .returning();
    if (!customer)
      return c.json({ error: "Customer could not be registered" }, 500);
    await db.insert(auditLogs).values({
      storeId: input.storeId,
      action: "customer.registered",
      entityType: "customer",
      entityId: customer.id,
    });
    return c.json(
      {
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          storeId: customer.storeId,
        },
      },
      201,
    );
  },
);

app.post(
  "/api/v1/auth/refresh",
  zValidator("json", refreshTokenSchema),
  async (c) => {
    const input = c.req.valid("json");
    try {
      const { payload } = await jwtVerify(
        input.refreshToken,
        new TextEncoder().encode(c.env.JWT_SECRET),
        { audience: ["staff-refresh", "customer-refresh"] },
      );
      if (
        payload.tokenType !== "refresh" ||
        typeof payload.sub !== "string" ||
        typeof payload.storeId !== "string"
      ) {
        return c.json({ error: "Invalid refresh token" }, 401);
      }
      const role =
        typeof payload.role === "string"
          ? (payload.role as import("@urp/shared-types").Role)
          : "fulfillment";
      const kind =
        payload.kind === "customer"
          ? ("customer" as const)
          : ("staff" as const);
      const identity = {
        id: payload.sub,
        storeId: payload.storeId,
        role,
        kind,
      };
      return c.json({
        accessToken: await createToken(identity, c.env.JWT_SECRET),
      });
    } catch {
      return c.json({ error: "Invalid or expired refresh token" }, 401);
    }
  },
);

app.get(
  "/api/v1/storefront/:storeSlug/products",
  zValidator("query", storefrontProductQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const db = createDb(c.env.DATABASE_URL);
    const [store] = await db
      .select({ id: stores.id, enabled: stores.storefrontEnabled })
      .from(stores)
      .where(eq(stores.slug, c.req.param("storeSlug")))
      .limit(1);
    if (!store) return c.json({ error: "Store not found" }, 404);
    if (!store.enabled)
      return c.json({ error: "Storefront is not enabled for this store" }, 403);
    const filters = [
      eq(products.storeId, store.id),
      eq(products.publishedOnline, true),
    ];
    if (query.categoryId)
      filters.push(eq(products.categoryId, query.categoryId));
    if (query.search)
      filters.push(
        sql`lower(${products.name}) LIKE ${`%${query.search.toLowerCase()}%`}`,
      );
    return c.json({
      products: await db
        .select()
        .from(products)
        .where(and(...filters)),
    });
  },
);

app.get("/api/v1/storefront/:storeSlug/products/:id", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const [store] = await db
    .select({ id: stores.id, enabled: stores.storefrontEnabled })
    .from(stores)
    .where(eq(stores.slug, c.req.param("storeSlug")))
    .limit(1);
  if (!store) return c.json({ error: "Store not found" }, 404);
  if (!store.enabled)
    return c.json({ error: "Storefront is not enabled for this store" }, 403);
  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.id, c.req.param("id")),
        eq(products.storeId, store.id),
        eq(products.publishedOnline, true),
      ),
    )
    .limit(1);
  if (!product) return c.json({ error: "Product not found" }, 404);
  return c.json({
    product,
    images: await db
      .select()
      .from(productImages)
      .where(
        and(
          eq(productImages.productId, product.id),
          eq(productImages.storeId, store.id),
        ),
      ),
  });
});
  app.get('/api/v1/sales', requireRole('cashier', 'supervisor', 'store_admin', 'owner'), zValidator('query', salesListQuerySchema), async (c) => {
    const user = c.get('user');
    const query = c.req.valid('query');
    const conditions = [eq(sales.storeId, user.storeId)];
    if (user.role === 'cashier') conditions.push(eq(sales.cashierId, user.id));
    if (query.shiftId) conditions.push(eq(sales.shiftId, query.shiftId));
    if (query.date) {
      const start = new Date(`${query.date}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      conditions.push(gte(sales.createdAt, start), lt(sales.createdAt, end));
    }
    return c.json({ sales: await c.get('db').select({ id: sales.id, deviceSaleId: sales.deviceSaleId, cashierId: sales.cashierId, shiftId: sales.shiftId, totalAmount: sales.totalAmount, paymentMethod: sales.paymentMethod, status: sales.status, createdAt: sales.createdAt }).from(sales).where(and(...conditions)).orderBy(desc(sales.createdAt)).limit(100) });
  });

app.get("/api/v1/storefront/:storeSlug/categories", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const [store] = await db
    .select({ id: stores.id, enabled: stores.storefrontEnabled })
    .from(stores)
    .where(eq(stores.slug, c.req.param("storeSlug")))
    .limit(1);
  if (!store) return c.json({ error: "Store not found" }, 404);
  if (!store.enabled)
    return c.json({ error: "Storefront is not enabled for this store" }, 403);
  return c.json({
    categories: await db
      .select()
      .from(categories)
      .where(eq(categories.storeId, store.id)),
  });
});

app.get("/api/v1/storefront/:storeSlug/promotions", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const [store] = await db
    .select({ id: stores.id, enabled: stores.storefrontEnabled })
    .from(stores)
    .where(eq(stores.slug, c.req.param("storeSlug")))
    .limit(1);
  if (!store) return c.json({ error: "Store not found" }, 404);
  if (!store.enabled)
    return c.json({ error: "Storefront is not enabled for this store" }, 403);
  return c.json({ promotions: await getActivePromotionRules(db, store.id) });
});
app.get("/api/v1/storefront/:storeSlug/payment-methods", async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const [store] = await db
    .select({ id: stores.id, enabled: stores.storefrontEnabled })
    .from(stores)
    .where(eq(stores.slug, c.req.param("storeSlug")))
    .limit(1);
  if (!store) return c.json({ error: "Store not found" }, 404);
  if (!store.enabled)
    return c.json({ error: "Storefront is not enabled for this store" }, 403);
  const configs = await db
    .select({
      provider: storePaymentConfigs.provider,
      isEnabled: storePaymentConfigs.isEnabled,
    })
    .from(storePaymentConfigs)
    .where(
      and(
        eq(storePaymentConfigs.storeId, store.id),
        eq(storePaymentConfigs.isEnabled, true),
      ),
    );
  return c.json({
    paymentMethods: ["cash", ...configs.map((config) => config.provider)],
  });
});

app.post(
  "/api/v1/customers/register",
  zValidator("json", customerRegisterSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = createDb(c.env.DATABASE_URL);
    const [store] = await db
      .select({ id: stores.id, enabled: stores.storefrontEnabled })
      .from(stores)
      .where(eq(stores.id, input.storeId))
      .limit(1);
    if (!store?.enabled)
      return c.json({ error: "Storefront is not enabled for this store" }, 403);
    const [existing] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.storeId, input.storeId),
          eq(customers.email, input.email),
        ),
      )
      .limit(1);
    if (existing)
      return c.json(
        { error: "A customer with that email already exists" },
        409,
      );
    const [customer] = await db
      .insert(customers)
      .values({
        storeId: input.storeId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        passwordHash: await hashPassword(input.password),
      })
      .returning();
    if (!customer)
      return c.json({ error: "Customer could not be registered" }, 500);
    return c.json(
      {
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          storeId: customer.storeId,
        },
      },
      201,
    );
  },
);

app.post(
  "/api/v1/customers/login",
  zValidator("json", customerLoginSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = createDb(c.env.DATABASE_URL);
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.storeId, input.storeId),
          eq(customers.email, input.email),
        ),
      )
      .limit(1);
    if (
      !customer ||
      !(await verifyPassword(input.password, customer.passwordHash))
    )
      return c.json({ error: "Invalid credentials" }, 401);
    const identity = {
      id: customer.id,
      storeId: customer.storeId,
      role: "fulfillment" as const,
      kind: "customer" as const,
    };
    return c.json({
      accessToken: await createToken(identity, c.env.JWT_SECRET),
      refreshToken: await createRefreshToken(identity, c.env.JWT_SECRET),
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        storeId: customer.storeId,
      },
    });
  },
);

app.use("/api/v1/customers/me/*", requireCustomer);
app.use("/api/v1/orders", requireCustomer);
app.use("/api/v1/orders/*", requireCustomer);

app.get("/api/v1/customers/me", async (c) => {
  const user = c.get("user");
  const [customer] = await c
    .get("db")
    .select({
      id: customers.id,
      storeId: customers.storeId,
      name: customers.name,
      email: customers.email,
      phone: customers.phone,
    })
    .from(customers)
    .where(and(eq(customers.id, user.id), eq(customers.storeId, user.storeId)))
    .limit(1);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  return c.json({ customer });
});

app.patch(
  "/api/v1/customers/me",
  zValidator(
    "json",
    customerRegisterSchema.pick({ name: true, phone: true }).partial(),
  ),
  async (c) => {
    const user = c.get("user");
    const [customer] = await c
      .get("db")
      .update(customers)
      .set(c.req.valid("json"))
      .where(
        and(eq(customers.id, user.id), eq(customers.storeId, user.storeId)),
      )
      .returning({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
      });
    return customer
      ? c.json({ customer })
      : c.json({ error: "Customer not found" }, 404);
  },
);

app.get("/api/v1/customers/me/addresses", async (c) =>
  c.json({
    addresses: await c
      .get("db")
      .select()
      .from(customerAddresses)
      .where(eq(customerAddresses.customerId, c.get("user").id)),
  }),
);
app.post(
  "/api/v1/customers/me/addresses",
  zValidator("json", addressSchema),
  async (c) => {
    const [address] = await c
      .get("db")
      .insert(customerAddresses)
      .values({ customerId: c.get("user").id, ...c.req.valid("json") })
      .returning();
    return address
      ? c.json({ address }, 201)
      : c.json({ error: "Address could not be saved" }, 500);
  },
);

app.post("/api/v1/orders", zValidator("json", createOrderSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");
  const [customer] = await c
    .get("db")
    .select()
    .from(customers)
    .where(and(eq(customers.id, user.id), eq(customers.storeId, user.storeId)))
    .limit(1);
  if (!customer) return c.json({ error: "Customer not found" }, 404);
  if (input.fulfillmentType === "delivery") {
    const [address] = await c
      .get("db")
      .select({ id: customerAddresses.id })
      .from(customerAddresses)
      .where(
        and(
          eq(customerAddresses.id, input.deliveryAddressId as string),
          eq(customerAddresses.customerId, user.id),
        ),
      )
      .limit(1);
    if (!address) return c.json({ error: "Delivery address not found" }, 400);
  }
  const rows = [];
  for (const item of input.items) {
    const [product] = await c
      .get("db")
      .select()
      .from(products)
      .where(
        and(
          eq(products.id, item.productId),
          eq(products.storeId, user.storeId),
          eq(products.publishedOnline, true),
        ),
      )
      .limit(1);
    if (!product)
      return c.json({ error: `Product unavailable: ${item.productId}` }, 400);
    if (
      product.unitOfMeasure === "piece" &&
      !Number.isInteger(Number(item.quantity))
    )
      return c.json(
        { error: `Fractional quantity is not valid for ${product.name}` },
        400,
      );
    rows.push({ item, product });
  }
  const pricedOrder = await priceLines(
    c.get("db"),
    user.storeId,
    rows.map(({ item, product }) => ({
      productId: product.id,
      categoryId: product.categoryId,
      quantity: item.quantity,
      unitPrice: product.sellingPrice,
    })),
  );
  const subtotal = Number(pricedOrder.total);
  const deliveryFee = input.fulfillmentType === "delivery" ? 0 : 0;
  const [order] = await c
    .get("db")
    .insert(orders)
    .values({
      storeId: user.storeId,
      customerId: user.id,
      fulfillmentType: input.fulfillmentType,
      deliveryAddressId: input.deliveryAddressId,
      subtotal: subtotal.toFixed(2),
      deliveryFee: deliveryFee.toFixed(2),
      totalAmount: (subtotal + deliveryFee).toFixed(2),
    })
    .returning();
  if (!order) return c.json({ error: "Order could not be created" }, 500);
  await c
    .get("db")
    .insert(orderItems)
    .values(
      rows.map(({ item, product }) => ({
        storeId: user.storeId,
        orderId: order.id,
        productId: product.id,
        quantity: item.quantity,
        unitPrice: product.sellingPrice,
      })),
    );
  await c
    .get("db")
    .insert(orderStatusHistory)
    .values({
      storeId: user.storeId,
      orderId: order.id,
      status: "pending",
      note: "Order placed by customer",
    });
  return c.json({ order }, 201);
});

const orderForUser = async (c: Context<AppEnv>, orderId: string) => {
  const user = c.get("user");
  const [order] = await c
    .get("db")
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.storeId, user.storeId),
        eq(orders.customerId, user.id),
      ),
    )
    .limit(1);
  return order;
};

app.get("/api/v1/customers/me/orders", async (c) => {
  const user = c.get("user");
  return c.json({
    orders: await c
      .get("db")
      .select()
      .from(orders)
      .where(
        and(eq(orders.storeId, user.storeId), eq(orders.customerId, user.id)),
      )
      .orderBy(desc(orders.createdAt)),
  });
});

app.get("/api/v1/orders/:id", async (c) => {
  const order = await orderForUser(c, c.req.param("id"));
  if (!order) return c.json({ error: "Order not found" }, 404);
  return c.json({
    order,
    items: await c
      .get("db")
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, order.id),
          eq(orderItems.storeId, order.storeId),
        ),
      ),
    history: await c
      .get("db")
      .select()
      .from(orderStatusHistory)
      .where(
        and(
          eq(orderStatusHistory.orderId, order.id),
          eq(orderStatusHistory.storeId, order.storeId),
        ),
      )
      .orderBy(orderStatusHistory.createdAt),
  });
});

app.post(
  "/api/v1/orders/:id/pay",
  zValidator("json", paymentSchema),
  async (c) => {
    const order = await orderForUser(c, c.req.param("id"));
    if (!order) return c.json({ error: "Order not found" }, 404);
    if (order.paymentStatus !== "unpaid")
      return c.json({ error: "Order is not payable" }, 409);
    const items = await c
      .get("db")
      .select()
      .from(orderItems)
      .where(
        and(
          eq(orderItems.orderId, order.id),
          eq(orderItems.storeId, order.storeId),
        ),
      );
    for (const item of items) {
      const result = await decrementStock(c.get("db"), {
        storeId: order.storeId,
        productId: item.productId,
        quantity: item.quantity,
        entityId: order.id,
      });
      if (!result.found)
        return c.json({ error: "Order product is no longer available" }, 409);
    }
    const input = c.req.valid("json");
    const [updated] = await c
      .get("db")
      .update(orders)
      .set({
        paymentStatus: "paid",
        status: "paid",
        paymentReference: input.paymentReference,
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, order.id), eq(orders.storeId, order.storeId)))
      .returning();
    await c
      .get("db")
      .insert(orderStatusHistory)
      .values({
        storeId: order.storeId,
        orderId: order.id,
        status: "paid",
        note: "Payment confirmed",
      });
    return c.json({ order: updated });
  },
);

app.get(
  "/api/v1/orders",
  requireStaff,
  requireRole("owner", "store_admin", "fulfillment"),
  async (c) => {
    const status = c.req.query("status") as
      | import("@urp/shared-types").OrderStatus
      | undefined;
    const conditions = [eq(orders.storeId, c.get("user").storeId)];
    if (status) conditions.push(eq(orders.status, status));
    return c.json({
      orders: await c
        .get("db")
        .select()
        .from(orders)
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt)),
    });
  },
);

app.patch(
  "/api/v1/orders/:id/status",
  requireStaff,
  requireRole("owner", "store_admin", "fulfillment"),
  zValidator("json", orderStatusUpdateSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [order] = await c
      .get("db")
      .select()
      .from(orders)
      .where(
        and(eq(orders.id, c.req.param("id")), eq(orders.storeId, user.storeId)),
      )
      .limit(1);
    if (!order) return c.json({ error: "Order not found" }, 404);
    if (!orderTransitions[order.status].includes(input.status))
      return c.json(
        { error: `Invalid transition from ${order.status} to ${input.status}` },
        409,
      );
    const [updated] = await c
      .get("db")
      .update(orders)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(orders.id, order.id))
      .returning();
    await c
      .get("db")
      .insert(orderStatusHistory)
      .values({
        storeId: user.storeId,
        orderId: order.id,
        status: input.status,
        changedByUserId: user.id,
        note: input.note,
      });
    return c.json({ order: updated });
  },
);

app.post(
  "/api/v1/billing/webhook",
  zValidator("json", mpesaCallbackSchema),
  async (c) => {
    const callback = c.req.valid("json").Body.stkCallback;
    const db = createDb(c.env.DATABASE_URL);
    const [attempt] = await db.select().from(invoicePaymentAttempts).where(eq(invoicePaymentAttempts.providerReference, callback.CheckoutRequestID)).limit(1);
    if (!attempt) return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
    if (attempt.status !== "initiated") return c.json({ ResultCode: 0, ResultDesc: "Already processed" });
    if (callback.ResultCode === 0) await completeInvoicePayment(db, attempt.invoiceId, callback.CheckoutRequestID, callback);
    else await db.update(invoicePaymentAttempts).set({ status: "failed", rawCallbackPayload: callback }).where(eq(invoicePaymentAttempts.id, attempt.id));
    return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
  },
);

app.post(
  "/api/v1/payments/mpesa/callback",
  zValidator("json", mpesaCallbackSchema),
  async (c) => {
    const callback = c.req.valid("json").Body.stkCallback;
    const db = createDb(c.env.DATABASE_URL);
    const [invoiceAttempt] = await db
      .select()
      .from(invoicePaymentAttempts)
      .where(eq(invoicePaymentAttempts.providerReference, callback.CheckoutRequestID))
      .limit(1);
    if (invoiceAttempt) {
      if (invoiceAttempt.status !== "initiated") return c.json({ ResultCode: 0, ResultDesc: "Already processed" });
      if (callback.ResultCode === 0) {
        await completeInvoicePayment(db, invoiceAttempt.invoiceId, callback.CheckoutRequestID, callback);
      } else {
        await db.update(invoicePaymentAttempts).set({ status: "failed", rawCallbackPayload: callback }).where(eq(invoicePaymentAttempts.id, invoiceAttempt.id));
      }
      return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
    const [transaction] = await db
      .select()
      .from(paymentTransactions)
      .where(
        eq(paymentTransactions.providerReference, callback.CheckoutRequestID),
      )
      .limit(1);
    if (!transaction) return c.json({ ResultCode: 0, ResultDesc: "Accepted" });
    if (
      transaction.status === "confirmed" ||
      transaction.status === "failed" ||
      transaction.status === "cancelled"
    )
      return c.json({ ResultCode: 0, ResultDesc: "Already processed" });
    const succeeded = callback.ResultCode === 0;
    const [updated] = await db
      .update(paymentTransactions)
      .set({
        status: succeeded ? "confirmed" : "failed",
        rawCallbackPayload: callback,
        updatedAt: new Date(),
      })
      .where(eq(paymentTransactions.id, transaction.id))
      .returning();
    if (succeeded && transaction.orderId) {
      const [order] = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, transaction.orderId),
            eq(orders.storeId, transaction.storeId),
          ),
        )
        .limit(1);
      if (order && order.paymentStatus === "unpaid") {
        const items = await db
          .select()
          .from(orderItems)
          .where(
            and(
              eq(orderItems.orderId, order.id),
              eq(orderItems.storeId, order.storeId),
            ),
          );
        for (const item of items)
          await decrementStock(db, {
            storeId: order.storeId,
            productId: item.productId,
            quantity: item.quantity,
            entityId: order.id,
          });
        await db
          .update(orders)
          .set({
            paymentStatus: "paid",
            status: "paid",
            paymentReference: callback.CheckoutRequestID,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
        await db
          .insert(orderStatusHistory)
          .values({
            storeId: order.storeId,
            orderId: order.id,
            status: "paid",
            note: "M-Pesa payment confirmed",
          });
      }
    }
    return c.json({
      ResultCode: 0,
      ResultDesc: "Accepted",
      transaction: updated,
    });
  },
);

app.use("/api/v1/*", requireAuth);
app.use("/api/v1/*", requireStaff);
app.use("/api/v1/*", async (c, next) => {
  c.set("db", createDb(c.env.DATABASE_URL));
  await next();
});
app.use("/api/v1/*", requireActiveStore);

app.get("/api/v1/billing/invoices", requireRole("owner"), async (c) => {
  const rows = await c
    .get("db")
    .select()
    .from(invoices)
    .where(eq(invoices.storeId, c.get("user").storeId))
    .orderBy(desc(invoices.createdAt));
  return c.json({ invoices: rows });
});

app.post(
  "/api/v1/billing/invoices/mpesa",
  requireRole("owner"),
  zValidator("json", invoiceMpesaSchema),
  async (c) => {
    const input = c.req.valid("json");
    const db = c.get("db");
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, input.invoiceId), eq(invoices.storeId, c.get("user").storeId)))
      .limit(1);
    if (!invoice || invoice.status === "paid" || invoice.status === "cancelled") return c.json({ error: "Invoice is not payable" }, 409);
    const [config] = await db
      .select()
      .from(platformPaymentConfig)
      .where(and(eq(platformPaymentConfig.provider, "mpesa"), eq(platformPaymentConfig.isActive, true)))
      .limit(1);
    if (!config) return c.json({ error: "Platform M-Pesa is not configured" }, 409);
    const response = await initiateMpesa(
      await decryptMpesaConfig(config.credentialsEncrypted, c.env.PAYMENT_CREDENTIALS_KEY, config.environment),
      {
        amount: invoice.amount,
        customerPhone: input.customerPhone,
        callbackUrl: new URL("/api/v1/payments/mpesa/callback", c.req.url).toString(),
      },
    );
    const [attempt] = await db
      .insert(invoicePaymentAttempts)
      .values({ invoiceId: invoice.id, provider: "mpesa", providerReference: response.CheckoutRequestID, status: "initiated" })
      .returning({ id: invoicePaymentAttempts.id, providerReference: invoicePaymentAttempts.providerReference, status: invoicePaymentAttempts.status });
    return c.json({ attempt, customerMessage: response.CustomerMessage });
  },
);

app.get(
  "/api/v1/payment-configs",
  requireRole("owner", "store_admin"),
  async (c) => {
    const rows = await c
      .get("db")
      .select({
        provider: storePaymentConfigs.provider,
        isEnabled: storePaymentConfigs.isEnabled,
        environment: storePaymentConfigs.environment,
        credentialsEncrypted: storePaymentConfigs.credentialsEncrypted,
      })
      .from(storePaymentConfigs)
      .where(eq(storePaymentConfigs.storeId, c.get("user").storeId));
    return c.json({
      paymentConfigs: rows.map(
        ({ credentialsEncrypted: encrypted, ...config }) => ({
          ...config,
          ...maskConfiguredCredentials(encrypted),
        }),
      ),
    });
  },
);

app.get(
  "/api/v1/printer-profiles",
  requireRole("owner", "store_admin", "cashier", "supervisor"),
  async (c) => {
    return c.json({
      printerProfiles: await c
        .get("db")
        .select()
        .from(printerProfiles)
        .where(eq(printerProfiles.storeId, c.get("user").storeId))
        .orderBy(desc(printerProfiles.createdAt)),
    });
  },
);

app.post(
  "/api/v1/printer-profiles",
  requireRole("owner", "store_admin"),
  zValidator("json", printerProfileSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [profile] = await c
      .get("db")
      .insert(printerProfiles)
      .values({ storeId: user.storeId, ...input })
      .returning();
    if (!profile)
      return c.json({ error: "Printer profile could not be created" }, 500);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "printer_profile.created",
        entityType: "printer_profile",
        entityId: profile.id,
      });
    return c.json({ printerProfile: profile }, 201);
  },
);

app.patch(
  "/api/v1/printer-profiles/:id",
  requireRole("owner", "store_admin"),
  zValidator("json", printerProfileUpdateSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [profile] = await c
      .get("db")
      .update(printerProfiles)
      .set(input)
      .where(
        and(
          eq(printerProfiles.id, c.req.param("id")),
          eq(printerProfiles.storeId, user.storeId),
        ),
      )
      .returning();
    if (!profile) return c.json({ error: "Printer profile not found" }, 404);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "printer_profile.updated",
        entityType: "printer_profile",
        entityId: profile.id,
      });
    return c.json({ printerProfile: profile });
  },
);

app.delete(
  "/api/v1/printer-profiles/:id",
  requireRole("owner", "store_admin"),
  async (c) => {
    const user = c.get("user");
    const [profile] = await c
      .get("db")
      .delete(printerProfiles)
      .where(
        and(
          eq(printerProfiles.id, c.req.param("id")),
          eq(printerProfiles.storeId, user.storeId),
        ),
      )
      .returning({ id: printerProfiles.id });
    if (!profile) return c.json({ error: "Printer profile not found" }, 404);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "printer_profile.deleted",
        entityType: "printer_profile",
        entityId: profile.id,
      });
    return c.body(null, 204);
  },
);

app.put(
  "/api/v1/payment-configs/:provider",
  requireRole("owner", "store_admin"),
  zValidator("json", paymentConfigSchema.omit({ provider: true })),
  async (c) => {
    const user = c.get("user");
    const provider = c.req.param("provider") as "mpesa" | "bank" | "card";
    if (!["mpesa", "bank", "card"].includes(provider))
      return c.json({ error: "Unsupported payment provider" }, 400);
    const input = c.req.valid("json");
    const encrypted = await encryptCredentials(
      JSON.stringify(input.credentials),
      c.env.PAYMENT_CREDENTIALS_KEY,
    );
    const [config] = await c
      .get("db")
      .insert(storePaymentConfigs)
      .values({
        storeId: user.storeId,
        provider,
        isEnabled: input.isEnabled,
        environment: input.environment,
        credentialsEncrypted: encrypted,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [storePaymentConfigs.storeId, storePaymentConfigs.provider],
        set: {
          isEnabled: input.isEnabled,
          environment: input.environment,
          credentialsEncrypted: encrypted,
          updatedAt: new Date(),
        },
      })
      .returning({
        provider: storePaymentConfigs.provider,
        isEnabled: storePaymentConfigs.isEnabled,
        environment: storePaymentConfigs.environment,
      });
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "payment_config.updated",
        entityType: "store_payment_config",
        entityId: config?.provider ? undefined : undefined,
        metadata: {
          provider,
          isEnabled: input.isEnabled,
          environment: input.environment,
        },
      });
    return c.json({
      paymentConfig: config ? { ...config, configured: true } : null,
    });
  },
);

app.post(
  "/api/v1/payment-configs/mpesa/test",
  requireRole("owner", "store_admin"),
  async (c) => {
    const [config] = await c
      .get("db")
      .select()
      .from(storePaymentConfigs)
      .where(
        and(
          eq(storePaymentConfigs.storeId, c.get("user").storeId),
          eq(storePaymentConfigs.provider, "mpesa"),
        ),
      )
      .limit(1);
    if (!config) return c.json({ error: "M-Pesa is not configured" }, 404);
    try {
      await testMpesaConnection(
        await decryptMpesaConfig(
          config.credentialsEncrypted,
          c.env.PAYMENT_CREDENTIALS_KEY,
          config.environment,
        ),
      );
      return c.json({ ok: true });
    } catch {
      return c.json({ ok: false, error: "M-Pesa connection failed" }, 502);
    }
  },
);

app.post(
  "/api/v1/payments/mpesa/initiate",
  requireRole("cashier", "supervisor", "owner", "store_admin"),
  zValidator("json", paymentInitiateSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [config] = await c
      .get("db")
      .select()
      .from(storePaymentConfigs)
      .where(
        and(
          eq(storePaymentConfigs.storeId, user.storeId),
          eq(storePaymentConfigs.provider, "mpesa"),
          eq(storePaymentConfigs.isEnabled, true),
        ),
      )
      .limit(1);
    if (!config) return c.json({ error: "M-Pesa is not enabled" }, 409);
    const response = await initiateMpesa(
      await decryptMpesaConfig(
        config.credentialsEncrypted,
        c.env.PAYMENT_CREDENTIALS_KEY,
        config.environment,
      ),
      {
        amount: input.amount,
        customerPhone: input.customerPhone,
        callbackUrl: new URL(
          "/api/v1/payments/mpesa/callback",
          c.req.url,
        ).toString(),
      },
    );
    const [transaction] = await c
      .get("db")
      .insert(paymentTransactions)
      .values({
        storeId: user.storeId,
        saleId: input.saleId,
        orderId: input.orderId,
        provider: "mpesa",
        providerReference: response.CheckoutRequestID,
        status: "initiated",
        amount: input.amount,
      })
      .returning({
        id: paymentTransactions.id,
        providerReference: paymentTransactions.providerReference,
        status: paymentTransactions.status,
      });
    return c.json({ transaction, customerMessage: response.CustomerMessage });
  },
);

app.post(
  "/api/v1/payments/bank",
  requireRole("cashier", "supervisor", "owner", "store_admin"),
  zValidator("json", paymentTransactionTargetSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [transaction] = await c
      .get("db")
      .insert(paymentTransactions)
      .values({
        storeId: user.storeId,
        saleId: input.saleId,
        orderId: input.orderId,
        provider: "bank",
        status: "pending",
        amount: input.amount,
        rawCallbackPayload: { referenceNote: input.referenceNote },
      })
      .returning({
        id: paymentTransactions.id,
        status: paymentTransactions.status,
      });
    return c.json(
      {
        transaction,
        instructions: "Bank transfer pending manual confirmation.",
      },
      201,
    );
  },
);

app.get(
  "/api/v1/payments/bank/pending",
  requireRole("owner", "store_admin"),
  async (c) => {
    return c.json({
      transactions: await c
        .get("db")
        .select({
          id: paymentTransactions.id,
          saleId: paymentTransactions.saleId,
          orderId: paymentTransactions.orderId,
          amount: paymentTransactions.amount,
          status: paymentTransactions.status,
          createdAt: paymentTransactions.createdAt,
          rawCallbackPayload: paymentTransactions.rawCallbackPayload,
        })
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.storeId, c.get("user").storeId),
            eq(paymentTransactions.provider, "bank"),
            eq(paymentTransactions.status, "pending"),
          ),
        )
        .orderBy(desc(paymentTransactions.createdAt)),
    });
  },
);

app.post(
  "/api/v1/payments/bank/:id/confirm",
  requireRole("owner", "store_admin"),
  async (c) => {
    const user = c.get("user");
    const [transaction] = await c
      .get("db")
      .select()
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.id, c.req.param("id")),
          eq(paymentTransactions.storeId, user.storeId),
          eq(paymentTransactions.provider, "bank"),
          eq(paymentTransactions.status, "pending"),
        ),
      )
      .limit(1);
    if (!transaction)
      return c.json({ error: "Pending bank transaction not found" }, 404);
    const [updated] = await c
      .get("db")
      .update(paymentTransactions)
      .set({ status: "confirmed", updatedAt: new Date() })
      .where(eq(paymentTransactions.id, transaction.id))
      .returning();
    if (transaction.orderId) {
      const [order] = await c
        .get("db")
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.id, transaction.orderId),
            eq(orders.storeId, user.storeId),
          ),
        )
        .limit(1);
      if (order && order.paymentStatus === "unpaid") {
        const items = await c
          .get("db")
          .select()
          .from(orderItems)
          .where(
            and(
              eq(orderItems.orderId, order.id),
              eq(orderItems.storeId, order.storeId),
            ),
          );
        for (const item of items)
          await decrementStock(c.get("db"), {
            storeId: order.storeId,
            productId: item.productId,
            quantity: item.quantity,
            entityId: order.id,
          });
        await c
          .get("db")
          .update(orders)
          .set({
            paymentStatus: "paid",
            status: "paid",
            paymentReference: transaction.id,
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));
        await c
          .get("db")
          .insert(orderStatusHistory)
          .values({
            storeId: order.storeId,
            orderId: order.id,
            status: "paid",
            changedByUserId: user.id,
            note: "Bank transfer manually confirmed",
          });
      }
    }
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "payment.bank_confirmed",
        entityType: "payment_transaction",
        entityId: transaction.id,
      });
    return c.json({ transaction: updated });
  },
);

app.post(
  "/api/v1/payments/card/initiate",
  requireRole("cashier", "supervisor", "owner", "store_admin"),
  async (c) => {
    try {
      await initiateCard();
      return c.json({ error: "Card payment provider is not configured" }, 501);
    } catch (error) {
      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Card payment provider is not configured",
        },
        501,
      );
    }
  },
);

app.get("/api/v1/payments/:id/status", async (c) => {
  const [transaction] = await c
    .get("db")
    .select({
      id: paymentTransactions.id,
      provider: paymentTransactions.provider,
      status: paymentTransactions.status,
      amount: paymentTransactions.amount,
      providerReference: paymentTransactions.providerReference,
    })
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.id, c.req.param("id")),
        eq(paymentTransactions.storeId, c.get("user").storeId),
      ),
    )
    .limit(1);
  return transaction
    ? c.json({ transaction })
    : c.json({ error: "Payment transaction not found" }, 404);
});

app.get("/api/v1/stores/:storeId", requireStoreAccess, async (c) => {
  const [store] = await c
    .get("db")
    .select({
      id: stores.id,
      name: stores.name,
      slug: stores.slug,
      currency: stores.currency,
      taxRate: stores.taxRate,
      posEnabled: stores.posEnabled,
      storefrontEnabled: stores.storefrontEnabled,
      timezone: stores.timezone,
    })
    .from(stores)
    .where(eq(stores.id, c.req.param("storeId")))
    .limit(1);
  if (!store) return c.json({ error: "Store not found" }, 404);
  return c.json({ store });
});

app.get("/api/v1/stores/slug/:slug", async (c) => {
  const [store] = await createDb(c.env.DATABASE_URL)
    .select({
      id: stores.id,
      name: stores.name,
      slug: stores.slug,
      accentColor: stores.accentColor,
      logoUrl: stores.logoUrl,
      currency: stores.currency,
      storefrontEnabled: stores.storefrontEnabled,
    })
    .from(stores)
    .where(eq(stores.slug, c.req.param("slug")))
    .limit(1);
  if (!store) return c.json({ error: "Store not found" }, 404);
  return c.json({ store });
});

app.patch(
  "/api/v1/store-branding",
  requireRole("owner", "store_admin"),
  async (c) => {
    const user = c.get("user");
    const body = (await c.req.json()) as {
      accentColor?: string;
      logoUrl?: string | null;
    };
    if (
      body.accentColor !== undefined &&
      !/^#[0-9a-f]{6}$/i.test(body.accentColor)
    )
      return c.json({ error: "Accent must be a six-digit hex color" }, 400);
    const [store] = await c
      .get("db")
      .update(stores)
      .set({
        ...(body.accentColor === undefined
          ? {}
          : { accentColor: body.accentColor }),
        ...(body.logoUrl === undefined ? {} : { logoUrl: body.logoUrl }),
      })
      .where(eq(stores.id, user.storeId))
      .returning({ accentColor: stores.accentColor, logoUrl: stores.logoUrl });
    return store
      ? c.json({ store })
      : c.json({ error: "Store not found" }, 404);
  },
);

app.get("/api/v1/categories", async (c) => {
  const user = c.get("user");
  const rows = await c
    .get("db")
    .select()
    .from(categories)
    .where(eq(categories.storeId, user.storeId));
  return c.json({ categories: rows });
});

app.get("/api/v1/users", requireRole("owner", "store_admin"), async (c) => {
  const rows = await c
    .get("db")
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.storeId, c.get("user").storeId));
  return c.json({ users: rows });
});

app.post(
  "/api/v1/users",
  requireRole("owner", "store_admin"),
  zValidator("json", staffCreateSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    if (input.role === "owner" && user.role !== "owner")
      return c.json({ error: "Only an owner can create an owner" }, 403);
    const [created] = await c
      .get("db")
      .insert(users)
      .values({
        storeId: user.storeId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        role: input.role,
        pinHash: input.pin ? await hashPassword(input.pin) : null,
        passwordHash: input.password
          ? await hashPassword(input.password)
          : null,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      });
    if (!created)
      return c.json({ error: "Staff member could not be created" }, 500);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "user.created",
        entityType: "user",
        entityId: created.id,
      });
    return c.json({ user: created }, 201);
  },
);

app.patch(
  "/api/v1/users/:id",
  requireRole("owner", "store_admin"),
  zValidator("json", staffUpdateSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [target] = await c
      .get("db")
      .select()
      .from(users)
      .where(
        and(eq(users.id, c.req.param("id")), eq(users.storeId, user.storeId)),
      )
      .limit(1);
    if (!target) return c.json({ error: "Staff member not found" }, 404);
    if (target.role === "owner" && user.role !== "owner")
      return c.json({ error: "Only an owner can edit an owner" }, 403);
    if (input.role === "owner" && user.role !== "owner")
      return c.json({ error: "Only an owner can assign owner role" }, 403);
    const [updated] = await c
      .get("db")
      .update(users)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.role === undefined ? {} : { role: input.role }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.pin === undefined
          ? {}
          : { pinHash: await hashPassword(input.pin) }),
        ...(input.password === undefined
          ? {}
          : { passwordHash: await hashPassword(input.password) }),
      })
      .where(and(eq(users.id, target.id), eq(users.storeId, user.storeId)))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
      });
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "user.updated",
        entityType: "user",
        entityId: target.id,
      });
    return c.json({ user: updated });
  },
);

app.get(
  "/api/v1/promotions",
  requireRole("owner", "store_admin", "cashier", "supervisor"),
  async (c) => {
    const user = c.get("user");
    const rows = await c
      .get("db")
      .select()
      .from(promotions)
      .where(eq(promotions.storeId, user.storeId));
    const links = await c
      .get("db")
      .select()
      .from(promotionProducts)
      .where(eq(promotionProducts.storeId, user.storeId));
    return c.json({
      promotions: rows.map((promotion) => ({
        ...promotion,
        productIds: links
          .filter((link) => link.promotionId === promotion.id)
          .map((link) => link.productId),
      })),
    });
  },
);

app.post(
  "/api/v1/promotions",
  requireRole("owner", "store_admin"),
  zValidator("json", promotionSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    if (input.categoryId) {
      const [category] = await c
        .get("db")
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, input.categoryId),
            eq(categories.storeId, user.storeId),
          ),
        )
        .limit(1);
      if (!category) return c.json({ error: "Category not found" }, 400);
    }
    if (input.productIds.length) {
      const validProducts = await c
        .get("db")
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.storeId, user.storeId),
            sql`${products.id} IN (${sql.join(
              input.productIds.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          ),
        );
      if (validProducts.length !== input.productIds.length)
        return c.json(
          { error: "One or more promotion products are outside this store" },
          400,
        );
    }
    const [promotion] = await c
      .get("db")
      .insert(promotions)
      .values({
        storeId: user.storeId,
        name: input.name,
        type: input.type,
        value: input.value,
        appliesTo: input.appliesTo,
        categoryId: input.categoryId,
        startAt: new Date(input.startAt),
        endAt: new Date(input.endAt),
        isActive: input.isActive,
        buyQuantity: input.buyQuantity,
        getQuantity: input.getQuantity,
        getDiscountPercentage: input.getDiscountPercentage,
        bundleQuantity: input.bundleQuantity,
        bundleTotalPrice: input.bundleTotalPrice,
      })
      .returning();
    if (!promotion)
      return c.json({ error: "Promotion could not be created" }, 500);
    if (input.productIds.length)
      await c
        .get("db")
        .insert(promotionProducts)
        .values(
          input.productIds.map((productId) => ({
            storeId: user.storeId,
            promotionId: promotion.id,
            productId,
          })),
        );
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "promotion.created",
        entityType: "promotion",
        entityId: promotion.id,
      });
    return c.json({ promotion }, 201);
  },
);

app.patch(
  "/api/v1/promotions/:id",
  requireRole("owner", "store_admin"),
  zValidator("json", promotionUpdateSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [existing] = await c
      .get("db")
      .select()
      .from(promotions)
      .where(
        and(
          eq(promotions.id, c.req.param("id")),
          eq(promotions.storeId, user.storeId),
        ),
      )
      .limit(1);
    if (!existing) return c.json({ error: "Promotion not found" }, 404);
    const [updated] = await c
      .get("db")
      .update(promotions)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.type === undefined ? {} : { type: input.type }),
        ...(input.value === undefined ? {} : { value: input.value }),
        ...(input.appliesTo === undefined
          ? {}
          : { appliesTo: input.appliesTo }),
        ...(input.categoryId === undefined
          ? {}
          : { categoryId: input.categoryId }),
        ...(input.startAt === undefined
          ? {}
          : { startAt: new Date(input.startAt) }),
        ...(input.endAt === undefined ? {} : { endAt: new Date(input.endAt) }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        ...(input.buyQuantity === undefined
          ? {}
          : { buyQuantity: input.buyQuantity }),
        ...(input.getQuantity === undefined
          ? {}
          : { getQuantity: input.getQuantity }),
        ...(input.getDiscountPercentage === undefined
          ? {}
          : { getDiscountPercentage: input.getDiscountPercentage }),
        ...(input.bundleQuantity === undefined
          ? {}
          : { bundleQuantity: input.bundleQuantity }),
        ...(input.bundleTotalPrice === undefined
          ? {}
          : { bundleTotalPrice: input.bundleTotalPrice }),
      })
      .where(
        and(
          eq(promotions.id, existing.id),
          eq(promotions.storeId, user.storeId),
        ),
      )
      .returning();
    if (input.productIds) {
      await c
        .get("db")
        .delete(promotionProducts)
        .where(
          and(
            eq(promotionProducts.promotionId, existing.id),
            eq(promotionProducts.storeId, user.storeId),
          ),
        );
      if (input.productIds.length)
        await c
          .get("db")
          .insert(promotionProducts)
          .values(
            input.productIds.map((productId) => ({
              storeId: user.storeId,
              promotionId: existing.id,
              productId,
            })),
          );
    }
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "promotion.updated",
        entityType: "promotion",
        entityId: existing.id,
      });
    return c.json({ promotion: updated });
  },
);

app.delete(
  "/api/v1/promotions/:id",
  requireRole("owner", "store_admin"),
  async (c) => {
    const user = c.get("user");
    const [deleted] = await c
      .get("db")
      .delete(promotions)
      .where(
        and(
          eq(promotions.id, c.req.param("id")),
          eq(promotions.storeId, user.storeId),
        ),
      )
      .returning({ id: promotions.id });
    if (!deleted) return c.json({ error: "Promotion not found" }, 404);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "promotion.deleted",
        entityType: "promotion",
        entityId: deleted.id,
      });
    return c.body(null, 204);
  },
);

app.get(
  "/api/v1/suppliers",
  requireRole("owner", "store_admin", "inventory_clerk"),
  async (c) => {
    return c.json({
      suppliers: await c
        .get("db")
        .select()
        .from(suppliers)
        .where(eq(suppliers.storeId, c.get("user").storeId)),
    });
  },
);

app.post(
  "/api/v1/suppliers",
  requireRole("owner", "store_admin", "inventory_clerk"),
  zValidator("json", supplierSchema),
  async (c) => {
    const user = c.get("user");
    const [supplier] = await c
      .get("db")
      .insert(suppliers)
      .values({ storeId: user.storeId, ...c.req.valid("json") })
      .returning();
    if (!supplier)
      return c.json({ error: "Supplier could not be created" }, 500);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "supplier.created",
        entityType: "supplier",
        entityId: supplier.id,
      });
    return c.json({ supplier }, 201);
  },
);

app.patch(
  "/api/v1/suppliers/:id",
  requireRole("owner", "store_admin", "inventory_clerk"),
  zValidator("json", supplierSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const [supplier] = await c
      .get("db")
      .update(suppliers)
      .set(c.req.valid("json"))
      .where(
        and(
          eq(suppliers.id, c.req.param("id")),
          eq(suppliers.storeId, user.storeId),
        ),
      )
      .returning();
    if (!supplier) return c.json({ error: "Supplier not found" }, 404);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "supplier.updated",
        entityType: "supplier",
        entityId: supplier.id,
      });
    return c.json({ supplier });
  },
);

app.get(
  "/api/v1/purchase-orders",
  requireRole("owner", "store_admin", "inventory_clerk"),
  async (c) => {
    const user = c.get("user");
    const rows = await c
      .get("db")
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.storeId, user.storeId))
      .orderBy(desc(purchaseOrders.createdAt));
    const items = await c
      .get("db")
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.storeId, user.storeId));
    return c.json({
      purchaseOrders: rows.map((purchaseOrder) => ({
        ...purchaseOrder,
        items: items.filter(
          (item) => item.purchaseOrderId === purchaseOrder.id,
        ),
      })),
    });
  },
);

app.post(
  "/api/v1/purchase-orders",
  requireRole("owner", "store_admin", "inventory_clerk"),
  zValidator("json", purchaseOrderSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [supplier] = await c
      .get("db")
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(
        and(
          eq(suppliers.id, input.supplierId),
          eq(suppliers.storeId, user.storeId),
        ),
      )
      .limit(1);
    if (!supplier) return c.json({ error: "Supplier not found" }, 400);
    const validProducts = await c
      .get("db")
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.storeId, user.storeId),
          sql`${products.id} IN (${sql.join(
            input.items.map((item) => sql`${item.productId}`),
            sql`, `,
          )})`,
        ),
      );
    if (validProducts.length !== input.items.length)
      return c.json(
        { error: "One or more products are outside this store" },
        400,
      );
    const [purchaseOrder] = await c
      .get("db")
      .insert(purchaseOrders)
      .values({
        storeId: user.storeId,
        supplierId: input.supplierId,
        createdByUserId: user.id,
      })
      .returning();
    if (!purchaseOrder)
      return c.json({ error: "Purchase order could not be created" }, 500);
    await c
      .get("db")
      .insert(purchaseOrderItems)
      .values(
        input.items.map((item) => ({
          storeId: user.storeId,
          purchaseOrderId: purchaseOrder.id,
          productId: item.productId,
          quantityOrdered: item.quantityOrdered,
          unitCost: item.unitCost,
        })),
      );
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "purchase_order.created",
        entityType: "purchase_order",
        entityId: purchaseOrder.id,
      });
    return c.json({ purchaseOrder }, 201);
  },
);

app.patch(
  "/api/v1/purchase-orders/:id",
  requireRole("owner", "store_admin", "inventory_clerk"),
  zValidator("json", purchaseOrderUpdateSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [purchaseOrder] = await c
      .get("db")
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, c.req.param("id")),
          eq(purchaseOrders.storeId, user.storeId),
        ),
      )
      .limit(1);
    if (!purchaseOrder)
      return c.json({ error: "Purchase order not found" }, 404);
    if (purchaseOrder.status !== "draft")
      return c.json({ error: "Only draft purchase orders can be edited" }, 409);
    const [updated] = await c
      .get("db")
      .update(purchaseOrders)
      .set({ status: input.status ?? purchaseOrder.status })
      .where(eq(purchaseOrders.id, purchaseOrder.id))
      .returning();
    if (input.items) {
      await c
        .get("db")
        .delete(purchaseOrderItems)
        .where(
          and(
            eq(purchaseOrderItems.purchaseOrderId, purchaseOrder.id),
            eq(purchaseOrderItems.storeId, user.storeId),
          ),
        );
      await c
        .get("db")
        .insert(purchaseOrderItems)
        .values(
          input.items.map((item) => ({
            storeId: user.storeId,
            purchaseOrderId: purchaseOrder.id,
            productId: item.productId,
            quantityOrdered: item.quantityOrdered,
            unitCost: item.unitCost,
          })),
        );
    }
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "purchase_order.updated",
        entityType: "purchase_order",
        entityId: purchaseOrder.id,
      });
    return c.json({ purchaseOrder: updated });
  },
);

app.post(
  "/api/v1/purchase-orders/:id/receive",
  requireRole("owner", "store_admin", "inventory_clerk"),
  zValidator("json", purchaseOrderReceiveSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [purchaseOrder] = await c
      .get("db")
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, c.req.param("id")),
          eq(purchaseOrders.storeId, user.storeId),
        ),
      )
      .limit(1);
    if (!purchaseOrder || purchaseOrder.status === "cancelled")
      return c.json({ error: "Receivable purchase order not found" }, 404);
    const orderItems = await c
      .get("db")
      .select()
      .from(purchaseOrderItems)
      .where(
        and(
          eq(purchaseOrderItems.purchaseOrderId, purchaseOrder.id),
          eq(purchaseOrderItems.storeId, user.storeId),
        ),
      );
    for (const received of input.items) {
      const item = orderItems.find(
        (candidate) => candidate.id === received.itemId,
      );
      if (
        !item ||
        Number(item.quantityReceived) + Number(received.quantityReceived) >
          Number(item.quantityOrdered)
      )
        return c.json(
          { error: `Invalid received quantity for ${received.itemId}` },
          400,
        );
      await c
        .get("db")
        .update(purchaseOrderItems)
        .set({
          quantityReceived: sql`${purchaseOrderItems.quantityReceived} + ${received.quantityReceived}`,
        })
        .where(eq(purchaseOrderItems.id, item.id));
      await c
        .get("db")
        .update(products)
        .set({
          stockQuantity: sql`${products.stockQuantity} + ${received.quantityReceived}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, item.productId),
            eq(products.storeId, user.storeId),
          ),
        );
    }
    const refreshedItems = await c
      .get("db")
      .select()
      .from(purchaseOrderItems)
      .where(eq(purchaseOrderItems.purchaseOrderId, purchaseOrder.id));
    const allReceived = refreshedItems.every(
      (item) => Number(item.quantityReceived) >= Number(item.quantityOrdered),
    );
    const anyReceived = refreshedItems.some(
      (item) => Number(item.quantityReceived) > 0,
    );
    const [updated] = await c
      .get("db")
      .update(purchaseOrders)
      .set({
        status: allReceived ? "received" : "partially_received",
        receivedAt: allReceived ? new Date() : null,
      })
      .where(eq(purchaseOrders.id, purchaseOrder.id))
      .returning();
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "purchase_order.received",
        entityType: "purchase_order",
        entityId: purchaseOrder.id,
        metadata: { received: input.items, anyReceived },
      });
    return c.json({ purchaseOrder: updated });
  },
);

app.get(
  "/api/v1/customer-accounts",
  requireRole("owner", "store_admin", "cashier"),
  async (c) => {
    const user = c.get("user");
    return c.json({
      customerAccounts: await c
        .get("db")
        .select()
        .from(customerAccounts)
        .where(eq(customerAccounts.storeId, user.storeId))
        .orderBy(desc(customerAccounts.createdAt)),
    });
  },
);

app.post(
  "/api/v1/customer-accounts",
  requireRole("owner", "store_admin"),
  zValidator("json", customerAccountSchema),
  async (c) => {
    const user = c.get("user");
    const [account] = await c
      .get("db")
      .insert(customerAccounts)
      .values({ storeId: user.storeId, ...c.req.valid("json") })
      .returning();
    if (!account)
      return c.json({ error: "Customer account could not be created" }, 500);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "customer_account.created",
        entityType: "customer_account",
        entityId: account.id,
      });
    return c.json({ customerAccount: account }, 201);
  },
);

app.patch(
  "/api/v1/customer-accounts/:id",
  requireRole("owner", "store_admin"),
  zValidator("json", customerAccountUpdateSchema),
  async (c) => {
    const user = c.get("user");
    const [account] = await c
      .get("db")
      .update(customerAccounts)
      .set(c.req.valid("json"))
      .where(
        and(
          eq(customerAccounts.id, c.req.param("id")),
          eq(customerAccounts.storeId, user.storeId),
        ),
      )
      .returning();
    if (!account) return c.json({ error: "Customer account not found" }, 404);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "customer_account.updated",
        entityType: "customer_account",
        entityId: account.id,
      });
    return c.json({ customerAccount: account });
  },
);

app.get(
  "/api/v1/customer-accounts/:id/transactions",
  requireRole("owner", "store_admin", "cashier"),
  async (c) => {
    const user = c.get("user");
    const [account] = await c
      .get("db")
      .select({ id: customerAccounts.id })
      .from(customerAccounts)
      .where(
        and(
          eq(customerAccounts.id, c.req.param("id")),
          eq(customerAccounts.storeId, user.storeId),
        ),
      )
      .limit(1);
    if (!account) return c.json({ error: "Customer account not found" }, 404);
    return c.json({
      transactions: await c
        .get("db")
        .select()
        .from(customerAccountTransactions)
        .where(
          and(
            eq(customerAccountTransactions.customerAccountId, account.id),
            eq(customerAccountTransactions.storeId, user.storeId),
          ),
        )
        .orderBy(desc(customerAccountTransactions.createdAt)),
    });
  },
);

app.post(
  "/api/v1/customer-accounts/:id/payments",
  requireRole("owner", "store_admin", "cashier"),
  zValidator("json", customerAccountPaymentSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [account] = await c
      .get("db")
      .select()
      .from(customerAccounts)
      .where(
        and(
          eq(customerAccounts.id, c.req.param("id")),
          eq(customerAccounts.storeId, user.storeId),
        ),
      )
      .limit(1);
    if (!account) return c.json({ error: "Customer account not found" }, 404);
    if (Number(input.amount) > Number(account.balance))
      return c.json({ error: "Payment exceeds account balance" }, 400);
    const [updated] = await c
      .get("db")
      .update(customerAccounts)
      .set({ balance: sql`${customerAccounts.balance} - ${input.amount}` })
      .where(
        and(
          eq(customerAccounts.id, account.id),
          eq(customerAccounts.storeId, user.storeId),
        ),
      )
      .returning();
    await c
      .get("db")
      .insert(customerAccountTransactions)
      .values({
        storeId: user.storeId,
        customerAccountId: account.id,
        type: "payment",
        amount: input.amount,
        note: input.note,
      });
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "customer_account.payment",
        entityType: "customer_account",
        entityId: account.id,
        metadata: { amount: input.amount },
      });
    return c.json({ customerAccount: updated });
  },
);

app.post(
  "/api/v1/categories",
  requireRole("owner", "store_admin"),
  zValidator("json", categoryInputSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [category] = await c
      .get("db")
      .insert(categories)
      .values({
        storeId: user.storeId,
        name: input.name,
        parentCategoryId: input.parentCategoryId,
      })
      .returning();
    if (!category)
      return c.json({ error: "Category could not be created" }, 500);
    await c.get("db").insert(auditLogs).values({
      storeId: user.storeId,
      userId: user.id,
      action: "category.created",
      entityType: "category",
      entityId: category.id,
    });
    return c.json({ category }, 201);
  },
);

app.get("/api/v1/products", async (c) => {
  const rows = await c
    .get("db")
    .select()
    .from(products)
    .where(eq(products.storeId, c.get("user").storeId));
  return c.json({ products: rows });
});

app.post(
  "/api/v1/products",
  requireRole("owner", "store_admin"),
  zValidator("json", productInputSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    if (input.categoryId) {
      const [category] = await c
        .get("db")
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, input.categoryId),
            eq(categories.storeId, user.storeId),
          ),
        )
        .limit(1);
      if (!category) return c.json({ error: "Category not found" }, 400);
    }
    const [product] = await c
      .get("db")
      .insert(products)
      .values({ storeId: user.storeId, ...input })
      .returning();
    if (!product) return c.json({ error: "Product could not be created" }, 500);
    await c.get("db").insert(auditLogs).values({
      storeId: user.storeId,
      userId: user.id,
      action: "product.created",
      entityType: "product",
      entityId: product.id,
    });
    return c.json({ product }, 201);
  },
);

app.patch(
  "/api/v1/products/:id",
  requireRole("owner", "store_admin"),
  zValidator("json", productInputSchema.partial()),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    if (input.categoryId) {
      const [category] = await c
        .get("db")
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, input.categoryId),
            eq(categories.storeId, user.storeId),
          ),
        )
        .limit(1);
      if (!category) return c.json({ error: "Category not found" }, 400);
    }
    const [product] = await c
      .get("db")
      .update(products)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(products.id, c.req.param("id")),
          eq(products.storeId, user.storeId),
        ),
      )
      .returning();
    if (!product) return c.json({ error: "Product not found" }, 404);
    await c.get("db").insert(auditLogs).values({
      storeId: user.storeId,
      userId: user.id,
      action: "product.updated",
      entityType: "product",
      entityId: product.id,
    });
    return c.json({ product });
  },
);

app.delete(
  "/api/v1/products/:id",
  requireRole("owner", "store_admin"),
  async (c) => {
    const user = c.get("user");
    const [product] = await c
      .get("db")
      .delete(products)
      .where(
        and(
          eq(products.id, c.req.param("id")),
          eq(products.storeId, user.storeId),
        ),
      )
      .returning({ id: products.id });
    if (!product) return c.json({ error: "Product not found" }, 404);
    await c.get("db").insert(auditLogs).values({
      storeId: user.storeId,
      userId: user.id,
      action: "product.deleted",
      entityType: "product",
      entityId: product.id,
    });
    return c.body(null, 204);
  },
);

app.post(
  "/api/v1/shifts/open",
  requireRole("cashier", "supervisor"),
  zValidator("json", openShiftSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [openShift] = await c
      .get("db")
      .select({ id: shifts.id })
      .from(shifts)
      .where(
        and(
          eq(shifts.storeId, user.storeId),
          eq(shifts.cashierId, user.id),
          sql`${shifts.closedAt} IS NULL`,
        ),
      )
      .limit(1);
    if (openShift) return c.json({ error: "A shift is already open" }, 409);

    const [shift] = await c
      .get("db")
      .insert(shifts)
      .values({
        storeId: user.storeId,
        cashierId: user.id,
        openingFloat: input.openingFloat,
      })
      .returning();
    if (!shift) return c.json({ error: "Shift could not be opened" }, 500);
    await c.get("db").insert(auditLogs).values({
      storeId: user.storeId,
      userId: user.id,
      action: "shift.opened",
      entityType: "shift",
      entityId: shift.id,
    });
    return c.json({ shift }, 201);
  },
);

app.post(
  "/api/v1/shifts/:id/close",
  requireRole("cashier", "supervisor"),
  zValidator("json", closeShiftSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [shift] = await c
      .get("db")
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.id, c.req.param("id")),
          eq(shifts.storeId, user.storeId),
          eq(shifts.cashierId, user.id),
          sql`${shifts.closedAt} IS NULL`,
        ),
      )
      .limit(1);
    if (!shift) return c.json({ error: "Open shift not found" }, 404);

    const [closedShift] = await c
      .get("db")
      .update(shifts)
      .set({
        closingAmountActual: input.closingAmountActual,
        closingAmountExpected: sql`(${shift.openingFloat}::numeric + COALESCE((SELECT SUM(total_amount) FROM sales WHERE shift_id = ${shift.id} AND status = 'completed'), 0))`,
        discrepancy: sql`${input.closingAmountActual}::numeric - (${shift.openingFloat}::numeric + COALESCE((SELECT SUM(total_amount) FROM sales WHERE shift_id = ${shift.id} AND status = 'completed'), 0))`,
        status: "closed",
        closedAt: new Date(),
      })
      .where(eq(shifts.id, shift.id))
      .returning();
    if (!closedShift)
      return c.json({ error: "Shift could not be closed" }, 500);
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: "shift.closed",
        entityType: "shift",
        entityId: shift.id,
        metadata: { closingAmountActual: input.closingAmountActual },
      });
    return c.json({ shift: closedShift });
  },
);

app.get(
  "/api/v1/shifts",
  requireRole("owner", "store_admin", "supervisor"),
  zValidator("query", shiftListQuerySchema),
  async (c) => {
    const user = c.get("user");
    const { status } = c.req.valid("query");
    const conditions = [eq(shifts.storeId, user.storeId)];
    if (status) conditions.push(eq(shifts.status, status));
    const rows = await c
      .get("db")
      .select({
        id: shifts.id,
        cashierId: shifts.cashierId,
        openingFloat: shifts.openingFloat,
        closingAmountExpected: shifts.closingAmountExpected,
        closingAmountActual: shifts.closingAmountActual,
        discrepancy: shifts.discrepancy,
        status: shifts.status,
        openedAt: shifts.openedAt,
        closedAt: shifts.closedAt,
      })
      .from(shifts)
      .where(and(...conditions))
      .orderBy(desc(shifts.openedAt));
    return c.json({ shifts: rows });
  },
);

app.post(
  "/api/v1/sales/batch",
  requireRole("cashier", "supervisor"),
  zValidator("json", salesBatchSchema),
  async (c) => {
    const user = c.get("user");
    const { sales: saleBatch } = c.req.valid("json");
    const results = [];

    for (const input of saleBatch) {
      const [existing] = await c
        .get("db")
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.storeId, user.storeId),
            eq(sales.deviceSaleId, input.deviceSaleId),
          ),
        )
        .limit(1);
      if (existing) {
        results.push({
          deviceSaleId: input.deviceSaleId,
          sale: existing,
          status: "already_synced",
        });
        continue;
      }

      if (input.shiftId) {
        const [shift] = await c
          .get("db")
          .select({ id: shifts.id })
          .from(shifts)
          .where(
            and(
              eq(shifts.id, input.shiftId),
              eq(shifts.storeId, user.storeId),
              eq(shifts.cashierId, user.id),
              sql`${shifts.closedAt} IS NULL`,
            ),
          )
          .limit(1);
        if (!shift)
          return c.json(
            { error: `Open shift not found for ${input.deviceSaleId}` },
            400,
          );
      }

      const productRows = [];
      for (const item of input.items) {
        const [product] = await c
          .get("db")
          .select()
          .from(products)
          .where(
            and(
              eq(products.id, item.productId),
              eq(products.storeId, user.storeId),
            ),
          )
          .limit(1);
        if (!product)
          return c.json({ error: `Product not found: ${item.productId}` }, 400);
        if (
          product.unitOfMeasure === "piece" &&
          !Number.isInteger(Number(item.quantity))
        )
          return c.json(
            { error: `Fractional quantity is not valid for ${product.name}` },
            400,
          );
        productRows.push({ item, product });
      }
      const pricedSale = await priceLines(
        c.get("db"),
        user.storeId,
        productRows.map(({ item, product }) => ({
          productId: product.id,
          categoryId: product.categoryId,
          quantity: item.quantity,
          unitPrice: product.sellingPrice,
        })),
      );
      let creditAccount: typeof customerAccounts.$inferSelect | undefined;
      if (input.paymentMethod === "credit" && input.customerAccountId) {
        [creditAccount] = await c
          .get("db")
          .select()
          .from(customerAccounts)
          .where(
            and(
              eq(customerAccounts.id, input.customerAccountId),
              eq(customerAccounts.storeId, user.storeId),
            ),
          )
          .limit(1);
        if (!creditAccount)
          return c.json({ error: "Customer account not found" }, 400);
        if (
          user.role !== "owner" &&
          user.role !== "store_admin" &&
          Number(creditAccount.balance) + Number(pricedSale.total) >
            Number(creditAccount.creditLimit)
        ) {
          const [approval] = await c
            .get("db")
            .insert(pendingApprovals)
            .values({
              storeId: user.storeId,
              requestedByUserId: user.id,
              actionType: "credit_limit_override",
              targetSaleId: null,
              reason: "Credit limit exceeded; cashier approval required",
              thresholdExceededAmount: (
                Number(creditAccount.balance) +
                Number(pricedSale.total) -
                Number(creditAccount.creditLimit)
              ).toFixed(2),
              metadata: {
                sale: input,
                totalAmount: pricedSale.total,
                customerAccountId: creditAccount.id,
                resultingBalance: (
                  Number(creditAccount.balance) + Number(pricedSale.total)
                ).toFixed(2),
              },
            })
            .returning({ id: pendingApprovals.id });
          if (!approval)
            return c.json({ error: "Approval could not be created" }, 500);
          results.push({
            deviceSaleId: input.deviceSaleId,
            status: "requires_approval",
            approvalId: approval.id,
          });
          continue;
        }
      }

      const sale = await completeSale(c.get("db"), {
        storeId: user.storeId,
        userId: user.id,
        sale: {
          deviceSaleId: input.deviceSaleId,
          shiftId: input.shiftId ?? null,
          totalAmount: pricedSale.total,
          paymentMethod: input.paymentMethod,
        },
        productRows: productRows.map(({ item, product }, index) => ({
          item: {
            ...item,
            unitPrice: product.sellingPrice,
            discountAmount: pricedSale.lines[index]?.discountAmount ?? "0",
          },
          product,
        })),
        customerAccountId: creditAccount?.id ?? null,
      });
      if (!sale) return c.json({ error: "Sale could not be recorded" }, 500);
      await c
        .get("db")
        .insert(auditLogs)
        .values({
          storeId: user.storeId,
          userId: user.id,
          action: "sale.created",
          entityType: "sale",
          entityId: sale.id,
          metadata: { deviceSaleId: sale.deviceSaleId },
        });
      results.push({
        deviceSaleId: input.deviceSaleId,
        sale,
        status: "synced",
      });
    }

    return c.json({ results }, 201);
  },
);

app.get(
  "/api/v1/shifts/:id",
  requireRole("cashier", "supervisor", "store_admin", "owner"),
  async (c) => {
    const user = c.get("user");
    const [shift] = await c
      .get("db")
      .select()
      .from(shifts)
      .where(
        and(eq(shifts.id, c.req.param("id")), eq(shifts.storeId, user.storeId)),
      )
      .limit(1);
    if (!shift) return c.json({ error: "Shift not found" }, 404);
    const shiftSales = await c
      .get("db")
      .select({
        id: sales.id,
        totalAmount: sales.totalAmount,
        paymentMethod: sales.paymentMethod,
        status: sales.status,
      })
      .from(sales)
      .where(and(eq(sales.shiftId, shift.id), eq(sales.storeId, user.storeId)));
    return c.json({
      shift,
      summary: {
        transactionCount: shiftSales.length,
        totalAmount: shiftSales
          .filter((sale) => sale.status === "completed")
          .reduce((total, sale) => total + Number(sale.totalAmount), 0)
          .toFixed(2),
      },
    });
  },
);

const saleDetail = async (c: Context<AppEnv>) => {
  const user = c.get("user");
  const saleId = c.req.param("id");
  if (!saleId) return c.json({ error: "Sale ID is required" }, 400);
  const [sale] = await c
    .get("db")
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.storeId, user.storeId)))
    .limit(1);
  if (!sale) return c.json({ error: "Sale not found" }, 404);
  const items = await c
    .get("db")
    .select()
    .from(saleItems)
    .where(
      and(eq(saleItems.saleId, sale.id), eq(saleItems.storeId, user.storeId)),
    );
  return c.json({ sale, items });
};

app.get(
  "/api/v1/sales/:id",
  requireRole("cashier", "supervisor", "store_admin", "owner"),
  saleDetail,
);

const requestSaleAction =
  (actionType: "void" | "refund") => async (c: Context<AppEnv>) => {
    const user = c.get("user");
    const input = (await c.req.json().catch(() => ({}))) as { deviceActionId?: string };
    if (!input.deviceActionId) return c.json({ error: "deviceActionId is required" }, 400);
    const [processed] = await c
      .get("db")
      .select({ id: pendingApprovals.id, status: pendingApprovals.status })
      .from(pendingApprovals)
      .where(and(eq(pendingApprovals.storeId, user.storeId), eq(pendingApprovals.deviceActionId, input.deviceActionId)))
      .limit(1);
    if (processed) return c.json({ status: "already_processed", approvalId: processed.id, approvalStatus: processed.status });
    const saleId = c.req.param("id");
    if (!saleId) return c.json({ error: "Sale ID is required" }, 400);
    const [sale] = await c
      .get("db")
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.storeId, user.storeId)))
      .limit(1);
    if (!sale) return c.json({ error: "Sale not found" }, 404);
    if (sale.status !== "completed")
      return c.json({ error: "Only completed sales can be changed" }, 409);

    if (user.role === "cashier") {
      const [approval] = await c
        .get("db")
        .insert(pendingApprovals)
        .values({
          storeId: user.storeId,
          requestedByUserId: user.id,
          actionType,
          targetSaleId: sale.id,
          reason: `${actionType} requested by cashier`,
          deviceActionId: input.deviceActionId,
        })
        .returning({ id: pendingApprovals.id });
      if (!approval)
        return c.json({ error: "Approval could not be created" }, 500);
      return c.json({ requires_approval: true, approval_id: approval.id }, 202);
    }

    const [updated] = await c
      .get("db")
      .update(sales)
      .set({ status: actionType === "void" ? "voided" : "refunded" })
      .where(and(eq(sales.id, sale.id), eq(sales.storeId, user.storeId)))
      .returning();
    await c.get("db").insert(pendingApprovals).values({
      storeId: user.storeId,
      requestedByUserId: user.id,
      actionType,
      targetSaleId: sale.id,
      reason: `${actionType} completed by supervisor`,
      deviceActionId: input.deviceActionId,
      status: "approved",
      approvedByUserId: user.id,
      resolvedAt: new Date(),
    });
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: `sale.${actionType}`,
        entityType: "sale",
        entityId: sale.id,
      });
    return c.json({ sale: updated });
  };

app.post(
  "/api/v1/sales/:id/void",
  requireRole("cashier", "supervisor", "store_admin"),
  requestSaleAction("void"),
);
app.post(
  "/api/v1/sales/:id/refund",
  requireRole("cashier", "supervisor", "store_admin"),
  requestSaleAction("refund"),
);

app.get(
  "/api/v1/approvals/pending",
  requireRole("supervisor", "store_admin", "owner"),
  async (c) => {
    const rows = await c
      .get("db")
      .select()
      .from(pendingApprovals)
      .where(
        and(
          eq(pendingApprovals.storeId, c.get("user").storeId),
          eq(pendingApprovals.status, "pending"),
        ),
      )
      .orderBy(desc(pendingApprovals.createdAt));
    return c.json({ approvals: rows });
  },
);

app.post(
  "/api/v1/approvals/:id/decide",
  requireRole("supervisor", "store_admin", "owner"),
  zValidator("json", approvalDecisionSchema),
  async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    const [approver] = await c
      .get("db")
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, user.id),
          eq(users.storeId, user.storeId),
          eq(users.isActive, true),
        ),
      )
      .limit(1);
    if (!approver || !(await verifyPassword(input.pin, approver.pinHash)))
      return c.json({ error: "Invalid supervisor PIN" }, 401);
    const [approval] = await c
      .get("db")
      .select()
      .from(pendingApprovals)
      .where(
        and(
          eq(pendingApprovals.id, c.req.param("id")),
          eq(pendingApprovals.storeId, user.storeId),
          eq(pendingApprovals.status, "pending"),
        ),
      )
      .limit(1);
    if (!approval) return c.json({ error: "Pending approval not found" }, 404);
    let approvedSaleId = approval.targetSaleId;
    if (
      input.decision === "approved" &&
      approval.actionType === "credit_limit_override"
    ) {
      const context = approval.metadata as {
        sale?: unknown;
        customerAccountId?: string;
      };
      const parsedSale = salesBatchSchema.shape.sales.element.safeParse(
        context.sale,
      );
      if (!parsedSale.success || !context.customerAccountId)
        return c.json({ error: "Approval retry context is invalid" }, 409);
      const saleInput = parsedSale.data;
      const [existingSale] = await c
        .get("db")
        .select()
        .from(sales)
        .where(
          and(
            eq(sales.storeId, user.storeId),
            eq(sales.deviceSaleId, saleInput.deviceSaleId),
          ),
        )
        .limit(1);
      if (existingSale) {
        approvedSaleId = existingSale.id;
      } else {
        const productRows = [];
        for (const item of saleInput.items) {
          const [product] = await c
            .get("db")
            .select()
            .from(products)
            .where(
              and(
                eq(products.id, item.productId),
                eq(products.storeId, user.storeId),
              ),
            )
            .limit(1);
          if (!product)
            return c.json(
              { error: `Product not found: ${item.productId}` },
              409,
            );
          productRows.push({ item, product });
        }
        const pricedSale = await priceLines(
          c.get("db"),
          user.storeId,
          productRows.map(({ item, product }) => ({
            productId: product.id,
            categoryId: product.categoryId,
            quantity: item.quantity,
            unitPrice: product.sellingPrice,
          })),
        );
        const sale = await completeSale(c.get("db"), {
          storeId: user.storeId,
          userId: approval.requestedByUserId,
          sale: {
            deviceSaleId: saleInput.deviceSaleId,
            shiftId: saleInput.shiftId ?? null,
            totalAmount: pricedSale.total,
            paymentMethod: saleInput.paymentMethod,
          },
          productRows: productRows.map(({ item, product }, index) => ({
            item: {
              ...item,
              unitPrice: product.sellingPrice,
              discountAmount: pricedSale.lines[index]?.discountAmount ?? "0",
            },
            product,
          })),
          customerAccountId: context.customerAccountId,
        });
        if (!sale)
          return c.json({ error: "Approved sale could not be completed" }, 500);
        approvedSaleId = sale.id;
      }
    }

    const [resolved] = await c
      .get("db")
      .update(pendingApprovals)
      .set({
        status: input.decision,
        approvedByUserId: user.id,
        targetSaleId: approvedSaleId,
        resolvedAt: new Date(),
      })
      .where(eq(pendingApprovals.id, approval.id))
      .returning();
    if (
      input.decision === "approved" &&
      approval.actionType !== "credit_limit_override" &&
      approval.targetSaleId
    ) {
      await c
        .get("db")
        .update(sales)
        .set({ status: approval.actionType === "void" ? "voided" : "refunded" })
        .where(
          and(
            eq(sales.id, approval.targetSaleId),
            eq(sales.storeId, user.storeId),
          ),
        );
    }
    await c
      .get("db")
      .insert(auditLogs)
      .values({
        storeId: user.storeId,
        userId: user.id,
        action: `approval.${input.decision}`,
        entityType: "pending_approval",
        entityId: approval.id,
        metadata: {
          actionType: approval.actionType,
          targetSaleId: approvedSaleId,
        },
      });
    return c.json({ approval: resolved });
  },
);

const reportWindow = (date: string) => {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
};

app.get(
  "/api/v1/reports/daily-summary",
  requireRole("supervisor", "store_admin", "owner"),
  zValidator("query", reportDateSchema),
  async (c) => {
    const user = c.get("user");
    const { start, end } = reportWindow(c.req.valid("query").date);
    const rows = await c
      .get("db")
      .select({
        totalAmount: sales.totalAmount,
        paymentMethod: sales.paymentMethod,
        status: sales.status,
      })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, user.storeId),
          gte(sales.createdAt, start),
          lt(sales.createdAt, end),
        ),
      );
    const completed = rows.filter((row) => row.status === "completed");
    const byPaymentMethod = Object.fromEntries(
      ["cash", "card", "mobile_money", "split"].map((method) => [
        method,
        completed
          .filter((row) => row.paymentMethod === method)
          .reduce((total, row) => total + Number(row.totalAmount), 0)
          .toFixed(2),
      ]),
    );
    return c.json({
      date: c.req.valid("query").date,
      transactionCount: completed.length,
      totalAmount: completed
        .reduce((total, row) => total + Number(row.totalAmount), 0)
        .toFixed(2),
      byPaymentMethod,
    });
  },
);

app.get(
  "/api/v1/reports/sales-by-cashier",
  requireRole("supervisor", "store_admin", "owner"),
  zValidator("query", reportDateSchema),
  async (c) => {
    const user = c.get("user");
    const { start, end } = reportWindow(c.req.valid("query").date);
    const rows = await c
      .get("db")
      .select({ cashierId: sales.cashierId, totalAmount: sales.totalAmount })
      .from(sales)
      .where(
        and(
          eq(sales.storeId, user.storeId),
          eq(sales.status, "completed"),
          gte(sales.createdAt, start),
          lt(sales.createdAt, end),
        ),
      );
    const summary = new Map<
      string,
      { transactionCount: number; totalAmount: number }
    >();
    for (const row of rows) {
      const current = summary.get(row.cashierId) ?? {
        transactionCount: 0,
        totalAmount: 0,
      };
      current.transactionCount += 1;
      current.totalAmount += Number(row.totalAmount);
      summary.set(row.cashierId, current);
    }
    return c.json({
      date: c.req.valid("query").date,
      cashiers: [...summary].map(([cashierId, value]) => ({
        cashierId,
        transactionCount: value.transactionCount,
        totalAmount: value.totalAmount.toFixed(2),
      })),
    });
  },
);

app.get(
  "/api/v1/reports/discrepancies",
  requireRole("supervisor", "store_admin", "owner"),
  zValidator("query", reportDateSchema),
  async (c) => {
    const user = c.get("user");
    const { start, end } = reportWindow(c.req.valid("query").date);
    const discrepancies = await c
      .get("db")
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.storeId, user.storeId),
          gte(auditLogs.createdAt, start),
          lt(auditLogs.createdAt, end),
          sql`${auditLogs.action} IN ('stock.discrepancy', 'shift.closed')`,
        ),
      )
      .orderBy(desc(auditLogs.createdAt));
    return c.json({ date: c.req.valid("query").date, discrepancies });
  },
);

const listAuditLogs = async (
  db: ReturnType<typeof createDb>,
  storeId: string,
  query: { action?: string | undefined; from?: string | undefined; to?: string | undefined; page: number; pageSize: number },
) => {
  const conditions = [eq(auditLogs.storeId, storeId)];
  if (query.action) conditions.push(eq(auditLogs.action, query.action));
  if (query.from) conditions.push(gte(auditLogs.createdAt, new Date(query.from)));
  if (query.to) conditions.push(lt(auditLogs.createdAt, new Date(query.to)));

  return db
    .select()
    .from(auditLogs)
    .where(and(...conditions))
    .orderBy(desc(auditLogs.createdAt))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize);
};

app.get(
  "/api/v1/audit-logs",
  requireRole("owner", "store_admin"),
  zValidator("query", auditLogQuerySchema),
  async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");
    const rows = await listAuditLogs(c.get("db"), user.storeId, query);
    return c.json({
      page: query.page,
      pageSize: query.pageSize,
      auditLogs: rows,
    });
  },
);

app.get(
  "/api/v1/platform/stores/:id/audit-logs",
  requirePlatformAdmin,
  zValidator("query", auditLogQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const rows = await listAuditLogs(c.get("db"), c.req.param("id"), query);
    return c.json({
      page: query.page,
      pageSize: query.pageSize,
      auditLogs: rows,
    });
  },
);

export const scheduled = async (_controller: unknown, env: AppEnv["Bindings"]) => {
  const db = createDb(env.DATABASE_URL);
  await generateInvoices(db);
  await markOverdueInvoices(db);
};

export default app;
export { app };
