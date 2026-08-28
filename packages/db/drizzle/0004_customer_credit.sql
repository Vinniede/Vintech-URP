ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'credit';
CREATE TYPE customer_account_transaction_type AS ENUM ('charge', 'payment');

CREATE TABLE customer_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  name text NOT NULL,
  phone text NOT NULL,
  credit_limit numeric(12, 2) NOT NULL DEFAULT 0,
  balance numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_accounts_non_negative CHECK (credit_limit >= 0 AND balance >= 0)
);

CREATE TABLE customer_account_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  customer_account_id uuid NOT NULL REFERENCES customer_accounts(id),
  sale_id uuid REFERENCES sales(id),
  type customer_account_transaction_type NOT NULL,
  amount numeric(12, 2) NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_account_transactions_positive_amount CHECK (amount > 0)
);

ALTER TABLE customer_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_accounts_tenant_isolation ON customer_accounts USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());
ALTER TABLE customer_account_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_account_transactions_tenant_isolation ON customer_account_transactions USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());