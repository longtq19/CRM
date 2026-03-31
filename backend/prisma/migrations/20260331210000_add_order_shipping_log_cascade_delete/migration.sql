-- DropForeignKey
ALTER TABLE "order_shipping_logs" DROP CONSTRAINT "order_shipping_logs_order_id_order_date_fkey";

-- AddForeignKey
ALTER TABLE "order_shipping_logs" ADD CONSTRAINT "order_shipping_logs_order_id_order_date_fkey" FOREIGN KEY ("order_id", "order_date") REFERENCES "orders"("id", "order_date") ON DELETE CASCADE ON UPDATE CASCADE;
