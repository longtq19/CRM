-- Đa tổ chức: bảng organizations + organization_id trên departments; mã đơn vị unique theo (organization_id, code).

CREATE TABLE IF NOT EXISTS "organizations" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_code_key" ON "organizations"("code");

ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_code_key";

ALTER TABLE "departments" ADD COLUMN IF NOT EXISTS "organization_id" TEXT;

INSERT INTO "organizations" ("id", "code", "name", "sort_order", "created_at", "updated_at")
SELECT gen_random_uuid()::text, 'KAGRI', 'KAGRI', 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "organizations" WHERE "code" = 'KAGRI');

UPDATE "departments" d
SET "organization_id" = (SELECT o.id FROM "organizations" o WHERE o.code = 'KAGRI' LIMIT 1)
WHERE d."organization_id" IS NULL;

ALTER TABLE "departments" ALTER COLUMN "organization_id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'departments_organization_id_fkey'
  ) THEN
    ALTER TABLE "departments"
      ADD CONSTRAINT "departments_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "departments_organization_id_code_key" ON "departments"("organization_id", "code");
CREATE INDEX IF NOT EXISTS "departments_organization_id_idx" ON "departments"("organization_id");
