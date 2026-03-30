-- Tỉ lệ phân luồng Marketing→Sales, Sales→CSKH trong khối + khối CS ngoài khi không có CSKH nội bộ
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "data_flow_shares" JSONB;
ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "external_cs_division_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_external_cs_division_id_fkey'
  ) THEN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_external_cs_division_id_fkey"
      FOREIGN KEY ("external_cs_division_id") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "departments_external_cs_division_id_idx" ON "departments"("external_cs_division_id");
