-- Thêm chức năng đơn vị: ghi nhận doanh thu theo khoảng dữ liệu (OrgFunc).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'OrgFunc' AND e.enumlabel = 'REV_DATA_BEFORE_20250701'
  ) THEN
    ALTER TYPE "OrgFunc" ADD VALUE 'REV_DATA_BEFORE_20250701';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'OrgFunc' AND e.enumlabel = 'REV_DATA_RANGE_20250701_20260131'
  ) THEN
    ALTER TYPE "OrgFunc" ADD VALUE 'REV_DATA_RANGE_20250701_20260131';
  END IF;
END $$;
