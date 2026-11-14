CREATE SEQUENCE IF NOT EXISTS support_ticket_number_seq;

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number varchar(32) NOT NULL UNIQUE,
  requester_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category varchar(40) NOT NULL CHECK (category IN (
    'account_access','payments_billing','orders_delivery','returns_refunds',
    'store_seller','trade_business','affiliate_commissions','technical_issue',
    'security_report','other'
  )),
  subject varchar(180) NOT NULL CHECK (length(trim(subject)) BETWEEN 4 AND 180),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 8000),
  priority varchar(12) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status varchar(24) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','waiting_for_user','resolved','closed')),
  assigned_to_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT NOW(),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
  author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 8000),
  visibility varchar(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','internal')),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(24) NOT NULL CHECK (event_type IN ('created','replied','internal_note','assigned','status_changed','priority_changed','reopened')),
  from_value varchar(80),
  to_value varchar(80),
  note varchar(1000),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_tickets_requester_updated_idx ON support_tickets (requester_user_id, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_tickets_queue_idx ON support_tickets (status, priority, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_tickets_assignee_idx ON support_tickets (assigned_to_user_id, status, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_messages_ticket_created_idx ON support_messages (ticket_id, created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_created_idx ON support_ticket_events (ticket_id, created_at DESC);
