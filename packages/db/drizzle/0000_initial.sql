CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE role AS ENUM ('owner', 'store_admin', 'inventory_clerk', 'cashier', 'supervisor', 'fulfillment');
CREATE TYPE unit_of_measure AS ENUM ('piece', 'kg', 'litre', 'box');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'other');
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'mobile_money';
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'split';
CREATE TYPE sale_status AS ENUM ('completed', 'voided', 'refunded');
CREATE TYPE shift_status AS ENUM ('open', 'closed');
CREATE TYPE approval_action_type AS ENUM ('void', 'refund', 'discount_override');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE order_status AS ENUM ('pending', 'paid', 'packed', 'shipped', 'ready_for_pickup', 'completed', 'cancelled');
CREATE TYPE fulfillment_type AS ENUM ('delivery', 'pickup');

CREATE TABLE stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  currency text NOT NULL DEFAULT 'USD',
  tax_rate numeric(8, 4) NOT NULL DEFAULT 0,
  pos_enabled boolean NOT NULL DEFAULT false,
  storefront_enabled boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  password_hash text,
  pin_hash text,
  role role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_store_email_unique UNIQUE (store_id, email)
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  name text NOT NULL,
  parent_category_id uuid REFERENCES categories(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT categories_store_name_unique UNIQUE (store_id, name)
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  sku text NOT NULL,
  barcode text,
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES categories(id),
  cost_price numeric(12, 2) NOT NULL DEFAULT 0,
  selling_price numeric(12, 2) NOT NULL,
  tax_rate numeric(8, 4) NOT NULL DEFAULT 0,
  unit_of_measure unit_of_measure NOT NULL DEFAULT 'piece',
  stock_quantity numeric(14, 3) NOT NULL DEFAULT 0,
  reorder_level numeric(14, 3) NOT NULL DEFAULT 0,
  published_online boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_store_sku_unique UNIQUE (store_id, sku),
  CONSTRAINT products_store_barcode_unique UNIQUE (store_id, barcode)
);

CREATE TABLE product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  cashier_id uuid NOT NULL REFERENCES users(id),
  opening_float numeric(12, 2) NOT NULL,
  closing_amount_expected numeric(12, 2),
  closing_amount_actual numeric(12, 2),
  discrepancy numeric(12, 2),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
  ,status shift_status NOT NULL DEFAULT 'open'
);

CREATE UNIQUE INDEX shifts_one_open_per_cashier_idx ON shifts (store_id, cashier_id) WHERE closed_at IS NULL;

CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  cashier_id uuid NOT NULL REFERENCES users(id),
  shift_id uuid REFERENCES shifts(id),
  total_amount numeric(12, 2) NOT NULL,
  payment_method payment_method NOT NULL,
  status sale_status NOT NULL DEFAULT 'completed',
  synced_at timestamptz,
  device_sale_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_store_device_sale_unique UNIQUE (store_id, device_sale_id)
);

CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(14, 3) NOT NULL,
  unit_price numeric(12, 2) NOT NULL,
  discount_amount numeric(12, 2) NOT NULL DEFAULT 0
);

CREATE TABLE pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  requested_by_user_id uuid NOT NULL REFERENCES users(id),
  action_type approval_action_type NOT NULL,
  target_sale_id uuid NOT NULL REFERENCES sales(id),
  reason text NOT NULL,
  threshold_exceeded_amount numeric(12, 2),
  status approval_status NOT NULL DEFAULT 'pending',
  approved_by_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_store_email_unique UNIQUE (store_id, email)
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  customer_id uuid NOT NULL REFERENCES customers(id),
  status order_status NOT NULL DEFAULT 'pending',
  fulfillment_type fulfillment_type NOT NULL,
  delivery_address text,
  delivery_fee numeric(12, 2) NOT NULL DEFAULT 0,
  total_amount numeric(12, 2) NOT NULL,
  payment_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  quantity numeric(14, 3) NOT NULL,
  unit_price numeric(12, 2) NOT NULL
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- The API sets this transaction-local value after authenticating a request.
CREATE OR REPLACE FUNCTION app_store_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.store_id', true), '')::uuid
$$;

ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY stores_tenant_isolation ON stores USING (id = app_store_id()) WITH CHECK (id = app_store_id());

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users', 'categories', 'products', 'shifts', 'sales', 'customers', 'orders', 'audit_logs', 'pending_approvals'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY %I_tenant_isolation ON %I USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id())', table_name, table_name);
  END LOOP;
END
$$;

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_images_tenant_isolation ON product_images USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());

ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY sale_items_tenant_isolation ON sale_items USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_items_tenant_isolation ON order_items USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());
