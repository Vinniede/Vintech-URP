import {
  posDb,
  type CachedPromotion,
  type PendingSaleAction,
  type PendingSale,
  type Session,
} from "./db";
import type { SyncResultStatus } from "@urp/shared-types";

const apiUrl = (path: string) =>
  `${import.meta.env.VITE_API_URL ?? ""}/api/v1${path}`;

export const syncPendingSales = async (session: Session) => {
  if (!navigator.onLine) return { synced: 0, approvalIds: [] as string[] };
  const pending = await posDb.pendingSales
    .where("storeId")
    .equals(session.storeId)
    .toArray();
  if (pending.length === 0) return { synced: 0, approvalIds: [] as string[] };

  const response = await fetch(apiUrl("/sales/batch"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: JSON.stringify({
      sales: pending.map(
        ({ id: _id, storeId: _storeId, createdAt: _createdAt, ...sale }) =>
          sale,
      ),
    }),
  });
  if (!response.ok) throw new Error(`Sale sync failed: ${response.status}`);
  const body = (await response.json()) as {
    results: Array<{
      deviceSaleId: string;
      status: string;
      approvalId?: string;
    }>;
  };
  const syncedIds = getConfirmedSaleIds(body.results);
  const approvalIds = body.results
    .filter(
      (result) =>
        result.status === "requires_approval" && "approvalId" in result,
    )
    .map((result) => String(result.approvalId));
  await posDb.pendingSales
    .where("deviceSaleId")
    .anyOf([...syncedIds])
    .delete();
  return { synced: syncedIds.size, approvalIds };
};

export const syncPendingActions = async (session: Session) => {
  if (!navigator.onLine) return { resolved: 0, approvalIds: [] as string[], failed: 0 };
  const pending = await posDb.pendingSaleActions.where('storeId').equals(session.storeId).and((action) => action.status === 'pending_sync').toArray();
  const result = { resolved: 0, approvalIds: [] as string[], failed: 0 };
  for (const action of pending) {
    const response = await fetch(apiUrl(`/sales/${action.saleId}/${action.action}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.accessToken}` },
      body: JSON.stringify({ deviceActionId: action.deviceActionId }),
    });
    if (response.status === 202) {
      const body = await response.json() as { approval_id: string };
      await posDb.pendingSaleActions.update(action.id!, { status: 'pending_approval', approvalId: body.approval_id });
      result.approvalIds.push(body.approval_id);
    } else if (response.ok) {
      await posDb.pendingSaleActions.update(action.id!, { status: 'resolved' });
      result.resolved += 1;
    } else if (response.status >= 400 && response.status < 500) {
      const body = await response.json().catch(() => ({})) as { error?: string };
      await posDb.pendingSaleActions.update(action.id!, { status: 'failed', error: body.error ?? `Action rejected (${response.status})` });
      result.failed += 1;
    } else {
      throw new Error(`Sale action sync failed: ${response.status}`);
    }
  }
  return result;
};

export const classifyActionResponse = (status: number) => {
  if (status === 202) return 'pending_approval' as const;
  if (status >= 200 && status < 300) return 'resolved' as const;
  if (status >= 400 && status < 500) return 'failed' as const;
  return 'retry' as const;
};

export const syncPromotions = async (session: Session) => {
  if (!navigator.onLine) return 0;
  const response = await fetch(apiUrl("/promotions"), {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok)
    throw new Error(`Promotion sync failed: ${response.status}`);
  const body = (await response.json()) as {
    promotions: Array<Record<string, unknown>>;
  };
  await posDb.promotions.clear();
  await posDb.promotions.bulkPut(
    body.promotions.map((promotion) => ({
      ...promotion,
      startAt: String(promotion.startAt),
      endAt: String(promotion.endAt),
    })) as CachedPromotion[],
  );
  return body.promotions.length;
};

export const getConfirmedSaleIds = (
  results: Array<{ deviceSaleId: string; status: string }>,
) =>
  new Set(
    results
      .filter(
        (
          result,
        ): result is { deviceSaleId: string; status: SyncResultStatus } =>
          result.status === "synced" || result.status === "already_synced",
      )
      .map((result) => result.deviceSaleId),
  );

export const queueSale = async (sale: PendingSale) =>
  posDb.pendingSales.add(sale);
