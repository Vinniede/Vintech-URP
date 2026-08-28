import Dexie, { type EntityTable } from "dexie";
import type { ProductInput, PromotionRule, Role } from "@urp/shared-types";

export type CachedProduct = ProductInput & {
  id: string;
  storeId: string;
  categoryId: string | null;
};
export type PendingSale = {
  id?: number;
  deviceSaleId: string;
  storeId: string;
  shiftId: string | null;
  totalAmount: string;
  customerAccountId?: string | null;
  paymentMethod: "cash" | "card" | "mobile_money" | "split" | "credit";
  items: Array<{
    productId: string;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
  }>;
  createdAt: string;
};
export type LocalShift = {
  id: string;
  storeId: string;
  openingFloat: string;
  openedAt: string;
};
export type Session = {
  id: string;
  storeId: string;
  role: Role;
  accessToken: string;
  refreshToken: string;
  name: string;
};
export type PendingSaleAction = { id?: number; deviceActionId: string; saleId: string; storeId: string; action: 'void' | 'refund'; status: 'pending_sync' | 'pending_approval' | 'resolved' | 'failed'; approvalId?: string; error?: string; createdAt: string };
export type CachedPromotion = PromotionRule;

class PosDatabase extends Dexie {
  products!: EntityTable<CachedProduct, "id">;
  pendingSales!: EntityTable<PendingSale, "id">;
  currentShift!: EntityTable<LocalShift, "id">;
  session!: EntityTable<Session, "id">;
  promotions!: EntityTable<CachedPromotion, "id">;
  pendingSaleActions!: EntityTable<PendingSaleAction, "id">;

  constructor() {
    super("urp-cashier-pos");
    this.version(1).stores({
      products: "id, storeId, sku, barcode, categoryId",
      pendingSales: "++id, deviceSaleId, storeId, createdAt",
      currentShift: "id, storeId",
      session: "id, storeId",
      promotions: "id, isActive, startAt, endAt",
      pendingSaleActions: "++id, saleId, storeId, action, createdAt",
    });
    this.version(2).stores({
      products: "id, storeId, sku, barcode, categoryId",
      pendingSales: "++id, deviceSaleId, storeId, createdAt",
      currentShift: "id, storeId",
      session: "id, storeId",
      promotions: "id, isActive, startAt, endAt",
      pendingSaleActions: "++id, deviceActionId, saleId, storeId, action, status, createdAt",
    });
  }
}

export const posDb = new PosDatabase();
