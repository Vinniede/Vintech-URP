# Unified Retail Platform

Phase 1 monorepo scaffold for the multi-tenant POS and storefront platform.

## Workspace

- `packages/db`: Drizzle schema and tenant-isolated PostgreSQL migrations
- `packages/shared-types`: shared domain enums and API contracts
- `packages/api`: reserved for the Cloudflare Workers API
- `apps/*`: reserved for the admin, cashier, and storefront applications

## Database commands

Copy `.env.example` to `.env`, set `DATABASE_URL`, then run:

```sh
pnpm install
pnpm db:generate
pnpm db:migrate
```

`pnpm db:generate` and `drizzle-kit check` validate repository migration files; they do not prove that a remote database is current. After loading `.env`, verify live alignment by running `pnpm db:migrate`, then confirm the expected migration count and schema through the target database connection. The migration command is the apply step, not a dry-run check.

The API must set `app.store_id` for every authenticated request before querying tenant data. The migration's RLS policies use that setting as the database-level tenant boundary.

For deployed Workers, set `PAYMENT_CREDENTIALS_KEY` with `wrangler secret put PAYMENT_CREDENTIALS_KEY`. Never commit the encryption key or payment credentials.
