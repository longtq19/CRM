-- AlterTable
ALTER TABLE "customers" ADD COLUMN "phone_secondary" TEXT;

-- Unique non-null phone_secondary (PostgreSQL allows multiple NULLs on UNIQUE)
CREATE UNIQUE INDEX "customers_phone_secondary_key" ON "customers"("phone_secondary");

-- AlterTable
ALTER TABLE "customer_interactions" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'USER_NOTE';
ALTER TABLE "customer_interactions" ADD COLUMN "detail" TEXT;
ALTER TABLE "customer_interactions" ADD COLUMN "processing_status_at_time" TEXT;

CREATE INDEX "customer_interactions_kind_idx" ON "customer_interactions"("kind");

-- CreateTable
CREATE TABLE "customer_marketing_contributors" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "first_contributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_marketing_contributors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_marketing_contributors_customer_id_employee_id_key" ON "customer_marketing_contributors"("customer_id", "employee_id");
CREATE INDEX "customer_marketing_contributors_customer_id_idx" ON "customer_marketing_contributors"("customer_id");
CREATE INDEX "customer_marketing_contributors_employee_id_idx" ON "customer_marketing_contributors"("employee_id");

ALTER TABLE "customer_marketing_contributors" ADD CONSTRAINT "customer_marketing_contributors_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_marketing_contributors" ADD CONSTRAINT "customer_marketing_contributors_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "customers_phone_secondary_idx" ON "customers"("phone_secondary");

-- Backfill: NV marketing người tạo bản ghi (role MARKETING)
INSERT INTO "customer_marketing_contributors" ("id", "customer_id", "employee_id", "first_contributed_at")
SELECT gen_random_uuid()::text, "id", "created_by_id", "created_at"
FROM "customers"
WHERE "created_by_id" IS NOT NULL AND "created_by_role" = 'MARKETING'
ON CONFLICT ("customer_id", "employee_id") DO NOTHING;

-- Backfill: chủ attribution marketing (nếu khác người đã có)
INSERT INTO "customer_marketing_contributors" ("id", "customer_id", "employee_id", "first_contributed_at")
SELECT gen_random_uuid()::text, "id", "marketing_owner_id", COALESCE("joined_date", "created_at")
FROM "customers"
WHERE "marketing_owner_id" IS NOT NULL
ON CONFLICT ("customer_id", "employee_id") DO NOTHING;
