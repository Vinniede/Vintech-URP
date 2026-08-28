CREATE TYPE payment_provider AS ENUM ('mpesa', 'bank', 'card');
CREATE TYPE payment_environment AS ENUM ('sandbox', 'production');
CREATE TYPE payment_transaction_status AS ENUM ('initiated', 'pending', 'confirmed', 'failed', 'cancelled');

CREATE TABLE store_payment_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  provider payment_provider NOT NULL,
  is_enabled boolean NOT NULL DEFAULT false,
  environment payment_environment NOT NULL DEFAULT 'sandbox',
  credentials_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_payment_configs_store_provider_unique UNIQUE (store_id, provider)
);

CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  sale_id uuid REFERENCES sales(id),
  order_id uuid REFERENCES orders(id),
  provider payment_provider NOT NULL,
  provider_reference text,
  status payment_transaction_status NOT NULL DEFAULT 'initiated',
  amount numeric(12, 2) NOT NULL,
  raw_callback_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_transactions_one_target CHECK ((sale_id IS NOT NULL) <> (order_id IS NOT NULL))
);

CREATE UNIQUE INDEX payment_transactions_provider_reference_idx ON payment_transactions (provider, provider_reference) WHERE provider_reference IS NOT NULL;

ALTER TABLE store_payment_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_payment_configs_tenant_isolation ON store_payment_configs USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_transactions_tenant_isolation ON payment_transactions USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());