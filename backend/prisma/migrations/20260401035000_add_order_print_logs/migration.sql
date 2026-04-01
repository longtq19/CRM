-- CreateTable
CREATE TABLE "order_print_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "order_date" TIMESTAMP(3) NOT NULL,
    "employee_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_print_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_print_logs_order_id_order_date_idx" ON "order_print_logs"("order_id", "order_date");

-- CreateIndex
CREATE INDEX "order_print_logs_employee_id_idx" ON "order_print_logs"("employee_id");

-- AddForeignKey
ALTER TABLE "order_print_logs" ADD CONSTRAINT "order_print_logs_order_id_order_date_fkey" FOREIGN KEY ("order_id", "order_date") REFERENCES "orders"("id", "order_date") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_print_logs" ADD CONSTRAINT "order_print_logs_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
