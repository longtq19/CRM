# Import nhân sự từ Excel

## Kiểm tra nhân sự đã có trong DB

- Vào **Nhân sự** trên CRM: nếu có danh sách thì DB đã có nhân sự.
- Hoặc gọi API `GET /api/hr/employees?limit=1`: nếu `data.length > 0` thì đã có.

## Nếu chưa có – thêm từ file Excel

1. **File mẫu**: Trong CRM vào **Nhân sự** (menu) và tải **Mẫu import** (hoặc gọi `GET /api/hr/employees/import-template`) để lấy file mẫu.

2. **Cột bắt buộc** trong Excel (tên cột tiếng Việt hoặc tiếng Anh):
   - **Họ và tên** (hoặc Full Name)
   - **Số điện thoại** (hoặc Phone)
   - **Email cá nhân** (hoặc Personal Email)
   - **Giới tính** (Nam / Nữ / Khác)
   - **Ngày sinh**
   - **Khối** (hoặc Division)
   - **Phòng ban** (hoặc Department)
   - **Chức danh** (hoặc Vị trí / Position)
   - **Loại hợp đồng** (hoặc Contract Type)
   - **Trạng thái** (hoặc Status)

3. **Import**: Vào **Nhân sự** > **Import** (hoặc gửi `POST /api/hr/employees/import` với form-data, field `file` = file Excel). Nếu bạn có file `Danh_sach_nhan_vien_2026-03-06.xlsx`, đảm bảo có đủ các cột trên (tên cột trùng hoặc map đúng theo tên trong code) rồi tải file đó lên.

4. **Lưu ý**: Nếu DB chưa chạy migration (chưa có cột `is_locked`, `session_invalidated_at`), cần chạy migration trước khi import (entrypoint baseline + migrate deploy). Sau khi có đủ cột, import mới chạy thành công.
