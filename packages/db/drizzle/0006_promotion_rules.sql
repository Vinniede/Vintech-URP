ALTER TABLE promotions ADD COLUMN buy_quantity numeric(14, 3);
ALTER TABLE promotions ADD COLUMN get_quantity numeric(14, 3);
ALTER TABLE promotions ADD COLUMN get_discount_percentage numeric(6, 2);
ALTER TABLE promotions ADD COLUMN bundle_quantity numeric(14, 3);
ALTER TABLE promotions ADD COLUMN bundle_total_price numeric(12, 2);

ALTER TABLE promotions ADD CONSTRAINT promotions_rule_values_valid CHECK (
  (type <> 'buy_x_get_y' OR (buy_quantity > 0 AND get_quantity > 0 AND get_discount_percentage BETWEEN 0 AND 100))
  AND (type <> 'bundle_price' OR (bundle_quantity > 0 AND bundle_total_price >= 0))
);