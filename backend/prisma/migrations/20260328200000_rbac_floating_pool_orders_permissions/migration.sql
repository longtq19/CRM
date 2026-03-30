-- Đổi mã quyền xem kho: VIEW_DATA_POOL -> VIEW_FLOATING_POOL (giữ nguyên id để không mất gán nhóm quyền)
UPDATE "permissions"
SET "code" = 'VIEW_FLOATING_POOL',
    "name" = 'Xem kho số thả nổi',
    "description" = 'Quyền xem danh sách kho số thả nổi'
WHERE "code" = 'VIEW_DATA_POOL';

UPDATE "permissions"
SET "name" = 'Quản lý kho số thả nổi',
    "description" = COALESCE("description", '')
WHERE "code" = 'MANAGE_DATA_POOL';

UPDATE "permissions"
SET "name" = 'Cấu hình kho số thả nổi'
WHERE "code" = 'DATA_POOL_CONFIG';

-- Quyền mới (bổ sung catalog)
INSERT INTO "permissions" ("id", "code", "name", "description", "created_at", "updated_at")
SELECT gen_random_uuid(), 'DISTRIBUTE_FLOATING_CROSS_ORG', 'Phân kho thả nổi ra mọi khối/đơn vị', 'Phân khách từ kho thả nổi tới bất kỳ đơn vị hoặc nhân viên trong hệ thống', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'DISTRIBUTE_FLOATING_CROSS_ORG');

INSERT INTO "permissions" ("id", "code", "name", "description", "created_at", "updated_at")
SELECT gen_random_uuid(), 'VIEW_ALL_COMPANY_ORDERS', 'Xem toàn bộ đơn hàng công ty', 'Bỏ lọc phạm vi cây — xem mọi đơn', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'VIEW_ALL_COMPANY_ORDERS');

INSERT INTO "permissions" ("id", "code", "name", "description", "created_at", "updated_at")
SELECT gen_random_uuid(), 'VIEW_ALL_COMPANY_CUSTOMERS', 'Xem toàn bộ khách hàng công ty', 'Bỏ lọc phạm vi — xem khách toàn công ty trong Sales/CSKH/Danh sách KH', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'VIEW_ALL_COMPANY_CUSTOMERS');

INSERT INTO "permissions" ("id", "code", "name", "description", "created_at", "updated_at")
SELECT gen_random_uuid(), 'CREATE_ORDER', 'Tạo đơn hàng (của bản thân)', 'Tạo đơn gán nhân viên là chính mình — tách khỏi sửa đơn', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'CREATE_ORDER');
