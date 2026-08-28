import { createMiddleware } from 'hono/factory';
import { jwtVerify, SignJWT } from 'jose';
import { eq } from 'drizzle-orm';
import { platformAdmins } from '@urp/db/schema';
import type { Env } from './env.js';
import { hashPassword } from './passwords.js';

export type PlatformVariables = { platformAdminId: string };
const key = (secret: string) => new TextEncoder().encode(secret);
const defaultPlatformAdminEmail = 'system@urp.local';
const defaultPlatformAdminPassword = 'ChangeMe123!';

export const createPlatformToken = (adminId: string, secret: string) => new SignJWT({ kind: 'platform_admin' })
  .setProtectedHeader({ alg: 'HS256' })
  .setAudience('platform-admin')
  .setSubject(adminId)
  .setIssuedAt()
  .setExpirationTime('8h')
  .sign(key(secret));

export const bootstrapPlatformAdmin = async (
  db: any,
  env: Partial<Env> = {},
  emailOverride?: string,
) => {
  const requestedEmail = (emailOverride ?? env.PLATFORM_ADMIN_EMAIL ?? defaultPlatformAdminEmail).trim().toLowerCase();
  const password = env.PLATFORM_ADMIN_PASSWORD ?? defaultPlatformAdminPassword;
  const [existingAdmin] = await db
    .select()
    .from(platformAdmins)
    .where(eq(platformAdmins.email, requestedEmail))
    .limit(1);

  if (existingAdmin) return existingAdmin;

  const [admin] = await db
    .insert(platformAdmins)
    .values({
      name: 'System Owner',
      email: requestedEmail,
      passwordHash: await hashPassword(password),
      isActive: true,
    })
    .returning({
      id: platformAdmins.id,
      name: platformAdmins.name,
      email: platformAdmins.email,
      isActive: platformAdmins.isActive,
    });

  return admin ?? null;
};

export const requirePlatformAdmin = createMiddleware<{ Bindings: Env; Variables: PlatformVariables }>(async (c, next) => {
  const token = c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return c.json({ error: 'Missing bearer token' }, 401);
  try {
    const { payload } = await jwtVerify(token, key(c.env.JWT_SECRET), { audience: 'platform-admin' });
    if (typeof payload.sub !== 'string') return c.json({ error: 'Invalid platform admin token' }, 401);
    c.set('platformAdminId', payload.sub);
    await next();
  } catch {
    return c.json({ error: 'Platform admin authentication required' }, 401);
  }
});
