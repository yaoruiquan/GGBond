-- USD credit fields must match wallet/redeem-code precision. Cash pay_amount
-- keeps the original payment-currency precision. Existing amounts are not revalued.
ALTER TABLE payment_orders
  ALTER COLUMN amount TYPE numeric(20,8),
  ALTER COLUMN bonus_amount TYPE numeric(20,8),
  ALTER COLUMN refund_amount TYPE numeric(20,8);
-- The Ent schema already uses eight decimals; ensure older databases agree.
ALTER TABLE redeem_codes ALTER COLUMN value TYPE numeric(20,8);
