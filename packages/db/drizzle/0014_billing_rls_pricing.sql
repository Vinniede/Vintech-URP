ALTER TABLE stores ADD COLUMN billing_plan billing_plan NOT NULL DEFAULT 'pos_only';
ALTER TABLE stores ADD COLUMN billing_cycle billing_cycle NOT NULL DEFAULT 'monthly';

CREATE TABLE plan_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan billing_plan NOT NULL,
  billing_cycle billing_cycle NOT NULL,
  amount numeric(12, 2) NOT NULL,
  currency text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plan_pricing (plan, billing_cycle, amount, currency, effective_from) VALUES
  ('pos_only', 'monthly', 1000.00, 'KES', now()),
  ('pos_only', 'annual', 10000.00, 'KES', now()),
  ('storefront_only', 'monthly', 1500.00, 'KES', now()),
  ('storefront_only', 'annual', 15000.00, 'KES', now()),
  ('bundled', 'monthly', 2200.00, 'KES', now()),
  ('bundled', 'annual', 22000.00, 'KES', now());

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoices_tenant_isolation ON invoices
  USING (store_id = app_store_id())
  WITH CHECK (store_id = app_store_id());

ALTER TABLE invoice_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY invoice_payment_attempts_tenant_isolation ON invoice_payment_attempts
  USING (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payment_attempts.invoice_id AND invoices.store_id = app_store_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM invoices WHERE invoices.id = invoice_payment_attempts.invoice_id AND invoices.store_id = app_store_id()));

ALTER TABLE plan_pricing ENABLE ROW LEVEL SECURITY;
CREATE POLICY plan_pricing_read_only ON plan_pricing FOR SELECT USING (true);
