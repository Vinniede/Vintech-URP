import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from './db.js';
import { createToken, requireAuth, requireCustomer, requireStaff, requireActiveStore } from './auth.js';
import { createPlatformToken, requirePlatformAdmin } from './platform-auth.js';
import app from './index.js';

describe('cross-audience JWT rejection', () => {
  afterEach(() => vi.restoreAllMocks());

  const platformApp = new Hono();
  platformApp.use('/api/v1/*', requireAuth);
  platformApp.use('/api/v1/*', requireStaff);
  platformApp.get('/api/v1/products', (c) => c.json({ ok: true }));
  platformApp.get('/api/v1/platform/stores', requirePlatformAdmin, (c) => c.json({ ok: true }));

  const customerApp = new Hono();
  customerApp.use('/api/v1/*', requireAuth);
  customerApp.get('/api/v1/customers/me/orders', requireCustomer, (c) => c.json({ ok: true }));

  it('rejects a platform admin token on tenant staff routes', async () => {
    const token = await createPlatformToken('platform-1', 'test-secret');
    const response = await platformApp.request('http://localhost/api/v1/products', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid or expired token' });
  });

  it('rejects a staff token on platform-admin routes', async () => {
    const token = await createToken({ id: 'staff-1', storeId: 'store-1', role: 'owner' }, 'test-secret');
    const response = await platformApp.request('http://localhost/api/v1/platform/stores', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Platform admin authentication required' });
  });

  it('rejects a customer token on staff routes', async () => {
    const token = await createToken({ id: 'customer-1', storeId: 'store-1', role: 'fulfillment', kind: 'customer' }, 'test-secret');
    const response = await platformApp.request('http://localhost/api/v1/products', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid or expired token' });
  });

  it('rejects a staff token on customer routes', async () => {
    const token = await createToken({ id: 'staff-1', storeId: 'store-1', role: 'owner' }, 'test-secret');
    const response = await customerApp.request('http://localhost/api/v1/customers/me/orders', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid or expired token' });
  });

  it('rejects a customer token on platform routes', async () => {
    const token = await createToken({ id: 'customer-1', storeId: 'store-1', role: 'fulfillment', kind: 'customer' }, 'test-secret');
    const response = await platformApp.request('http://localhost/api/v1/platform/stores', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: 'Platform admin authentication required' });
  });

  it('rejects a suspended store even for an already-issued staff token', async () => {
    const suspendedApp = new Hono();
    suspendedApp.use('/api/v1/*', async (c, next) => {
      const db = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ isSuspended: true }],
            }),
          }),
        }),
      } as any;
      (c as any).set('db', db);
      await next();
    });
    suspendedApp.use('/api/v1/*', requireAuth);
    suspendedApp.use('/api/v1/*', requireStaff);
    suspendedApp.use('/api/v1/*', requireActiveStore);
    suspendedApp.get('/api/v1/products', (c) => c.json({ ok: true }));

    const token = await createToken({ id: 'staff-1', storeId: 'store-1', role: 'owner' }, 'test-secret');
    const response = await suspendedApp.request('http://localhost/api/v1/products', {
      headers: { Authorization: `Bearer ${token}` },
    }, {
      DATABASE_URL: 'postgres://test',
      JWT_SECRET: 'test-secret',
      PAYMENT_CREDENTIALS_KEY: 'test-key',
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Store suspended',
      code: 'store_suspended',
    });
  });

  it('allows a platform-admin to read a target store audit log and rejects tenant users', async () => {
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: () => ({
                offset: async () => [{ storeId: 'store-1', action: 'user.login', createdAt: new Date('2026-01-01T00:00:00Z') }],
              }),
            }),
          }),
        }),
      }),
    } as any;

    vi.spyOn(dbModule, 'createDb').mockReturnValue(fakeDb);

    const platformToken = await createPlatformToken('platform-1', 'test-secret');
    const platformResponse = await app.request('http://localhost/api/v1/platform/stores/store-1/audit-logs?page=1&pageSize=20', {
      headers: { Authorization: `Bearer ${platformToken}` },
    }, {
      DATABASE_URL: 'postgres://test',
      JWT_SECRET: 'test-secret',
      PAYMENT_CREDENTIALS_KEY: 'test-key',
    });

    expect(platformResponse.status).toBe(200);
    await expect(platformResponse.json()).resolves.toMatchObject({
      page: 1,
      pageSize: 20,
      auditLogs: [{ action: 'user.login' }],
    });

    const staffToken = await createToken({ id: 'staff-1', storeId: 'store-1', role: 'owner' }, 'test-secret');
    const staffResponse = await app.request('http://localhost/api/v1/platform/stores/store-1/audit-logs?page=1&pageSize=20', {
      headers: { Authorization: `Bearer ${staffToken}` },
    }, {
      DATABASE_URL: 'postgres://test',
      JWT_SECRET: 'test-secret',
      PAYMENT_CREDENTIALS_KEY: 'test-key',
    });

    expect(staffResponse.status).toBe(401);
    await expect(staffResponse.json()).resolves.toMatchObject({ error: 'Platform admin authentication required' });

    const customerToken = await createToken({ id: 'customer-1', storeId: 'store-1', role: 'fulfillment', kind: 'customer' }, 'test-secret');
    const customerResponse = await app.request('http://localhost/api/v1/platform/stores/store-1/audit-logs?page=1&pageSize=20', {
      headers: { Authorization: `Bearer ${customerToken}` },
    }, {
      DATABASE_URL: 'postgres://test',
      JWT_SECRET: 'test-secret',
      PAYMENT_CREDENTIALS_KEY: 'test-key',
    });

    expect(customerResponse.status).toBe(401);
    await expect(customerResponse.json()).resolves.toMatchObject({ error: 'Platform admin authentication required' });
  });
});
