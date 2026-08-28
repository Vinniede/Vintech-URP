import {
  boolean,
  decimal,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roleEnum = pgEnum("role", [
  "owner",
  "store_admin",
  "inventory_clerk",
  "cashier",
  "supervisor",
  "fulfillment",
]);

export const unitOfMeasureEnum = pgEnum("unit_of_measure", [
  "piece",
  "kg",
  "litre",
  "box",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "card",
  "mobile_money",
  "split",
  "credit",
]);
export const customerAccountTransactionTypeEnum = pgEnum(
  "customer_account_transaction_type",
  ["charge", "payment"],
);
export const shiftStatusEnum = pgEnum("shift_status", ["open", "closed"]);
export const saleStatusEnum = pgEnum("sale_status", [
  "completed",
  "voided",
  "refunded",
]);
export const approvalActionTypeEnum = pgEnum("approval_action_type", [
  "void",
  "refund",
  "discount_override",
  "credit_limit_override",
]);
export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "unpaid",
  "paid",
  "failed",
  "refunded",
]);
export const promotionTypeEnum = pgEnum("promotion_type", [
  "percentage_discount",
  "fixed_discount",
  "buy_x_get_y",
  "bundle_price",
]);
export const promotionAppliesToEnum = pgEnum("promotion_applies_to", [
  "all",
  "category",
  "specific_products",
]);
export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft",
  "ordered",
  "partially_received",
  "received",
  "cancelled",
]);
export const paymentProviderEnum = pgEnum("payment_provider", [
  "mpesa",
  "bank",
  "card",
]);
export const paymentEnvironmentEnum = pgEnum("payment_environment", [
  "sandbox",
  "production",
]);
export const billingPlanEnum = pgEnum("billing_plan", [
  "pos_only",
  "storefront_only",
  "bundled",
]);
export const billingCycleEnum = pgEnum("billing_cycle", ["monthly", "annual"]);
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "pending",
  "paid",
  "overdue",
  "cancelled",
]);
export const invoicePaymentAttemptStatusEnum = pgEnum(
  "invoice_payment_attempt_status",
  ["initiated", "confirmed", "failed"],
);
export const paymentTransactionStatusEnum = pgEnum(
  "payment_transaction_status",
  ["initiated", "pending", "confirmed", "failed", "cancelled"],
);
export const printerTransportEnum = pgEnum("printer_transport", [
  "bluetooth",
  "network",
  "usb",
  "browser",
]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "packed",
  "shipped",
  "ready_for_pickup",
  "completed",
  "cancelled",
]);
export const fulfillmentTypeEnum = pgEnum("fulfillment_type", [
  "delivery",
  "pickup",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const platformAdmins = pgTable("platform_admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const stores = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  currency: text("currency").notNull().default("USD"),
  taxRate: decimal("tax_rate", { precision: 8, scale: 4 })
    .notNull()
    .default("0"),
  posEnabled: boolean("pos_enabled").notNull().default(false),
  storefrontEnabled: boolean("storefront_enabled").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  billingPlan: billingPlanEnum("billing_plan").notNull().default("pos_only"),
  billingCycle: billingCycleEnum("billing_cycle").notNull().default("monthly"),
  timezone: text("timezone").notNull().default("UTC"),
  accentColor: text("accent_color").notNull().default("#1F3A5F"),
  logoUrl: text("logo_url"),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash"),
    pinHash: text("pin_hash"),
    role: roleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_store_email_idx").on(table.storeId, table.email),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    parentCategoryId: uuid("parent_category_id"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("categories_store_name_idx").on(table.storeId, table.name),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    sku: text("sku").notNull(),
    barcode: text("barcode"),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: uuid("category_id").references(() => categories.id),
    costPrice: decimal("cost_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    sellingPrice: decimal("selling_price", {
      precision: 12,
      scale: 2,
    }).notNull(),
    taxRate: decimal("tax_rate", { precision: 8, scale: 4 })
      .notNull()
      .default("0"),
    unitOfMeasure: unitOfMeasureEnum("unit_of_measure")
      .notNull()
      .default("piece"),
    stockQuantity: decimal("stock_quantity", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    reorderLevel: decimal("reorder_level", { precision: 14, scale: 3 })
      .notNull()
      .default("0"),
    publishedOnline: boolean("published_online").notNull().default(false),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("products_store_sku_idx").on(table.storeId, table.sku),
    uniqueIndex("products_store_barcode_idx").on(table.storeId, table.barcode),
    uniqueIndex("products_store_id_idx").on(table.storeId, table.id),
  ],
);

export const productImages = pgTable("product_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const promotions = pgTable("promotions", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  name: text("name").notNull(),
  type: promotionTypeEnum("type").notNull(),
  value: decimal("value", { precision: 12, scale: 4 }).notNull(),
  appliesTo: promotionAppliesToEnum("applies_to").notNull(),
  categoryId: uuid("category_id").references(() => categories.id),
  buyQuantity: decimal("buy_quantity", { precision: 14, scale: 3 }),
  getQuantity: decimal("get_quantity", { precision: 14, scale: 3 }),
  getDiscountPercentage: decimal("get_discount_percentage", {
    precision: 6,
    scale: 2,
  }),
  bundleQuantity: decimal("bundle_quantity", { precision: 14, scale: 3 }),
  bundleTotalPrice: decimal("bundle_total_price", { precision: 12, scale: 2 }),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const promotionProducts = pgTable(
  "promotion_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("promotion_products_unique_idx").on(
      table.promotionId,
      table.productId,
    ),
  ],
);

