CREATE TABLE IF NOT EXISTS trade_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  initiator_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  counterparty_account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  pending_response_account_id uuid REFERENCES accounts(id) ON DELETE RESTRICT,
  title varchar(180) NOT NULL,
  description text,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  proposed_amount numeric(14,2) CHECK (proposed_amount IS NULL OR proposed_amount >= 0),
  status varchar(24) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'proposed', 'negotiating', 'accepted', 'declined', 'cancelled', 'completed')),
  expires_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT trade_deals_distinct_accounts CHECK (initiator_account_id <> counterparty_account_id),
  CONSTRAINT trade_deals_pending_party CHECK (
    pending_response_account_id IS NULL
    OR pending_response_account_id IN (initiator_account_id, counterparty_account_id)
  )
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS trade_deal_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES trade_deals(id) ON DELETE CASCADE,
  title varchar(180) NOT NULL,
  description text,
  sku varchar(120),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price >= 0),
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS trade_deal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES trade_deals(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  event_type varchar(32) NOT NULL
    CHECK (event_type IN ('created', 'proposed', 'countered', 'accepted', 'declined', 'cancelled', 'completed')),
  from_status varchar(24),
  to_status varchar(24) NOT NULL,
  body text,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trade_deals_initiator_updated_idx ON trade_deals (initiator_account_id, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trade_deals_counterparty_updated_idx ON trade_deals (counterparty_account_id, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trade_deal_items_deal_idx ON trade_deal_items (deal_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS trade_deal_events_deal_idx ON trade_deal_events (deal_id, created_at DESC);
