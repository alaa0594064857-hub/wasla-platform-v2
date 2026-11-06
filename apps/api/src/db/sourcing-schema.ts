import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { accounts, users } from "./schema.js";

export const sourcingRequests = pgTable("sourcing_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  buyerUserId: uuid("buyer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  itemName: varchar("item_name", { length: 180 }).notNull(),
  description: text("description"),
  specifications: jsonb("specifications").$type<Record<string, unknown>>().notNull().default({}),
  quantity: integer("quantity").notNull(),
  unit: varchar("unit", { length: 40 }).notNull(),
  destinationCountryCode: varchar("destination_country_code", { length: 2 }).notNull(),
  destinationCity: varchar("destination_city", { length: 120 }).notNull(),
  deliveryLocationSnapshot: jsonb("delivery_location_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  requestedCurrency: varchar("requested_currency", { length: 3 }),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("sourcing_requests_buyer_idempotency_unique").on(t.buyerUserId, t.idempotencyKey),
  index("sourcing_requests_buyer_status_created_idx").on(t.buyerUserId, t.status, t.createdAt.desc()),
  index("sourcing_requests_destination_status_idx").on(t.destinationCountryCode, t.status, t.createdAt.desc()),
  check("sourcing_requests_quantity_check", sql`${t.quantity} > 0`),
  check("sourcing_requests_country_check", sql`${t.destinationCountryCode} ~ '^[A-Z]{2}$'`),
  check("sourcing_requests_status_check", sql`${t.status} IN ('draft','submitted','searching','offers_available','buyer_selected','fulfilled','cancelled','expired')`),
]);

export const supplierOffers = pgTable("supplier_offers", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => sourcingRequests.id, { onDelete: "restrict" }),
  supplierAccountId: uuid("supplier_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  originCountryCode: varchar("origin_country_code", { length: 2 }).notNull(),
  offeredQuantity: integer("offered_quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 14, scale: 4 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull(),
  shippingAmount: numeric("shipping_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  leadTimeDays: integer("lead_time_days"),
  availabilityConfirmedAt: timestamp("availability_confirmed_at", { withTimezone: true }),
  availabilityValidUntil: timestamp("availability_valid_until", { withTimezone: true }),
  quoteValidUntil: timestamp("quote_valid_until", { withTimezone: true }),
  status: varchar("status", { length: 24 }).notNull().default("draft"),
  termsSnapshot: jsonb("terms_snapshot").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("supplier_offers_request_status_created_idx").on(t.requestId, t.status, t.createdAt),
  index("supplier_offers_supplier_created_idx").on(t.supplierAccountId, t.createdAt.desc()),
  uniqueIndex("supplier_offers_one_accepted_per_request_unique").on(t.requestId).where(sql`${t.status} = 'accepted'`),
  check("supplier_offers_quantity_check", sql`${t.offeredQuantity} > 0`),
  check("supplier_offers_unit_price_check", sql`${t.unitPrice} >= 0`),
  check("supplier_offers_shipping_check", sql`${t.shippingAmount} >= 0`),
  check("supplier_offers_status_check", sql`${t.status} IN ('draft','submitted','availability_pending','available','unavailable','withdrawn','expired','accepted','rejected')`),
]);

export const sourcingRequestEvents = pgTable("sourcing_request_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  requestId: uuid("request_id").notNull().references(() => sourcingRequests.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: varchar("event_type", { length: 80 }).notNull(),
  fromStatus: varchar("from_status", { length: 24 }),
  toStatus: varchar("to_status", { length: 24 }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("sourcing_request_events_request_created_idx").on(t.requestId, t.createdAt.desc()),
]);

export const sourcingOrders = pgTable("sourcing_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: varchar("order_number", { length: 32 }).notNull().unique(),
  requestId: uuid("request_id").notNull().unique().references(() => sourcingRequests.id, { onDelete: "restrict" }),
  acceptedOfferId: uuid("accepted_offer_id").notNull().unique().references(() => supplierOffers.id, { onDelete: "restrict" }),
  buyerUserId: uuid("buyer_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  supplierAccountId: uuid("supplier_account_id").notNull().references(() => accounts.id, { onDelete: "restrict" }),
  status: varchar("status", { length: 24 }).notNull().default("awaiting_payment"),
  currency: varchar("currency", { length: 3 }).notNull(),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull(),
  shippingTotal: numeric("shipping_total", { precision: 14, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull(),
  commercialSnapshot: jsonb("commercial_snapshot").$type<Record<string, unknown>>().notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("sourcing_orders_buyer_idempotency_unique").on(t.buyerUserId, t.idempotencyKey),
  index("sourcing_orders_supplier_status_created_idx").on(t.supplierAccountId, t.status, t.createdAt.desc()),
  check("sourcing_orders_total_check", sql`${t.grandTotal} = ${t.subtotal} + ${t.shippingTotal}`),
  check("sourcing_orders_status_check", sql`${t.status} IN ('awaiting_payment','payment_pending','paid','fulfilment_pending','shipped','completed','cancelled')`),
]);
