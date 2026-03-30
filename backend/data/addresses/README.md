# Địa chỉ hành chính (JSON seed)

## Vì sao có thể trùng bản ghi trong DB

- **Hai nguồn VTP**: đồng bộ `source=both` nạp cả V3 (sau sáp nhập) và V2 (trước sáp nhập). Cùng một địa danh thực tế có thể có **hai `WARDS_ID` khác nhau** (hệ cũ qua huyện vs hệ mới gắn tỉnh).
- **Không unique theo tên**: bảng `wards` unique theo `id` (mã VTP), không theo `(province_id, tên)` — nên nhiều dòng cùng tên là có thể xảy ra.
- **Chuẩn hóa trước đây khác nhau**: ALL CAPS / Title Case / mixed làm tưởng là hai tên khác nhau nếu chưa chuẩn hóa thống nhất.
- **JSON tay / copy cũ**: file trong `Viettel Post API/` hoặc snapshot cũ trộn với dữ liệu mới.

- **File JSON** trong thư mục này (sau `export:address:vtp` hoặc `copy-address-json`): tên địa danh **Title Case** (mỗi từ viết hoa đầu, `vi-VN`) — dễ đọc, chuẩn bị sẵn cho seed.
- **Cột `name` trong PostgreSQL** sau khi seed / đồng bộ: luôn qua **`storageAdministrativeName`** (chữ thường `vi-VN`) để so khớp và gộp trùng nghĩa ổn định.

## Làm sạch và nạp lại (kịch bản khuyến nghị)

1. **Backup** (bắt buộc trước khi xóa danh mục): trong `backend/` chạy `npm run backup:db`.
2. **(Tuỳ chọn) Xóa JSON cũ** trong thư mục này (`provinces-*.json`, `districts-old.json`, `wards-*.json`) nếu muốn tránh nhầm bản snapshot tay; hoặc ghi đè bằng bước 3.
3. **Tạo lại JSON từ API Viettel Post** (không cần DB, chỉ cần `VTP_TOKEN`): `npm run export:address:vtp` — gọi V2+V3, ghi 5 file **Title Case**. Trên image đã build: `npm run export:address:vtp:prod`.
4. **Xóa toàn bộ địa chỉ trong DB** rồi nạp lại — chọn **một** hướng:
   - **Trực tiếp từ VTP:** API `POST /api/vtp/sync-address?clear=true&source=both` (JWT + `MANAGE_SYSTEM`) hoặc CLI `npm run sync:address:vtp -- --clear` (xóa rồi nạp từ API, không cần bước seed JSON).
   - **Từ JSON vừa xuất (bước 3):** chỉ xóa danh mục, **không** gọi lại VTP — sau backup: `npm run clear:address:db -- --yes` (container đã build: `npm run clear:address:db:prod -- --yes`), rồi `POST /api/address/seed-from-json?source=both` hoặc `npm run seed:address`. Tên trong file JSON (Title Case) được đưa về chữ thường khi ghi DB.
5. **(Tuỳ chọn) Gộp xã sau sáp nhập trùng nghĩa** (cùng tỉnh, `district_id` null, tên trùng sau chuẩn hóa): sau backup, `npm run dedupe:wards-direct`.

## Copy từ thư mục `Viettel Post API/` (máy dev)

Script `backend/scripts/copy-address-json.js` đọc export Postman/local và ghi vào đây; **tên địa danh Title Case** giống `export:address:vtp`. Ưu tiên nguồn trực tiếp API (`export:address:vtp`) để ID khớp VTP.
