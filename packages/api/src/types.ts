import type { AuthUser } from './auth.js';
import type { Database } from './db.js';
import type { Env } from './env.js';

export type AppEnv = {
  Bindings: Env;
  Variables: { db: Database; user: AuthUser };
};
