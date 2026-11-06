CREATE TABLE "sourcing_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "item_name" varchar(180) NOT NULL,
  "description" text,
  "specifications" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "quantity" integer NOT NULL,
  "unit" varchar(40) NOT NULL,
  "destination_country_code" varchar(2) NOT NULL,
  "destination_city" varchar(120) NOT NULL,
  "delivery_location_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "requested_currency" varchar(3),
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "idempotency_key" varchar(128) NOT NULL,
  "submitted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sourcing_requests_item_name_check" CHECK (length(trim("item_name")) > 0),
  CONSTRAINT "sourcing_requests_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "sourcing_requests_unit_check" CHECK (length(trim("unit")) > 0),
  CONSTRAINT "sourcing_requests_country_check" CHECK ("destination_country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "sourcing_requests_currency_check" CHECK ("requested_currency" IS NULL OR "requested_currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "sourcing_requests_status_check" CHECK ("status" IN ('draft','submitted','searching','offers_available','buyer_selected','fulfilled','cancelled','expired'))
);
CREATE UNIQUE INDEX "sourcing_requests_buyer_idempotency_unique" ON "sourcing_requests" ("buyer_user_id","idempotency_key");
CREATE INDEX "sourcing_requests_buyer_status_created_idx" ON "sourcing_requests" ("buyer_user_id","status","created_at" DESC);
CREATE INDEX "sourcing_requests_destination_status_idx" ON "sourcing_requests" ("destination_country_code","status","created_at" DESC);

CREATE TABLE "supplier_offers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "sourcing_requests"("id") ON DELETE RESTRICT,
  "supplier_account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "submitted_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "origin_country_code" varchar(2) NOT NULL,
  "offered_quantity" integer NOT NULL,
  "unit_price" numeric(14,4) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "shipping_amount" numeric(14,2) NOT NULL DEFAULT 0,
  "lead_time_days" integer,
  "availability_confirmed_at" timestamptz,
  "availability_valid_until" timestamptz,
  "quote_valid_until" timestamptz,
  "status" varchar(24) NOT NULL DEFAULT 'draft',
  "terms_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "supplier_offers_origin_country_check" CHECK ("origin_country_code" ~ '^[A-Z]{2}$'),
  CONSTRAINT "supplier_offers_quantity_check" CHECK ("offered_quantity" > 0),
  CONSTRAINT "supplier_offers_unit_price_check" CHECK ("unit_price" >= 0),
  CONSTRAINT "supplier_offers_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "supplier_offers_shipping_check" CHECK ("shipping_amount" >= 0),
  CONSTRAINT "supplier_offers_lead_time_check" CHECK ("lead_time_days" IS NULL OR "lead_time_days" >= 0),
  CONSTRAINT "supplier_offers_validity_check" CHECK ("availability_valid_until" IS NULL OR "availability_confirmed_at" IS NULL OR "availability_valid_until" > "availability_confirmed_at"),
  CONSTRAINT "supplier_offers_status_check" CHECK ("status" IN ('draft','submitted','availability_pending','available','unavailable','withdrawn','expired','accepted','rejected'))
);
CREATE INDEX "supplier_offers_request_status_created_idx" ON "supplier_offers" ("request_id","status","created_at");
CREATE INDEX "supplier_offers_supplier_created_idx" ON "supplier_offers" ("supplier_account_id","created_at" DESC);
CREATE UNIQUE INDEX "supplier_offers_one_accepted_per_request_unique" ON "supplier_offers" ("request_id") WHERE "status" = 'accepted';

CREATE TABLE "sourcing_request_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL REFERENCES "sourcing_requests"("id") ON DELETE RESTRICT,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "event_type" varchar(80) NOT NULL,
  "from_status" varchar(24),
  "to_status" varchar(24),
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "sourcing_request_events_request_created_idx" ON "sourcing_request_events" ("request_id","created_at" DESC);

CREATE TABLE "sourcing_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_number" varchar(32) NOT NULL UNIQUE,
  "request_id" uuid NOT NULL UNIQUE REFERENCES "sourcing_requests"("id") ON DELETE RESTRICT,
  "accepted_offer_id" uuid NOT NULL UNIQUE REFERENCES "supplier_offers"("id") ON DELETE RESTRICT,
  "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "supplier_account_id" uuid NOT NULL REFERENCES "accounts"("id") ON DELETE RESTRICT,
  "status" varchar(24) NOT NULL DEFAULT 'awaiting_payment',
  "currency" varchar(3) NOT NULL,
  "subtotal" numeric(14,2) NOT NULL,
  "shipping_total" numeric(14,2) NOT NULL DEFAULT 0,
  "grand_total" numeric(14,2) NOT NULL,
  "commercial_snapshot" jsonb NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "sourcing_orders_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "sourcing_orders_amounts_check" CHECK ("subtotal" >= 0 AND "shipping_total" >= 0 AND "grand_total" >= 0),
  CONSTRAINT "sourcing_orders_total_check" CHECK ("grand_total" = "subtotal" + "shipping_total"),
  CONSTRAINT "sourcing_orders_status_check" CHECK ("status" IN ('awaiting_payment','payment_pending','paid','fulfilment_pending','shipped','completed','cancelled'))
);
CREATE UNIQUE INDEX "sourcing_orders_buyer_idempotency_unique" ON "sourcing_orders" ("buyer_user_id","idempotency_key");
CREATE INDEX "sourcing_orders_supplier_status_created_idx" ON "sourcing_orders" ("supplier_account_id","status","created_at" DESC);
