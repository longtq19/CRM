-- Bảng đếm phân nhánh luồng data theo khối cho (scope) — cân bằng tỉ lệ theo thời gian
CREATE TABLE "division_flow_routing_counters" (
    "id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "scope_division_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "assigned_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "division_flow_routing_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "division_flow_routing_counters_scope_division_id_kind_target_id_key" ON "division_flow_routing_counters"("scope_division_id", "kind", "target_id");

CREATE INDEX "division_flow_routing_counters_organization_id_idx" ON "division_flow_routing_counters"("organization_id");

CREATE INDEX "division_flow_routing_counters_scope_division_id_kind_idx" ON "division_flow_routing_counters"("scope_division_id", "kind");

ALTER TABLE "division_flow_routing_counters" ADD CONSTRAINT "division_flow_routing_counters_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "division_flow_routing_counters" ADD CONSTRAINT "division_flow_routing_counters_scope_division_id_fkey" FOREIGN KEY ("scope_division_id") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
