-- NONE | OLD | NEW — bộ mã tỉnh/huyện/xã website gửi khi nhận lead (khớp AddressType trên customer_addresses)
ALTER TABLE "marketing_campaigns" ADD COLUMN "public_lead_address_hierarchy" TEXT NOT NULL DEFAULT 'NONE';
