-- Add per-root counts for crop selections on customers
ALTER TABLE "customers"
ADD COLUMN IF NOT EXISTS "main_crops_root_counts" jsonb;

