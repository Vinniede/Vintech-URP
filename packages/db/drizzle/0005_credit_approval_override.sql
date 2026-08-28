ALTER TYPE approval_action_type ADD VALUE IF NOT EXISTS 'credit_limit_override';
ALTER TABLE pending_approvals ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';
ALTER TABLE pending_approvals ALTER COLUMN target_sale_id DROP NOT NULL;