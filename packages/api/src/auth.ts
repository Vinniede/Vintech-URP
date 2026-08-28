import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { stores } from '@urp/db/schema';
import type { Role } from '@urp/shared-types';
import type { Database } from './db.js';
import type { Env } from './env.js';

export type AuthUser = {
  id: string;
  storeId: string;
  role: Role;
  kind?: 'staff' | 'customer';
};

type AuthVariables = { db: Database; user: AuthUser };

const secretKey = (secret: string) => new TextEncoder().encode(secret);

export const createToken = async (user: AuthUser, secret: string) => new SignJWT({
  storeId: user.storeId,
  role: user.role,
  kind: user.kind ?? 'staff',
})
  .setProtectedHeader({ alg: 'HS256' })
  .setAudience(user.kind === 'customer' ? 'customer' : 'staff')
  .setSubject(user.id)
  .setIssuedAt()
  .setExpirationTime('8h')
  .sign(secretKey(secret));

export const requireAuth = createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/v1/platform/') || path.startsWith('/api/v1/stores/slug/')) return await next();

  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Missing bearer token' }, 401);

  try {
    const { payload } = await jwtVerify(token, secretKey(c.env.JWT_SECRET), { audience: ['staff', 'customer'] });
    if (typeof payload.sub !== 'string' || typeof payload.storeId !== 'string' || typeof payload.role !== 'string') {
      return c.json({ error: 'Invalid token claims' }, 401);
    }
    const kind = payload.aud === 'customer' ? 'customer' : 'staff';
    c.set('user', { id: payload.sub, storeId: payload.storeId, role: payload.role as Role, kind });
    await next();
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
});

export const createRefreshToken = async (user: AuthUser, secret: string) => new SignJWT({
  storeId: user.storeId,
  role: user.role,
  kind: user.kind ?? 'staff',
  tokenType: 'refresh',
})
  .setProtectedHeader({ alg: 'HS256' })
  .setAudience(user.kind === 'customer' ? 'customer-refresh' : 'staff-refresh')
  .setSubject(user.id)
  .setIssuedAt()
  .setExpirationTime('30d')
  .sign(secretKey(secret));

export const requireRole = (...roles: Role[]) => createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
  const user = c.get('user');
  if (!roles.includes(user.role)) return c.json({ error: 'Forbidden' }, 403);
  await next();
});

export const requireStaff = createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/v1/platform/') || path.startsWith('/api/v1/stores/slug/')) return await next();
  if (path.startsWith('/api/v1/orders') || path.startsWith('/api/v1/customers/me')) {
    await next();
    return;
  }
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Missing bearer token' }, 401);
  try {
    await jwtVerify(token, secretKey(c.env.JWT_SECRET), { audience: 'staff' });
  } catch {
    return c.json({ error: 'Invalid or expired token' }, 401);
  }
  await next();
});

export const requireCustomer = createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Missing bearer token' }, 401);
  try {
    const { payload } = await jwtVerify(token, secretKey(c.env.JWT_SECRET), { audience: 'customer' });
    if (typeof payload.sub !== 'string' || typeof payload.storeId !== 'string') return c.json({ error: 'Invalid customer token' }, 401);
    c.set('user', { id: payload.sub, storeId: payload.storeId, role: 'fulfillment', kind: 'customer' });
    await next();
  } catch {
    return c.json({ error: 'Customer authentication required' }, 401);
  }
});

export const requireStoreAccess = createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
  const user = c.get('user');
  const storeId = c.req.param('storeId');
  if (storeId && storeId !== user.storeId) return c.json({ error: 'Store access denied' }, 403);
  await next();
});

export const requireActiveStore = createMiddleware<{ Bindings: Env; Variables: AuthVariables }>(async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path.startsWith('/api/v1/platform/') || path.startsWith('/api/v1/stores/slug/')) return await next();

  const user = c.get('user');
  if (!user?.storeId) return c.json({ error: 'Invalid token claims' }, 401);

  const [store] = await c
    .get('db')
    .select({ isSuspended: stores.isSuspended })
    .from(stores)
    .where(eq(stores.id, user.storeId))
    .limit(1);

  if (store?.isSuspended) {
    return c.json({ error: 'Store suspended', code: 'store_suspended' }, 403);
  }

  await next();
});
