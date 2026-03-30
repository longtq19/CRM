-- Chỉ tiêu xử lý vận đơn theo ngày + theo dõi từ chối (PENDING)
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_declined_by_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_declined_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "orders_shipping_declined_by_id_idx" ON "orders"("shipping_declined_by_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_shipping_declined_by_id_fkey'
  ) THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_declined_by_id_fkey"
      FOREIGN KEY ("shipping_declined_by_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "shipping_daily_quotas" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "target_count" INTEGER NOT NULL,
    "assigned_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_daily_quotas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "shipping_daily_quotas_employee_id_work_date_key" ON "shipping_daily_quotas"("employee_id", "work_date");
CREATE INDEX IF NOT EXISTS "shipping_daily_quotas_work_date_idx" ON "shipping_daily_quotas"("work_date");
CREATE INDEX IF NOT EXISTS "shipping_daily_quotas_assigned_by_id_idx" ON "shipping_daily_quotas"("assigned_by_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipping_daily_quotas_employee_id_fkey'
  ) THEN
    ALTER TABLE "shipping_daily_quotas" ADD CONSTRAINT "shipping_daily_quotas_employee_id_fkey"
      FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shipping_daily_quotas_assigned_by_id_fkey'
  ) THEN
    ALTER TABLE "shipping_daily_quotas" ADD CONSTRAINT "shipping_daily_quotas_assigned_by_id_fkey"
      FOREIGN KEY ("assigned_by_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
