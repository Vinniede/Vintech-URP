CREATE TYPE "billing_plan" AS ENUM ('pos_only', 'storefront_only', 'bundled');
CREATE TYPE "billing_cycle" AS ENUM ('monthly', 'annual');
CREATE TYPE "invoice_status" AS ENUM ('pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE "invoice_payment_attempt_status" AS ENUM ('initiated', 'confirmed', 'failed');

CREATE TABLE "platform_payment_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "provider" "payment_provider" NOT NULL,
  "credentials_encrypted" text NOT NULL,
  "environment" "payment_environment" DEFAULT 'sandbox' NOT NULL,
  "is_active" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX "platform_payment_config_provider_idx" ON "platform_payment_config" USING btree ("provider");

CREATE TABLE "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL,
  "plan" "billing_plan" NOT NULL,
  "billing_cycle" "billing_cycle" NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL,
  "status" "invoice_status" DEFAULT 'pending' NOT NULL,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "due_date" timestamptz NOT NULL,
  "paid_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "stores"("id");

CREATE TABLE "invoice_payment_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "invoice_id" uuid NOT NULL,
  "provider" "payment_provider" NOT NULL,
  "provider_reference" text,
  "status" "invoice_payment_attempt_status" DEFAULT 'initiated' NOT NULL,
  "raw_callback_payload" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE "invoice_payment_attempts" ADD CONSTRAINT "invoice_payment_attempts_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE cascade;
CREATE UNIQUE INDEX "invoice_payment_attempts_provider_reference_idx" ON "invoice_payment_attempts" USING btree ("provider_reference");
