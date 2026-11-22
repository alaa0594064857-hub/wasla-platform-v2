ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IN (
    'account_access',
    'account_deletion',
    'payments_billing',
    'orders_delivery',
    'returns_refunds',
    'store_seller',
    'trade_business',
    'affiliate_commissions',
    'technical_issue',
    'security_report',
    'other'
  ));
