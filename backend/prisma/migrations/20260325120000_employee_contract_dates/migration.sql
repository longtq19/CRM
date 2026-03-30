-- Ngày hiệu lực / hết hạn hợp đồng trên hồ sơ nhân viên (tùy chọn).
ALTER TABLE "employees" ADD COLUMN "contract_effective_date" TIMESTAMP(3);
ALTER TABLE "employees" ADD COLUMN "contract_end_date" TIMESTAMP(3);
