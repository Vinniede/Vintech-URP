export const roles = [
  "owner",
  "store_admin",
  "inventory_clerk",
  "cashier",
  "supervisor",
  "fulfillment",
] as const;

export type Role = (typeof roles)[number];

export const unitOfMeasures = ["piece", "kg", "litre", "box"] as const;
export type UnitOfMeasure = (typeof unitOfMeasures)[number];

export const paymentMethods = [
  "cash",
  "card",
  "mobile_money",
  "split",
  "credit",
] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const saleStatuses = ["completed", "voided", "refunded"] as const;
export type SaleStatus = (typeof saleStatuses)[number];

import { z } from "zod";

export const staffLoginSchema = z
  .object({
    storeId: z.string().uuid(),
    email: z.string().email(),
    password: z.string().min(1).optional(),
    pin: z
      .string()
      .regex(/^\d{4,8}$/)
      .optional(),
  })
  .refine((value) => Boolean(value.password) !== Boolean(value.pin), {
    message: "Provide exactly one of password or pin",
  });

export const platformAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const invoiceMpesaSchema = z.object({
  invoiceId: z.string().uuid(),
  customerPhone: z.string().trim().min(7).max(30),
});

export const platformPaymentConfigSchema = z.object({
  provider: z.enum(["mpesa", "bank"]),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  isActive: z.boolean().default(false),
  credentials: z.record(z.string().min(1)).default({}),
});

export const planPricingSchema = z.object({
  plan: z.enum(["pos_only", "storefront_only", "bundled"]),
  billingCycle: z.enum(["monthly", "annual"]),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().trim().length(3).toUpperCase(),
  isActive: z.boolean().default(true),
  effectiveFrom: z.coerce.date(),
});

export const storeCreateSchema = z.object({
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  currency: z.string().trim().length(3).toUpperCase(),
  timezone: z.string().trim().min(1).max(80).default('UTC'),
  posEnabled: z.boolean().default(false),
  storefrontEnabled: z.boolean().default(false),
  billingPlan: z.enum(['pos_only', 'storefront_only', 'bundled']).default('pos_only'),
  billingCycle: z.enum(['monthly', 'annual']).default('monthly'),
  ownerName: z.string().trim().min(1).max(160),
  ownerEmail: z.string().email(),
  ownerPhone: z.string().trim().max(40).optional(),
  ownerPassword: z.string().min(8).max(128),
});

export const moduleToggleSchema = z.object({
  posEnabled: z.boolean().optional(),
  storefrontEnabled: z.boolean().optional(),
}).refine((value) => value.posEnabled !== undefined || value.storefrontEnabled !== undefined, { message: 'At least one module flag is required' });

export const customerLoginSchema = z.object({
  storeId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(1),
});

export const customerRegisterSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  email: z.string().email(),
  phone: z.string().trim().max(40).nullable().optional(),
  password: z.string().min(8).max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

const moneySchema = z.string().regex(/^\d+(\.\d{1,2})?$/);
export const invoiceCreateSchema = z.object({
  plan: z.enum(["pos_only", "storefront_only", "bundled"]),
  billingCycle: z.enum(["monthly", "annual"]),
  amount: moneySchema,
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  dueDate: z.coerce.date(),
});

const quantitySchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/)
  .refine((value) => Number(value) > 0);

export const openShiftSchema = z.object({
  openingFloat: moneySchema,
});

export const closeShiftSchema = z.object({
  closingAmountActual: moneySchema,
});

export const saleItemInputSchema = z.object({
  productId: z.string().uuid(),
  quantity: quantitySchema,
  unitPrice: moneySchema,
  discountAmount: moneySchema.default("0"),
});

export const offlineSaleSchema = z
  .object({
    deviceSaleId: z.string().uuid(),
    shiftId: z.string().uuid().nullable().optional(),
    totalAmount: moneySchema,
    paymentMethod: z.enum(paymentMethods),
    customerAccountId: z.string().uuid().nullable().optional(),
    items: z.array(saleItemInputSchema).min(1),
  })
  .superRefine((value, context) => {
    if (value.paymentMethod === "credit" && !value.customerAccountId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerAccountId"],
        message: "Customer account is required for credit sales",
      });
  });

export const salesBatchSchema = z.object({
  sales: z.array(offlineSaleSchema).min(1).max(100),
});

export const customerAccountSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(40),
  creditLimit: moneySchema,
});

