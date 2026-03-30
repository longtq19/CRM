# ViettelPost API Collection - Hướng dẫn sử dụng

**Lưu ý:** File JSON trong thư mục này có thể là snapshot tay (Postman). **Khuyến nghị** tạo bản chuẩn trong `backend/data/addresses/` bằng `npm run export:address:vtp` (trong `backend/`, cần `VTP_TOKEN` trong `.env`) — gọi trực tiếp API V2+V3 theo đúng endpoint trong collection Postman (`listProvinceById` / `listDistrict` / `listWards` và `listProvinceNew` / `listWardsNew`). Tên địa danh trong file JSON được chuẩn **Title Case** (mỗi từ viết hoa đầu, locale `vi-VN`, hàm `jsonExportTitleCaseAdministrativeName` trong code). Khi **nạp vào PostgreSQL**, `seed-from-json` / sync vẫn đưa tên về **chữ thường** (`storageAdministrativeName`) để đồng nhất và tránh trùng do VTP trả ALL CAPS. Nếu copy từ file Postman trong thư mục này: `node backend/scripts/copy-address-json.js` (từ gốc repo) chuẩn hóa tên giống export; sau đó `POST /api/address/seed-from-json?source=new|old|both`. **Xóa toàn bộ địa chỉ trong DB trước khi nạp lại:** bắt buộc **backup** (`npm run backup:db` trong `backend/`), rồi `POST /api/vtp/sync-address?clear=true&source=both` (JWT + `MANAGE_SYSTEM`) hoặc CLI `npm run sync:address:vtp -- --clear`. Chi tiết: `backend/data/addresses/README.md`.

## Địa chỉ hành chính: trước và sau sáp nhập

Hai **loại danh mục** tương ứng API Viettel Post và file JSON trong thư mục `Viettel Post API/`:

| Loại | Cấu trúc | API Viettel Post | File JSON (góc repo `Viettel Post API/`) | Sau khi copy → `backend/data/addresses/` |
|------|-----------|------------------|-------------------------------------------|------------------------------------------|
| **Trước sáp nhập** | Tỉnh → **Huyện** → Xã | **V2**: `GET /v2/categories/listProvinceById`, `listDistrict`, `listWards` | `Provinces-Old.json` *(khuyến nghị)* hoặc fallback `Provinces.json`; `District-Old.json`; `Wards-Old.json` | `provinces-old.json`, `districts-old.json`, `wards-old.json` |
| **Sau sáp nhập** | Tỉnh → Xã (không cấp huyện) | **V3**: `GET /v3/categories/listProvinceNew`, `listWardsNew` | `Provinces.json`; `Wards.json` (mỗi xã có `PROVINCE_ID`) | `provinces-new.json`, `wards-new.json` |

**Nạp vào database HCRM:** bảng `provinces`, `districts`, `wards` — sau khi có đủ file trong `backend/data/addresses/`, gọi API (quyền `MANAGE_SYSTEM`):

- `POST /api/address/seed-from-json?source=old` — chỉ bộ **trước sáp nhập**
- `POST /api/address/seed-from-json?source=new` — chỉ bộ **sau sáp nhập**
- `POST /api/address/seed-from-json?source=both` — cả hai (mặc định trong code nếu không truyền)

Hoặc đồng bộ trực tiếp từ VTP: `POST /api/vtp/sync-address` (auth + quyền `MANAGE_SYSTEM`; query `source=new|old|both`, `clear=true` để xóa danh mục và gỡ FK khách trước khi nạp — **cần backup DB**). CLI: dev — `npm run sync:address:vtp -- --clear`; **container production** — `npm run sync:address:vtp:prod -- --clear` (tại `/app/backend`, không dùng `ts-node`).

## Tổng quan

Bộ sưu tập Postman Collection đầy đủ cho việc tích hợp API ViettelPost TMĐT.

### Môi trường

| Môi trường | URL |
|------------|-----|
| Production | https://partner.viettelpost.vn |
| Development | https://partnerdev.viettelpost.vn |

## Cài đặt

### Bước 1: Import Collection
1. Mở Postman
2. Click **Import** → Chọn file `ViettelPost_API_Collection.postman_collection.json`

### Bước 2: Import Environment
1. Click **Import** → Chọn file `ViettelPost_Environment.postman_environment.json`
2. Chọn Environment **ViettelPost Environment** từ dropdown góc phải

### Bước 3: Cấu hình
1. Click icon **Environment** → **Edit**
2. Điền các giá trị:
   - `username`: Số điện thoại đăng ký trên viettelpost.vn
   - `password`: Mật khẩu tài khoản

## Danh sách API

