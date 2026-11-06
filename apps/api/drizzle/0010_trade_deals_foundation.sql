CREATE TABLE "trade_deals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_number" varchar(32) NOT NULL UNIQUE,
  "sourcing_order_id" uuid NOT NULL UNIQUE REFERENCES "sourcing_orders"("id") ON DELETE RESTRICT,
  "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "supplier_account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "status" varchar(24) NOT NULL DEFAULT 'proposed',
  "terms_version" integer NOT NULL DEFAULT 1,
  "terms_snapshot" jsonb NOT NULL,
  "proposed_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "accepted_by_user_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
  "accepted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "trade_deals_version_check" CHECK ("terms_version" > 0),
  CONSTRAINT "trade_deals_status_check" CHECK ("status" IN ('proposed','agreed','in_progress','completed','cancelled','disputed'))
);
CREATE INDEX "trade_deals_buyer_status_created_idx" ON "trade_deals" ("buyer_user_id","status","created_at" DESC);
CREATE INDEX "trade_deals_supplier_status_created_idx" ON "trade_deals" ("supplier_account_id","status","created_at" DESC);

CREATE TABLE "trade_deal_amendments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "trade_deals"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL,
  "proposed_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "responded_by_user_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" varchar(16) NOT NULL DEFAULT 'proposed',
  "terms_snapshot" jsonb NOT NULL,
  "reason" varchar(1000),
  "responded_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "trade_deal_amendments_version_unique" UNIQUE ("deal_id","version"),
  CONSTRAINT "trade_deal_amendments_version_check" CHECK ("version" > 1),
  CONSTRAINT "trade_deal_amendments_status_check" CHECK ("status" IN ('proposed','accepted','rejected'))
);
CREATE INDEX "trade_deal_amendments_deal_created_idx" ON "trade_deal_amendments" ("deal_id","created_at" DESC);

CREATE TABLE "trade_deal_milestones" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "trade_deals"("id") ON DELETE RESTRICT,
  "title" varchar(180) NOT NULL,
  "description" varchar(2000),
  "due_at" timestamptz,
  "status" varchar(16) NOT NULL DEFAULT 'pending',
  "completed_by_user_id" uuid REFERENCES "users"("id") ON DELETE RESTRICT,
  "completed_at" timestamptz,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "trade_deal_milestones_status_check" CHECK ("status" IN ('pending','completed','cancelled'))
);
CREATE INDEX "trade_deal_milestones_deal_status_idx" ON "trade_deal_milestones" ("deal_id","status","due_at");

CREATE TABLE "trade_deal_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deal_id" uuid NOT NULL REFERENCES "trade_deals"("id") ON DELETE RESTRICT,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" varchar(80) NOT NULL,
  "from_status" varchar(24),
  "to_status" varchar(24),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "trade_deal_events_deal_created_idx" ON "trade_deal_events" ("deal_id","created_at" DESC);