export const customerAccountUpdateSchema = customerAccountSchema.partial();
export const customerAccountPaymentSchema = z.object({
  amount: moneySchema,
  note: z.string().trim().max(500).optional(),
});

export const approvalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  pin: z.string().regex(/^\d{4,8}$/),
});

export const approvalActionTypes = [
  "void",
  "refund",
  "discount_override",
  "credit_limit_override",
] as const;

export const reportDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const salesListQuerySchema = z.object({
  shiftId: z.string().uuid().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const saleActionSchema = z.object({
  deviceActionId: z.string().uuid(),
});

const staffFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().email(),
  phone: z.string().trim().max(40).nullable().optional(),
  role: z.enum(roles),
  pin: z
    .string()
    .regex(/^\d{4,8}$/)
    .optional(),
  password: z.string().min(8).max(128).optional(),
});

export const staffCreateSchema = staffFieldsSchema.superRefine(
  (value, context) => {
    if (["cashier", "supervisor"].includes(value.role) && !value.pin) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pin"],
        message: "PIN is required for this role",
      });
    }
    if (["owner", "store_admin"].includes(value.role) && !value.password) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password"],
        message: "Password is required for this role",
      });
    }
  },
);

export const staffUpdateSchema = staffFieldsSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const shiftListQuerySchema = z.object({
  status: z.enum(["open", "closed"]).optional(),
});

export const auditLogQuerySchema = z.object({
  action: z.string().trim().max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const syncResultStatuses = ["synced", "already_synced"] as const;
export type SyncResultStatus = (typeof syncResultStatuses)[number];

export const orderStatuses = [
  "pending",
  "paid",
  "packed",
  "shipped",
  "ready_for_pickup",
  "completed",
  "cancelled",
] as const;
export type OrderStatus = (typeof orderStatuses)[number];
export const fulfillmentTypes = ["delivery", "pickup"] as const;

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(80),
  addressLine1: z.string().trim().min(1).max(200),
  addressLine2: z.string().trim().max(200).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().min(1).max(100),
  isDefault: z.boolean().default(false),
});

export const createOrderSchema = z
  .object({
    items: z
      .array(
        z.object({ productId: z.string().uuid(), quantity: quantitySchema }),
      )
      .min(1),
    fulfillmentType: z.enum(fulfillmentTypes),
    deliveryAddressId: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, context) => {
    if (value.fulfillmentType === "delivery" && !value.deliveryAddressId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["deliveryAddressId"],
        message: "Delivery address is required",
      });
    }
  });

export const orderStatusUpdateSchema = z.object({
  status: z.enum(orderStatuses),
  note: z.string().trim().max(500).optional(),
});

export const paymentSchema = z.object({
  paymentReference: z.string().trim().min(1).max(200).optional(),
});
export const storefrontProductQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
});

const promotionFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: z.enum([
    "percentage_discount",
    "fixed_discount",
    "buy_x_get_y",
    "bundle_price",
  ]),
  value: z.string().regex(/^\d+(\.\d{1,4})?$/),
  appliesTo: z.enum(["all", "category", "specific_products"]),
  categoryId: z.string().uuid().nullable().optional(),
  productIds: z.array(z.string().uuid()).default([]),
  buyQuantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .nullable()
    .optional(),
  getQuantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .nullable()
    .optional(),
  getDiscountPercentage: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .nullable()
    .optional(),
  bundleQuantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .nullable()
    .optional(),
  bundleTotalPrice: moneySchema.nullable().optional(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  isActive: z.boolean().default(true),
});

export const promotionSchema = promotionFieldsSchema.superRefine(
  (value, context) => {
    if (new Date(value.endAt) <= new Date(value.startAt))
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endAt"],
        message: "End must be after start",
      });
    if (value.appliesTo === "category" && !value.categoryId)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categoryId"],
        message: "Category is required",
      });
    if (
      value.appliesTo === "specific_products" &&
      value.productIds.length === 0
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["productIds"],
        message: "At least one product is required",
      });
    if (
      value.type === "buy_x_get_y" &&
      (!value.buyQuantity || !value.getQuantity || !value.getDiscountPercentage)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["buyQuantity"],
        message: "Buy, get, and discount values are required",
      });
    if (
      value.type === "bundle_price" &&
      (!value.bundleQuantity || !value.bundleTotalPrice)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bundleQuantity"],
        message: "Bundle quantity and price are required",
      });
  },
);

export const promotionUpdateSchema = promotionFieldsSchema.partial();

