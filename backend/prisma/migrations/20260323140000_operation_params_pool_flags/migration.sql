-- Tham số vận hành: mở rộng luồng CSKH ↔ Sales và gia hạn attribution marketing theo khách (VIP)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "marketing_attribution_extra_days" INTEGER;

ALTER TABLE "data_pool" ADD COLUMN IF NOT EXISTS "awaiting_sales_after_cskh" BOOLEAN NOT NULL DEFAULT false;
