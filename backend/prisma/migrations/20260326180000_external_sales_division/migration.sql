-- Khối đồng cấp có Sales khi khối hiện tại không có đơn vị Sales (nối luồng Marketing → Sales ngoài khối)
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "external_sales_division_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_external_sales_division_id_fkey'
  ) THEN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_external_sales_division_id_fkey"
      FOREIGN KEY ("external_sales_division_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "departments_external_sales_division_id_idx" ON "departments"("external_sales_division_id");
