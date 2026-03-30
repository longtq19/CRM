-- Thêm quy cách đóng gói cấp sản phẩm (mọi loại); đồng bộ từ product_bios.pack_type nếu có.
ALTER TABLE "products" ADD COLUMN "packaging_spec" VARCHAR(500);

UPDATE "products" p
SET "packaging_spec" = LEFT(pb.pack_type, 500)
FROM "product_bios" pb
WHERE pb.product_id = p.id
  AND pb.pack_type IS NOT NULL
  AND TRIM(pb.pack_type) <> ''
  AND (p.packaging_spec IS NULL OR TRIM(p.packaging_spec) = '');
