CREATE TABLE IF NOT EXISTS "store_products" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "store_id" uuid NOT NULL,
  "title" varchar(180) NOT NULL,
  "description" text,
  "sku" varchar(80),
  "price" numeric(12,2) NOT NULL,
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "stock_quantity" integer DEFAULT 0 NOT NULL,
  "image_url" text,
  "video_url" text,
  "status" varchar(16) DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_products_store_id_fkey' AND conrelid = 'store_products'::regclass) THEN
    ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_id_fkey"
      FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_products_store_sku_unique' AND conrelid = 'store_products'::regclass) THEN
    ALTER TABLE "store_products" ADD CONSTRAINT "store_products_store_sku_unique" UNIQUE ("store_id", "sku");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_products_price_check' AND conrelid = 'store_products'::regclass) THEN
    ALTER TABLE "store_products" ADD CONSTRAINT "store_products_price_check" CHECK ("price" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_products_stock_quantity_check' AND conrelid = 'store_products'::regclass) THEN
    ALTER TABLE "store_products" ADD CONSTRAINT "store_products_stock_quantity_check" CHECK ("stock_quantity" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'store_products_status_check' AND conrelid = 'store_products'::regclass) THEN
    ALTER TABLE "store_products" ADD CONSTRAINT "store_products_status_check" CHECK ("status" IN ('draft', 'active', 'archived'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "store_products_store_status_created_idx"
  ON "store_products" ("store_id", "status", "created_at" DESC);
