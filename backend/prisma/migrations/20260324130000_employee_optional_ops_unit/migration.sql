-- Cho phép nhân viên chưa gán đơn vị / chức danh vận hành (HR tạo hồ sơ, Vận hành gán sau).
ALTER TABLE "employees" ALTER COLUMN "department_id" DROP NOT NULL;
ALTER TABLE "employees" ALTER COLUMN "position_id" DROP NOT NULL;
