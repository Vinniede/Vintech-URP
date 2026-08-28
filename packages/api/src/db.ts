import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '@urp/db/schema';

export const createDb = (databaseUrl: string) => drizzle(neon(databaseUrl), { schema });

export type Database = ReturnType<typeof createDb>;
