-- Tách kho Sales (SALES_OPEN) và kho thả nổi (FLOATING)
ALTER TABLE "data_pool" ADD COLUMN "pool_queue" TEXT NOT NULL DEFAULT 'SALES_OPEN';

CREATE INDEX "data_pool_pool_queue_idx" ON "data_pool"("pool_queue");

-- Lead đang AVAILABLE + đã có mã xử lý (trả số theo luồng trạng thái) → kho thả nổi
UPDATE "data_pool"
SET "pool_queue" = 'FLOATING'
WHERE "status" = 'AVAILABLE'
  AND "pool_type" = 'SALES'
  AND "processing_status" IS NOT NULL;
