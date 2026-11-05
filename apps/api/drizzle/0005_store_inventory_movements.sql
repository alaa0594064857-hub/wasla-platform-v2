CREATE TABLE IF NOT EXISTS "store_inventory_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "product_id" uuid NOT NULL REFERENCES "store_products"("id") ON DELETE CASCADE,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "movement_type" varchar(16) NOT NULL,
  "quantity_delta" integer NOT NULL,
  "quantity_before" integer NOT NULL,
  "quantity_after" integer NOT NULL,
  "reason" varchar(500) NOT NULL,
  "reference_code" varchar(120),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "store_inventory_movements_type_check" CHECK ("movement_type" IN ('inbound', 'outbound', 'adjustment')),
  CONSTRAINT "store_inventory_movements_delta_check" CHECK ("quantity_delta" <> 0),
  CONSTRAINT "store_inventory_movements_before_check" CHECK ("quantity_before" >= 0),
  CONSTRAINT "store_inventory_movements_after_check" CHECK ("quantity_after" >= 0),
  CONSTRAINT "store_inventory_movements_balance_check" CHECK ("quantity_after" - "quantity_before" = "quantity_delta"),
  CONSTRAINT "store_inventory_movements_direction_check" CHECK (
    ("movement_type" = 'inbound' AND "quantity_delta" > 0) OR
    ("movement_type" = 'outbound' AND "quantity_delta" < 0) OR
    "movement_type" = 'adjustment'
  )
);
CREATE INDEX IF NOT EXISTS "store_inventory_movements_store_created_idx"
  ON "store_inventory_movements" ("store_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "store_inventory_movements_product_created_idx"
  ON "store_inventory_movements" ("product_id", "created_at" DESC);