export const shifts = pgTable(
  "shifts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => users.id),
    openingFloat: decimal("opening_float", {
      precision: 12,
      scale: 2,
    }).notNull(),
    closingAmountExpected: decimal("closing_amount_expected", {
      precision: 12,
      scale: 2,
    }),
    closingAmountActual: decimal("closing_amount_actual", {
      precision: 12,
      scale: 2,
    }),
    discrepancy: decimal("discrepancy", { precision: 12, scale: 2 }),
    status: shiftStatusEnum("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("shifts_one_open_per_cashier_idx")
      .on(table.storeId, table.cashierId)
      .where(sql`${table.closedAt} IS NULL`),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    cashierId: uuid("cashier_id")
      .notNull()
      .references(() => users.id),
    shiftId: uuid("shift_id").references(() => shifts.id),
    totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    status: saleStatusEnum("status").notNull().default("completed"),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    deviceSaleId: uuid("device_sale_id").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sales_store_device_sale_id_idx").on(
      table.storeId,
      table.deviceSaleId,
    ),
  ],
);

export const saleItems = pgTable("sale_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  saleId: uuid("sale_id")
    .notNull()
    .references(() => sales.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  name: text("name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  ...timestamps,
});

export const purchaseOrders = pgTable("purchase_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  supplierId: uuid("supplier_id")
    .notNull()
    .references(() => suppliers.id),
  status: purchaseOrderStatusEnum("status").notNull().default("draft"),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  ...timestamps,
  receivedAt: timestamp("received_at", { withTimezone: true }),
});

export const purchaseOrderItems = pgTable("purchase_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  purchaseOrderId: uuid("purchase_order_id")
    .notNull()
    .references(() => purchaseOrders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantityOrdered: decimal("quantity_ordered", {
    precision: 14,
    scale: 3,
  }).notNull(),
  quantityReceived: decimal("quantity_received", { precision: 14, scale: 3 })
    .notNull()
    .default("0"),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }).notNull(),
});

export const pendingApprovals = pgTable("pending_approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  requestedByUserId: uuid("requested_by_user_id")
    .notNull()
    .references(() => users.id),
  actionType: approvalActionTypeEnum("action_type").notNull(),
  targetSaleId: uuid("target_sale_id").references(() => sales.id),
  reason: text("reason").notNull(),
  thresholdExceededAmount: decimal("threshold_exceeded_amount", {
    precision: 12,
    scale: 2,
  }),
  metadata: jsonb("metadata").notNull().default({}),
  deviceActionId: uuid("device_action_id"),
  status: approvalStatusEnum("status").notNull().default("pending"),
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  ...timestamps,
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("pending_approvals_store_device_action_idx").on(table.storeId, table.deviceActionId).where(sql`${table.deviceActionId} IS NOT NULL`),
]);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customers_store_email_idx").on(table.storeId, table.email),
  ],
);

