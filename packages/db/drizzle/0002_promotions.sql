CREATE TYPE promotion_type AS ENUM ('percentage_discount', 'fixed_discount', 'buy_x_get_y', 'bundle_price');
CREATE TYPE promotion_applies_to AS ENUM ('all', 'category', 'specific_products');

CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  name text NOT NULL,
  type promotion_type NOT NULL,
  value numeric(12, 4) NOT NULL,
  applies_to promotion_applies_to NOT NULL,
  category_id uuid REFERENCES categories(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT promotions_valid_window CHECK (end_at > start_at),
  CONSTRAINT promotions_non_negative_value CHECK (value >= 0)
);

CREATE TABLE promotion_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  promotion_id uuid NOT NULL REFERENCES promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT promotion_products_unique UNIQUE (promotion_id, product_id)
);

ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
CREATE POLICY promotions_tenant_isolation ON promotions USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());

ALTER TABLE promotion_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY promotion_products_tenant_isolation ON promotion_products USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());