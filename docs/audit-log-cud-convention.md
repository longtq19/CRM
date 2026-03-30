# Nhật ký hệ thống cho thao tác CUD

Quy ước dự án HCRM (đồng bộ với `.cursor/rules/audit-log-cud.mdc` trên máy dev).

Khi **thay đổi nghiệp vụ** dẫn tới thao tác **Create / Update / Delete** (API hoặc luồng ghi DB tương đương):

1. **Bắt buộc ghi nhật ký** vào `system_logs` qua `logAudit` (hoặc `logAction` trong `logController`), kèm `req` khi có để tránh trùng middleware và lưu IP/user-agent khi cần.
2. **`details`** phải **đọc được bằng tiếng Việt**.
3. **Cập nhật (Update)**: **`details` phải có so sánh trước–sau** — các dòng dạng *Đổi [nhãn trường] từ "giá trị cũ" sang "giá trị mới"*, hoặc helper tương đương (`describeChangesVi`, `describeCustomerAuditDiff`, pattern kho hàng…). Cần đọc bản ghi **trước** khi ghi DB.
4. **Tạo / Xóa**: mô tả rõ đối tượng và thông tin chính; có thể kèm `newValues` / `oldValues` JSON khi hữu ích.
5. Sau khi bổ sung chức năng: **cập nhật README** (mục audit / nghiệp vụ) nếu thay đổi quy ước hoặc phạm vi log.

**Tham chiếu:** `backend/src/utils/auditLog.ts`, `backend/src/utils/vietnameseAuditDiff.ts`, `backend/src/middleware/auditLogMiddleware.ts`, README mục **3.3. Audit log**.
