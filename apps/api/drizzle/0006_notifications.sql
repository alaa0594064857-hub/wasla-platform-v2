CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type varchar(64) NOT NULL CHECK (type IN ('account_invitation', 'message_received', 'product_inquiry', 'friend_request')),
  title_ar varchar(180) NOT NULL,
  title_en varchar(180) NOT NULL,
  body_ar text,
  body_en text,
  action_url varchar(500) NOT NULL,
  resource_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_action_path_check CHECK (left(action_url, 1) = '/' AND left(action_url, 2) <> '//')
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON notifications (user_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;