### 1. Danh mục địa danh

| API | Method | Endpoint | Mô tả |
|-----|--------|----------|-------|
| Lấy Tỉnh/TP (V2) | GET | `/v2/categories/listProvinceById` | Lấy danh sách tỉnh/thành phố |
| Lấy Quận/Huyện (V2) | GET | `/v2/categories/listDistrict` | Lấy danh sách quận/huyện |
| Lấy Phường/Xã (V2) | GET | `/v2/categories/listWards` | Lấy danh sách phường/xã |
| Lấy Tỉnh/TP (V3) | GET | `/v3/categories/listProvinceNew` | Danh mục mới sau sáp nhập |
| Lấy Phường/Xã (V3) | GET | `/v3/categories/listWardsNew` | Danh mục mới sau sáp nhập |

### 2. Xác thực Token

| API | Method | Endpoint | Mô tả |
|-----|--------|----------|-------|
| Đăng nhập | POST | `/v2/user/Login` | Lấy token tạm |
| Lấy token dài hạn | POST | `/v2/user/ownerconnect` | Token có hiệu lực 1-2 năm |
| Token ủy quyền | POST | `/v2/user/ownerconnect` | Cho đơn vị thành viên |
| Token từ VTP Secret | POST | `/v2/user/LoginVTP` | Từ tham số bí mật |

#### Hướng dẫn lấy Token

**Cách 1: Đăng nhập API (token tạm → token dài hạn)**

1. **Lấy token tạm:**  
   `POST {{base_url}}/v2/user/Login`  
   Body (JSON): `{"USERNAME": "số điện thoại đăng ký", "PASSWORD": "mật khẩu"}`  
   Response: `data.token` — dùng làm token tạm.

2. **Đổi sang token dài hạn (1–2 năm):**  
   `POST {{base_url}}/v2/user/ownerconnect`  
   Header: `Token: <token tạm từ bước 1>`  
   Body: `{"USERNAME": "...", "PASSWORD": "..."}`  
   Response: `data.token` — token dài hạn, ghi vào `VTP_TOKEN` trong HCRM.

**Cách 2: Token bí mật từ website Viettel Post**

1. Đăng nhập https://viettelpost.vn  
2. Vào **Cấu hình tài khoản**: https://viettelpost.vn/cau-hinh-tai-khoan  
3. Chọn **Thêm mới token** → tạo token → xác thực OTP.  
4. Sao chép token (chuỗi bí mật).  
5. Đổi sang token API:  
   `POST {{base_url}}/v2/user/LoginVTP`  
   Body: `{"token": "chuỗi bí mật vừa tạo"}`  
   Response: `data.token` — token dùng cho API, ghi vào `VTP_TOKEN` trong HCRM.

Trong HCRM, cấu hình `VTP_TOKEN` trong file `.env` (backend) hoặc biến môi trường trên Dokploy.

### 3. Dịch vụ & Tính cước

| API | Method | Endpoint | Mô tả |
|-----|--------|----------|-------|
| Lấy dịch vụ (ID) | POST | `/v2/order/getPriceAll` | Theo ID địa danh |
| Lấy dịch vụ (NLP) | POST | `/v2/order/getPriceAllNlp` | Theo địa chỉ chi tiết |
| Tính cước (ID) | POST | `/v2/order/getPrice` | Theo ID địa danh |
| Tính cước (NLP) | POST | `/v2/order/getPriceNlp` | Theo địa chỉ chi tiết |

### 4. Đơn hàng

| API | Method | Endpoint | Mô tả |
|-----|--------|----------|-------|
| Tạo đơn (NLP) | POST | `/v2/order/createOrderNlp` | Địa chỉ chi tiết |
| Tạo đơn (ID) | POST | `/v2/order/createOrder` | ID địa danh |
| Sửa đơn | POST | `/v2/order/edit` | Cập nhật thông tin |
| Cập nhật trạng thái | POST | `/v2/order/UpdateOrder` | Duyệt/Hủy/Hoàn |
| Lấy mã in | POST | `/v2/order/printing-code` | Lấy link in vận đơn |

## Luồng tích hợp cơ bản

```
1. Đăng nhập lấy token
   └── POST /v2/user/Login
   └── POST /v2/user/ownerconnect (lấy token dài hạn)

2. Lấy danh mục địa danh
   └── GET /v2/categories/listProvinceById
   └── GET /v2/categories/listDistrict
   └── GET /v2/categories/listWards

3. Lấy dịch vụ phù hợp
   └── POST /v2/order/getPriceAll (hoặc getPriceAllNlp)

4. Tính cước (tùy chọn)
   └── POST /v2/order/getPrice (hoặc getPriceNlp)

5. Tạo đơn hàng
   └── POST /v2/order/createOrder (hoặc createOrderNlp)

6. Theo dõi đơn hàng
   └── Webhook callback từ VTP
   └── POST /v2/order/UpdateOrder (cập nhật trạng thái)

7. In vận đơn
   └── POST /v2/order/printing-code
```

