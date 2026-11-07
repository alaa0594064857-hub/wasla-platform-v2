CREATE TABLE IF NOT EXISTS message_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_low uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  participant_high uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  participant_low_last_read_at timestamptz,
  participant_high_last_read_at timestamptz,
  CONSTRAINT message_conversations_distinct CHECK (participant_low < participant_high),
  CONSTRAINT message_conversations_pair_unique UNIQUE (participant_low, participant_high)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES message_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
ALTER TABLE message_conversations ADD COLUMN IF NOT EXISTS participant_low_last_read_at timestamptz;
--> statement-breakpoint
ALTER TABLE message_conversations ADD COLUMN IF NOT EXISTS participant_high_last_read_at timestamptz;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages (conversation_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS message_conversations_low_updated_idx ON message_conversations (participant_low, updated_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS message_conversations_high_updated_idx ON message_conversations (participant_high, updated_at DESC);
