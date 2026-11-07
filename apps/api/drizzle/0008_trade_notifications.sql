ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
--> statement-breakpoint
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('account_invitation', 'message_received', 'product_inquiry', 'friend_request', 'trade_deal'));
