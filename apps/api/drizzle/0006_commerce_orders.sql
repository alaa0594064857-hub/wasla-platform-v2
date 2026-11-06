CREATE TYPE "order_status" AS ENUM ('placed', 'accepted', 'processing', 'shipped', 'completed', 'cancelled');

CREATE TABLE "orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_number" varchar(32) NOT NULL UNIQUE,
  "buyer_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE RESTRICT,
  "status" "order_status" DEFAULT 'placed' NOT NULL,
  "currency" varchar(3) NOT NULL,
  "subtotal" numeric(14,2) NOT NULL,
  "discount_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "shipping_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "tax_total" numeric(14,2) DEFAULT 0 NOT NULL,
  "grand_total" numeric(14,2) NOT NULL,
  "shipping_address_snapshot" jsonb NOT NULL,
  "buyer_note" varchar(1000),
  "idempotency_key" varchar(128) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cancelled_at" timestamp with time zone,
  CONSTRAINT "orders_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "orders_amounts_nonnegative_check" CHECK ("subtotal" >= 0 AND "discount_total" >= 0 AND "shipping_total" >= 0 AND "tax_total" >= 0 AND "grand_total" >= 0),
  CONSTRAINT "orders_total_consistency_check" CHECK ("grand_total" = "subtotal" - "discount_total" + "shipping_total" + "tax_total")
);
CREATE UNIQUE INDEX "orders_buyer_idempotency_unique" ON "orders" ("buyer_user_id", "idempotency_key");
CREATE INDEX "orders_buyer_created_idx" ON "orders" ("buyer_user_id", "created_at" DESC);
CREATE INDEX "orders_store_status_created_idx" ON "orders" ("store_id", "status", "created_at" DESC);

CREATE TABLE "order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "product_id" uuid REFERENCES "store_products"("id") ON DELETE SET NULL,
  "product_title_snapshot" varchar(180) NOT NULL,
  "sku_snapshot" varchar(80),
  "unit_price_snapshot" numeric(12,2) NOT NULL,
  "quantity" integer NOT NULL,
  "line_subtotal" numeric(14,2) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_items_amounts_check" CHECK ("unit_price_snapshot" >= 0 AND "line_subtotal" >= 0),
  CONSTRAINT "order_items_line_total_check" CHECK ("line_subtotal" = "unit_price_snapshot" * "quantity")
);
CREATE INDEX "order_items_order_idx" ON "order_items" ("order_id");

CREATE TABLE "order_status_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id") ON DELETE RESTRICT,
  "previous_status" "order_status",
  "new_status" "order_status" NOT NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reason" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX "order_status_history_order_created_idx" ON "order_status_history" ("order_id", "created_at" DESC);
