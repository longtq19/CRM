-- AlterTable
ALTER TABLE "wards" ADD COLUMN IF NOT EXISTS "vtp_district_id" INTEGER;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "warehouse_id" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "orders_warehouse_id_idx" ON "orders"("warehouse_id");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_warehouse_id_fkey'
  ) THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_warehouse_id_fkey"
      FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
