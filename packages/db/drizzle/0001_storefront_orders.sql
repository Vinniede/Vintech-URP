CREATE TYPE payment_status AS ENUM ('unpaid', 'paid', 'failed', 'refunded');

CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  region text NOT NULL,
  is_default boolean NOT NULL DEFAULT false
);

ALTER TABLE orders ADD COLUMN delivery_address_id uuid REFERENCES customer_addresses(id);
ALTER TABLE orders ADD COLUMN subtotal numeric(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN payment_reference text;
ALTER TABLE orders ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE orders ALTER COLUMN payment_status DROP DEFAULT;
ALTER TABLE orders ALTER COLUMN payment_status TYPE payment_status USING CASE
  WHEN payment_status IN ('paid', 'refunded') THEN payment_status::payment_status
  ELSE 'unpaid'::payment_status
END;
ALTER TABLE orders ALTER COLUMN payment_status SET DEFAULT 'unpaid';
ALTER TABLE orders DROP COLUMN delivery_address;

CREATE TABLE order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status order_status NOT NULL,
  changed_by_user_id uuid REFERENCES users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY customer_addresses_tenant_isolation ON customer_addresses
  USING (EXISTS (SELECT 1 FROM customers WHERE customers.id = customer_addresses.customer_id AND customers.store_id = app_store_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM customers WHERE customers.id = customer_addresses.customer_id AND customers.store_id = app_store_id()));

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY order_status_history_tenant_isolation ON order_status_history
  USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());

CREATE UNIQUE INDEX products_store_id_idx ON products (store_id, id);

ALTER TABLE order_items ADD CONSTRAINT order_items_store_product_fk
  FOREIGN KEY (store_id, product_id) REFERENCES products(store_id, id);
