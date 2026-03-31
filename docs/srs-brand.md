# SRS — Nhận diện thương hiệu (Brand) — HCRM

**Phiên bản tài liệu:** 1.0  
**Hệ thống:** HCRM (Kagri Tech CRM)  
**Phạm vi:** Giao diện người dùng web (SPA React), tài sản tĩnh và quy ước mã nguồn liên quan đến thương hiệu **Kagri Tech / Kagri**.

---

## 1. Giới thiệu

### 1.1. Mục đích

Mô tả **yêu cầu phần mềm** đối với việc áp dụng nhận diện thương hiệu trên ứng dụng CRM nội bộ: màu sắc, logo, văn bản slogan/tiêu đề, và quy tắc đồng nhất giao diện — để đồng bộ giữa phát triển, kiểm thử và vận hành.

### 1.2. Phạm vi trong / ngoài phạm vi

| Trong phạm vi | Ngoài phạm vi (phiên bản hiện tại) |
|---------------|-------------------------------------|
| Bảng màu thương hiệu và ánh xạ Tailwind | Trang quản trị “đổi màu logo theo từng khách hàng SaaS” (không có cấu hình brand trong DB) |
| Logo / favicon phục vụ SPA (`public/`) | In ấn, bộ nhận diện ngoài sản phẩm số |
| Tiêu đề trang, slogan trên màn đăng nhập | Thương hiệu pháp lý (đăng ký nhãn hiệu) |
| Component dùng màu brand (nút CTA, icon khối, …) | Email template / PDF (trừ khi module tương ứng gọi `getBrandColor`) |

### 1.3. Định nghĩa

| Thuật ngữ | Ý nghĩa |
|-----------|---------|
| **Palette** | Tập mã hex cố định trong `brandPalette` |
| **Primary** | Màu chủ đạo (CTA, liên kết, trạng thái tích cực) |
| **Secondary** | Màu chữ/ nền tối đi kèm primary |
| **Division** | Màu phụ trợ cho icon **khối** (DIVISION) trên cây tổ chức |

### 1.4. Tài liệu tham chiếu

- `README.md` — mục **2.2** (bản đồ mã nguồn: `brandColors.ts`, `tailwind.config.ts`).
- `frontend/src/constants/brandColors.ts`
- `frontend/tailwind.config.ts`
- `frontend/index.html` (title, favicon)
- `frontend/src/index.css` (body `text-secondary`, nút toolbar)

---

## 2. Mô tả tổng quan

HCRM là SPA React; nhận diện thương hiệu được **mã hóa tập trung** tại `brandColors.ts` và được Tailwind expose dưới dạng token màu (`primary`, `secondary`, `division`, …). Người dùng cuối **không** tự đổi bảng màu qua giao diện; mọi thay đổi brand là **thay đổi mã nguồn + build lại frontend**.

---

## 3. Các bên liên quan

| Vai trò | Nhu cầu |
|---------|---------|
| Người dùng nội bộ | Giao diện nhất quán, dễ nhận diện Kagri |
| Phát triển | Một nguồn sự thật cho hex; không nhân bản mã màu |
| Quản trị sản phẩm / Marketing | Đối chiếu SRS khi đổi nhận diện |

---

## 4. Yêu cầu chức năng

### 4.1. Bảng màu (FR-BRAND-01)

**Mô tả:** Hệ thống phải định nghĩa đủ các màu sau trong một object `brandPalette` (hoặc tương đương):

| Khóa | Mục đích sử dụng chính (hiện tại) |
|------|-----------------------------------|
| `primary` | Nút chính, focus ring, liên kết nhấn mạnh |
| `secondary` | Chữ body mặc định, tiêu đề phụ (kết hợp `@layer base` body) |
| `division` | Icon khối (Layers) trên module Vận hành — tím trầm, đồng bộ với secondary |
| `accent` | Nền nhấn nhẹ (ví dụ vùng highlight) |
| `support` | Màu hỗ trợ (cảnh báo nhẹ / nhấn phụ) |
| `success` | Trạng thái thành công |
| `warning` | Trạng thái cảnh báo |
| `error` | Trạng thái lỗi |

**Tiêu chí chấp nhận:**

- Mọi class Tailwind `bg-primary`, `text-primary`, `text-secondary`, `text-division`, … resolve đúng hex trong `brandPalette`.
- Có hàm `getBrandColor(key)` trả về chuỗi hex cho key hợp lệ (dùng chart, export, style động khi cần).

