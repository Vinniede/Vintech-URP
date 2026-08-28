CREATE TYPE printer_transport AS ENUM ('bluetooth', 'network', 'usb', 'browser');

CREATE TABLE printer_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id),
  name text NOT NULL,
  transport printer_transport NOT NULL,
  connection_config jsonb NOT NULL DEFAULT '{}',
  auto_cut boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE printer_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY printer_profiles_tenant_isolation ON printer_profiles USING (store_id = app_store_id()) WITH CHECK (store_id = app_store_id());