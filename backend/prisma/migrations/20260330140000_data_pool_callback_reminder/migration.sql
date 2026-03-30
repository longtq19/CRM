-- Hẹn gọi lại + nhắc thông báo (data_pool)
ALTER TABLE "data_pool" ADD COLUMN "callback_at" TIMESTAMP(3);
ALTER TABLE "data_pool" ADD COLUMN "callback_notify_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "data_pool" ADD COLUMN "callback_notify_minutes_before" INTEGER;
ALTER TABLE "data_pool" ADD COLUMN "callback_reminder_sent_at" TIMESTAMP(3);
CREATE INDEX "data_pool_callback_at_callback_notify_enabled_idx" ON "data_pool"("callback_at", "callback_notify_enabled");