export const customerAddresses = pgTable("customer_addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2"),
  city: text("city").notNull(),
  region: text("region").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  status: orderStatusEnum("status").notNull().default("pending"),
  fulfillmentType: fulfillmentTypeEnum("fulfillment_type").notNull(),
  deliveryAddressId: uuid("delivery_address_id").references(
    () => customerAddresses.id,
  ),
  deliveryFee: decimal("delivery_fee", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  subtotal: decimal("subtotal", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  paymentStatus: paymentStatusEnum("payment_status")
    .notNull()
    .default("unpaid"),
  paymentReference: text("payment_reference"),
  ...timestamps,
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  quantity: decimal("quantity", { precision: 14, scale: 3 }).notNull(),
  unitPrice: decimal("unit_price", { precision: 12, scale: 2 }).notNull(),
});

export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  status: orderStatusEnum("status").notNull(),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id),
  note: text("note"),
  ...timestamps,
});

export const customerAccounts = pgTable("customer_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  creditLimit: decimal("credit_limit", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  balance: decimal("balance", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  ...timestamps,
});

export const customerAccountTransactions = pgTable(
  "customer_account_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    customerAccountId: uuid("customer_account_id")
      .notNull()
      .references(() => customerAccounts.id),
    saleId: uuid("sale_id").references(() => sales.id),
    type: customerAccountTransactionTypeEnum("type").notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    note: text("note"),
    ...timestamps,
  },
);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").notNull().default({}),
  ...timestamps,
});

export const storePaymentConfigs = pgTable(
  "store_payment_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    provider: paymentProviderEnum("provider").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(false),
    environment: paymentEnvironmentEnum("environment")
      .notNull()
      .default("sandbox"),
    credentialsEncrypted: text("credentials_encrypted").notNull(),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("store_payment_configs_store_provider_idx").on(
      table.storeId,
      table.provider,
    ),
  ],
);

export const platformPaymentConfig = pgTable(
  "platform_payment_config",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    provider: paymentProviderEnum("provider").notNull(),
    credentialsEncrypted: text("credentials_encrypted").notNull(),
    environment: paymentEnvironmentEnum("environment")
      .notNull()
      .default("sandbox"),
    isActive: boolean("is_active").notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex("platform_payment_config_provider_idx").on(table.provider)],
);

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  plan: billingPlanEnum("plan").notNull(),
  billingCycle: billingCycleEnum("billing_cycle").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  status: invoiceStatusEnum("status").notNull().default("pending"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  ...timestamps,
});

export const planPricing = pgTable("plan_pricing", {
  id: uuid("id").defaultRandom().primaryKey(),
  plan: billingPlanEnum("plan").notNull(),
  billingCycle: billingCycleEnum("billing_cycle").notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  ...timestamps,
});

export const invoicePaymentAttempts = pgTable(
  "invoice_payment_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum("provider").notNull(),
    providerReference: text("provider_reference"),
    status: invoicePaymentAttemptStatusEnum("status")
      .notNull()
      .default("initiated"),
    rawCallbackPayload: jsonb("raw_callback_payload"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("invoice_payment_attempts_provider_reference_idx").on(
      table.providerReference,
    ),
  ],
);

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id),
    saleId: uuid("sale_id").references(() => sales.id),
    orderId: uuid("order_id").references(() => orders.id),
    provider: paymentProviderEnum("provider").notNull(),
    providerReference: text("provider_reference"),
    status: paymentTransactionStatusEnum("status")
      .notNull()
      .default("initiated"),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    rawCallbackPayload: jsonb("raw_callback_payload"),
    ...timestamps,
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("payment_transactions_provider_reference_idx").on(
      table.provider,
      table.providerReference,
    ),
  ],
);

export const printerProfiles = pgTable("printer_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id")
    .notNull()
    .references(() => stores.id),
  name: text("name").notNull(),
  transport: printerTransportEnum("transport").notNull(),
  connectionConfig: jsonb("connection_config").notNull().default({}),
  autoCut: boolean("auto_cut").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  ...timestamps,
});
