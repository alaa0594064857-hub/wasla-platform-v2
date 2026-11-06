CREATE TABLE "sourcing_order_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "sourcing_orders"("id") ON DELETE RESTRICT,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" varchar(80) NOT NULL,
  "from_status" varchar(24),
  "to_status" varchar(24),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "sourcing_order_events_order_created_idx" ON "sourcing_order_events" ("order_id","created_at" DESC);
CREATE INDEX "sourcing_order_events_actor_created_idx" ON "sourcing_order_events" ("actor_user_id","created_at" DESC);
