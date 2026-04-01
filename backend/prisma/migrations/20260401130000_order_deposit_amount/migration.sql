-- Tiền khách đã cọc (trừ khỏi tiền thu hộ COD khi đẩy Viettel Post)
ALTER TABLE "orders" ADD COLUMN "deposit_amount" DECIMAL(15,2) NOT NULL DEFAULT 0;