export const supplierSchema = z.object({
  name: z.string().trim().min(1).max(160),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  contactEmail: z.string().email().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const purchaseOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantityOrdered: quantitySchema,
  unitCost: moneySchema,
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  items: z.array(purchaseOrderItemSchema).min(1),
});

export const purchaseOrderUpdateSchema = z.object({
  status: z.enum(["draft", "ordered", "cancelled"]).optional(),
  items: z.array(purchaseOrderItemSchema).min(1).optional(),
});

export const purchaseOrderReceiveSchema = z.object({
  items: z
    .array(
      z.object({ itemId: z.string().uuid(), quantityReceived: quantitySchema }),
    )
    .min(1),
});

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentCategoryId: z.string().uuid().nullable().optional(),
});

export const paymentConfigSchema = z.object({
  provider: z.enum(["mpesa", "bank", "card"]),
  isEnabled: z.boolean().default(false),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  credentials: z.record(z.string().min(1)).default({}),
});

export const paymentInitiateSchema = z
  .object({
    saleId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    amount: moneySchema,
    customerPhone: z.string().regex(/^\+?\d{10,15}$/),
  })
  .refine((value) => Boolean(value.saleId) !== Boolean(value.orderId), {
    message: "Provide exactly one saleId or orderId",
  });

export const bankPaymentSchema = z.object({
  referenceNote: z.string().trim().min(1).max(500),
});
export const paymentTransactionTargetSchema = z
  .object({
    saleId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    amount: moneySchema,
    referenceNote: z.string().trim().min(1).max(500),
  })
  .refine((value) => Boolean(value.saleId) !== Boolean(value.orderId), {
    message: "Provide exactly one saleId or orderId",
  });

export const mpesaCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            }),
          ),
        })
        .optional(),
    }),
  }),
});

export const productInputSchema = z.object({
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(80).nullable().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  costPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  sellingPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
  taxRate: z
    .string()
    .regex(/^\d+(\.\d{1,4})?$/)
    .default("0"),
  unitOfMeasure: z.enum(unitOfMeasures).default("piece"),
  stockQuantity: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .default("0"),
  reorderLevel: z
    .string()
    .regex(/^\d+(\.\d{1,3})?$/)
    .default("0"),
  publishedOnline: z.boolean().default(false),
});

export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export * from "./pricing";
export * from "./receipt";

const bluetoothConfigSchema = z.object({
  serviceUuid: z.string().min(1),
  characteristicUuid: z.string().min(1),
});
const networkConfigSchema = z.object({
  url: z.string().url(),
});
const usbConfigSchema = z.object({
  vendorId: z.number().int().min(0),
  productId: z.number().int().min(0),
  interfaceNumber: z.number().int().min(0).default(0),
  endpointNumber: z.number().int().min(0).default(1),
});

export const printerProfileSchema = z.discriminatedUnion("transport", [
  z.object({
    name: z.string().trim().min(1).max(120),
    transport: z.literal("bluetooth"),
    connectionConfig: bluetoothConfigSchema,
    autoCut: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  }),
  z.object({
    name: z.string().trim().min(1).max(120),
    transport: z.literal("network"),
    connectionConfig: networkConfigSchema,
    autoCut: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  }),
  z.object({
    name: z.string().trim().min(1).max(120),
    transport: z.literal("usb"),
    connectionConfig: usbConfigSchema,
    autoCut: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  }),
  z.object({
    name: z.string().trim().min(1).max(120),
    transport: z.literal("browser"),
    connectionConfig: z.object({}),
    autoCut: z.boolean().default(true),
    isDefault: z.boolean().default(false),
  }),
]);

export const printerProfileUpdateSchema = z.union([
  z.object({
    name: z.string().trim().min(1).max(120).optional(),
    transport: z.literal("bluetooth").optional(),
    connectionConfig: bluetoothConfigSchema.optional(),
    autoCut: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    name: z.string().trim().min(1).max(120).optional(),
    transport: z.literal("network").optional(),
    connectionConfig: networkConfigSchema.optional(),
    autoCut: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    name: z.string().trim().min(1).max(120).optional(),
    transport: z.literal("usb").optional(),
    connectionConfig: usbConfigSchema.optional(),
    autoCut: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  }),
  z.object({
    name: z.string().trim().min(1).max(120).optional(),
    transport: z.literal("browser").optional(),
    connectionConfig: z.object({}).optional(),
    autoCut: z.boolean().optional(),
    isDefault: z.boolean().optional(),
  }),
]);
