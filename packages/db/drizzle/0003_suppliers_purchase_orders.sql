CREATE TYPE purchase_order_status AS ENUM ('draft', 'ordered', 'partially_received', 'received', 'cancelled');

CREATE TABLE suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  name text NOT NULL,
  contact_phone text,
  contact_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  supplier_id uuid NOT NULL REFERENCES suppliers(id),
  status purchase_order_status NOT NULL DEFAULT 'draft',
  created_by_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz
);

CREATE TABLE purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  purchase_order_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity_ordered numeric(14, 3) NOT NULL,
  quantity_received numeric(14, 3) NOT NULL DEFAULT 0,
  unit_cost numeric(12, 2) NOT NULL
);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_tenant_isolation ON suppliers USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_orders_tenant_isolation ON purchase_orders USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY purchase_order_items_tenant_isolation ON purchase_order_items USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());