## Mã dịch vụ phổ biến

| Mã | Tên dịch vụ |
|----|-------------|
| VCN | Chuyển phát nhanh |
| VCBO | Chuyển phát thường |
| VHT | Vận chuyển hàng hóa |
| PHS | Nội tỉnh tiết kiệm |

## Dịch vụ cộng thêm

| Mã | Tên dịch vụ |
|----|-------------|
| GBP | Báo phát |
| XMG | Thu tiền xem hàng |
| GGD | Giao tại điểm giao dịch |
| PTTX | Xác thực người nhận |

## Loại thanh toán (ORDER_PAYMENT)

| Giá trị | Mô tả |
|---------|-------|
| 1 | Không thu hộ |
| 2 | Thu hộ tiền hàng và tiền cước |
| 3 | Thu hộ tiền hàng, không thu hộ tiền cước |
| 4 | Thu hộ tiền cước, không thu hộ tiền hàng |

## Trạng thái đơn hàng

### Trạng thái chính

| Mã | Tên | Mô tả |
|----|-----|-------|
| 101 | VTP từ chối nhận | ViettelPost từ chối nhận đơn hàng |
| 102 | Đơn hàng chờ xử lý | Đơn hàng chờ xử lý |
| 103 | Giao cho bưu cục | Bưu cục tiếp nhận đơn hàng |
| 104 | Giao cho Bưu tá đi nhận | Đã phân công bưu tá đi nhận |
| 105 | Bưu Tá đã nhận hàng | Bưu Tá đã nhận hàng thành công |
| 107 | Đối tác yêu cầu hủy | Đối tác yêu cầu hủy qua API |
| 200 | Nhận từ bưu tá | VTP đã nhận hàng và nhập doanh thành công |
| 201 | Hủy nhập phiếu gửi | Hủy nhập phiếu gửi |
| 300 | Khai thác đi | Đóng tải |
| 400 | Khai thác đến | Bàn giao hoặc nhận bàn giao |
| 500 | Giao bưu tá đi phát | Phân công bưu tá đi giao hàng |
| 501 | Phát thành công | ✅ Thành công |
| 502 | Chuyển hoàn bưu cục gốc | Chuyển hoàn bưu cục gốc |
| 503 | Hủy theo yêu cầu KH | ❌ Hủy theo yêu cầu khách hàng |
| 504 | Hoàn thành công | ✅ Chuyển hoàn lại cho người gửi |
| 505 | Phát thất bại - Yêu cầu hoàn | Thông báo chuyển hoàn |
| 506 | Phát thất bại | Khách hẹn giao lại |
| 507 | KH đến bưu cục nhận | Khách hàng đến bưu cục nhận |
| 508 | Phát tiếp | Đơn vị yêu cầu phát tiếp |
| 515 | Duyệt hoàn | Bưu cục phát duyệt hoàn |
| 550 | Phát tiếp | Khách hàng yêu cầu phát tiếp |

### Trạng thái cuối (không phát sinh thêm)
- 101, 107, 201, 501, 503, 504

## Webhook

### Cấu hình
1. Truy cập https://partner.viettelpost.vn
2. Vào **Cấu hình tài khoản** → **Thông tin nhận hành trình**
3. Điền URL endpoint và Secret key
4. Gửi checklist go-live cho VTP để duyệt

### Lưu ý quan trọng
- Trả HTTP 200 khi xử lý thành công
- VTP retry 5 lần nếu không thành công
- Hành trình có thể bị trùng hoặc thừa → bypass với HTTP 200
- Ảnh báo phát lưu trữ 6 tháng

## Bảng lỗi phổ biến

| Message | Mô tả |
|---------|-------|
| Header Token is required | Thiếu Token trong header |
| Token invalid | Token sai hoặc hết hạn |
| Invalid owner account or password | Sai tài khoản/mật khẩu |
| Order does not exist | Mã đơn hàng không tồn tại |
| Incorrect data: ORDER_SERVICE | Mã dịch vụ không hợp lệ |
| Incorrect data: ORDER_PAYMENT | Hình thức thanh toán không hợp lệ |
| Price does not apply to this itinerary | Dịch vụ không khả dụng cho tuyến đường |

## Hỗ trợ

- Website: https://viettelpost.vn
- Hotline: 1900 8095
