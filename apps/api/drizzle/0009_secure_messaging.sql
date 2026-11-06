CREATE TABLE "message_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "participant_a_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "participant_b_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "message_conversations_distinct_participants" CHECK ("participant_a_id" < "participant_b_id"),
  CONSTRAINT "message_conversations_pair_unique" UNIQUE ("participant_a_id", "participant_b_id")
);
CREATE INDEX "message_conversations_participant_a_updated_idx" ON "message_conversations" ("participant_a_id", "updated_at" DESC);
CREATE INDEX "message_conversations_participant_b_updated_idx" ON "message_conversations" ("participant_b_id", "updated_at" DESC);

CREATE TABLE "messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "message_conversations"("id") ON DELETE CASCADE,
  "sender_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "body" varchar(5000) NOT NULL,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "messages_body_not_empty" CHECK (length(btrim("body")) > 0)
);
CREATE INDEX "messages_conversation_created_idx" ON "messages" ("conversation_id", "created_at" DESC);
CREATE INDEX "messages_unread_sender_idx" ON "messages" ("conversation_id", "sender_user_id", "read_at");
