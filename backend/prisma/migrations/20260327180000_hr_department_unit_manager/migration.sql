-- Quản lý bộ phận HR (duyệt nghỉ phép theo danh mục bộ phận)
ALTER TABLE "hr_department_units" ADD COLUMN "manager_id" TEXT;

CREATE INDEX "hr_department_units_manager_id_idx" ON "hr_department_units"("manager_id");

ALTER TABLE "hr_department_units" ADD CONSTRAINT "hr_department_units_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
