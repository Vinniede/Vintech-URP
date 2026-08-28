import { describe, expect, it } from 'vitest';
import { bootstrapPlatformAdmin } from './platform-auth.js';

describe('bootstrapPlatformAdmin', () => {
  it('creates a system admin when none exists yet', async () => {
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
          }),
        }),
      }),
      insert: () => ({
        values: () => ({
          returning: async () => [{
            id: 'admin-1',
            name: 'System Owner',
            email: 'owner@urp.local',
            isActive: true,
          }],
        }),
      }),
    } as any;

    const admin = await bootstrapPlatformAdmin(db, {
      PLATFORM_ADMIN_EMAIL: 'owner@urp.local',
      PLATFORM_ADMIN_PASSWORD: 'ChangeMe123!',
    } as any);

    expect(admin).toMatchObject({
      id: 'admin-1',
      email: 'owner@urp.local',
      name: 'System Owner',
      isActive: true,
    });
  });
});
