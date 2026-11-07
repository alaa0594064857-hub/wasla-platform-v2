ALTER TABLE message_conversations ADD COLUMN IF NOT EXISTS participant_low_last_read_at timestamptz;
--> statement-breakpoint
ALTER TABLE message_conversations ADD COLUMN IF NOT EXISTS participant_high_last_read_at timestamptz;
