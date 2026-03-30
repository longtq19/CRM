-- AlterTable: Warehouse — thêm địa chỉ hành chính + thông tin liên hệ
ALTER TABLE "warehouses" ADD COLUMN "contact_name" TEXT;
ALTER TABLE "warehouses" ADD COLUMN "contact_phone" TEXT;
ALTER TABLE "warehouses" ADD COLUMN "detail_address" TEXT;
ALTER TABLE "warehouses" ADD COLUMN "province_id" TEXT;
ALTER TABLE "warehouses" ADD COLUMN "district_id" TEXT;
ALTER TABLE "warehouses" ADD COLUMN "ward_id" TEXT;

-- FK constraints
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "provinces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "districts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_ward_id_fkey" FOREIGN KEY ("ward_id") REFERENCES "wards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: MarketingCampaign — thêm accepted_fields cho API field selection
ALTER TABLE "marketing_campaigns" ADD COLUMN "accepted_fields" JSONB;
