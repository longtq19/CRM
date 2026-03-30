-- Product combo relation: one combo product contains many component products.
CREATE TABLE "product_combo_items" (
  "id" TEXT NOT NULL,
  "combo_product_id" TEXT NOT NULL,
  "component_product_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "product_combo_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_combo_items_combo_product_id_component_product_id_key"
  ON "product_combo_items"("combo_product_id", "component_product_id");

CREATE INDEX "product_combo_items_component_product_id_idx"
  ON "product_combo_items"("component_product_id");

ALTER TABLE "product_combo_items"
  ADD CONSTRAINT "product_combo_items_combo_product_id_fkey"
  FOREIGN KEY ("combo_product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "product_combo_items"
  ADD CONSTRAINT "product_combo_items_component_product_id_fkey"
  FOREIGN KEY ("component_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