### 4.2. Không nhân đôi mã hex (FR-BRAND-02)

**Mô tả:** Không hard-code lại cùng một mã màu thương hiệu ở nhiều file tách rời; ưu tiên import `brandPalette` / `getBrandColor` hoặc class Tailwind map từ `tailwind.config.ts`.

**Tiêu chí chấp nhận:** Đổi một lần trong `brandColors.ts` (+ rebuild) cập nhật toàn bộ chỗ dùng token.

### 4.3. Logo và favicon (FR-BRAND-03)

**Mô tả:**

- Trang HTML gốc dùng favicon trỏ tới asset tĩnh (ví dụ `/plainLogo.png`).
- Màn hình đăng nhập hiển thị logo thương hiệu (ví dụ `/logo.png`) kèm slogan cố định phù hợp định vị nông nghiệp hiện đại.

**Tiêu chí chấp nhận:** File ảnh nằm trong thư mục public/build output; đường dẫn không phụ thuộc API.

### 4.4. Tiêu đề trình duyệt (FR-BRAND-04)

**Mô tả:** Thẻ `<title>` của `index.html` phản ánh thương hiệu Kagri và thông điệp ngắn (ví dụ *Chuẩn mới cho nông nghiệp hiện đại*).

**Tiêu chí chấp nhận:** Tab trình duyệt hiển thị đúng chuỗi đã cấu hình sau khi build.

### 4.5. Thành phần giao diện dùng brand (FR-BRAND-05)

**Mô tả:**

- Nút CTA thanh công cụ dùng lớp `btn-toolbar-primary` / alias `btn-primary` — gắn với màu `primary`.
- Body mặc định dùng `text-secondary` trên nền sáng (`bg-gray-50`).
- Bản đồ / marker tùy chọn dùng logo Kagri (`plainLogo.png`) làm icon — nhất quán nhận diện trên bản đồ nội bộ.

**Tiêu chí chấp nhận:** Không thay thế màu CTA chính bằng màu ngoài palette (trừ trường hợp ngoại lệ có ghi rõ trong code review).

### 4.6. Phân biệt icon cây tổ chức (FR-BRAND-06)

**Mô tả:** Icon tổ chức → `text-primary`; icon khối DIVISION → `text-division` (tím `#5b21b6` theo palette); icon đơn vị → neutral / theo pattern hiện có.

**Tiêu chí chấp nhận:** Người dùng phân biệt được cấp tổ chức / khối / đơn vị qua màu icon theo README mục cây Vận hành.

---

## 5. Yêu cầu phi chức năng

### 5.1. Bảo trì (NFR-BRAND-01)

Thay đổi palette hoặc logo phải được **ghi nhận trong commit** và cập nhật README nếu quy ước hiển thị thay đổi (theo quy tắc dự án).

### 5.2. Hiệu năng (NFR-BRAND-02)

Asset logo/favicon dạng PNG; kích thước hợp lý để không làm chậm LCP trên màn đăng nhập (tối ưu theo khuyến nghị frontend).

### 5.3. Khả năng tiếp cận (NFR-BRAND-03)

Nút và liên kết dùng màu primary phải duy trì độ tương phản đọc được với chữ trắng hoặc theo pattern hiện tại (`text-white` trên `bg-primary`).

---

## 6. Ràng buộc và giả định

1. **Đơn tenant nhận diện:** Một bộ brand cho một deployment; không có bảng `branding` trong PostgreSQL cho phiên bản này.
2. **JWT / API:** Không mang cấu hình màu sắc trong token; brand thuần **frontend + static files**.
3. **Analytics:** Script phân tích trên `index.html` thuộc miền `analytics.kagri.tech` — tách với logic brand UI nhưng cùng hệ sinh thái Kagri.

---

## 7. Ma trận truy vết (tóm tắt)

| ID yêu cầu | File / vị trí tham chiếu |
|------------|---------------------------|
| FR-BRAND-01, 02 | `frontend/src/constants/brandColors.ts`, `frontend/tailwind.config.ts` |
| FR-BRAND-03, 04 | `frontend/index.html`, `frontend/src/pages/Login.tsx` (logo/slogan) |
| FR-BRAND-05 | `frontend/src/index.css` |
| FR-BRAND-06 | `README.md` (mục cây Vận hành), component cây org |

---

## 8. Lịch sử sửa đổi

| Ngày | Phiên bản | Mô tả |
|------|-----------|--------|
| 2026-03-31 | 1.0 | Khởi tạo SRS theo codebase hiện tại |
