# HCRM (Kagri Tech CRM) - README

Tài liệu này mô tả tổng quan dự án, luồng vận hành hệ thống và nghiệp vụ theo từng chức năng chính.

## 1. Vị trí file README

**Kho mã nguồn (Git):** `https://github.com/longtq19/CRM.git`

File tài liệu chính của repo nằm tại **thư mục gốc dự án**: `README.md` (cùng cấp với `backend/` và `frontend/`).

### 1.1. Giao diện Responsive (Mobile Friendly):
- **Bảng dữ liệu:** Sử dụng utility class `.responsive-table-container` (trong `index.css`) bọc ngoài các thẻ `<table>` để hỗ trợ cuộn ngang mượt mà trên mobile mà không phá vỡ layout.
- **Modal:** Các modal phức tạp (như chi tiết đơn hàng, chi tiết khách hàng) được cấu hình full-screen trên mobile (`w-full h-[90vh] rounded-t-xl`) và trở lại kích thước chuẩn trên desktop (`max-w-* rounded-xl`).
- **Sidebar:** Sidebar danh mục (ở module Sản phẩm) tự động ẩn trên mobile để tối ưu không gian hiển thị danh sách.

### 1.2. Quy tắc đọc và cập nhật README (nghiệp vụ & phát triển)

- **Trước** khi làm bất kỳ yêu cầu thay đổi nghiệp vụ, luật hệ thống, luồng dùng hoặc cấu hình: **đọc README** (ít nhất các mục liên quan) để khớp với mô tả hiện tại và tránh mâu thuẫn tài liệu.
- **Sau** khi hoàn tất thay đổi đó: **cập nhật README** (thêm / sửa / xóa đoạn tương ứng) để tài liệu gốc luôn phản ánh hành vi thật của hệ thống. Không để code đã đổi mà README còn mô tả cũ.
- **Database — thao tác có rủi ro mất / ghi đè dữ liệu** (migration, script xóa hoặc sửa hàng loạt, import upsert trùng mã, v.v.): **bắt buộc backup trước** (trong `backend/`: `npm run backup:db` → file `backend/backups/hcrm_full_<timestamp>.dump`). **Restore** (`pg_restore` từ file đó) **chỉ khi cần hoàn tác hoặc khôi phục** — không restore sau mỗi lần chạy thành công nếu muốn giữ dữ liệu vừa ghi. Chi tiết cách nghĩ về hoàn tác: mục **Khôi phục cấu trúc tổ chức KAGRI** (bước `pg_restore`, cẩn trọng `--clean`).
- **Deploy production (Dokploy):** môi trường server hiện dùng **Dokploy**; trên dashboard, **application** tên **`app`** (dùng để mở đúng service, shell container, biến môi trường). Chi tiết Dockerfile, `DATABASE_URL`, lệnh trong container (`WORKDIR` `/app/backend`): mục **5.5.1**.
- **Khi có thay đổi schema / migration:** sau khi cập nhật code, trên môi trường deploy cần chạy các lệnh **Prisma an toàn** (ưu tiên **`npx prisma migrate deploy`** trong thư mục `backend/`, **sau backup** khi thao tác có rủi ro) — xem **5.5.1** và bảng mã nguồn (Prisma). Trợ lý phát triển (AI) theo quy ước dự án sẽ **nhắc** thực hiện các bước này khi thay đổi liên quan DB.

## 2. Tổng quan kiến trúc

HCRM gồm 2 phần:

1. Backend: `backend/`
   - Node.js + Express
   - Prisma (PostgreSQL)
   - Socket.IO realtime (nhận sự kiện lead/notification/order)
   - Web Push (thông báo khi app chạy nền / màn hình khóa)
   - Cron jobs (tự thu hồi lead, nhắc hạn, reset marketing attribution)
   - Tích hợp Viettel Post (địa chỉ, tạo đơn vận chuyển, webhook cập nhật trạng thái)
2. Frontend: `frontend/`
   - React + Vite (SPA)
   - Giao tiếp backend qua REST API (`/api/...`) và Socket.IO

Các điểm vào chính:

- Backend server: `backend/src/server.ts`
- Backend app/route mount: `backend/src/app.ts` + `backend/src/routes/api.ts`
- Socket.IO: `backend/src/socket.ts`
- Cron: `backend/src/cron/leadDistribution.ts` (và một số cron khác)
- Viettel Post webhook: `backend/src/routes/webhookRoutes.ts` + `backend/src/controllers/viettelPostWebhookController.ts`
- Auth/permission: `backend/src/middleware/authMiddleware.ts`

### 2.1. Index PostgreSQL (bảng tải cao)

Các bảng **nhật ký hệ thống** (`system_logs`), **khách hàng** (`customers`), **đơn hàng** (`orders`), **chi phí chiến dịch** (`marketing_campaign_costs`), **tương tác CSKH** (`customer_interactions`) có thêm index btree/GiN trong `backend/prisma/schema.prisma` bám theo các filter/sort thực tế trong controller (ví dụ: `customers` sort `updatedAt`, OR `createdById`, lọc `mainCrops`; `orders` theo `shippingStatus` + `orderDate`; `marketing_campaign_costs` theo `campaignId` + `costDate`). `customers` còn có `main_crops_root_counts` để lưu số gốc cho các cây tính theo gốc (FE/BE validate bắt buộc khi chọn các cây này).

- Sau khi kéo schema mới: chạy `npx prisma db push` hoặc tạo migration tương đương trên môi trường deploy để PostgreSQL tạo index (trên bảng lớn, tạo index có thể khóa ghi ngắn — nên thực hiện giờ thấp tải).
- **Kiểm tra nhanh:** từ thư mục `backend/`, sau `db push` chạy `npm run db:smoke` (kết nối DB + đếm `customers`, kiểm tra có index GIN `main_crops`).
- **Windows:** nếu `prisma generate` báo `EPERM` khi rename `query_engine-windows.dll.node`, tắt process đang giữ file (dev server, antivirus quét `node_modules`), rồi chạy lại `npx prisma generate`. `db push` vẫn có thể đồng bộ DB thành công khi generate lỗi — nên xử lý generate để client và engine khớp phiên bản schema.
- **Sửa kèm:** báo cáo chi phí `getCostReport` dùng đúng trường `costDate` (trước đó lọc nhầm `date` nên không khớp schema).

### 2.2. Bản đồ mã nguồn (đọc và sửa code nhanh)

| Muốn làm gì | Nơi bắt đầu |
|-------------|-------------|
| Thêm/sửa API REST | `backend/src/routes/api.ts` (xem route đã `router.use` nhánh nào) → file `backend/src/routes/*Routes.ts` tương ứng → `backend/src/controllers/*Controller.ts` |
| Schema DB / model | `backend/prisma/schema.prisma` → `npx prisma generate` (trong `backend/`) |
| Auth JWT, cookie, `checkPermission` | `backend/src/middleware/authMiddleware.ts` |
| Mã quyền theo nhóm API (policy, không gán theo mã vai trò trong code) | `backend/src/config/routePermissionPolicy.ts` — `SYSTEM_MODULE_PATH_ACCESS_PERMISSIONS` đồng bộ với `frontend/src/constants/routePermissionPolicy.ts` (vào `/system` khi có quyền nghiệp vụ dù chưa gắn menu) |
| Catalog quyền (tên, mô tả tooltip, upsert DB) | `backend/src/constants/permissionsCatalog.ts` — `DEFAULT_PERMISSIONS`; khởi động backend qua `ensureDefaultPermissionsCatalog` trong `authController.ts` |
| Phạm vi xem khách (view scope) | `backend/src/utils/viewScopeHelper.ts` và các controller khách hàng / data pool |
| Cron lead / pool | `backend/src/cron/leadDistribution.ts`, cấu hình số trong `system_configs` (mục 3.6) |
| Webhook Viettel Post (public) | `backend/src/app.ts` mount `/api/webhook` → `backend/src/routes/webhookRoutes.ts` |
| Socket.IO | `backend/src/socket.ts`, `backend/src/server.ts` |
| Route SPA, lazy load trang | `frontend/src/App.tsx` |
| Màu thương hiệu (hex + Tailwind) | `frontend/src/constants/brandColors.ts` (`brandPalette`, `getBrandColor`) — `tailwind.config.ts` import palette làm `colors.primary`, `secondary`, `division` (tím icon khối), … — **SRS nhận diện thương hiệu:** `docs/srs-brand.md` |
| Ảnh đại diện fallback (ui-avatars, **cùng tên → cùng ảnh** mọi máy) | `frontend/src/utils/uiAvatar.ts` — `getUiAvatarFallbackUrl`: màu nền suy ra từ chuỗi tên (hash), **không** dùng `background=random` của dịch vụ (tham số đó khiến mỗi lần tải có thể khác nhau). |
| Ảnh đại diện đã upload (một file / nhân viên, mọi máy thấy bản mới nhất) | Upload `POST /api/hr/employees/upload-avatar` gửi kèm `employeeId` (khi đã có id) → middleware lưu **`uploads/avatars/<employeeId>.jpg`** (ghi đè). `PATCH /api/hr/employees/:id/avatar` xóa file cũ khi đổi đường dẫn. Phục vụ tĩnh `/uploads/avatars` dùng **Cache-Control: no-cache** (không cache 7 ngày như asset khác). **Frontend:** sau khi đổi ảnh thành công, giao diện thêm tham số `?t=` / `?v=` lên URL hiển thị (cùng đường dẫn DB) để trình duyệt không giữ ảnh bitmap cũ khi URL không đổi. |
| Ảnh / file upload khác (sản phẩm, kho, chat, …) | DB lưu **`/uploads/...`**; backend phục vụ thư mục `uploads/` tại cùng origin. FE: `frontend/src/utils/assetsUrl.ts` — **`resolveUploadUrl`** nối origin của API (`VITE_API_URL`) với đường dẫn khi SPA và backend khác host. |
| Mã chức năng đơn vị lá (`OrgFunc`) | `backend/src/constants/orgUnitFunctions.ts` + `frontend/src/constants/orgUnitFunctions.ts` (đồng bộ với `schema.prisma` enum `OrgFunc`) |
| Sidebar / menu từ API | `frontend/src/components/Sidebar.tsx` (nhãn từ DB, không map cứng ở FE) |
| Gọi API, cookie, lỗi mạng | `frontend/src/api/client.ts` |
| Định dạng ngày/giờ hiển thị (dd/MM/yyyy, …) | `frontend/src/utils/format.ts` — `formatDate`, `formatDateTime`, `formatDateTimeSeconds`, `formatMonthYear`, `formatDateWeekday` (date-fns + locale `vi`) |
| `hasPermission`, phiên đăng nhập | `frontend/src/context/useAuthStore.ts` + `frontend/src/constants/rbac.ts` (`hasExecutiveReportUiAccess` cho báo cáo điều hành theo `VIEW_REPORTS` / `VIEW_PERFORMANCE`; `hasModuleEffectivenessAccess` cho tab báo cáo hiệu quả Sales/CSKH: `VIEW_SALES_EFFECTIVENESS` / `VIEW_CSKH_EFFECTIVENESS` hoặc `VIEW_PERFORMANCE` / `VIEW_REPORTS`) |
| Chặn route theo quyền | `frontend/src/components/PermissionRoute.tsx` — vào `/sales` khi có menu Sales **hoặc** đồng thời `MANAGE_MARKETING_GROUPS` và `MANAGE_SALES` (quản lý marketing cần xem kho Sales chưa phân; xem `SALES_MODULE_PATH_ACCESS_PERMISSIONS` trong `routePermissionPolicy.ts`). |
| RBAC full API (chỉ quản trị hệ thống) | Backend: `isTechnicalAdminRoleCode` + `userHasCatalogPermission` trong `backend/src/constants/rbac.ts`. Frontend: `isTechnicalAdminRole`. Không bypass theo `crm_administrator` / `BOD` — chỉ qua permission trên JWT. `FULL_ACCESS` vẫn được `checkPermission` chấp nhận. |
| Script bảo trì / migrate dữ liệu một lần | Thư mục `backend/scripts/` (chạy từ `backend/` với `npx ts-node scripts/<file>.ts` hoặc `node` tùy file; đọc đầu file để biết mục đích). Ví dụ xóa một khối (DIVISION) và cây đơn vị con: `npx ts-node scripts/delete-division-subtree.ts "TÊN_KHỐI"`; nếu còn nhân viên trong cây, thêm `--move-employees` để gán tạm sang đơn vị DEPARTMENT/TEAM khác cùng tổ chức (kèm chức vụ đầu tiên tìm được ở đơn vị đó). **Khôi phục 7 khối KAGRI + tùy chọn đơn vị mẫu:** `npm run restore:kagri-org` (xem mục **Khôi phục cấu trúc tổ chức KAGRI** bên dưới). |
| Kiểm tra DB sau khi đổi schema | `npm run db:smoke` trong `backend/` |
| Kiểm tra đủ 7 khối KAGRI dưới gốc | `npm run verify:kagri-org` trong `backend/` (cần `DATABASE_URL`) |

**Lệnh thường dùng khi dev:** `backend`: `npm run dev`, `npm run build` (TypeScript `tsc`), `npm run db:smoke`. `frontend`: `npm run dev`, `npm run build` (Vite production build). **Dev:** cần **cả hai** — frontend Vite (thường cổng 5173) proxy `/api` tới backend (mặc định **3000**); nếu chỉ chạy frontend, đăng nhập sẽ lỗi kết nối API.

**Nút thanh công cụ FE:** style định nghĩa trong `frontend/src/index.css` (`btn-toolbar-primary` / `btn-toolbar-secondary`; `.btn-primary` alias của primary). **Nên dùng component** `ToolbarButton` và `ToolbarFileLabel` tại `frontend/src/components/ui/ToolbarButton.tsx` — gom `variant`, `type="button"` mặc định và class CSS; `ToolbarFileLabel` dùng cho `<label>` bọc input file (Nhập Excel). Chỉ gắn class trực tiếp khi không render được bằng hai component này.

**Đa tổ chức & cây Vận hành (DB `organizations` + `departments.organization_id`):** Mỗi bản ghi `Organization` là một tổ chức độc lập (mặc định seed **KAGRI**). Dưới mỗi tổ chức có đúng một nút gốc `type: COMPANY`, kế đến các **khối** `DIVISION` (có thể nhiều cấp anh em hoặc **khối con** dưới khối cha). Đơn vị `DEPARTMENT`/`TEAM` gắn vào khối hoặc đơn vị cha; cây không giới hạn độ sâu. Mã đơn vị (`departments.code`) là **duy nhất trong phạm vi một tổ chức** (`@@unique([organizationId, code])`). Khi khởi động DB, `ensureOrgRootCompany` / `ensureKagriOrganizationAndTree` (trong `hrController`, gọi từ `connectDB`) đảm bảo tổ chức KAGRI, gốc COMPANY và **7 khối** mặc định (mã `DIV_*` trong `backend/src/constants/kagriSeedDivisions.ts`): **KAGRI BIO, NAM DƯƠNG, PE, KVC, THÍCH, TRUST, CSKH TỔNG** — tạo nếu thiếu; **cập nhật tên / parent / displayOrder** nếu bản ghi đã có đúng mã. **Quản lý** (`managerId`) tùy chọn. Chỉ **đơn vị lá** (không có con) được gán `function` (enum `OrgFunc`): `MARKETING`, `SALES`, `CSKH`, `REV_DATA_BEFORE_20250701` (ghi nhận doanh thu từ data có trước 01/07/2025), `REV_DATA_RANGE_20250701_20260131` (ghi nhận doanh thu từ data trong khoảng 01/07/2025–31/01/2026). Với ba chức năng đầu, gán nhân viên yêu cầu **khớp loại NV** (`marketing` / `sales` / `customer_service`); với hai chức năng doanh thu theo data, chỉ cần đơn vị lá có `function` và nhân viên có **bất kỳ** loại NV (mã nguồn: `backend/src/constants/orgUnitFunctions.ts`, `frontend/src/constants/orgUnitFunctions.ts`). API: `GET/POST /api/hr/organizations`, `PUT/DELETE /api/hr/organizations/:id` (xóa chỉ khi không còn nhân viên trong cây đơn vị; không xóa KAGRI). `GET /api/hr/divisions` và `GET /api/hr/departments` nhận query **`organizationId`** (bắt buộc phía nghiệp vụ; nếu thiếu thì dùng tổ chức đầu tiên theo `sortOrder`). `GET /api/hr/organizations` trả thêm `rootDepartmentId` (id nút COMPANY). Quyền: `CONFIG_ORG_STRUCTURE` hoặc `MANAGE_HR` cho cây & tổ chức; `CONFIG_DATA_FLOW` hoặc `MANAGE_HR` cho `targetSalesUnitId` / `targetCsUnitId`. Nối luồng chỉ cho phép đích **cùng tổ chức**.

**Luồng phân data / lead:** Cấu hình `targetSalesUnitId` / `targetCsUnitId` trên đơn vị lá (Marketing → Sales → CSKH) thực hiện qua **API HR** (`PUT` đơn vị) hoặc công cụ DB; trên FE module **Vận hành** chỉ còn tab **Cấu trúc tổ chức** (và các tab tham số / phân hạng / mục tiêu KD) — không còn tab riêng luồng phân data. Luồng nghiệp vụ tổng thể vẫn bám cron và cấu hình mục 3.5 / 3.6.

**Tỉ lệ phân luồng theo khối (bổ sung):** Trên bản ghi **khối** (`DIVISION`) có thể lưu `data_flow_shares` (JSON), `external_cs_division_id` (khi khối **không** có đơn vị lá CSKH — nối sang khối đồng cấp có CSKH) và **`external_sales_division_id`** (khi khối **không** có đơn vị lá Sales — nối sang khối đồng cấp có Sales). **Phân vai trò (UI / nghiệp vụ):** **Khối chỉ nối đích** (khối cho — ví dụ Marketing chỉ trỏ `external_sales_division_id`) mặc định **không** có ô %, **không** đếm tỉ lệ. **Chia % và cân bằng theo thời gian** chỉ trên **khối nhận** (đích có đơn vị lá Sales/CSKH tương ứng); `externalMarketingToSalesPct` luôn trên khối Sales nhận. **Kỹ thuật:** map trong `data_flow_shares` vẫn lưu trên bản ghi khối theo scope cây để định tuyến nội bộ (`marketingToSalesPct`, `marketingToSalesChildDivisionPct`, `salesToCsPct`, …). **Thứ tự định tuyến (MKT→Sales, Sales→CS):** tại mỗi khối, hệ thống **ưu tiên chia cho các khối DIVISION con trực tiếp** có đơn vị lá Sales/CSKH (có cấu hình % hoặc chia đều có đếm), rồi **đệ quy** vào khối con được chọn; **sau đó** mới áp `marketingToSalesPct` / `salesToCsPct` cho các đơn vị lá **trực thuộc** khối đó (không nằm trong cây khối con). **Cân bằng theo thời gian:** bảng `division_flow_routing_counters` (`scope_division_id` = id khối cấu hình bước tương ứng — thường là khối cho; riêng `EXT_MKT_SALES_LEAF` = khối nhận Sales, `kind` loại bước, `target_id` = id khối con hoặc đơn vị lá đích, `assigned_count`) và thuật toán **thiếu so với kỳ vọng** (expected − count). Code: `divisionFlowRoutingCounterService.ts`, `leadRoutingService.ts`.

**Dữ liệu cũ:** Nếu `externalMarketingToSalesPct` từng lưu trên khối Marketing (gửi), cần nhập lại trên khối Sales nhận (hoặc copy JSON sang `data_flow_shares` của khối đích). Lưu `data-flow` trên khối không có đơn vị lá Sales sẽ **gỡ** key này khỏi JSON.

JSON gồm: `marketingToSalesPct` (MKT → từng đơn vị lá Sales **trực thuộc khối** — không gồm đơn vị Sales nằm trong cây khối DIVISION con; chia sâu tại khối con), `marketingToSalesChildDivisionPct` (MKT → **khối DIVISION con trực tiếp** có đơn vị lá Sales trong cây con — lặp đệ quy xuống từng khối con rồi mới tới `marketingToSalesPct` lá), `externalMarketingToSalesPct` (MKT → từng đơn vị lá Sales **trực thuộc khối nhận** khi luồng từ khối đồng cấp có MKT trỏ `external_sales_division_id` vào khối này — **không** lưu trên khối Marketing gửi), `salesToCsPct`, `salesToCsChildDivisionPct` (Sales → khối con trực tiếp có CSKH, đệ quy tương tự rồi tới `salesToCsPct` lá), `csOnlyPct`. **Khối chỉ có CSKH (không MKT/Sales trong cây):** cùng thứ tự định tuyến — **trước** chia **khối DIVISION con trực tiếp** có đơn vị lá CSKH trong cây con qua **`salesToCsChildDivisionPct`** (cùng key JSON như bước Sales→CS; không liệt kê đơn vị CSKH nằm sâu dưới khối con), **sau đó** đệ quy vào khối con; tới **đơn vị lá CSKH trực thuộc** khối đang xét (không nằm trong cây khối con) thì dùng **`csOnlyPct`** (không dùng `salesToCsPct` — trường đó chỉ khi cùng khối có Sales và CSKH). `pickNextResalesEmployeeId` / `pickCsLeafDeptFromDivisionTree` đọc `csOnlyPct` khi chia lá (nếu không có `salesToCsPct` trên cùng bản ghi). Validate backend (`divisionDataFlowService`): khóa map thuộc đúng khối/đích (key khối con = id `DIVISION` con trực tiếp có đủ lá Sales/CSKH trong cây con tương ứng); với **`salesToCsChildDivisionPct`**, điều kiện «được phép lưu map này» xét **toàn cây khối** (theo `parent_id`), không chỉ đơn vị lá có `computeDivisionId` trùng khối đang lưu — tránh từ chối khi CSKH chỉ nằm dưới khối DIVISION con; giá trị 0–100; tổng mỗi map ≤ 100%; `marketingToSalesPct` và `externalMarketingToSalesPct` chỉ chứa id đơn vị lá Sales **trực thuộc** khối (theo cây `parent_id`, khớp `pickSalesLeafDeptFromDivisionTree`); `csOnlyPct` chỉ chứa id đơn vị lá CSKH **trực thuộc** khối (không gồm lá trong cây khối con); **không cho phép** lưu `marketingToSalesPct` / `marketingToSalesChildDivisionPct` / `externalMarketingToSalesPct` trên khối **chỉ gom nhánh** (trong cây vừa có MKT vừa có Sales nhưng **không** có đơn vị lá Marketing hoặc Sales **trực thuộc** khối đó — MKT và Sales chỉ nằm dưới các khối DIVISION con); `external_cs_division_id` / `external_sales_division_id` phải là khối **đồng cấp** (cùng `parent_id`), không trỏ chính khối; khối Sales ngoài phải có ít nhất một đơn vị lá Sales. API: **`PUT /api/hr/divisions/:id/data-flow`** (body: `dataFlowShares`, `externalCsDivisionId`, `externalSalesDivisionId`), quyền `CONFIG_DATA_FLOW` hoặc `CONFIG_ORG_STRUCTURE` hoặc `MANAGE_HR`. Trên **FE** (`DivisionDataFlowPanel`), chỉ gửi `external_cs_division_id` khi đang hiện phần nối CS đồng cấp (`showExternalCs`), và chỉ gửi `external_sales_division_id` khi đang hiện phần nối Sales (`showExternalSales`); nếu không thì gửi `null` để **không** gán nhầm khối đồng cấp khi chỉ lưu tỉ lệ % (ví dụ khối chỉ CSKH). `GET /api/hr/divisions` trả kèm `dataFlowShares`, `externalCsDivision`, `externalSalesDivision`. Khi xóa khối, các khối đang trỏ tới id đó được gỡ FK ngoài. **Migration (luồng khối):** `20260323120000_division_data_flow_shares`, **`20260326180000_external_sales_division`**, `20260328120000_division_flow_routing_counters`. Trên FE: dropdown khối đích CS / Sales chỉ liệt kê khối đồng cấp có đủ đơn vị lá tương ứng; **nếu chỉ có đúng một** khối đồng cấp có Sales (hoặc có CSKH), **không** hiển thị dropdown — nối **mặc định** tới khối đó (người cấu hình không đổi được đích), lưu `external_*` khi ghi luồng. Định tuyến chọn NV Sales/CSKH theo tỉ lệ (trọng số khối con → lá, rồi `externalMarketingToSalesPct` đọc từ **JSON khối Sales đích**) nằm trong `leadRoutingService.pickNextSalesEmployeeId` / `pickNextResalesEmployeeId` (cron thu hồi lead, auto phân kho, Marketing tạo lead). **Hiển thị panel phân luồng theo khối (`DivisionDataFlowPanel`):** điều kiện «có Marketing / Sales / CSKH» xét **đơn vị lá** trong **toàn bộ cây khối** (khối đang mở và mọi khối con), không chỉ đơn vị gắn trực tiếp khối đó — để khối **chỉ chứa khối con** (không có đơn vị gốc trực tiếp) vẫn hiện panel khi trong cây con có Marketing nhưng chưa có Sales/CSKH. **Dòng mô tả** dưới tiêu đề panel (về %, khối nhận, README) **chỉ hiện** khi trên khối đang mở có **ít nhất một nhóm nhập %** (MKT→Sales, Sales→CSKH, CSKH-only, …); **khối chỉ nối đích** (chỉ khung nối Sales/CS đồng cấp, không ô % trên khối này) **không** hiện dòng mô tả đó. **Khối cha chỉ gom nhánh (MKT và Sales mỗi nhánh một khối DIVISION con, không lá MKT/Sales trực thuộc cha — ví dụ KAGRI BIO với khối Marketing + khối Sales):** **không** hiển thị ô phân tỉ lệ MKT→Sales (`marketingToSalesChildDivisionPct`, `marketingToSalesPct`, `externalMarketingToSalesPct`) trên khối cha; nối Marketing→Sales (`external_sales_division_id`) và % đơn vị Sales cấu hình trên **khối Marketing** / **khối Sales** tương ứng; khối cha chỉ còn các phần khác (ví dụ **nối CS đồng cấp** khi trong cây có Sales nhưng chưa có CSKH). **FE** xác định «lá trực thuộc khối» cho ẩn panel MKT→Sales bằng **cây `parent_id`** (gộp bản ghi DIVISION và đơn vị), cùng quy tắc `collectSubtreeDepartmentIds` / validate — **không** chỉ dựa vào `divisionId` suy từ ancestor trên đơn vị. **Khối cha chỉ chứa khối con:** có thể **chỉ** cấu hình `external_sales_division_id` / `external_cs_division_id` trên **khối cha**; không bắt buộc lặp trên từng khối con — định tuyến leo khối cha để lấy đích nối sang khối **đồng cấp** có Sales/CSKH. Phần nối Marketing → Sales sang khối đồng cấp chỉ có khi (trong cây khối) có Marketing nhưng chưa có Sales — **chỉ chọn khối đích** trên khối gửi; **ô %** chia Sales nằm trên **khối Sales nhận** (mở khối đó). Phần nối CSKH sang khối đồng cấp chỉ hiện khi có Sales trong cây nhưng chưa có CSKH (không hiện khi trong cây chưa có Sales lá, ví dụ chỉ Marketing). **Khối con, không có khối đồng cấp phù hợp:** khi danh sách khối đồng cấp (có Sales / CSKH) **rỗng** nhưng khối đang mở có **khối cha** trong cây khối (`DIVISION` cha), giao diện dùng **cùng khung** «Nối mặc định (không chọn khác)» như trường hợp chỉ một khối đồng cấp — hiển thị **Luồng qua khối cha** (tên khối), **không** dropdown; giá trị tương ứng **không** gán `external_sales_division_id` / `external_cs_division_id` trên khối con; cấu hình nối ngoài (nếu cần) đặt tại khối cha. Trong trường hợp **chỉ** các khung nối về khối cha (không có ô tỉ lệ / không có phần khác cần ghi), nút **Lưu luồng phân data** **ẩn** vì không có gì để lưu trên khối này.

**Sắp xếp cây tổ chức (FE):** Khối (`DIVISION`) cùng cấp kéo thả trên tiêu đề khối (lưu `displayOrder` qua `PUT /api/hr/divisions/reorder`). Đơn vị (`DEPARTMENT`/`TEAM`) cùng khối và cùng cha: kéo bằng **biểu tượng kéo** bên trái dòng đơn vị. `GET /api/hr/departments` trả về đơn vị theo `display_order` rồi `name`. **Tạo đơn vị** (`POST /api/hr/departments`): nếu body có **parentId** thì cha trực tiếp trong DB là bản ghi đó (đơn vị con); chỉ khi **không** có parentId mới dùng **divisionId** làm cha (đơn vị gốc dưới khối). **FE cây khối:** đơn vị gốc dưới một khối có `departments.parent_id` = **id bản ghi DIVISION** đó (không dùng `parent_id` null); danh sách gốc trong UI lọc `parentId === division.id`. **Hiển thị gốc:** các đơn vị gốc được **sắp xếp và nhóm theo** thứ tự chức năng lá: Marketing → Sales → CSKH → ghi nhận DT (data trước 01/07/2025) → ghi nhận DT (data 01/07/2025–31/01/2026) → «Khác»; tiêu đề khối hiển thị **tổng số đơn vị** (`DEPARTMENT`/`TEAM`) thuộc khối; tỉ lệ % (nếu có) hiển thị cạnh tên đơn vị lá Sales / CSKH.

**Tab Cấu trúc tổ chức (FE):** Trên cây **không hiển thị mã** tổ chức / khối / đơn vị (mã vẫn dùng trong DB và API). **Màu icon/chữ** bám palette thương hiệu (`primary` / `secondary` / `division` / `support` trong `brandColors.ts`). Icon: tổ chức (Building2, `text-primary`), khối (Layers, `text-division` — tím `#5b21b6` trong `brandColors.ts`), đơn vị (UsersRound). **Chọn tổ chức:** khi có nhiều org, `<select>` gọn trên thanh **«Tên N khối»**; một org thì không hiện select. **Thêm tổ chức** nằm **cuối** danh sách khối cấp 1 (sau các thẻ khối như KAGRI BIO, NAM DƯƠNG, …), trong vùng đã mở, không nằm cạnh tên tổ chức ở header. Dòng **thu gọn / mở** hiển thị dạng gọn **«Tên tổ chức» + `${N} khối`** (chữ *khối* luôn viết thường; ví dụ KAGRI 7 khối — tên org giữ nguyên như dữ liệu/translate); **Thêm khối** cùng hàng, căn phải. **Thêm khối con** mở form với **khối cha** đã ghi nhận (readonly). **Thêm đơn vị** từ một khối mặc định thuộc khối đó — modal **Thêm mới đơn vị** chỉ mở từ **+ Thêm đơn vị** trên **khối** (đã **không** còn trên dòng đơn vị nút thêm chức danh / thêm đơn vị con); select **Thuộc khối / nút cha** bị **khóa** theo khối đã chọn; **Sửa** đơn vị gốc dưới khối (không có đơn vị cha) vẫn có thể đổi khối qua select; **chức năng đơn vị bắt buộc**; **gán nhân viên** vào đơn vị lá **sau** khi tạo (nút **Thêm nhân viên** dưới đơn vị trên cây — modal **Thêm mới đơn vị** không còn chọn NV). **Không** còn quản lý danh sách chức danh trên cây (không sửa/xóa/tạo chức danh từng đơn vị trên UI); **không** hiển thị nhãn chức danh cạnh quản lý / từng nhân viên trên cây; backend vẫn dùng bảng `positions` khi gán NV — khi cần `positionId`, giao diện đảm bảo có ít nhất một chức danh (ưu tiên dùng chức danh đầu tiên có sẵn, nếu chưa có thì tạo **«Thành viên»**). Nút **Sửa / Xóa** đơn vị luôn hiển thị khi có quyền (không ẩn trên desktop chờ hover). Bản ghi `DIVISION` trùng **mã** hoặc **tên** với tổ chức đang chọn vẫn được ẩn khỏi danh sách. Khi một khối chưa có đơn vị con và chưa có khối con, vùng cây hiển thị dòng gợi ý: dùng **+ Thêm đơn vị** để tạo mới hoặc kéo thả đơn vị từ khối khác.

**Xóa đơn vị (`DELETE /api/hr/departments/:id`):** Chỉ áp dụng cho `type` `DEPARTMENT`/`TEAM`. Từ chối nếu còn **đơn vị con**, còn nhân viên (`employees.department_id` = id), hoặc còn **`lead_assignments`** trỏ `from`/`to` tới id này. Khi hợp lệ, backend **tự xóa các bản ghi `positions` thuộc đơn vị** (và gỡ `employees.position_id` nếu đang trỏ tới chức danh đó), gỡ `manager_id` của đơn vị, gỡ `targetSalesUnitId`/`targetCsUnitId` ở đơn vị khác nếu trỏ tới id này, xóa `sales_targets` / `team_distribution_ratios` gắn đơn vị (nếu có), rồi xóa `departments`. Trước đây lỗi «có chức vụ» dù không có nhân viên là do vẫn còn `positions` (kể cả **«Thành viên»** do hệ thống tạo khi gán NV).

**Nhân viên theo đơn vị lá & API:** Với **đơn vị lá** (không có đơn vị con), sau khi gán **chức năng** `function` (xem enum `OrgFunc` ở mục đa tổ chức), có thể **xem danh sách nhân viên trực tiếp** (`GET /api/hr/employees?departmentId=…&directDepartment=1` — chỉ đúng `departmentId`, không gồm cây con). **Gán / chuyển** qua `PUT /api/hr/departments/:departmentId/staff-assignment` (body: `employeeId`, `positionId` tùy chọn — mặc định chức danh đầu tiên của đơn vị; trên FE nếu đơn vị chưa có chức danh thì tự tạo **«Thành viên»** rồi gán). Nếu nhân viên **đã** có đơn vị vận hành **khác** đích, API trả **400** với thông báo cần **gỡ** khỏi đơn vị hiện tại trước — trừ khi body có **`allowReassignFromOtherUnit: true`** (luồng **Chuyển** đơn vị lá trên FE). Quyền `CONFIG_ORG_STRUCTURE` hoặc `MANAGE_HR`. **Gỡ nhân viên khỏi đơn vị vận hành** (đặt `employees.department_id` / `position_id` = `NULL`): `DELETE /api/hr/departments/:departmentId/staff-assignment/:employeeId` — chỉ khi nhân viên **đang** thuộc đúng `departmentId` và đơn vị là `DEPARTMENT`/`TEAM` (không áp dụng lên nút `COMPANY`/`DIVISION`); nếu nhân viên là `manager_id` của một đơn vị, gỡ luôn quản lý đó. **Quyền:** `checkPermission` với một trong `CONFIG_ORG_STRUCTURE`, `CONFIG_DATA_FLOW`, `MANAGE_HR` (hằng `OPS_LEAF_STAFF_REMOVE_PERMISSIONS` trong `backend/src/config/routePermissionPolicy.ts` — gán qua **Nhóm quyền** trong DB; nhóm **Quản trị hệ thống** `system_administrator` / legacy `ADM` vẫn full API theo `authMiddleware`). Trên FE tab **Cấu trúc tổ chức**, danh sách nhân viên trực tiếp hiển thị **họ tên kèm mã nhân viên**; **bấm vào dòng** nhân viên mở modal thông tin chi tiết (`EmployeeDetailModal` — render qua `createPortal` vào `document.body`, lớp z cao để không bị thẻ khối / kéo thả đè). **Thêm nhân viên** mở modal **Chọn nhân viên** có **ô tìm nhanh** (lọc theo tên, mã NV, SĐT, tên đơn vị đang tại); modal **Chọn nhân viên** và modal **Chuyển nhân viên** render qua `createPortal` vào `document.body` với lớp `z-index` cao (cùng ý tưởng `EmployeeDetailModal`) để không bị thẻ khối / kéo thả đè. Nút **Gỡ** cạnh từng nhân viên chỉ hiện khi người dùng có một trong các quyền trên (đồng bộ logic backend). Với `MARKETING` / `SALES` / `CSKH`, loại nhân viên (`employee_types.code`) phải khớp: `marketing` / `sales` / `customer_service`. Với `REV_DATA_BEFORE_20250701` / `REV_DATA_RANGE_20250701_20260131`, **không** bắt buộc khớp ba loại trên (chỉ cần có loại NV). **Không** gán nhân viên vào `COMPANY`/`DIVISION` hoặc vào đơn vị lá chưa có `function`. Đơn vị **có con** vẫn tương thích dữ liệu cũ (không áp bộ quy tắc lá–chức năng khi validate). **Thêm nhân viên** (`POST /api/hr/employees`) **không** dùng `departmentId`/`positionId` trong body (bị loại bỏ phía server) — bản ghi lưu null cho đơn vị/chức danh vận hành cho đến khi gán tại Vận hành. **`PUT /api/hr/employees/:id`:** nếu nhân viên **đang** có `department_id` (đơn vị lá), mỗi lần lưu backend **luôn** kiểm tra `employeeTypeId` khớp chức năng đơn vị (đồng bộ bắt buộc); khi body **đổi** phòng ban / chức danh / loại nhân viên thì áp đủ quy tắc tương ứng; đổi phòng ban mà không gửi `positionId`, backend gán chức danh đầu tiên của phòng ban đích (nếu có).

**Đơn vị vs khối (cấu hình hiện tại):** Trong DB, `departments.type` phân biệt `DIVISION` (khối) và `DEPARTMENT`/`TEAM` (đơn vị). API `PUT /api/hr/departments/:id` (**updateDepartment**) **không** cho phép đổi `type` — **một đơn vị không thể “biến thành” khối** chỉ bằng cập nhật đơn vị. Để có khối làm **cha** của nhiều đơn vị: dùng **+ Khối con** (hoặc **+ Thêm khối** ở cấp dưới `COMPANY`) để tạo `DIVISION`, rồi **thêm đơn vị** hoặc **kéo thả** đơn vị vào khối đó / gán cha hợp lệ. Khối có thể chứa đồng thời **đơn vị** và **khối con** (cây lồng nhau). **Mã (`departments.code`) là duy nhất trong cả tổ chức cho mọi loại nút** (COMPANY / DIVISION / DEPARTMENT / TEAM): khi tạo khối không nhập mã, backend gán `K01`…`K99` sau khi quét **toàn bộ** bản ghi `departments` của tổ chức để tránh trùng với mã đơn vị đã có.

**Migration DB (lần đầu lên đa tổ chức):** chạy `npx prisma migrate deploy` trong `backend/` (migration `20250323120000_organizations_and_department_org_fk`) **sau khi backup**; migration tạo bảng `organizations`, gán mọi `departments` hiện có vào org KAGRI và thay unique `code` bằng unique kép `(organization_id, code)`.

**Migration `20260323103000_orgfunc_revenue_data_periods`:** mở rộng enum PostgreSQL `OrgFunc` thêm `REV_DATA_BEFORE_20250701`, `REV_DATA_RANGE_20250701_20260131` (chạy `migrate deploy` sau backup; an toàn nếu giá trị đã tồn tại nhờ kiểm tra `pg_enum`).

**Migration `20260323120000_division_data_flow_shares`:** thêm cột `data_flow_shares` (JSONB), `external_cs_division_id` (FK nullable tới `departments`, `ON DELETE SET NULL`) cho luồng phân data theo khối.

**Migration `20260324130000_employee_optional_ops_unit`:** cho phép `employees.department_id` và `employees.position_id` **nullable** (HR tạo hồ sơ không gán đơn vị vận hành; Vận hành gán sau). Chạy `npx prisma migrate deploy` trong `backend/` **sau khi backup**.

**Migration `20260325120000_employee_contract_dates`:** thêm `employees.contract_effective_date` và `employees.contract_end_date` (nullable) — **ngày hiệu lực / hết hạn hợp đồng** trên hồ sơ, tùy chọn cho mọi loại HĐ. Form nhân sự và Excel import/export dùng chung hai cột «Ngày hiệu lực HĐ» / «Ngày hết hạn HĐ». Với loại HĐ thử việc (mã gợi ý `probation`, `thu_viec`, …), backend **đồng bộ** hai ngày này với `probation_start_date` / `probation_end_date`; khi đổi sang loại HĐ khác, kỳ thử việc được xóa (`probation_status` = `NONE`). Chạy `npx prisma migrate deploy` trong `backend/` **sau khi backup**. Nếu tạm thời chưa migrate, `GET /api/hr/employees`, chi tiết nhân viên, **`PUT` cập nhật** và **`POST` tạo nhân viên** vẫn hoạt động: đọc/ghi bỏ qua hai cột ngày HĐ khi cần (retry / select dự phòng P2022) — nên migrate sớm để lưu và hiển thị đủ ngày hợp đồng.

**Migration `20260325140000_employee_hr_job_title`:** thêm `employees.hr_job_title` (nullable) làm **chức danh HR nội bộ**. Trường này chỉ phục vụ module Nhân sự (form/list/import/export), **không** tham gia validate gán đơn vị/chức danh vận hành (`departmentId`/`positionId`). Chạy `npx prisma migrate deploy` trong `backend/` **sau khi backup**.

**Migration `20260326120000_warehouse_address_and_campaign_fields`:** thêm cột địa chỉ hành chính cho `warehouses` (`contact_name`, `contact_phone`, `detail_address`, `province_id`, `district_id`, `ward_id` + FK) và `accepted_fields` (JSONB) cho `marketing_campaigns`. Chạy `npx prisma migrate deploy` trong `backend/` **sau khi backup**.

**Migration `20260327180000_hr_department_unit_manager`:** thêm `hr_department_units.manager_id` (FK nullable tới `employees`, `ON DELETE SET NULL`) — gán **quản lý bộ phận HR** để duyệt/từ chối đơn nghỉ phép theo `employees.hr_department_unit_id`. Chạy `npx prisma migrate deploy` trong `backend/` **sau khi backup**.

**Migration `20260327200000_hr_department_unit_sort_backfill`:** nếu **mọi** bản ghi `hr_department_units` đều `sort_order = 0`, gán thứ tự `1,2,3…` theo **tên** (tránh ghi đè khi đã có bản ghi `sort_order` khác 0). Chạy `npx prisma migrate deploy` trong `backend/` **sau khi backup**.

**Khôi phục cấu trúc tổ chức KAGRI (khối / đơn vị seed):** Khi mất **7 khối mặc định** (`DIV_KAGARI_BIO` … `DIV_CSKH_TONG`) hoặc org/gốc COMPANY, dùng script sau — **trước khi ghi DB phải có backup** (quy tắc dự án).

1. **Backup (khuyến nghị thủ công thêm một bản):**  
   `pg_dump "<DATABASE_URL>" -Fc -f backup-truoc-khoi-phuc.dump`  
   (PowerShell: đặt chuỗi kết nối trong biến hoặc dùng `pg_dump` với tham số `-h -U -d` tương đương.)  
   **Backup đầy đủ vào `backend/backups/` (tên `hcrm_full_<timestamp>.dump`):** trong thư mục `backend/` chạy `npm run backup:db` (Linux/Docker: chỉ `pg_dump` trong PATH; Windows: thêm `pg_dump.exe` và thư mục PostgreSQL nếu có).
2. **Chạy script** trong thư mục `backend/`:  
   - `npm run restore:kagri-org` — mặc định **tự gọi `pg_dump`** (định dạng custom) vào `backend/backups/pre-restore-kagri-org-<timestamp>.dump`, sau đó gọi `ensureKagriOrganizationAndTree` (cùng logic `connectDB` / `ensureOrgRootCompany`) để tạo lại org **KAGRI**, nút **COMPANY**, và các khối seed còn thiếu.  
   - `npm run restore:kagri-org -- --skip-backup` — nếu đã `pg_dump` tay, bỏ bước backup trong script.  
   - `npm run restore:kagri-org -- --minimal-units` — sau bước trên, với mỗi khối seed **chưa có** đơn vị con `DEPARTMENT`/`TEAM`, tạo **3 đơn vị lá mẫu** (Marketing / Sales / CSKH), mã dạng `DIV_…_AUTO_MKT` / `_AUTO_SAL` / `_AUTO_CSKH`, tên có hậu tố «(khôi phục mẫu)»; có thể đổi tên hoặc xóa trên giao diện **Cấu trúc tổ chức**.  
3. **Hoàn tác / lấy lại DB như trước khi chạy script:** dùng **pg_restore** (hoặc công cụ restore của PostgreSQL) từ file `.dump` vừa tạo ở bước 1 hoặc 2 — tùy môi trường (thường tạo DB trống hoặc `--clean` lên DB đích; **cẩn trọng** vì ghi đè dữ liệu).  
4. **Hạn chế:** Script **không** tái tạo khối/đơn vị **tùy chỉnh** (mã không thuộc bộ seed) đã xóa; chỉ có **backup cũ** mới khôi phục được đúng như trước.

**Khôi phục kho vật lý & đồng bộ danh mục sản phẩm theo file pg_dump (plain SQL):** Trước khi chạy: `npm run backup:db`. Trong `backend/`: `npm run restore:warehouses-products-pgdump` hoặc `npx ts-node scripts/restore-warehouses-and-products-from-pgdump.ts [đường-dẫn-file.sql]` (mặc định đọc `backup_2026-03-30_18-00-12.sql` ở thư mục gốc repo). Script đọc các khối `COPY` cho `warehouses`, `products`, `product_bios`; **tạo hoặc cập nhật** hai kho mã **`biohn`** và **`biohcm`** theo snapshot trong file; **upsert** từng sản phẩm cho **mỗi** kho (khóa `code` + `warehouse_id`) và tạo dòng `stocks` tồn 0 nếu chưa có. Chi tiết: comment đầu file `backend/scripts/restore-warehouses-and-products-from-pgdump.ts`.

**Xóa toàn bộ dữ liệu khách hàng và chiến dịch marketing (nguy hiểm):** Trong `backend/`, **bắt buộc `npm run backup:db`** (hoặc `pg_dump` tương đương) trước. Sau đó: `CONFIRM_PURGE=yes npm run purge:customers-campaigns` (Windows PowerShell: `$env:CONFIRM_PURGE="yes"; npm run purge:customers-campaigns`). Script xóa: `lead_opportunities`, `lead_assignments`, đơn hàng (`orders` + log/line liên quan), `lead_distribution_history`, `warranty_claims` (gắn khách), toàn bộ `draft_invoices`, ghi chú nội bộ có `customer_id`, tương tác/tổng hợp/thẻ/nông trại/địa chỉ khách, `data_pool`, **toàn bộ `customers`**, rồi toàn bộ bảng **chiến dịch** (`marketing_campaign_costs` / `marketing_cost_assignments` / `products` / `members` / `marketing_campaigns`). **Không** xóa: danh mục `marketing_sources`, định nghĩa `customer_tags`, nhân sự, sản phẩm, cấu hình hệ thống.

**Hệ thống → Nhóm quyền:** Tab phân quyền (`RoleGroupManager`) nằm trong `frontend/src/pages/SystemAdmin.tsx`. **Tab** «Nhật ký» / «Nhóm quyền» / «Tài khoản nhân sự» hiển thị theo **quyền** (ví dụ `VIEW_LOGS` / `MANAGE_SYSTEM`, `VIEW_ROLE_GROUPS` / `MANAGE_ROLE_GROUPS` / `VIEW_SETTINGS` / `EDIT_SETTINGS`, `STAFF_*` / `MANAGE_HR` / `MANAGE_SYSTEM`) — **không** giới hạn chỉ nhóm `system_administrator`. Truy cập route `/system`: ưu tiên có menu **Hệ thống** (`/system`); nếu thiếu menu nhưng có một trong các quyền nghiệp vụ tương ứng, `PermissionRoute` vẫn cho qua (`SYSTEM_PATH_ACCESS_PERMISSIONS` trong `PermissionRoute.tsx`). API `/api/role-groups/*`: **đọc** cần `VIEW_ROLE_GROUPS` hoặc `VIEW_SETTINGS`; **ghi** (tạo/sửa/xóa, cập nhật phạm vi xem) cần `MANAGE_ROLE_GROUPS` hoặc `EDIT_SETTINGS`. Trên tab này, **Menu truy cập** và **Chức năng hệ thống** hiển thị tiếng Việt: nhãn menu qua `translate()` (gồm khóa `menu.*`/`role.*` trong `dictionary.ts`), tên chức năng qua `translatePermissionLabel(code, name)` — ưu tiên map theo mã `Permission.code` rồi mới dịch trường `name` từ API. Có nút **sao chép mã nhóm quyền** (`RoleGroup.code`) cạnh mã ở danh sách trái và ở tiêu đề nhóm đang chọn. Nhóm **Quản trị hệ thống** (`system_administrator`, legacy `ADM`) hiển thị **đủ** menu/quyền và phạm vi xem **toàn công ty** ở chế độ chỉ xem (mờ, không đổi tên / không lưu / không xóa); API từ chối sửa/xóa nhóm này. Khi bổ sung quyền hoặc menu mới trong catalog, `syncDefaultMenus` (khởi động backend) tự gán đủ cho nhóm đó.

## 3. Luồng vận hành “end-to-end”

### 3.1. Khởi động backend

1. `backend/src/server.ts`
   - Tạo `httpServer` từ `app`
   - Khởi tạo `Socket.IO` (CORS cho dev)
   - `initSocket(io)` để gắn các handler realtime
   - Khởi tạo cron:
     - `initLogCleanup()`
     - `initContractExpiryReminder()`
     - `initLeadDistributionCron()`
   - `listen(PORT)`
2. `backend/src/app.ts`
   - Load env: `dotenv.config({ override: true })`
   - Kết nối DB: `connectDB()` (Prisma) — gồm `ensureOrgRootCompany`, `ensureHrDepartmentUnits`, `ensureEmploymentTypes` (danh mục loại hợp đồng tiếng Việt), `seedDefaultConfigs`, v.v.
   - Cấu hình middleware:
     - `compression`, `helmet`, `cors`
     - `express.json`, `express.urlencoded`
     - `cookieParser`
   - Serve file tĩnh:
     - `/uploads/images`, `/uploads/avatars`, `/uploads/chat`, `/uploads/marketing-costs`
   - Mount routes:
     - Webhook public: `app.use('/api/webhook', webhookRoutes)`
     - Audit log middleware: `app.use('/api', auditLog)` (chỉ log các thao tác ghi)
     - API business routes: `app.use('/api', apiRoutes)`
   - Production:
     - Nếu build frontend tồn tại (`frontend/dist/index.html`) và `NODE_ENV=production` thì backend serve SPA.

### 3.2. Xác thực & phân quyền (Auth/RBAC)

- Login:
  - `POST /api/login` (route trong `backend/src/routes/authRoutes.ts`)
  - Backend phát JWT dưới dạng cookie (`setTokenCookie`) và trả user info.
- Mỗi request API protected:
  - `authMiddleware` (`authenticate`) đọc token theo thứ tự:
    - **Ưu tiên** header `Authorization: Bearer <token>` (phiên kiểm tra tài khoản dùng Bearer + sessionStorage, không ghi đè cookie tab quản trị)
    - Nếu không có Bearer: `req.cookies.jwt`
  - Giải mã token → kiểm tra:
    - User tồn tại
    - Tài khoản bị lock / session invalidated (nếu cột đã có)
    - `status.isActive`
  - Nạp quyền từ `roleGroup.permissions` → gán vào `req.user.permissions`.
- `checkPermission()` (`authMiddleware.ts`):
  - Nếu `roleGroup.code` là **Quản trị hệ thống** (`isTechnicalAdminRoleCode`: `system_administrator` hoặc legacy `ADM`) → full access API, không cần từng permission. **Không** có nhóm quyền nào khác (kể cả `crm_administrator`) được hard code bypass toàn hệ thống — các nhóm đó chỉ có quyền theo bản ghi gán trên tab **Nhóm quyền**.
  - Helper `userHasCatalogPermission` (`backend/src/constants/rbac.ts`): kiểm tra một hoặc nhiều mã quyền trên JWT (có tôn trọng `FULL_ACCESS` và quản trị hệ thống).
  - Nếu user có `FULL_ACCESS` trong danh sách permission → qua hết (theo `checkPermission`)
  - Ngược lại → chỉ cho phép nếu có ít nhất một permission trong set endpoint yêu cầu
- Frontend `hasPermission` (`frontend/src/context/useAuthStore.ts`): cùng quy tắc nhóm **Quản trị hệ thống**; nếu phiên có **`FULL_ACCESS`** trong `user.permissions` thì **mọi** `hasPermission(<mã>)` đều `true` (đồng bộ với backend, tránh trường hợp đã gán «toàn quyền» nhưng UI vẫn chặn từng tab).
- **Chính sách mã quyền theo route:** các mảng quyền dùng cho `checkPermission([...])` được gom tại `backend/src/config/routePermissionPolicy.ts` (comment đầu file: quyền thực tế chỉ qua **Nhóm quyền** trong DB; ngoại lệ full API là `system_administrator` / legacy `ADM`). FE vào `/system` theo danh sách `SYSTEM_MODULE_PATH_ACCESS_PERMISSIONS` trong `frontend/src/constants/routePermissionPolicy.ts` (đồng bộ với backend).
- **Module Nhân sự (API):** không còn phân quyết «HCNS» theo **mã nhóm quyền** (`HR_STAFF`, `QL_HCNS`, …) trong `hrController.checkEmployeeAccess` — thay bằng quyền catalog **`VIEW_HR`** (xem hồ sơ theo phạm vi trong logic quyền sửa/xem chi tiết), **`MANAGE_HR`** / **`FULL_ACCESS`** (sửa), cùng ngoại lệ **`system_administrator` / `ADM`**. **Đọc (GET)** danh sách/chi tiết NV, master phục vụ lọc/form (tổ chức, chức danh, khối/đơn vị, nhóm quyền, danh mục HR, …) trên `hrRoutes.ts` **chỉ cần đăng nhập** (`authMiddleware`); **phạm vi bản ghi** (ai được xem NV nào) do **`getVisibleEmployeeIds`** / `checkEmployeeAccess` trong controller — tránh chặn nhầm **quản lý đơn vị vận hành** hoặc NV có menu Nhân sự nhưng chưa gán `VIEW_HR` trong nhóm quyền. **Ghi (POST/PUT/DELETE)** nhân sự và cấu trúc org vẫn dùng `checkPermission` như trước.

### 3.3. Audit log (ghi nhận thay đổi)

**Quy ước phát triển:** Mọi thay đổi nghiệp vụ tạo thao tác Create / Update / Delete bắt buộc ghi nhật ký; với **cập nhật**, `details` phải có **so sánh trước–sau bằng tiếng Việt**. Chi tiết: `docs/audit-log-cud-convention.md` (Cursor: `.cursor/rules/audit-log-cud.mdc`). Helper: `backend/src/utils/vietnameseAuditDiff.ts`.
- **Data Pool / Marketing:** đẩy lead vào pool và phân tỉ lệ hàng loạt; phân phối từ kho thả nổi; thay đổi ưu tiên / trạng thái xử lý thuộc nghiệp vụ ghi DB — dùng `logAudit` với `details` tiếng Việt (và so sánh trước–sau khi cập nhật bản ghi).
- **Lịch sử hiển thị cho Sales/CSKH:** ngoài `system_logs`, các thay đổi quan trọng trên khách còn được phản ánh trong `customer_interactions` (`kind=SYSTEM_CHANGE` hoặc ghi chú `USER_NOTE`) để người dùng nghiệp vụ xem tại modal «Lịch sử tác động» — không thay thế audit log.

`backend/src/middleware/auditLogMiddleware.ts`:

- Chỉ log write operations: `POST/PUT/PATCH/DELETE` (pha 1).
- Chuẩn bản ghi tối thiểu: `userId`, `userName`, `userPhone`, `action`, `object`, `details`, `result`, `timestamp`.
- `details` ưu tiên thông tin truy vết ngắn (`Tên`/`Mã`/`ID`) và có bước lọc key nhạy cảm (`password`, `token`, `authorization`, `cookie`, `secret`, ...).
- Với các route **chưa** ghi log thủ công từ controller, middleware gom **nhiều trường trong body** thành một dòng mô tả (nhãn tiếng Việt cho các key phổ biến), **ưu tiên mô tả này hơn** chuỗi `ID: <uuid>` khi body có dữ liệu — tránh nhật ký chỉ còn UUID khó đọc.
- **Kho hàng** (`PUT/POST/DELETE /api/inventory/warehouses...`): controller ghi log qua `logAudit` với nội dung **so sánh trước/sau** (ví dụ *Đổi tên kho từ "..." sang "..."*, *Đổi địa chỉ chi tiết từ "..." sang "..."*), kèm `oldValues`/`newValues` JSON khi cần tra cứu.
- **Khách hàng / thẻ khách hàng / nông trại khách hàng** (`customerController`): mọi **Tạo mới / Cập nhật / Xóa** ghi `logAudit`; **cập nhật** dùng `describeCustomerAuditDiff` (và `describeChangesVi` cho thẻ/vườn) — các dòng *Đổi [trường] từ "..." sang "..."* bằng tiếng Việt; đối tượng trong nhật ký là tên tiếng Việt (ví dụ `Khách hàng`, `Thẻ khách hàng`).
- **Marketing** (nguồn, chiến dịch, lead, chi phí chiến dịch): tương tự — `logAudit` + so sánh trước/sau cho cập nhật; tạo/xóa có mô tả tiếng Việt và `object_id` khi có.
- **Chỉ tiêu vận đơn theo ngày** (`PUT /api/shipping/daily-quotas`): ghi `logAudit` khi gán/sửa/xóa chỉ tiêu (`shippingQuotaController`).
- **`logAction` trong `logController`**: chuyển sang ghi qua `prisma.systemLog` (cùng pipeline `logAudit`), có cột `object_id` thay vì chỉ nối `ID` vào chuỗi `details`.
- Tự nhận diện actor hệ thống cho một số luồng không có user đăng nhập (ví dụ API public/webhook).
- Chống ghi trùng: nếu controller đã ghi qua `logAudit(...)` (đặc thù nghiệp vụ), middleware sẽ không ghi lặp cùng request.
- Với các module đã có log thủ công chi tiết (ví dụ khách hàng/marketing), middleware bỏ qua một số route để tránh duplicate log.
- Tab FE `Hệ thống -> Nhật ký hệ thống` hỗ trợ hiển thị/lọc đồng thời các trạng thái cũ và mới (`SUCCESS`/`FAILURE` và `Thành công`/`Thất bại`), có thêm trạng thái `Thành công một phần`.

### 3.4. Realtime & thông báo

- Socket.IO:
  - Khi client connect, nếu truyền `userId` trên `socket.handshake.query.userId` thì socket sẽ `join(userId)` để nhận private notifications.
  - Handler nổi bật:
    - `new_lead` / `notification:new` từ backend khi có sự kiện
    - **Video call signaling:** `call:initiate` → `call:incoming`, `call:accept` → `call:accepted`, `call:reject` → `call:rejected`, `call:end` → `call:ended`, `call:offer`, `call:answer`, `call:ice-candidate` (chi tiết mục 4.13.1)
    - (phần chat AI hiện tại là demo stream cố định trong `socket.ts`, không phải AI thật)
  - Socket rooms khác:
    - `shipping:staff` cho sự kiện cập nhật trạng thái đơn vận chuyển.
    - `userId` (join khi connect) cho thông báo cá nhân + incoming call.
- Web Push:
  - Frontend subscribe push theo `GET /api/user-notifications/push-vapid-key` và lưu subscription qua `POST /api/user-notifications/push-subscribe`.
  - Backend sử dụng `web-push` trong `pushNotificationService` để gửi khi có sự kiện (ví dụ: lead mới từ marketing).

### 3.5. Cron jobs (tự vận hành nghiệp vụ)

`backend/src/cron/leadDistribution.ts` khởi tạo nhiều schedule, ví dụ:

- Sales deadline recall: `0 * * * *` (mỗi giờ)
  - Lead ở poolType `SALES`, status `ASSIGNED`, `deadline < now` → thu hồi và phân lại Sales (ưu tiên cùng đơn vị → cùng khối → khối anh em → cùng tổ chức), **không** gán lại sales đã nằm trong `previousAssignees`.
  - Mỗi vòng Sales giữ theo `data_pool_auto_recall_days` (mặc định `3` ngày).
  - Nếu `awaitingSalesAfterCskh = true` (Sales đang xử lý sau khi CSKH thu hồi): hết hạn → phân lại **CSKH** (ưu tiên đơn vị/khối), giữ `customer_recycle_days` / `resales_hold_days` theo `cskhStage`, **không** tính vào vòng `max_repartition_rounds`.
  - Nếu luồng Sales thường và vượt `max_repartition_rounds` (mặc định `5`) → **trả số về kho thả nổi** (`status=AVAILABLE`, `poolType=SALES`, gỡ `employeeId` khách).
  - Revoke `leadDistributionHistory` và tạo lịch sử phân lại khi có nhân viên mới.
- CSKH interaction check: `0 8 * * *` (mỗi ngày 8h)
  - PoolType `CSKH`, `interactionDeadline < now` → chuyển về Sales, set `awaitingSalesAfterCskh = true`, `deadline = now + data_pool_auto_recall_days`.
  - `interactionDeadline` được reset theo `cskh_max_note_days` (mặc định `15`) khi có lịch sử tác động; CSKH có thể kéo dài hạn trên từng khách qua `PUT /api/resales/customer/:id` với `cskhInteractionDeadlineDays`.
- CSKH hold limit: `0 9 * * *` (mỗi ngày 9h)
  - PoolType `CSKH`, `holdUntil < now` → chuyển về Sales tương tự (cờ `awaitingSalesAfterCskh`).
- Deadline reminder: `0 8 * * *`
  - Sắp đến `deadline` trong 1 ngày → tạo `userNotification` nhắc hạn
- Hẹn gọi lại (callback): `*/5 * * * *` (mỗi 5 phút)
  - Lead `status=ASSIGNED`, `callback_notify_enabled`, có `callback_at`, `callback_reminder_sent_at` null, `now >= callback_at − callback_notify_minutes_before` → tạo `user_notifications` (+ Web Push) cho `assigned_to_id`, ghi `callback_reminder_sent_at`. Đổi hẹn/cấu hình nhắc trên UI **xóa** `callback_reminder_sent_at` để có thể nhắc lại cho lượt hẹn mới.
- Marketing attribution reset: `0 7 * * *`
  - Khách có `marketingOwnerId` quá hạn (`attributionExpiredAt < now`) → reset `marketingOwnerId` về null
  - `attributionExpiredAt` được cập nhật từ ngày `DELIVERED` gần nhất theo `marketing_revenue_attribution_days` (mặc định `45` ngày) **cộng** `customers.marketing_attribution_extra_days` (CSKH chỉnh qua `PUT /api/resales/customer/:id`, dùng cho VIP / ngoại lệ).
 - CSKH khởi tạo sau đủ số đơn `DELIVERED` theo `sales_orders_before_cs_handoff` (mặc định `1`):
   - Sau khi cập nhật đơn sang `DELIVERED`, nếu số đơn `DELIVERED` của khách **bằng** ngưỡng này và khách còn `employeeId` (sales), hệ thống cập nhật `data_pool` sang `poolType=CSKH`, `status=ASSIGNED`
   - Set `cskhStage=1`, `holdUntil = now + customer_recycle_days` (mặc định `180` ngày)
   - Set `interactionDeadline = now + cskh_max_note_days` (mặc định `15` ngày)
   - Phân cho nhân sự Resales và cập nhật `assignedToId` tương ứng (để cron CSKH có dữ liệu chạy vòng đời ngay)

### 3.6 Tham số vận hành (Vận hành → Tham số vận hành)

Chỉ danh mục `operations_params` hiển thị trên tab này (và mục tương ứng trong Cài đặt). Các key cũ Marketing/Telesales/Resales dư thừa được gán category `deprecated_internal` khi seed lại (`seedDefaultConfigs`). Phân bổ kho số (`auto_assign_lead`, `lead_assign_method`) vẫn là `lead_distribution`, chỉnh qua quyền `DATA_POOL_CONFIG` / API — **không** nằm trên tab Tham số vận hành.

**Danh mục trạng thái xử lý lead (Vận hành → quản lý `lead_processing_statuses`):** Mã và nhãn chuẩn nằm trong `backend/src/constants/operationParams.ts` (`POOL_PUSH_STATUS_DEFINITIONS`). Khi backend khởi động, `ensureLeadProcessingStatuses` upsert bảng `lead_processing_statuses` (cập nhật `name` / `sortOrder`; **không** ghi đè `is_push_to_pool` trên bản ghi đã tồn tại — cờ này đồng bộ từ `pool_push_processing_statuses` khi khởi động và khi lưu cấu hình) và gán `data_pool.processing_status = NEW` («Mới») cho các bản ghi kho còn trống trạng thái. Số/lead **mới** vào kho (`data_pool` tạo từ Marketing, import, public API, Sales thêm khách, v.v.) mặc định `processing_status = NEW`. Giao diện Sales / Kho số thả nổi / CSKH lấy danh sách dropdown từ `GET /api/processing-statuses/active` (đồng bộ với tab cấu hình Vận hành). Trạng thái `NEW` **không** nằm trong `DEFAULT_POOL_PUSH_PROCESSING_STATUSES` (không đẩy kho thả nổi theo mặc định).

Các key (chỉnh khi có quyền `CONFIG_OPERATIONS` hoặc `EDIT_SETTINGS`, hoặc tài khoản quản trị hệ thống):

- `min_note_characters` (INTEGER, mặc định `10`): tối thiểu ký tự ghi chú lịch sử tác động (Sales/CSKH). **Ngoại lệ:** khi trạng thái xử lý được chọn thuộc `pool_push_processing_statuses`, backend **không** áp tối thiểu (`salesController` / `resalesController`); FE modal `CustomerImpactHistoryModal` đồng bộ (dùng danh sách mã từ cấu hình hoặc mặc định giống backend khi chưa có bản ghi).
- `marketing_allow_duplicate_phone` (BOOLEAN, mặc định `true`): bật = cho phép marketing xử lý SĐT trùng (ghi nhận/ghi chú theo luồng hiện tại); tắt = từ chối tạo lead trùng SĐT.
- `marketing_revenue_attribution_days` (INTEGER, `45`): kỳ attribution marketing sau đơn giao; cộng thêm `marketing_attribution_extra_days` trên bảng `customers` khi có.
- `pool_push_processing_statuses` (STRING, JSON mảng mã): các mã trạng thái xử lý Sales mà khi chọn sẽ **đưa số về kho thả nổi** (`AVAILABLE`). **Cài mới:** mặc định tích sẵn `WRONG_NUMBER`, `INVALID_NUMBER_TYPE`, `NO_NEED`, `TRASH_LEAD`, `RELEASED` (Sai số; Số loại/không hợp lệ; Không có nhu cầu; Sổ thả/lead rác; Trả số/nhả lead). Các mã khác (ví dụ «Không nghe máy», «Khách tham khảo») chỉ đẩy kho thả nổi khi được bật trên FE. **Môi trường đã có dữ liệu:** giá trị JSON đã lưu **không** bị ghi đè khi `seedDefaultConfigs` chạy lại (chỉ cập nhật metadata); lọc kho thả nổi và ngoại lệ ghi chú ngắn đọc từ JSON này. Khi lưu tab Tham số vận hành hoặc khi sửa cờ «Đẩy kho thả nổi» trên danh mục trạng thái, hai nguồn được đồng bộ. Mã không nằm trong danh sách có thể đi luồng phân bộ lại theo `max_repartition_rounds`. Định nghĩa mã: `backend/src/constants/operationParams.ts`.
- `data_pool_auto_recall_days` (INTEGER, `3`): số ngày Sales giữ số kể từ `assignedAt` (và thời hạn Sales sau khi CSKH chuyển về).
- `max_repartition_rounds` (INTEGER, `5`): số vòng phân Sales tối đa trước khi trả kho thả nổi (luồng marketing/sales thường).
- `sales_orders_before_cs_handoff` (INTEGER, `1`): số đơn `DELIVERED` cần đạt trước khi chuyển khách sang CSKH sau cấu hình auto phân resales.
- `customer_recycle_days` (INTEGER, `180`): CSKH lần 1 giữ số (`holdUntil`).
- `cskh_max_note_days` (INTEGER, `15`): hạn có ghi chú CSKH (mặc định); có thể chỉnh từng khách qua API resales.
- `resales_hold_days` (INTEGER, `90`): CSKH lần 2+ giữ số.

### 3.7 Ngôn ngữ hiển thị trên FE (tiếng Việt)

- Sidebar hiển thị trực tiếp `menus.label` từ DB (FE không tự map menu). `syncDefaultMenus()` trong `backend/src/controllers/authController.ts` cập nhật `label` theo `path` để đảm bảo nhãn menu hiển thị tiếng Việt (ví dụ: `Bảng điều khiển`, `Tiếp thị`, `Kinh doanh`).
- Màn hình phân quyền nhóm (`RoleGroupManager`, Hệ thống → Nhóm quyền): nhãn chức năng lấy từ `translatePermissionLabel(code, name)` trong `frontend/src/utils/dictionary.ts` — ưu tiên tra nhãn tiếng Việt theo `Permission.code` trong `DICTIONARY`, rồi mới dịch `name`. DB lưu `name` và **`description`** (mô tả ngắn tiếng Việt cho tooltip/hướng dẫn; đồng bộ từ catalog `backend/src/constants/permissionsCatalog.ts` khi `syncDefaultMenus`). Chức năng được chia thành **15 nhóm theo module** trên UI (tiền tố `01.`–`15.` để sắp thứ tự): Hệ thống, Dashboard & Báo cáo, Nhân sự, Kho số & Phân bổ, Khách hàng, Marketing, Sales, CSKH, Sản phẩm, Hỗ trợ, Đơn hàng & Vận chuyển, Kho vận, Kế toán, Vận hành & Cơ cấu, Tiện ích (map `PERMISSION_GROUPS` trong `RoleGroupManager.tsx`; quyền trong nhóm **sắp theo mã**). Tổng cộng **73 quyền** trong catalog (cùng file `permissionsCatalog.ts`), đồng bộ `dictionary.ts` (FE) và `checkPermission()` (routes). Khi server khởi động, `syncDefaultMenus()` tự upsert các quyền catalog vào DB và **xóa quyền "ma"** (permission trong DB nhưng không nằm trong danh sách chính thức) qua `cleanupOrphanPermissions()`.
- **Địa danh hành chính (tỉnh/thành, quận/huyện, phường/xã):** FE hiển thị dạng Title Case (mỗi từ viết hoa đầu, `vi-VN`) qua `administrativeTitleCase` / `formatAdminGeoLine` trong `frontend/src/utils/addressDisplayFormat.ts`; bản đồ phân bố khách dùng `matchAdministrativeNameKey` để khớp tên tỉnh từ API (có thể chữ thường) với bảng tọa độ cố định.

## 4. Nghiệp vụ theo chức năng chính

> Danh sách dưới đây bám theo các nhóm route trong `backend/src/routes/api.ts`.

### 4.1. Auth & quản trị nhân sự (login/logout/lock)

- `POST /api/login`
  - Chuẩn hóa phone (9 số → thêm `0`)
  - Self-healing:
    - Nếu là Super Admin phone (`SUPERADMIN_PHONE`) thì đảm bảo tồn tại tài khoản admin hệ thống
    - Đảm bảo Super Admin có role ADM + password mặc định nếu thiếu
    - Nếu role group technical admin chưa có menu/permission → auto tạo từ bộ mặc định
  - Login thành công → set cookie token JWT + trả user/menu/permissions.
  - **Thông báo lỗi:** phản hồi lỗi đăng nhập và lỗi xác thực (401/403 liên quan phiên) dùng **tiếng Việt** trong `message` JSON. Tránh lỗi 500 do `roleGroup.permissions` thiếu: map permission luôn dùng `(roleGroup?.permissions ?? []).map(...)`. FE: `frontend/src/api/client.ts` ném `ApiHttpError` kèm `status` và **luôn đọc `message` từ body** (kể cả 401), màn đăng nhập hiển thị trực tiếp chuỗi đó; `useAuthStore.checkAuth` coi mọi `ApiHttpError` mã 401 là hết phiên.
- `GET /api/me`
  - Trả thông tin user đang đăng nhập (kèm menu/permissions).
- `POST /api/logout`
  - Xóa cookie `jwt`
- Tác vụ ADM:
  - `POST /api/auth/admin/set-temp-password` (một trong: `MANAGE_HR`, `MANAGE_SYSTEM`, `STAFF_LOCK`)
  - `POST /api/auth/admin/issue-staff-check-token` (`MANAGE_HR` hoặc `MANAGE_SYSTEM`): phát hành JWT ngắn hạn (khoảng 15 phút, có `jti`) để mở tab mới và đăng nhập thay nhân sự.
  - `POST /api/auth/consume-staff-check-token` (public, không cần cookie): body `{ token }` — **không** ghi cookie `jwt` (tránh mọi tab cùng origin bị đổi phiên); trả JWT phiên trong JSON; FE lưu vào **sessionStorage** cửa sổ kiểm tra và gửi `Authorization: Bearer`. Middleware xác thực **ưu tiên Bearer** rồi mới cookie. Dùng khi cửa sổ mới tải `/login?staffCheck=…`. Token có hiệu lực ~15 phút (kể từ lúc phát hành). **Mỗi token chỉ tiêu thụ thành công một lần** (theo dõi `jti` trong bộ nhớ process: `staffCheckTokenStore.ts`). Nếu **nhiều instance** backend cùng lúc, cần chuyển sang Redis/DB tương đương để chặn dùng lại nhất quán.
  - `POST /api/auth/admin/logout-employee` (STAFF_LOGOUT): vô hiệu hóa phiên qua `session_invalidated_at`
  - `POST /api/auth/admin/lock-employee` (STAFF_LOCK): lock/unlock account và invalidate session
  - **Giao diện:** đặt mật khẩu tạm không còn tab riêng; thao tác **Mật khẩu tạm** nằm trên danh sách **Tài khoản nhân sự** (Cài đặt hệ thống → tab Tài khoản nhân sự, hoặc Quản trị hệ thống → tab Tài khoản nhân sự), theo từng dòng nhân sự. Modal **Mật khẩu tạm** có **Tạo ngẫu nhiên 12 ký tự** và **Sao chép**. Thao tác **Kiểm tra** mở **cửa sổ trình duyệt mới** (pop-up có kích thước); cửa sổ đó tự đăng nhập bằng tài khoản nhân sự (JWT phiên trong sessionStorage — tab/cửa sổ quản trị giữ phiên riêng). Hành động `STAFF_CHECK_LOGIN` ghi trong nhật ký cho quản trị, `LOGIN` cho phiên nhân sự.
- `POST /api/auth/change-password`
  - Đổi mật khẩu theo currentPassword
- **Menu sidebar (DB `menus`, thứ tự chuẩn):**
  - Nguồn cấu hình: `DEFAULT_MENUS` trong `backend/src/controllers/authController.ts`.
  - Mỗi lần backend kết nối PostgreSQL (`connectDB`), hàm `syncDefaultMenus` cập nhật theo `path`: **`label` là chuỗi hiển thị (tiếng Việt) lưu trong DB**, `icon`, `order`; thêm bản ghi nếu chưa có.
  - Sidebar (`Sidebar.tsx`) hiển thị trực tiếp `menu.label` từ API — không map menu tại FE.
  - **Hai module tách route:** Kagri AI → SPA `/ai` (menu path `/ai`). Tin nhắn (chat nội bộ) → SPA `/chat` (menu path `/chat`), **xếp ngay sau Tài liệu**.
  - Role đã có menu `/chat` được tự bổ sung `/ai` khi sync (tránh mất module AI). Nhóm `system_administrator` / `ADM` được gán lại **đủ** menu trong DB sau mỗi lần sync.
  - Thứ tự hiển thị: Bảng điều khiển → Báo cáo → Kagri AI → Tài liệu → **Tin nhắn** → Nhân sự → Tiếp thị → **Kho số thả nổi** → Kinh doanh → CSKH → Sản phẩm → Kho vận → Đơn hàng → Bảo hành → Kế toán → Vận hành → Hệ thống → Hỗ trợ → Cài đặt.

### 4.2. Customer (Khách hàng), tag, farm và import/export Excel

Module nằm ở `backend/src/routes/customerRoutes.ts` + `backend/src/controllers/customerController.ts`.

Nghiệp vụ chính:

- `GET /api/customers` / `GET /api/customers/:id`
  - Lọc theo search/status/employeeId/tagIds/createdByRole/province/mainCrop…
  - Áp dụng phạm vi xem theo cấu hình “view scope” để không lộ khách của người khác.
  - Response danh sách (`GET /api/customers`) có thêm **`viewScopeDescription`** (chuỗi tiếng Việt) — mô tả ngắn phạm vi (FULL_ACCESS, quản trị hệ thống, `VIEW_ALL_COMPANY_CUSTOMERS`, hoặc **Phạm vi xem (CUSTOMER)** trên Nhóm quyền: SELF_RECURSIVE / DEPARTMENT / DIVISION / COMPANY). Helper: `describeCustomerListScopeVi` trong `viewScopeHelper.ts`.
- `POST /api/customers` / `PUT /api/customers/:id` / `DELETE /api/customers/:id`
  - **Tạo khách (`POST`):** JWT cần một trong `MANAGE_CUSTOMERS` | `MANAGE_SALES` | `MANAGE_RESALES` (quản trị kỹ thuật / `FULL_ACCESS` theo `checkPermission`). **Sửa/xóa** khách: quyền như cấu hình route (ví dụ `MANAGE_CUSTOMERS`, `DELETE_CUSTOMER` cho xóa).
  - Tạo mã `KH-XXXXXX`
  - Ràng buộc trùng `phone`; **SĐT phụ** `phone_secondary` (nullable, unique khi có giá trị) — gán **một lần** qua `PATCH /api/customers/:id/phone-secondary`, không sửa sau khi đã có (API trả lỗi nếu đã tồn tại hai số).
  - **Trùng SĐT khi tạo (`POST`):** HTTP 400, `duplicate: true`, `responsibleStaff` (tên + SĐT **NV Sales/CSKH phụ trách** và/hoặc **NV Marketing** khi có trên bản ghi khách — ưu tiên `customers.employee_id`, nếu chưa có thì NV đang được gán ở kho `data_pool.assigned_to_id` khi `status=ASSIGNED`). Đồng thời gửi `user_notifications` (`notifyDuplicateStakeholders` trong `leadDuplicateService`) tới các NV phụ trách đó — **không** gửi lại cho chính người vừa nhập trùng. Ghi `system_logs` (cảnh báo). **Lịch sử tác động:** ghi `customer_interactions` loại `sales_duplicate_phone_attempt` (thời gian + người nhập + nội dung form qua `addDuplicateNote`). FE form khách (`CustomerForm.tsx`) hiển thị thêm các dòng NV trong thông báo lỗi.
  - **Tạo khách thành công (Sales / CSKH):** ghi thêm một dòng `customer_interactions` loại `lead_created` (thời gian, nhân viên, mã/SĐT, ghi chú form nếu có) — không tách thêm `NOTE` riêng cho hai role này để tránh trùng dòng.
  - **NV marketing đóng góp (1-n):** bảng `customer_marketing_contributors` (khách + nhân viên marketing đã từng nhập/trùng SĐT); backfill từ `created_by` / marketing owner khi migrate; luồng tạo khách Marketing / trùng SĐT gọi upsert contributor.
  - Khi tạo mới bởi role `SALES` thì tự gắn customer vào `DataPool` (status ASSIGNED) để hiển thị vào danh sách Sales.
  - **Sales gán Marketing (tùy chọn):** body `POST` có thể có `marketingOwnerId`, `campaignId`, `leadSourceId` — gắn số cho NV Marketing và chiến dịch/nền tảng; backend kiểm tra NV tồn tại, set `attributionExpiredAt` theo `marketing_revenue_attribution_days`. FE: form tạo khách trên **Kinh doanh** (`CustomerForm.tsx`) — dropdown NV Marketing lấy từ `GET /api/hr/employees?marketingOwnerOptions=1` (xem mục **4.10**); danh sách chiến dịch theo `GET /api/marketing/campaigns?createdByEmployeeId=…`, tự điền `leadSourceId` theo chiến dịch khi chọn.
  - Update:
    - Chỉ admin mới được thay đổi `employeeId` (chuyển chủ)
    - Ghi “lịch sử tác động” theo từng trường thay đổi (customerInteraction).
  - Delete (`DELETE_CUSTOMER`; `FULL_ACCESS` / quản trị kỹ thuật theo `checkPermission`):
    - Xóa cascade: đơn hàng (và log kho/vận đơn liên quan), lead/cơ hội, phân lead, bảo hành, hóa đơn nháp, ghi chú nội bộ gắn khách, tương tác/tổng hợp/thẻ/nông trại/địa chỉ, kho số, rồi khách; gỡ `duplicate_of_customer_id` trỏ tới khách này.
    - Phạm vi bản ghi: cùng quy tắc **sửa** khách (admin kỹ thuật: mọi khách; người khác: chỉ khách do mình/cấp dưới phụ trách hoặc khách chưa gán `employeeId`).
    - Ghi `system_logs` khi xóa thành công.
- Tags:
  - `GET/POST/PUT/DELETE /api/customer-tags/...`
  - `POST /api/customer-tags/assign` / `DELETE /api/customer-tags/:customerId/:tagId` — **ghi nhật ký** (`logAudit`) khi gắn/bỏ thẻ nhanh (chi tiết tiếng Việt: tên thẻ, tên/SĐT khách).
  - **Ghi (CRUD + gán):** một trong `MANAGE_CUSTOMERS` | `MANAGE_SALES` | `MANAGE_RESALES` | `MANAGE_MARKETING_GROUPS`. **FE:** modal «Quản lý thẻ» trên **Tiếp thị** (`Marketing.tsx`), **Kinh doanh / Sales** (`Sales.tsx`), **CSKH** (`Resales.tsx`) — dùng chung API, danh sách thẻ trên form thêm/sửa khách đồng bộ sau khi đóng modal.
  - **Thẻ mặc định (Kagri — phân bón sinh học & IoT nông nghiệp):** khi khởi động backend, `ensureDefaultCustomerTags` upsert theo `code` (ví dụ `KAGRI_BIO_FERTILIZER`, `KAGRI_IOT_SENSOR`, nhóm `TECH_IOT`, …) — không xóa thẻ do người dùng tạo.
  - **Danh sách khách:** cột **«Thẻ khách hàng»** — **Tiếp thị** (`Marketing.tsx`): **chỉ xem** trên bảng (không gắn/bỏ thẻ tại ô); **Kinh doanh / Sales**, **CSKH** (`Resales`), **Kho số thả nổi** (`DataPool`): hiển thị badge và **gắn/bỏ thẻ nhanh** (`CustomerTagsQuickCell`) khi có quyền gán thẻ. Modal «Quản lý thẻ» (danh mục thẻ) vẫn có trên các màn có quyền tương ứng.
- Customer farms:
  - `GET/POST/PUT/DELETE /api/customers/:customerId/farms...`
  - Xóa soft (`isActive=false`).
- Import/Export Excel:
  - `GET /api/customers/export/excel` (`VIEW_CUSTOMERS`)
  - `GET /api/customers/import/template` (VIEW_CUSTOMERS)
  - `POST /api/customers/import` (MANAGE_CUSTOMERS) + `excelUploadMiddleware`
  - Phần import có kiểm tra các cột bắt buộc (SĐT, Loại hình, Kênh tiếp cận, Thẻ…).

### 4.3. Data Pool — «Kho số thả nổi» (data đã loại) & kho Sales (chưa phân)

Module ở `backend/src/routes/dataPoolRoutes.ts` + `backend/src/controllers/dataPoolController.ts`.

Bảng `data_pool` có **`pool_queue`**: `SALES_OPEN` | `FLOATING` (migration `20260327140000_data_pool_queue`).

- **`SALES_OPEN` (kho Sales, chưa phân NV):** lead mới từ Marketing / import / website / thu hồi… — NV Sales nhận qua `POST /api/data-pool/claim` (quyền `CLAIM_LEAD`). **Giao diện:** khối «Kho Sales (chưa phân)» nằm trên trang **Kinh doanh (Sales)** (`Sales.tsx`). Màn **Kho số thả nổi** (`/data-pool`) **không** hiển thị, **không** quản lý và **không** thống kê kho này.
- **`FLOATING` (kho thả nổi):** chỉ chứa số **đã bị loại** khỏi luồng đang phụ trách (đẩy về thả nổi): khi Sales chọn trạng thái xử lý thuộc `pool_push_processing_statuses`, hoặc hết vòng phân bổ Sales (cron), v.v. Đây **không** là kho «số mới chờ phân NV» — đối tượng đó là `SALES_OPEN` trên trang Sales. **Phân** (`POST /api/data-pool/distribute`) và **nhận** (`POST /api/data-pool/claim-customer`): JWT có ít nhất một trong `DISTRIBUTE_FLOATING_POOL` / `MANAGE_DATA_POOL` / `CLAIM_FLOATING_POOL` — gán qua **Nhóm quyền** (quản trị kỹ thuật bypass theo rule dự án).

**Phạm vi phân từ kho thả nổi:** user chỉ có `DISTRIBUTE_FLOATING_POOL` chỉ chọn đích trong phạm vi khối/đơn vị được quản lý; cần **`DISTRIBUTE_FLOATING_CROSS_ORG`** để phân ra mọi khối/đơn vị/NV (kiểm tra `floatingPoolScopeHelper` + `distributeFromFloatingPool`).

**Màn hình Kho số thả nổi (`DataPool.tsx`, `/data-pool`):**

- **Chỉ** danh sách số đã loại về thả nổi: `status=AVAILABLE`, `poolQueue=FLOATING`, `poolType=SALES`. Khi không chọn trạng thái xử lý cụ thể, backend lọc `processingStatus` theo mã trong **`pool_push_processing_statuses`** (`system_config`; cờ `is_push_to_pool` trên `lead_processing_statuses` được đồng bộ với JSON này khi khởi động / lưu cấu hình).
- **Thống kê trên màn này** (từ `GET /api/data-pool/stats` mà FE dùng): **`totalAvailableFloating`** = số bản ghi `AVAILABLE` + `FLOATING` + `poolType=SALES` (đang chờ trong kho thả nổi). **`todayAdded`** = số bản ghi cùng điều kiện đó có **`enteredAt`** từ 0h hôm nay (giờ server) — **không** đếm lead mới vào `SALES_OPEN` hay các hàng đợi/trạng thái khác, để tránh lệch so với danh sách.
- **Không** tab «Lead trong đơn vị», **không** xuất Excel trên màn này (export khách: module Khách hàng + `VIEW_CUSTOMERS`).
- Cùng response `GET /api/data-pool/stats` vẫn trả **`totalAvailable`**, **`totalAvailableSalesOpen`**, **`totalAssigned`**, … phục vụ trang **Sales** và tích hợp khác; riêng **UI** Kho số thả nổi chỉ dùng hai chỉ số FLOATING Sales ở trên cho hai thẻ đầu.

**Quyền xem API:** `VIEW_FLOATING_POOL` (thay mã cũ `VIEW_DATA_POOL`, migration `20260328200000_rbac_floating_pool_orders_permissions`). Một số route cho phép `VIEW_SALES` để tương thích đọc kho `SALES_OPEN` (xem `dataPoolRoutes.ts`).

**Marketing → Sales:** sau khi tạo bản ghi `SALES_OPEN`, hệ thống **luôn** thử tự phân (tỉ lệ MKT→Sales nằm ở **khối** `data_flow_shares` trên Vận hành; cột DB `auto_distribute_lead` **không còn** dùng trong nghiệp vụ và **không** cho sửa qua API cập nhật khối). Thứ tự: **(1)** `pickNextSalesEmployeeId` (luồng khối, chia đều NV trong đơn vị lá Sales qua `MKT_SALES_EMPLOYEE_IN_LEAF`; khi cây org lệch, có thể neo khối gần đơn vị NV qua `findNearestDivisionContainingDepartment`); **(2)** fallback `assignLeadsUsingTeamRatios` (bảng `team_distribution_ratios`). **Phân xong:** gửi `user_notifications` (loại `NEW_LEAD`) + socket `new_lead` + Web Push tới **NV Sales được gán** (`notifySalesLeadFromMarketing.ts`). Nếu **không** chọn được NV Sales, lead vẫn `AVAILABLE`. **Lưu ý kỹ thuật:** phần dư khi chia theo `team_distribution_ratios` chỉ gán vào đơn vị còn NV `WORKING` (xem `teamRatioDistributionService`).

**Cron nhắc thu hồi:** `backend/src/cron/leadDistribution.ts` — hàm `deadlineReminder` tạo `userNotification` khi `deadline` lead rơi vào **ngày mai** (nhắc trước khi thu hồi tự động).

Nghiệp vụ API:

- `GET /api/data-pool` — `poolQueue`, `managedScope`, `status`, `strictPoolPush`, lọc `provinceId` / `mainCrop` (customer).
- `GET /api/data-pool/stats` — `totalAvailable`, `totalAvailableSalesOpen`, `totalAvailableFloating` (FLOATING + AVAILABLE + `poolType=SALES`), `todayAdded` (cùng khung FLOATING Sales AVAILABLE, `enteredAt` trong ngày — không phản ánh SALES_OPEN), …; `?managedScope=1` cho thống kê theo đội (trưởng đơn vị; nhánh này giữ `todayAdded` theo `enteredAt` + lọc đội).
- `POST /api/data-pool/distribute` — lead `pool_queue=FLOATING`; kiểm tra quyền + phạm vi đích.
- `POST /api/data-pool/claim-customer` — `pool_queue=FLOATING`.
- `POST /api/data-pool/claim` — `pool_queue=SALES_OPEN` (`CLAIM_LEAD`).
- `PUT /api/data-pool/processing-status` — đẩy về kho thả nổi: `pool_queue=FLOATING` + `processing_status` tương ứng.
- `PUT /api/data-pool/callback-schedule` — **hẹn gọi lại** + **nhắc thông báo** trên `data_pool`: body `{ dataPoolId, callbackAt (ISO hoặc null), callbackNotifyEnabled, callbackNotifyMinutesBefore }`; quyền một trong `CLAIM_LEAD` | `MANAGE_SALES` | `MANAGE_RESALES` | `MANAGE_DATA_POOL`; ghi `customer_interactions` + `system_logs`. Cron mỗi **5 phút** gửi `user_notifications` (+ Web Push nếu cấu hình) cho **NV được gán** khi `now >= callbackAt - callbackNotifyMinutesBefore` (và chưa gửi lượt này — `callback_reminder_sent_at`).
- Các route assign/auto-distribute/recall/immediate-distribute giữ cho cron/vận hành; `immediate-distribute` dùng chung service tỉ lệ khi phân hàng loạt.

### 4.4. Sales (Danh sách khách hàng Sales)

Module ở `backend/src/routes/salesRoutes.ts` + `backend/src/controllers/salesController.ts`.

**Thay đổi lớn:** Pipeline Lead → Opportunity → Customer đã bị loại bỏ. Sales giờ chỉ nhận danh sách khách hàng/lead để xử lý, không có bước chuyển đổi.

**Phân quyền theo phạm vi xem (View Scope):** Quản lý khối xem toàn khối + đơn vị con; quản lý đơn vị xem đơn vị mình; nhân viên chỉ xem data của mình. Dùng `getVisibleEmployeeIds` từ `viewScopeHelper.ts`. Quyền **`VIEW_ALL_COMPANY_CUSTOMERS`** bỏ lọc theo cây (xem toàn công ty) — không hardcode nhóm CRM.

Nghiệp vụ:

- `GET /api/sales/my-leads` — lọc theo `employeeId`, `tagIds`, `processingStatus`, `priority` (1–5), `source`, `dateFrom`, `dateTo`, **`provinceId`**, **`mainCrop`**, **`spendingRankCode`** (hạng chi tiêu / `customers.spending_rank_code`; giá trị đặc biệt **`__UNRANKED__`** = khách **chưa xếp hạng**, tức `spending_rank_code` null); include khách kèm `spendingRank`, `totalOrdersValue` (tổng `finalAmount` các đơn đã giao **DELIVERED**), `marketingContributors`, `phoneSecondary`, v.v.
- `GET /api/sales/stats` — thống kê lead (đang xử lý, chốt đơn, tương tác hôm nay)
- `PUT /api/sales/lead/:id/status` — cập nhật trạng thái lead
- `PATCH /api/sales/lead/:id/priority` — đổi **ưu tiên** (1–5) trên `data_pool` (pool Sales); ghi dòng lịch sử tác động (`SYSTEM_CHANGE`) + `logAudit`
- `POST /api/sales/interaction` — ghi nhận tương tác (body có thể có `detail`, `processingStatus`, `syncProcessingToDataPool`); độ dài tối thiểu theo `min_note_characters` (ưu tiên kiểm tra `detail` nếu có), **trừ** khi `processingStatus` thuộc `pool_push_processing_statuses` (đẩy kho thả nổi).
- `GET /api/sales/interactions/:customerId` — lịch sử tác động / tương tác (phân trang), phạm vi quyền Sales (`userCanAccessCustomerForSalesModule`)
- Khách: `PATCH /api/customers/:id/quick-name` (đổi tên nhanh), `PATCH /api/customers/:id/phone-secondary` (SĐT phụ một lần), `PATCH /api/customers/:id/quick-main-crop` (body `{ mainCrop }` — **một** cây; tương thích cũ), `PATCH /api/customers/:id/quick-main-crops` (body `{ mainCrops: string[], mainCropsRootCounts?: object }` — **nhiều** cây trong danh mục; gốc bắt buộc cho cây tính theo gốc) — đều ghi impact + audit khi thành công.

**Lịch sử tác động (`customer_interactions`):** trường `kind` phân biệt ghi chú thủ công (`USER_NOTE`) và thay đổi hệ thống/ghi nhận diff (`SYSTEM_CHANGE`); có `detail`, `processing_status_at_time`. Các thao tác đổi tên / SĐT phụ / nhóm cây / thẻ / ưu tiên / … tạo dòng mô tả tiếng Việt (và nhật ký `system_logs` theo mục 3.3).

**Giao diện (FE `Sales.tsx`):** Bộ lọc: **hạng chi tiêu** (`spendingRankCode`, danh sách từ `GET /api/customer-ranks/spending-ranks`, thêm mục **Chưa xếp hạng** → `__UNRANKED__`). Bảng lead: cột **Khách** (tên → đổi tên nhanh, mã, **hạng chi tiêu** + **đã mua** = `totalOrdersValue`, thẻ nhanh — dropdown gắn thẻ render qua portal để không bị cắt bởi `overflow` bảng), **Nhóm cây** (hiển thị đủ `mainCrops`, **số gốc** (`mainCropsRootCounts`) cho cây tính theo gốc; dòng phụ **diện tích** `farmArea`/`farmAreaUnit` và **loại đất** `soilType` khi có; mở modal **Sửa nhóm cây** — `quick-main-crops` khi có quyền quản lý Sales/Resales/Khách), **Liên hệ** (SĐT1 + SĐT phụ), **Ưu tiên** (chọn 1–5), **Trạng thái** xử lý lead (`data_pool.processingStatus` — **đổi trực tiếp** tại cột khi có quyền quản lý Sales; `PUT /data-pool/processing-status`), **Hẹn gọi lại** (`datetime-local` + bật **Nhắc tôi** + chọn phút nhắc trước — `PUT /data-pool/callback-schedule`), **NV phụ trách**, **NV marketing**, **Nguồn**, **Tác động** (chỉ **xem / thêm lịch sử tác động** — modal timeline + form ghi chú; trạng thái xử lý khi thêm ghi chú nằm trong form modal, không trùng cột Trạng thái), **Cập nhật** (form khách). Trên **CSKH** (`Resales.tsx`) cùng cách bố trí (lọc hạng đồng bộ API hạng; **Nhóm cây** như Sales); đổi trạng thái tại cột **Trạng thái** khi có `data_pool` và quyền; modal lịch sử dùng API prefix `resales`.

**Route đã loại bỏ:** `/lead/:id/convert`, `/opportunity/:id/convert`, `/opportunities`, `/opportunity/:id`, `/pipeline`

Điểm nối sang Order/Resales:

- Khi đơn đầu tiên của khách được giao `DELIVERED`, hệ thống cập nhật tổng giá trị, rank, và push sang CSKH nếu cấu hình bật.

### 4.5. Resales (CSKH) & chăm sóc khách

Module ở `backend/src/routes/resalesRoutes.ts` + `backend/src/controllers/resalesController.ts`.

**Phân quyền theo View Scope:** Tương tự Sales, dùng `getVisibleEmployeeIds` thay vì `includeSubordinates` cũ. Quản lý khối/đơn vị xem theo phạm vi được gán trong `RoleGroupViewScope`. **`VIEW_ALL_COMPANY_CUSTOMERS`** bỏ lọc phạm vi nhân viên.

Nghiệp vụ:

- `GET /api/resales/my-customers` — lọc: `employeeId`, `tagIds`, `processingStatus`, `cskhStage`, `interactionDeadline` (overdue/soon/ok), `priority` (1–5), `source`, `dateFrom`, `dateTo`, **`provinceId`**, **`mainCrop`**, **`spendingRankCode`** (hạng chi tiêu; **`__UNRANKED__`** = chưa xếp hạng / `spending_rank_code` null); include **`dataPool`** (id, priority, `processingStatus`, nguồn), `marketingContributors`, `leadSource` / `campaign`, `phoneSecondary`, v.v.
- `GET /api/resales/customer/:id` — chi tiết khách
- `GET /api/resales/care-schedule` — lịch chăm sóc
- `POST /api/resales/interaction` — ghi nhận tương tác (body mở rộng nhánh Sales: `detail`, `processingStatus`, `syncProcessingToDataPool`)
- `GET /api/resales/interactions/:customerId` — lịch sử tác động (phân trang), phạm vi Resales
- `PATCH /api/resales/lead/:id/priority` — đổi ưu tiên lead **CSKH** (`poolType=CSKH`); ghi impact + audit
- `PUT /api/resales/customer/:id` — cập nhật khách
- `POST /api/resales/transfer` — chuyển khách nội bộ

**Giao diện (FE `Resales.tsx`):** Cột **Khách** (hạng + đã mua; thẻ), **Nhóm cây** (cùng cách hiển thị Sales: cây, số gốc, diện tích, loại đất), **Liên hệ**, **Trạng thái**, **Hẹn gọi lại** (như Sales), **Tác động** như mô tả mục Sales (đổi TT tại cột Trạng thái; Tác động chỉ mở lịch sử); modal `apiPrefix=resales`. API: `PUT /api/data-pool/processing-status` và `PUT /api/data-pool/callback-schedule` khi có `dataPool.id`.

### 4.6. Marketing (Sources/Campaigns/Leads/Costs) và đẩy lead vào DataPool

Module ở `backend/src/routes/marketingRoutes.ts` + `backend/src/controllers/marketingController.ts`.

Các nhánh nghiệp vụ:

- **Nền tảng** (sources — bảng `marketing_sources`; nhãn UI: «Nền tảng»):
  - **Phạm vi dữ liệu:** một danh mục **dùng chung toàn công ty** (không phân đơn vị/tổ chức trên bản ghi). Mọi nhân viên **đã đăng nhập** có thể **`GET /api/marketing/sources`** để đọc danh sách (dropdown, tham chiếu). Tab «Nền tảng» trên module Marketing và thao tác **tạo/sửa/xóa** vẫn theo quyền catalog (`VIEW_MARKETING_PLATFORMS` mở tab xem bảng; `CREATE` / `UPDATE` / `DELETE_MARKETING_PLATFORM` cho POST/PUT/DELETE).
  - `GET/POST/PUT/DELETE /api/marketing/sources`
  - Quyền: **`GET`** chỉ cần **JWT hợp lệ**; **`POST`** `CREATE_MARKETING_PLATFORM` | **`PUT`** `UPDATE_MARKETING_PLATFORM` | **`DELETE`** `DELETE_MARKETING_PLATFORM` — gán trong **Hệ thống → Nhóm quyền** (quản trị hệ thống bypass theo quy ước dự án). Khi deploy, `syncDefaultMenus` migrate nhóm đang có `MANAGE_MARKETING_PLATFORMS` (cũ) sang bốn quyền trên rồi xóa mã legacy khỏi catalog.
  - Chặn xóa nếu nền tảng đang dùng bởi campaign.
- Chiến dịch (CRUD tách quyền; **không** dùng `MANAGE_MARKETING_CATALOG` — đã loại; đồng bộ startup gán quyền mới cho nhóm từng có legacy + `VIEW` cho mọi nhóm có `MANAGE_CUSTOMERS`):
  - `GET /api/marketing/campaigns` — **`VIEW_MARKETING_CAMPAIGNS`** hoặc **`MANAGE_CUSTOMERS`** (tương thích đọc danh sách / dropdown Kinh doanh).
  - `POST` — **`CREATE_MARKETING_CAMPAIGN`**.
  - `PUT /api/marketing/campaigns/:id` — **`UPDATE_MARKETING_CAMPAIGN`**.
  - `DELETE /api/marketing/campaigns/:id` — **`DELETE_MARKETING_CAMPAIGN`**: xóa cơ hội (`lead_opportunities`) và chi phí/thành viên/sản phẩm gắn chiến dịch khi đủ điều kiện nghiệp vụ; **gỡ gán** `customers.campaign_id` (không xóa khách); ghi nhật ký.
  - Tích hợp API public lead (`POST/PUT/DELETE` api-key, api-integration, allowed-origins): **`UPDATE_MARKETING_CAMPAIGN`**; `GET .../api-info`: **`VIEW_MARKETING_CAMPAIGNS`** hoặc **`MANAGE_CUSTOMERS`**.
  - `GET` query: `sourceId`, `status`, `search`, `createdByEmployeeId`; include `createdByEmployee` (người tạo).
  - **Phạm vi danh sách / sửa / xóa / chi phí / hiệu quả / API tích hợp:** mặc định chỉ chiến dịch do **chính NV** tạo (`createdByEmployeeId`); **quản lý đơn vị** (có cấp dưới trong cây phòng ban — `getSubordinateIds`) thêm chiến dịch do **NV cấp dưới** tạo; **toàn công ty** nếu có **`VIEW_ALL_COMPANY_CUSTOMERS`**, phạm vi xem khách **COMPANY** trên nhóm quyền, hoặc **`MANAGE_MARKETING_GROUPS`** (quản lý nhóm Marketing), hoặc quản trị kỹ thuật / `FULL_ACCESS`. **Kinh doanh** gọi `GET ...?createdByEmployeeId=<NV Marketing>` (form tạo khách) khi có **`MANAGE_SALES`** + **`VIEW_CUSTOMERS`**: được lấy chiến dịch của đúng NV Marketing đã chọn (ngoài phạm vi cây của user KD).
  - Tạo campaign có owner = người tạo + tạo member liên quan.
  - **Ngân sách dự kiến** (`marketing_campaigns.total_budget`): số tiền kế hoạch do người dùng nhập khi tạo/sửa chiến dịch (bắt buộc trên form). **Chi phí thực tế** không lưu trên bản ghi chiến dịch: tính **tổng trường `amount`** của các bản ghi **`marketing_campaign_costs`** thuộc chiến dịch (cùng nguồn với KPI `totalCost` trong báo cáo hiệu quả). `GET /api/marketing/campaigns` bổ sung trường `totalSpentActual` (VND) để danh sách hiển thị hai cột; không cần migration thêm cột.
  - **Lịch chiến dịch:** Ngày bắt đầu phải **nhỏ hơn** ngày kết thúc (không trùng ngày) — validate `POST/PUT` và form FE. Không cho phép trạng thái **Đang chạy** / **Tạm dừng** khi đã qua ngày kết thúc (theo cùng quy ước giờ VN như `backend/src/utils/campaignSchedule.ts`). Trên FE, cột trạng thái hiển thị **Kết thúc** khi đã qua ngày kết thúc dù DB còn ghi khác (có nhãn phụ «theo lịch» khi khác trạng thái lưu).
  - **API public lead & cấu hình key:** `POST /api/public/lead` từ chối khi chiến dịch **đã kết thúc** (trạng thái `ENDED`/`COMPLETED` hoặc đã qua ngày kết thúc), khi **chưa tới ngày bắt đầu**, hoặc khi trạng thái không phải **Đang chạy**. `POST/PUT` tạo/cập nhật API key (`/marketing/campaigns/:id/api-key`, `api-integration`) từ chối nếu chiến dịch đã kết thúc theo quy tắc trên; `GET .../api-info` trả thêm `startDate`/`endDate` cho UI.
- Lead marketing:
  - `GET /api/marketing/leads` (lọc theo source/campaign/status/search/tagIds; áp dụng View Scope qua `buildCustomerWhereByScope`). Response bổ sung: `firstDeliveredOrderAmount` (giá trị đơn giao **DELIVERED** đầu tiên), `duplicatePhoneNote` (mô tả trùng số cross-campaign), `impactHistory` (tối đa 50 tương tác gần nhất), `employee` (NV Sales phụ trách, kèm SĐT), `marketingOwner`, campaign/source, …
  - `POST /api/marketing/leads` (tạo lead thủ công): **bắt buộc** `phone`, `note`, **`campaignId`**. Nền tảng (`leadSourceId`) và cây trồng: theo form; nếu chọn cây tính theo gốc thì vẫn validate số gốc. (FE: `MarketingCustomerForm`.)
  - `PUT /api/marketing/leads/:id/status` (cập nhật leadStatus)
  - `POST /api/marketing/leads/push-to-pool` (đẩy bulk sang DataPool)
  - `GET /api/marketing/leads/import-template` + `POST /api/marketing/leads/import` (import Excel)
  - Trường hợp SĐT trùng (`leadDuplicateService` + `createMarketingLead` / import Excel):
    - **Cùng chiến dịch:** trả `sameCampaignWarning`, `responsibleStaff`; gửi thông báo qua `notifyDuplicateStakeholders`; ghi `marketing_duplicate_interaction` trên khách hiện có (thời gian + người nhập + ghi chú).
    - **Chiến dịch khác** (cho phép trùng): ghi `note`, tương tác `marketing_duplicate_interaction`, JSON có `responsibleStaff`; thông báo như trên.
    - **Từ chối trùng** (`marketing_allow_duplicate_phone=false`): HTTP 400 `rejectedDuplicate`, `responsibleStaff`; vẫn gửi thông báo cho NV liên quan (trừ người nhập). **Lịch sử tác động:** vẫn ghi `marketing_duplicate_interaction` (khi có `actorId`) kèm ghi chú hoặc thông báo từ chối.
- Chi phí campaign:
  - **Quyền route (một trong):** `VIEW_MARKETING_CAMPAIGNS` | `CREATE_MARKETING_CAMPAIGN` | `UPDATE_MARKETING_CAMPAIGN` | `MANAGE_CUSTOMERS` — để NV Tiếp thị (có xem/tạo/sửa chiến dịch) nhập chi phí mà không cần quyền Kinh doanh. **Phạm vi từng chiến dịch** (ai được xem/sửa/xóa chi phí): trong controller — người tạo chiến dịch hoặc marketing admin (`MANAGE_MARKETING_GROUPS` / quản trị kỹ thuật), cùng logic tab chiến dịch.
  - `GET/POST/PUT/DELETE` …/costs và `PUT/DELETE` `/api/marketing/costs/:costId` — **bắt buộc** gắn chi phí với chiến dịch qua URL; **`sourceId` và `platform` trên bản ghi chi phí luôn lấy từ nền tảng của chiến dịch** (1–1; không gửi/đổi từ client). Chiến dịch không có `sourceId` thì không thêm/cập nhật chi phí. Metric, mô tả, chứng từ tùy chọn (FE `MarketingCostEffectiveness` hiển thị nền tảng chỉ đọc).
  - có phân bổ chi phí cho người/nhóm theo payload.
- Báo cáo/hiệu quả:
  - `GET /api/marketing/effectiveness`, `GET /api/marketing/campaigns/:campaignId/effectiveness`, `GET /api/marketing/employee-rankings` — cùng bộ quyền route như chi phí chiến dịch ở trên; lọc phạm vi chiến dịch trong controller (`canViewAllCompanyMarketingCampaigns`, `getAllowedMarketingCampaignCreatorIds`, …).
  - các KPI gồm CPL/CPA/ROAS/ROI/CVR (tính trong controller).

Đẩy lead vào DataPool:

- `pushLeadsToDataPool` tạo các `dataPool` mới:
  - `status=AVAILABLE`, `priority=1`, `source=MARKETING`
  - bỏ qua nếu customer đã có trong pool.
  - Với **từng** lead mới (khi có NV neo trong JWT), gọi `assignSingleMarketingPoolToSales`: **trước** `pickNextSalesEmployeeId` (khối), **sau** `assignLeadsUsingTeamRatios` (tỉ lệ team). Sau đó thông báo realtime cho NV Sales được gán (như trên). Nếu không gán được NV, lead nằm ở kho chưa phân. Có `logAudit`; response có `autoDistributeApplied` (đã thử phân khi có actor), `ratioAssigned` (số lead đã `ASSIGNED`).

### 4.7. Public API nhận lead từ website (API Key)

Module ở `backend/src/routes/publicApiRoutes.ts` + `backend/src/controllers/publicApiController.ts`.

**Lưu ý triển khai:** `POST /api/public/lead` chỉ dùng header `X-API-Key`, **không** dùng cookie/JWT. Các router mount tại `router.use('/', …)` trong `api.ts` không được áp `authMiddleware` cho toàn bộ sub-router (xử lý đúng trong `dashboardRoutes.ts`), nếu không mọi request `/api/*` sẽ trả 401 «Chưa gửi thông tin đăng nhập» trước khi tới handler public lead.

Luồng:

1. Admin marketing tạo API key cho campaign:
   - `POST /api/marketing/campaigns/:campaignId/api-key` (body: `acceptedFields`)
   - API key + webhookSecret + `acceptedFields` lưu vào `marketing_campaigns`. Trường `publicLeadAddressHierarchy` trong DB luôn được chuẩn hóa về `NONE` (không còn nhận mã tỉnh/huyện/xã qua public lead).
   - **Chỉ bốn trường** được phép trong cấu hình: `phone` (luôn bắt buộc trong payload), và tùy chọn `note`, `name`, `address` (địa chỉ một dòng chữ). Email, UTM, UUID địa chỉ hành chính, v.v. **không** có trong API này.
   - Cập nhật cấu hình không đổi key: `PUT /api/marketing/campaigns/:campaignId/api-integration` (body: `acceptedFields`).
2. Website (public) gửi lead:
   - `POST /api/public/lead`
   - Authentication: header `X-API-Key`
   - Key do hệ thống cấp có dạng cố định `mkt_` + 48 ký tự hex; nếu **không khớp định dạng**, API trả **401** ngay (không gọi DB) — tránh phụ thuộc DB cho key rõ ràng sai.
   - Body JSON chỉ gồm các trường đã cấu hình (`acceptedFields`), tối điểu `phone`. Mẫu cURL / JavaScript / HTML trong modal Marketing và phản hồi `GET .../api-info` / `POST .../api-key` / `PUT .../api-integration` dùng `buildPublicLeadSampleCode` / `buildSampleLeadBody`.
3. Backend xử lý:
   - kiểm tra campaign tồn tại + campaign active + **chưa quá ngày kết thúc** (`endDate` trên form được coi là còn hiệu lực đến hết **23:59:59 giờ Việt Nam** của ngày đó — `isPastCampaignEndDateInclusiveVietnam` trong `backend/src/utils/campaignSchedule.ts`; tránh lỗi cũ so sánh với nửa đêm UTC khiến sau ~07:00 sáng VN ngày cuối đã báo «Chiến dịch đã kết thúc»)
   - chuẩn hóa phone
   - kiểm trùng:
     - nếu trùng và là duplicate:
       - không tạo customer mới
       - gửi `user_notifications` tới NV Sales/CSKH phụ trách và NV Marketing (actor = chủ chiến dịch; trừ actor khỏi danh sách nhận nếu trùng mục tiêu)
       - trả `success=true` + `duplicate=true` + `customerId` + `responsibleStaff` (khi có)
   - Nếu không trùng:
     - tạo customer (marketingOwnerId = owner chiến dịch; `employeeId` ban đầu `null`); ghi tên / địa chỉ dòng chữ / ghi chú theo `acceptedFields` (không upsert `customer_addresses` từ public lead).
     - tạo `dataPool` nguồn `MARKETING`, `status=AVAILABLE` — **giống lead Marketing tạo thủ công** (`createMarketingLead`): luôn thử tự phân (neo = owner chiến dịch), thứ tự **(1)** luồng khối — `pickNextSalesEmployeeId` (anchor = owner): định tuyến theo `dataFlowShares` trên khối (`marketingToSalesPct`, khối con, …) và **chia đều NV trong đơn vị lá Sales** (đếm `MKT_SALES_EMPLOYEE_IN_LEAF`); **(2)** nếu không gán được, fallback **`team_distribution_ratios`** (`assignLeadsUsingTeamRatios`). Kết quả: `dataPool` → `ASSIGNED`, `customer.employeeId` = NV Sales, `lead_distribution_history`. Nếu không chọn được NV Sales, lead nằm **kho Sales chưa phân** (`SALES_OPEN`, `AVAILABLE`).
     - tăng `marketingCampaign.leadCount`
     - tạo notifications (database) + emit socket `new_lead` + gửi Web Push.

### 4.8. Orders & Viettel Post shipping

Module ở `backend/src/routes/orderRoutes.ts` + `backend/src/controllers/orderController.ts` và:
- webhook cập nhật trạng thái: `backend/src/routes/webhookRoutes.ts` + `backend/src/controllers/viettelPostWebhookController.ts`
- địa chỉ/VTP service: `backend/src/routes/addressRoutes.ts` (route /api/address..., /api/vtp/...)

Luồng tạo & vận chuyển:

1. Tạo đơn:
   - `POST /api/orders`
  - **Modal tạo đơn (FE `CreateOrderModal`):** bước **Chọn khách hàng** tự động gọi `GET /api/customers` (phân trang) để hiển thị danh sách khách trong **phạm vi được phép** — cùng logic với module Khách hàng; khi gõ từ **2 ký tự** trở lên thêm tham số `search`. Response có `viewScopeDescription` (tiếng Việt) khi backend trả về. Bước **Thêm sản phẩm** gọi `GET /api/products` (phân trang) để hiển thị **đủ danh sách sản phẩm theo trang** ngay khi vào bước; từ **2 ký tự** trở lên thêm `search` (lọc tên/mã). Tổng số lượng đặt **không vượt tổng tồn** (`stocks` trên từng sản phẩm): hết tồn hoặc vượt tồn thì hiện cảnh báo và không cho thêm/tăng số lượng.
  - **Địa chỉ trước sáp nhập (OLD):** khi vào bước địa chỉ, form đồng bộ tỉnh/huyện/xã theo **mã danh mục VTP** (`provinces.id` / `districts.id` / `wards.id` trùng `PROVINCE_ID` / `DISTRICT_ID` / `WARDS_ID`), không dùng `code` tỉnh/huyện (có thể khác mã VTP) — tránh ô dropdown trống dù khách đã có `customer_addresses` kiểu OLD. Hỗ trợ thêm trường hợp **chưa có** `customer_addresses` nhưng khách vẫn có quan hệ `province` + `district` + `ward` (xã gắn huyện) trên bảng `customers`.
  - **Tiền thu hộ (COD) Viettel Post:** `POST /api/orders` nhận tùy chọn `depositAmount` (đã cọc) và `shippingFee` (cước VTP tham khảo, lưu `orders.shipping_fee` — **chi phí công ty**; đơn **miễn phí vận chuyển cho khách**). `orders.final_amount` = tổng hàng − giảm giá (không trừ cọc). `orders.cod_amount` = max(0, `final_amount` − `deposit_amount`) — **tổng khách thanh toán khi nhận hàng = COD**, không cộng cước VTP. Khi đẩy VTP (`push-viettel-post`), `MONEY_COLLECTION` = `cod_amount` nếu có, ngược lại `final_amount` (đơn cũ).
  - **Sales / CSKH:** trên danh sách khách (module **Kinh doanh** và **CSKH**), khi có quyền `CREATE_ORDER` hoặc `MANAGE_ORDERS`, có nút **Tạo đơn** (icon gói hàng) mở cùng modal tạo đơn; CSKH nạp khách qua `GET /api/resales/customer/:id`, Sales qua `GET /api/customers/:id`.
  - **Thông báo lỗi trên modal tạo đơn:** hiển thị **cố định phía trên thanh nút** (Hủy / Tiếp tục / Tạo đơn), không chỉ trong vùng cuộn nội dung — tránh trường hợp ở bước Vận chuyển người dùng không thấy lỗi API và tưởng nút không phản hồi. Khi thiếu cột DB sau deploy (Prisma `P2022`), `POST /api/orders` trả thông điệp tiếng Việt hướng dẫn chạy `npx prisma migrate deploy` (README 5.5.1).
  - **Bắt buộc** `warehouseId` (kho gửi — điểm gửi Viettel Post), `receiverProvinceId/DistrictId/WardId` (địa chỉ nhận; V3 có thể thiếu `receiverDistrictId` nếu có `vtp_district_id` trên xã).
   - Quyền route `POST /api/orders`: **`CREATE_ORDER`** và/hoặc **`MANAGE_ORDERS`** (xem `orderRoutes.ts`). Nút tạo đơn trên FE hiển thị khi có một trong hai quyền.
   - **Phạm vi khách khi tạo đơn:** mặc định chỉ khách đang gán cho **bản thân hoặc cấp dưới** (`customers.employeeId`); khách chưa gán NV hoặc gán NV khác → 403. Quyền catalog **`CREATE_ORDER_COMPANY`** bỏ giới hạn này (tạo đơn cho mọi khách trong hệ thống). **`FULL_ACCESS`** và nhóm **quản trị hệ thống** (`system_administrator` / legacy `ADM`) luôn được coi là đủ quyền — `userHasCatalogPermission` trong `orderController.createOrder` (không cần gán `CREATE_ORDER_COMPANY` riêng). Đồng bộ catalog: `ensureDefaultPermissionsCatalog`; nhóm **Quản trị CRM** nhận thêm `CREATE_ORDER_COMPANY` qua `ensureCrmAdministratorDefaultPermissions` khi chạy `syncDefaultMenus`.
  - **Danh sách / chi tiết đơn** (`GET /api/orders`, `GET /api/orders/:id`): lọc theo `employeeId` người tạo đơn — mặc định **bản thân + cấp dưới quản lý** (`getVisibleEmployeeIds(..., 'ORDER')`, cùng logic Sales/CSKH xem phạm vi cây quản lý). Quyền **`VIEW_ALL_COMPANY_ORDERS`** hoặc phạm vi nhóm **COMPANY** (tab Nhóm quyền → phạm vi xem đơn hàng) bỏ giới hạn — xem **toàn công ty**.
  - **`GET /api/orders/stats`:** cùng phạm vi lọc `employeeId` như danh sách (trước đây thống kê có thể lệch nếu không lọc; đã đồng bộ).
   - Tạo code `DH-XXXXXX`
   - Tính tổng giá trị từ `product.listPriceNet` + quantity
   - Set trạng thái:
     - `orderStatus=DRAFT` hoặc `CONFIRMED` tùy luồng tạo đơn
     - `shippingStatus=PENDING` / `CONFIRMED`
2. Xác nhận đơn:
   - `POST /api/orders/:id/:orderDate/confirm`
   - chỉ khi `shippingStatus=PENDING`
   - đổi `shippingStatus=CONFIRMED`, `orderStatus=CONFIRMED`
   - **Chia xác nhận (NV vận đơn):** `POST /api/orders/distribute-pending-confirm` — quyền **`ASSIGN_SHIPPING_DAILY_QUOTA`**. Body: `{ "mode": "even" }` (tùy chọn `employeeIds: string[]` — chỉ phân trong tập NV loại Vận đơn đang hoạt động khớp danh sách). Lấy mọi đơn `shippingStatus=PENDING` trong **cùng phạm vi** `employeeId` người tạo đơn như `GET /api/orders` (`getVisibleEmployeeIds(..., 'ORDER')`). Với `even`: gán **round-robin** theo thứ tự `(orderDate, id)`. **Không còn** chế độ chia ngẫu nhiên. **Chia thủ công:** xác nhận từng đơn trên danh sách (`POST /api/orders/:id/:orderDate/confirm`). Mỗi đơn cập nhật như xác nhận đơn lẻ: `confirmedById` = NV được phân, `confirmedAt` = thời điểm xử lý. Ghi `logAudit` (tiếng Việt). **FE:** trang Đơn hàng — tab **Cấu hình chia đơn** (hướng dẫn chia thủ công + nút **Chia đều** hàng loạt khi có quyền gán chỉ tiêu vận đơn).
3. Đẩy sang Viettel Post:
   - `POST /api/orders/:id/:orderDate/push-viettel-post`
   - điều kiện:
     - shippingStatus phải là `CONFIRMED`
     - receiver cần đủ thông tin + đặc biệt cần `receiverProvinceId/receiverDistrictId/receiverWardId`
   - backend gọi `viettelPostService.createOrder(...)` — **khối lượng** gửi VTP là **tổng gram** = Σ(`product.weight` × số lượng); sản phẩm không có `weight` dùng 500g/đơn vị (đồng bộ với màn tạo đơn). **Điểm gửi (SENDER_*):** bắt buộc lấy từ **kho** đã gắn đơn (`orders.warehouse_id`) qua `resolveWarehouseVtpSender` — **không** dùng `VTP_SENDER_*` trong `.env` cho luồng ứng dụng (tránh lệch danh mục V3 và lỗi *Price does not apply* / không có cước). Kho phải có đủ địa chỉ chi tiết, SĐT; với **địa chỉ sau sáp nhập** (không cấp huyện trong DB), mã **DISTRICT** VTP lấy từ `wards.vtp_district_id` trên xã kho (đồng bộ `POST /api/vtp/sync-address` với `source=new`). **Mã dịch vụ VTP (`ORDER_SERVICE`):** ưu tiên `VTP_ORDER_SERVICE` (nếu đặt); nếu không — gọi **`/order/getPriceAll`** và chọn dịch vụ khả dụng (xem trên). Địa chỉ nhận V3: `receiver_district_id` có thể null — backend suy từ `receiver_ward_id` + `wards.vtp_district_id`.
   - **Kiểm thử tạo đơn thật (CLI):** trong `backend/` chạy `npm run test:vtp-order` (cần `VTP_TOKEN` hoặc `VTP_USERNAME`+`VTP_PASSWORD`). Mặc định script dùng **gửi** từ `VTP_SENDER_*` và **nhận** mẫu liên tỉnh Hà Nội → TP.HCM (mã trong script); ghi đè bằng `VTP_TEST_RECEIVER_PROVINCE` / `VTP_TEST_RECEIVER_DISTRICT` / `VTP_TEST_RECEIVER_WARD`, hoặc `VTP_TEST_USE_DB_RECEIVER=1` để lấy xã từ DB (cần đã sync địa chỉ VTP).
   - cập nhật order:
     - `shippingStatus=SHIPPING`
     - `trackingNumber/shippingCode`
   - tạo `orderShippingLog` (để đồng bộ với webhook)
3b. Hủy vận đơn trên Viettel Post:
   - `POST /api/orders/:id/:orderDate/cancel-viettel-post` (quyền `MANAGE_SHIPPING`), body tùy chọn `{ "note": "..." }`
   - chỉ khi đơn đã có `trackingNumber` và `shippingProvider=VIETTEL_POST`; gọi VTP `UpdateOrder` TYPE=4; điều kiện hủy theo quy định VTP (trạng thái vận đơn).
4. Lấy trạng thái vận chuyển:
   - `GET /api/orders/:id/:orderDate/shipping-status`
   - trả `shippingStatus` + logs (OrderShippingLog + legacy ShippingLog)
   - nếu trackingNumber tồn tại và `shippingProvider=VIETTEL_POST` thì có thể sync status từ VTP.
5. Cập nhật trạng thái vận chuyển (manual):
   - `PUT /api/orders/:id/:orderDate/shipping-status`
   - ghi `shippingLog` legacy + update order
   - nếu status `DELIVERED`:
     - update `orderStatus=COMPLETED`, `paymentStatus=PAID`
     - cập nhật tổng chi tiêu/hạng khách theo `updateCustomerRank`
     - nếu là đơn đầu tiên: chạy `handleFirstOrderCompletion` để đẩy khách về pool Resales (nếu cấu hình bật).
   - **Từ chối khi chờ xác nhận:** chuyển `shippingStatus` từ `PENDING` sang `CANCELLED` ghi `shippingDeclinedById` / `shippingDeclinedAt` (dùng đếm tiến độ “từ chối” trong chỉ tiêu ngày; xem mục dưới).
5b. **Chỉ tiêu xử lý vận đơn theo ngày** (múi giờ `Asia/Ho_Chi_Minh`):
   - Bảng `shipping_daily_quotas`: `employeeId`, `workDate` (DATE), `targetCount`, `assignedById`; unique `(employeeId, workDate)`.
   - **Chỉ áp dụng cho nhân viên loại «Vận đơn»** — nhận diện theo `employee_types`: mã **`SHP`** (seed), **`logistics`** (một số môi trường), hoặc **tên** chứa «Vận đơn». Gán chỉ tiêu chỉ tới NV khớp một trong các điều kiện đó; **`targetCount: 0`** xóa chỉ tiêu ngày đó. Có thể gán cho **chính mình** nếu hồ sơ nhân viên của tài khoản cũng là Vận đơn.
   - `GET /api/shipping/daily-quotas/me?workDate=YYYY-MM-DD` — quyền **`MANAGE_SHIPPING`**: chỉ tiêu + số đơn **đã xác nhận** / **từ chối** / tổng đã xử lý trong ngày.
   - `GET /api/shipping/daily-quotas/assignable-employees` — quyền **`ASSIGN_SHIPPING_DAILY_QUOTA`**: danh sách NV **loại Vận đơn (SHP)** đang hoạt động; thêm **chính user** lên đầu nếu user cũng là SHP nhưng chưa nằm trong danh sách (để tự gán).
   - `GET /api/shipping/daily-quotas` — **`ASSIGN_SHIPPING_DAILY_QUOTA`**: chỉ tiêu + tiến độ theo từng NV cho một `workDate`.
   - `PUT /api/shipping/daily-quotas` — **`ASSIGN_SHIPPING_DAILY_QUOTA`**: upsert/xóa (gửi `targetCount: 0` xóa bản ghi ngày đó); ghi `logAudit` (chi tiết tiếng Việt).
   - Controller: `backend/src/controllers/shippingQuotaController.ts`; route mount: `backend/src/routes/shippingQuotaRoutes.ts` → `/api/shipping`.
   - **FE:** trang **Đơn hàng** (`/orders`) — **tab «Danh sách đơn hàng»** (thống kê, lọc, bảng đơn); **tab «Chỉ tiêu vận đơn»** (chọn ngày, tiến độ của tôi nếu có `MANAGE_SHIPPING`, bảng gán nếu có `ASSIGN_SHIPPING_DAILY_QUOTA`); **tab «Cấu hình chia đơn»** (chia thủ công qua danh sách + chia đều hàng loạt nếu có `ASSIGN_SHIPPING_DAILY_QUOTA` — không còn chia ngẫu nhiên).
6. Hàng hoàn:
   - `POST /api/orders/:id/:orderDate/process-return`
   - tạo `returnedOrder` và nếu có `restockedQty/damagedQty` thì ghi `inventoryLog`.

Webhook Viettel Post:

- Public endpoints (không cần auth):
  - `POST /api/webhook/viettelpost/order-status`
  - `POST /api/webhook/viettelpost/order-st` (alias theo URL cấu hình)
  - `POST/GET /api/webhook/viettelpost/test`
- Endpoint xử lý:
  - `handleVTPWebhook`:
    - đọc token webhook từ `.env` (`VTP_WEBHOOK_SECRET`) hoặc header/body token
    - parse payload `DATA` → với mỗi item:
      - tìm order trong DB theo code/tracking/shippingCode
      - map `ORDER_STATUS` → internal `shippingStatus`
      - update order shipping fields
      - tạo `orderShippingLog` (rawData, timestamp, description, note+location)
      - emit socket:
        - tới room riêng của chủ đơn: `user:<employeeId>`
        - tới room vận đơn: `shipping:staff`
    - luôn trả HTTP 200 khi xử lý xong để VTP không retry vô hạn.

**Kho vận (Inventory, FE `/inventory`):** modal **Nhập kho** (`frontend/src/pages/Inventory/ImportModal.tsx`) — thêm dòng sản phẩm bằng ô **Tìm tên hoặc mã** (gọi `GET /api/products?search=…&warehouseId=…`); **không** hiển thị danh sách sản phẩm dạng lưới trước khi người dùng nhập từ khóa tìm kiếm.

### 4.9. Accounting (Kế toán)

Module ở `backend/src/routes/accountingRoutes.ts`.

Các mảng:

- Salary Components:
  - `GET/POST/PUT/DELETE /api/accounting/salary-components`
- Payroll (bảng lương):
  - `GET/POST/PUT /api/accounting/payrolls`
  - `POST /api/accounting/payrolls/:id/approve`
  - `POST /api/accounting/payrolls/generate` (tạo bảng lương theo tháng)
- Draft invoices:
  - CRUD `/api/accounting/invoices`
  - `POST /api/accounting/invoices/:id/prepare-export`
  - `POST /api/accounting/invoices/from-order` (tạo hóa đơn từ đơn hàng)
- Financial Reports:
  - `GET /api/accounting/reports`
  - `POST /api/accounting/reports/generate`
  - `GET /api/accounting/summary`
- Invoice Providers:
  - CRUD `/api/accounting/providers`
- Role dashboard metrics:
  - `GET /api/accounting/role-dashboard`
  - `PUT /api/accounting/role-metrics`

### 4.10. HR (Nhân sự, cấu trúc tổ chức)

Module ở `backend/src/routes/hrRoutes.ts` + `backend/src/controllers/hrController.ts`.

Nghiệp vụ:

- Upload avatar / ID card (middleware xử lý ảnh)
- Master data (phân quyền theo `MANAGE_HR`):
  - positions, departments, divisions, subsidiaries
  - **Bộ phận (HR)** — bảng `hr_department_units` / API `GET/POST/PUT/DELETE /api/hr/hr-department-units`: dùng để phân nhóm và lọc trong module Nhân sự, **không** tham gia luồng vận hành hay phân data. Có thể gán **`manager_id`** (nhân viên) làm **quản lý bộ phận**: người này được **duyệt / từ chối** đơn nghỉ phép của các nhân viên có cùng `employees.hr_department_unit_id` (không tự duyệt chính mình). Không xóa bộ phận mặc định mã `CHUNG` hoặc bộ phận đang có nhân viên.
  - **Cấu hình trên FE (module Nhân sự):** Trang **`/hr/catalogs`** (nút **Danh mục**) — vào được khi có một trong: `MANAGE_HR`, `FULL_ACCESS`, `VIEW_HR`, `VIEW_EMPLOYEE_TYPE_CATALOG`, `MANAGE_EMPLOYEE_TYPE_CATALOG` (route `PermissionRoute`). Ba tab: **Công ty con**, **Bộ phận** (đọc nếu có `MANAGE_HR`/`VIEW_HR`/…; ghi nếu có `MANAGE_HR`/`FULL_ACCESS`), **Loại nhân viên** — xem danh sách đầy đủ (kể cả đã tắt) với `VIEW_EMPLOYEE_TYPE_CATALOG` hoặc `MANAGE_EMPLOYEE_TYPE_CATALOG` hoặc `MANAGE_HR`; thêm/sửa/xóa với `MANAGE_EMPLOYEE_TYPE_CATALOG` hoặc `MANAGE_HR` (API `GET/POST/PUT/DELETE /api/hr/employee-types`, `GET ?includeInactive=1` cho tab quản lý). Nhật ký: `EMPLOYEE_TYPE` (tạo/cập nhật có so sánh trước–sau, xóa có mô tả).
  - role groups (view scopes, menus/permissions)
  - banks, employee statuses, employee types
  - **Loại hợp đồng** (`employment_types`): mỗi lần backend kết nối DB (`connectDB`), `ensureEmploymentTypes` trong `hrController` **upsert** bộ mã cố định (`official`, `probation`, `intern`, …) với **`name` tiếng Việt** để form nhân sự / Excel hiển thị đúng (`GET /api/hr/employment-types`). Có thể bổ sung hoặc sửa bản ghi trực tiếp trong DB (Prisma Studio); lần khởi động sau có thể ghi đè `name`/`sortOrder` theo seed nếu trùng `code`.
- CRUD nhân viên:
  - `GET/POST/PUT/DELETE /api/hr/employees...`
  - upload avatar, import excel, danh sách birthdays trong tháng
  - **Thêm/cập nhật nhân viên:** Trên FE (`EmployeeForm`), **Công ty con**, **Bộ phận HR** và **Loại nhân viên** chỉ chọn từ danh mục đã cấu hình — không thêm mới tại form (cấu hình tại **Nhân sự → Danh mục**). Loại nhân viên (`employeeTypeId`) và **bộ phận HR** (`hrDepartmentUnitId`) là bắt buộc khi tạo (FE + BE). **Ngày sinh** phải là ngày **trước hôm nay** (FE: `max` trên ô ngày + thông báo; BE: `parseEmployeeBirthDate`). **`POST /api/hr/employees` luôn bỏ qua** `departmentId`/`positionId` trong body — bản ghi tạo với đơn vị/chức danh vận hành **null**; gán sau qua `PUT /api/hr/departments/:departmentId/staff-assignment` (validate chức năng đơn vị lá tại bước đó). **`PUT /api/hr/employees/:id`:** form HR thường **không** gửi `departmentId`/`positionId`; khi body **thay đổi** `departmentId`, `employeeTypeId` hoặc `positionId` so với bản ghi hiện tại và nhân viên đang gắn đơn vị lá vận hành, backend mới gọi `validateEmployeeDepartmentForStaffAssignment` (cùng quy tắc `PUT .../staff-assignment`). Cập nhật chỉ các trường khác (email công ty, địa chỉ, …) **không** kích hoạt lại bước này. Đổi loại NV không khớp đơn vị hiện tại → 400. Trường **`hrJobTitle` (Chức danh HR)** chỉ phục vụ quản trị nhân sự, không liên quan logic vận hành. **Check trùng dùng chung** cho create/update/import: trùng theo **SĐT** hoặc **Email cá nhân** (SĐT so theo biến thể VN); với **import Excel**, nếu **Mã NV** khớp nhân viên đã có thì **cập nhật** thay vì báo trùng mã; nếu để trống mã thì backend tự sinh mã theo quy tắc `NVxxxx`. Khi phát hiện trùng ở create/update, API trả kèm danh sách `duplicates` gồm `code`, `fullName`, `departmentUnit` để FE hiển thị rõ ràng. **Ngày hiệu lực / hết hạn hợp đồng** (`contractEffectiveDate`, `contractEndDate`) là **tùy chọn** cho mọi loại HĐ; nếu có cả hai thì ngày hết hạn không được trước ngày hiệu lực. Loại HĐ thử việc (mã gợi ý: `probation`, `thu_viec`, …) khi tạo được gán `probationStatus` = `ON_PROBATION` và đồng bộ kỳ thử việc từ hai trường hợp đồng (API vẫn chấp nhận `probationStartDate`/`probationEndDate` cũ để tương thích). Lỗi API trên form nhân viên hiển thị đúng `message` từ server (dùng `ApiHttpError` từ `apiClient`, không dùng `error.response` kiểu axios).
  - **Xem danh sách / chi tiết:** Route đọc (`GET /api/hr/employees`, `GET /api/hr/employees/:id`, sinh nhật trong tháng, và các **GET** master đọc như tổ chức / chức danh / khối–đơn vị / nhóm quyền / danh mục HR, …) **chỉ cần JWT**; **phạm vi bản ghi** theo **Phạm vi xem (HR)** — `getVisibleEmployeeIds` + kiểm tra chi tiết (không lọc khi `FULL_ACCESS`, quản trị kỹ thuật, hoặc khi có **`MANAGE_ROLE_GROUPS` / `EDIT_SETTINGS`** để quản lý RBAC gán nhóm quyền hàng loạt thấy đủ danh sách NV). Chi tiết trả về `access.canEdit` khi có **`MANAGE_HR`** hoặc **`FULL_ACCESS`** (hoặc nhóm quản trị kỹ thuật), không phụ thuộc mã nhóm HCNS cứng. **Module Nhân sự (FE)** không hiển thị khối, phòng ban vận hành, cấp trên trực tiếp; hiển thị **bộ phận** (`hrDepartmentUnit`) và các trường phù hợp khác. Payload danh sách/chi tiết đã loại bỏ enrich khối/phòng/QL khỏi gói nhìn HR.
  - **Dropdown «Gán Marketing» (tạo khách — `CustomerForm`):** `GET /api/hr/employees?marketingOwnerOptions=1` — yêu cầu JWT có một trong các quyền `MANAGE_SALES`, `VIEW_SALES`, `MANAGE_CUSTOMERS`, `VIEW_CUSTOMERS`, `MANAGE_RESALES`, `FULL_ACCESS`, hoặc nhóm quản trị kỹ thuật. Trong trường hợp này backend **bỏ lọc phạm vi HR** và chỉ trả nhân viên loại Marketing (`employee_types.code = marketing` hoặc `sales_type` khớp), để NV Sales (phạm vi HR thường không gồm cây Marketing) vẫn chọn được NV Marketing khi gán nguồn.
  - **Lọc & đồng bộ UI (danh sách / xuất Excel):** `organizationId`, `subsidiaryId` (công ty con), `hrDepartmentUnitId`, `employeeTypeId`, `roleGroupId`, `search`. Khi có `organizationId`, danh sách gồm nhân viên thuộc org đó **và** nhân viên chưa gán `department_id` (chưa có đơn vị vận hành) — **chỉ áp khi** phạm vi HR của user là **toàn công ty** (`getVisibleEmployeeIds` trả `null`). Nếu user đã bị giới hạn theo danh sách id phạm vi HR (theo **Phạm vi xem (HR)** trên Nhóm quyền: SELF_RECURSIVE, DEPARTMENT, DIVISION, …), backend **không** thêm lọc `organizationId` từ query để tránh loại hết bản ghi (ví dụ đơn vị lá thuộc tổ chức khác với org mặc định trên dropdown). Helper `getVisibleEmployeeIds` (context `HR`): phạm vi **DEPARTMENT** — nếu chưa có `department_id` vận hành thì **ít nhất** trả về chính user; không trả mảng rỗng (tránh `id IN ()`); **DIVISION** — nếu không có nhân viên trong cây khối thì **ít nhất** `[user.id]`.
  - Trên FE, nhóm quyền hiển thị bằng **tiếng Việt** (`translate` trên `roleGroup.name`). Không còn lọc theo khối/phòng ban/quản lý hay nút «Chỉ hiện quản lý».
  - **Excel (mẫu import / import / export):** Cùng thứ tự cột — `backend/src/constants/hrEmployeeSpreadsheet.ts` và `frontend/src/constants/hrEmployeeSpreadsheet.ts` (phải giữ khớp). Import **bắt buộc** cột **Loại nhân viên** và **Bộ phận**; cột **Chức danh** là `hrJobTitle` (text tự do, tùy chọn) và **không** map sang `position` vận hành. **Nhóm quyền** tùy chọn (nếu điền phải khớp DB). Mẫu tải xuống đánh dấu cột bắt buộc bằng **dấu `*` màu đỏ** ngay trên header (không tô đỏ cả ô), và có dropdown chọn từ danh mục hệ thống hiện có cho các cột **Loại nhân viên**, **Bộ phận**, **Công ty con**. Import ưu tiên tổ chức mã **KAGRI** nếu có, không thì tổ chức mặc định đầu danh sách. **Trùng SĐT/email khi import** so khớp theo nhiều dạng số VN (0 / 84 / +84) để trùng định dạng Excel không báo nhầm. **Mã NV** nếu trùng nhân viên đã có trong DB → **cập nhật** bản ghi từ dòng Excel (không coi là lỗi trùng); nếu SĐT hoặc email cá nhân trong file lại thuộc **nhân viên khác** thì vẫn báo trùng (kèm `reason`). Khi import phát hiện trùng nhân sự (theo quy tắc trong controller), response có mảng `duplicates` — FE hiển thị danh sách trùng cho người dùng (nhãn popup giải thích **mã NV hiển thị là mã trong hệ thống** khi trùng SĐT/email, không phải mã lấy từ file nếu cột Mã NV để trống).

### 4.11. Role Groups & Permissions (RBAC UI)

Module ở `backend/src/routes/roleGroupRoutes.ts`.

Nghiệp vụ:

- Quản lý role group:
  - `GET/POST/PUT/DELETE /api/role-groups` — **đọc** (`GET`): `VIEW_ROLE_GROUPS` hoặc `VIEW_SETTINGS`; **ghi**: `MANAGE_ROLE_GROUPS` hoặc `EDIT_SETTINGS`. Nhóm quản trị kỹ thuật (`system_administrator` / `ADM`) bỏ qua kiểm tra permission.
- **Gán nhóm quyền cho nhân viên (CRUD nghiệp vụ RBAC):** `POST /api/hr/employees/assign-role-group` chấp nhận `MANAGE_HR` **hoặc** `MANAGE_ROLE_GROUPS` **hoặc** `EDIT_SETTINGS` (cùng quy tắc `checkPermission` một trong các quyền). Modal **Phân quyền nhanh** trên FE chỉ gán **theo nhân viên** (`employeeIds`); backend vẫn có thể nhận `departmentId` / `divisionId` nếu gọi API khác. `GET` `/employees` và các master đọc phục vụ HR **không** gắn `checkPermission` theo catalog — chỉ cần JWT; phạm vi NV do controller (`getVisibleEmployeeIds`, v.v.).
- Menu & permission:
  - `GET /api/role-groups/menus`
  - `GET /api/role-groups/permissions`
  - view scopes:
    - `GET/PUT /api/role-groups/view-scopes`
- Nhóm quản trị kỹ thuật (`system_administrator` và legacy `ADM`): **luôn** gắn đủ mọi menu và mọi quyền trong catalog, phạm vi xem HR & Khách hàng là **COMPANY** (toàn công ty) — đồng bộ mỗi lần `syncDefaultMenus` (khởi động backend). **Không** chỉnh sửa nhóm này trên UI (tab **Hệ thống → Nhóm quyền**) và không đổi/xóa qua API; khi thêm quyền mới vào `DEFAULT_PERMISSIONS`, lần khởi động sau sẽ tự gán cho nhóm đó.
- **Danh sách 73 quyền trong catalog** (15 nhóm theo module, `backend/src/constants/permissionsCatalog.ts` — `DEFAULT_PERMISSIONS`; UI: `PERMISSION_GROUPS` trong `RoleGroupManager.tsx`):
  1. **Hệ thống (9):** `FULL_ACCESS`, `MANAGE_SYSTEM`, `VIEW_LOGS`, `VIEW_SETTINGS`, `EDIT_SETTINGS`, `STAFF_LOGOUT`, `STAFF_LOCK`, `VIEW_ROLE_GROUPS`, `MANAGE_ROLE_GROUPS`
  2. **Dashboard & Báo cáo (3):** `VIEW_DASHBOARD`, `VIEW_REPORTS`, `VIEW_PERFORMANCE`
  3. **Nhân sự (8):** `MANAGE_HR`, `VIEW_HR`, `VIEW_EMPLOYEE_TYPE_CATALOG`, `MANAGE_EMPLOYEE_TYPE_CATALOG`, `VIEW_CONTRACTS`, `VIEW_LEAVE_REQUESTS`, `MANAGE_LEAVE_REQUESTS`, `DELETE_LEAVE_REQUESTS`
  4. **Kho số & Phân bổ (14):** `VIEW_FLOATING_POOL`, `MANAGE_DATA_POOL`, `DATA_POOL_CONFIG`, `CONFIG_DISTRIBUTION`, `CLAIM_LEAD`, `ASSIGN_LEAD`, `DISTRIBUTE_FLOATING_POOL`, `DISTRIBUTE_FLOATING_CROSS_ORG`, `CLAIM_FLOATING_POOL`, `VIEW_CSKH_POOL`, `MANAGE_CSKH_POOL`, `VIEW_MANAGED_UNIT_POOL`, `RECALL_MANAGED_UNIT_LEADS`, `DISTRIBUTE_SALES_CROSS_ORG`
  5. **Khách hàng (4):** `VIEW_CUSTOMERS`, `VIEW_ALL_COMPANY_CUSTOMERS`, `MANAGE_CUSTOMERS`, `DELETE_CUSTOMER`
  6. **Marketing (9):** `VIEW_MARKETING_PLATFORMS`, `CREATE_MARKETING_PLATFORM`, `UPDATE_MARKETING_PLATFORM`, `DELETE_MARKETING_PLATFORM`, `MANAGE_MARKETING_GROUPS`, `VIEW_MARKETING_CAMPAIGNS`, `CREATE_MARKETING_CAMPAIGN`, `UPDATE_MARKETING_CAMPAIGN`, `DELETE_MARKETING_CAMPAIGN`
  7. **Sales (3):** `VIEW_SALES`, `MANAGE_SALES`, `VIEW_SALES_EFFECTIVENESS`
  8. **CSKH (3):** `VIEW_RESALES`, `MANAGE_RESALES`, `VIEW_CSKH_EFFECTIVENESS`
  9. **Sản phẩm (1):** `MANAGE_PRODUCTS`
  10. **Hỗ trợ (1):** `MANAGE_SUPPORT_TICKETS`
  11. **Đơn hàng & Vận chuyển (7):** `VIEW_ORDERS`, `VIEW_ALL_COMPANY_ORDERS`, `CREATE_ORDER`, `CREATE_ORDER_COMPANY`, `MANAGE_ORDERS`, `MANAGE_SHIPPING`, `ASSIGN_SHIPPING_DAILY_QUOTA`
  12. **Kho vận (1):** `MANAGE_WAREHOUSE`
  13. **Kế toán (2):** `VIEW_ACCOUNTING`, `MANAGE_ACCOUNTING`
  14. **Vận hành & Cơ cấu (4):** `CONFIG_OPERATIONS`, `CONFIG_ORG_STRUCTURE`, `CONFIG_DATA_FLOW`, `VIEW_DIVISIONS`
  15. **Tiện ích (5):** `MANAGE_NOTIFICATIONS`, `CREATE_DRAFT_NOTIFICATION`, `MANAGE_DOCUMENTS`, `MANAGE_INTERNAL_NOTES`, `DELETE_CONVERSATION`
- Khi cần thêm quyền mới: thêm vào `DEFAULT_PERMISSIONS` trong `backend/src/constants/permissionsCatalog.ts` (kèm `description`), map nhóm trong `PERMISSION_GROUPS` (FE `RoleGroupManager.tsx`), và nhãn trong `DICTIONARY` (FE `dictionary.ts`). Sau khi thêm vào catalog, `ensureTechnicalAdminsHaveAllPermissions` trong `syncDefaultMenus` gán quyền mới cho `system_administrator` / `ADM`. Các nhóm khác (kể cả `crm_administrator`) **không** được tự động gắn `CONFIG_ORG_STRUCTURE` / `CONFIG_DATA_FLOW` khi sync — gán qua **Nhóm quyền** khi cần.

### 4.12. Documents & Internal Notes

- Documents:
  - `POST /api/documents/upload` (upload file)
  - `GET/POST/PUT/DELETE /api/documents/documents` (theo permission trong controller)
  - `GET /api/documents/documents/types` (và CRUD types)
  - `PUT /api/documents/:id/permissions` (quản lý phạm vi xem/sửa — **chỉ gán theo nhân sự**, không còn phân theo nhóm quyền hay khối/phòng ban)
  - `GET /api/documents/:id/download` và `GET /api/documents/:id/print-check`
  - Helper UI phân quyền: `GET /api/documents-helper/employees` (danh sách nhân sự để chọn)
- Internal notes:
  - CRUD `/api/internal-notes`
  - quyền: `MANAGE_INTERNAL_NOTES`

### 4.13. Chat

Module ở `backend/src/routes/chatRoutes.ts`.

Các nghiệp vụ:

- Nhóm công ty mặc định `K-VENTURES I OFFICE`:
  - Backend tự đồng bộ để **mọi nhân sự** đều là thành viên nhóm.
  - Vai trò trưởng nhóm (`OWNER`) được gán cho nhân sự có `roleGroup.code` là `system_administrator` (hoặc legacy `ADM`) — không gán theo mã CRM cứng; các nhóm khác vẫn là thành viên thường.
  - Đồng bộ được kích hoạt khi đăng nhập để tự vá dữ liệu cũ thiếu membership/owner.

- Group chat:
  - `GET /api/chat/groups`, `GET /api/chat/groups/:groupId`
  - `GET /api/chat/groups/:groupId/messages`
  - members/settings/avatar/background/pin
  - attachments và file download
- Member requests:
  - `POST/GET /api/chat/groups/:groupId/member-requests`
  - approve/reject yêu cầu vào nhóm
- Private chat:
  - `POST /api/chat/private`, `GET /api/chat/private/:targetUserId`
- Messages:
  - `POST /api/chat/messages` (upload nhiều file qua `chatUploadMiddleware`)
  - `POST /api/chat/messages/read` đánh dấu đã đọc
  - `POST /api/chat/messages/call` — lưu lịch sử cuộc gọi (type `CALL`, content chứa JSON `{ duration, result, callType }`)
  - FE: hiển thị nội dung qua `renderChatMessageHtml` (`frontend/src/utils/chatMessageHtml.ts`): cho phép định dạng HTML cơ bản và thẻ `<a>`; liên kết `http(s)` mở **tab mới** (`target="_blank"`); URL dạng văn bản (không HTML) được tự bọc thành liên kết.
  - FE trang `/chat` — ô nhập tin (layout **không** gồm gửi danh thiếp):
    - **Hàng trên:** Emoji (tab Sticker cute) · Gửi ảnh · Đính kèm file · Bật/tắt định dạng (Ctrl+Shift+X) · **Tin nhắn nhanh** (danh sách lưu `localStorage` key `hcrm_chat_quick_messages_v1`, mặc định trong `chatQuickMessagesStorage.ts`; thêm/sửa/xóa trong modal, chèn nhanh từ dropdown).
    - **Ô nhập:** placeholder gợi ý Ctrl+Shift+X; nền trắng, viền.
    - **Thanh định dạng dưới** (khi bật): B/I/U/gạch ngang, cỡ chữ, **màu chữ** (popover `ChatTextColorPopover` mở **lên trên** ô công cụ: `react-colorful` + HEX + swatch), cỡ chữ (dropdown cũng mở lên trên); xóa định dạng, list/number, thụt/lề, hoàn tác/làm lại, mở rộng/thu ô nhập; `execCommand` + `onMouseDown` `preventDefault` trên nút để giữ selection.

#### 4.13.1. Video Call & Screen Share (WebRTC)

Tính năng gọi video/thoại và chia sẻ màn hình giữa các thành viên nhóm chat, sử dụng **WebRTC** peer-to-peer và **Socket.IO** cho signaling.

**Kiến trúc:**

- **WebRTC:** Sử dụng browser APIs `RTCPeerConnection`, `getUserMedia`, `getDisplayMedia` cho media; STUN servers của Google (`stun.l.google.com:19302`).
- **Socket.IO signaling:** Tất cả signaling events đi qua socket server; không cần media server (peer-to-peer trực tiếp).
- **Yêu cầu:** WebRTC cần **HTTPS** hoặc `localhost` để truy cập camera/microphone.

**Luồng cuộc gọi (signaling handshake):**

1. **Caller** nhấn nút gọi → emit `call:initiate` → backend broadcast `call:incoming` tới group room + userId rooms (mọi thành viên).
2. **Receiver** thấy popup `IncomingCallModal` (trên **bất kỳ trang nào** — xử lý bởi `GlobalCallHandler`), nghe tiếng chuông Messenger-style.
3. Receiver bấm **Nghe** → emit `call:accept` → backend broadcast `call:accepted` tới group room.
4. Caller nhận `call:accepted` → **lúc này mới** tạo WebRTC `offer` → emit `call:offer`.
5. Receiver nhận `call:offer` → tạo `answer` → emit `call:answer`.
6. ICE candidates trao đổi hai chiều (`call:ice-candidate`).
7. Kết nối thành công → trạng thái `connected`, bắt đầu đếm thời gian.
8. Kết thúc: một bên emit `call:end` → `call:ended` broadcast → cả hai đóng modal.

**Socket events (backend `socket.ts`):**

| Event | Hướng | Mô tả |
|---|---|---|
| `call:initiate` | Client → Server | Bắt đầu cuộc gọi; server broadcast `call:incoming` tới group + userId rooms |
| `call:accept` | Client → Server | Chấp nhận; server broadcast `call:accepted` |
| `call:reject` | Client → Server | Từ chối; server broadcast `call:rejected` |
| `call:end` | Client → Server | Kết thúc; server broadcast `call:ended` |
| `call:offer` | Client → Server → Room | WebRTC offer SDP |
| `call:answer` | Client → Server → Room | WebRTC answer SDP |
| `call:ice-candidate` | Client → Server → Room | ICE candidate exchange |

**Components (Frontend):**

| File | Mô tả |
|---|---|
| `frontend/src/components/chat/GlobalCallHandler.tsx` | **Global handler** — mount trong `MainLayout`, lắng nghe `call:incoming` trên **mọi trang**. Chứa logic ringtone (Web Audio API, 3 nốt E5→G#5→B5 kiểu Messenger), popup incoming, và mount `VideoCallModal` khi accept. |
| `frontend/src/components/chat/VideoCallModal.tsx` | Giao diện cuộc gọi: hiển thị video local/remote, điều khiển (tắt mic, tắt cam, chia sẻ màn hình, fullscreen), đếm thời gian, xử lý WebRTC state machine. Tự `join_group` trên mount để nhận signaling. |
| `frontend/src/components/chat/IncomingCallModal.tsx` | Popup cuộc gọi đến: hiển thị tên/avatar người gọi, loại cuộc gọi, nút Accept/Reject. |
| `frontend/src/utils/callMessageUtils.ts` | Utility parse/format tin nhắn CALL: `parseCallContent`, `formatCallDuration`, `getCallPreviewText`. |

**Chia sẻ màn hình:**

- **Cuộc gọi video:** `replaceTrack` — thay track camera bằng track screen trên video sender sẵn có.
- **Cuộc gọi audio (không có video sender):** `addTrack` — thêm track screen mới vào `RTCPeerConnection` + renegotiation (tạo lại offer). Khi dừng chia sẻ, `removeTrack` + renegotiation.

**Lịch sử cuộc gọi:**

- **API:** `POST /api/chat/messages/call` — lưu tin nhắn type `CALL` với content JSON: `{ duration: number, result: 'completed'|'missed'|'rejected', callType: 'video'|'audio' }`.
- **Controller:** `createCallMessage` trong `chatController.ts`.
- **Hiển thị:** Tin nhắn CALL render dạng pill/badge trong timeline chat:
  - 🟢 `Cuộc gọi video • 02:35` (completed)
  - 🔴 `Cuộc gọi thoại bị từ chối` (rejected)
  - 🟠 `Cuộc gọi thoại nhỡ` (missed)
- **Preview:** Sidebar danh sách (Chat.tsx), popup notification (ChatListDropdown.tsx), popup chat (ChatPopup.tsx) đều hiển thị text đẹp thay vì JSON thô.

**Chuông cuộc gọi đến:**

- Tạo bằng **Web Audio API** (không cần file MP3).
- Pattern: 3 nốt đi lên **E5 → G#5 → B5** (hợp âm E major), mỗi nốt có overtone harmonic x2 tạo âm sắc marimba.
- Envelope: attack nhanh 20ms, decay mượt 350ms. Lặp mỗi 2 giây.
- Kiểu **Facebook Messenger**.

**Lưu ý kỹ thuật:**

- `GlobalCallHandler` sử dụng socket từ `ChatContext` (global, join userId room). `VideoCallModal` tự emit `join_group` trên mount để nhận signaling broadcast tới group room.
- Backend `call:initiate` emit `call:incoming` tới cả group room **và** từng userId room (query `ChatMember` trong DB) để `GlobalCallHandler` nhận được trên mọi trang.
- Cuộc gọi lưu lịch sử khi: kết thúc bình thường (completed), bị từ chối (rejected), hoặc nhỡ (missed). Cả caller và receiver đều gọi API lưu.

### 4.14. Notifications & Push

Admin:

- `GET/POST/PUT/DELETE /api/notifications/admin/notifications`

User:

- `GET /api/user-notifications` (danh sách)
- `GET /api/user-notifications/unread-count`
- `PUT /api/user-notifications/:id/read`
- `PUT /api/user-notifications/mark-all-read`
- `DELETE /api/user-notifications/read` (xóa tất cả đã đọc)

**Cron nhắc lead (deadline):** `leadDistribution.ts` → `deadlineReminder` tạo thông báo «Lead sắp hết hạn» (1 ngày trước `deadline`) kèm `link` tới chi tiết khách.

Push:

- `GET /api/user-notifications/push-vapid-key`
- `POST /api/user-notifications/push-subscribe`

### 4.15. Support Tickets

Module ở `backend/src/routes/supportTicketRoutes.ts`.

Nghiệp vụ:

- `GET /api/support-tickets` và `GET /api/support-tickets/:id`
- `POST /api/support-tickets`:
  - hỗ trợ upload file tối đa 5 file
  - tạo ticket + đính kèm
- `PUT /api/support-tickets/:id/status`:
  - chỉ quản lý có quyền `MANAGE_SUPPORT_TICKETS`
- `DELETE /api/support-tickets/:id`:
  - chủ ticket hoặc quản lý.

### 4.16. Leave Requests (Nghỉ phép)

Module ở `backend/src/routes/leaveRequestRoutes.ts`.

- Config:
  - `GET/PUT /api/leave-requests/config`
- Pending approvals/confirmations:
  - `GET /api/leave-requests/pending-approvals` — danh sách chờ duyệt (quản trị kỹ thuật xem tất cả; người khác chỉ thấy yêu cầu của **cấp dưới theo đơn vị vận hành** hoặc của nhân viên **cùng bộ phận HR** nếu họ là **quản lý bộ phận** đã gán trên `hr_department_units.manager_id`)
  - `GET /api/leave-requests/pending-confirmations`
- CRUD bản thân:
  - `GET/POST /api/leave-requests`
  - `GET /api/leave-requests/:id`
  - `DELETE /api/leave-requests/:id` — **hủy** đơn (chuyển trạng thái `CANCELLED`); chỉ **chủ đơn** hoặc **quản trị kỹ thuật**, chỉ khi đơn đang `PENDING`
  - `POST /api/leave-requests/:id/permanent-delete` — **xóa hẳn** bản ghi khỏi CSDL (không hoàn tác). Route yêu cầu quyền **`DELETE_LEAVE_REQUESTS`** (gán qua **Nhóm quyền**); ngoài ra `FULL_ACCESS` và nhóm **quản trị kỹ thuật** vẫn **qua middleware** như các API khác. Phạm vi đơn: cùng quy tắc **xem** như `GET /api/leave-requests/:id`. **Bổ sung:** đơn trạng thái **đã duyệt** (`APPROVED`) hoặc **đã xác nhận** (`CONFIRMED`) **chỉ** xóa được nếu JWT có **đúng mã** `DELETE_LEAVE_REQUESTS` hoặc người dùng thuộc nhóm **quản trị kỹ thuật** — chỉ có `FULL_ACCESS` (không gán `DELETE_LEAVE_REQUESTS`) thì **không** xóa được các đơn này. Ghi nhật ký hệ thống khi xóa thành công.
- Actions:
  - `POST /api/leave-requests/:id/approve` — **quản trị kỹ thuật**, hoặc **quản lý theo cây đơn vị vận hành** (`departments.manager_id` + cấp dưới), hoặc **quản lý bộ phận HR** (trùng `manager_id` trên bộ phận với `employees.hr_department_unit_id` của người xin phép)
  - `POST /api/leave-requests/:id/reject` — cùng quy tắc duyệt
  - `POST /api/leave-requests/:id/confirm` — vẫn yêu cầu quyền HR / `MANAGE_HR` như cấu hình route
- History:
  - `GET /api/leave-requests/employee/:employeeId/history`
- **Thông báo trong hệ thống** (`user_notifications`, link `/hr/leave-requests`):
  - **Tạo đơn:** gửi tới **quản lý trực tiếp theo đơn vị vận hành** (nếu có), **quản lý bộ phận HR** (`hr_department_units.manager_id` khớp `employees.hr_department_unit_id`, khác người tạo), và **mọi nhân viên có nhóm quyền HCNS** (cùng tập mã nhóm như `isHRUser` trong controller: `HR_STAFF`, `NV_HCNS`, `hr_assistant`, …) để biết có đơn mới / cần xác nhận sau bước duyệt.
  - **Duyệt / từ chối** (quản lý): gửi tới **người tạo đơn**.
  - **Duyệt:** thêm thông báo tới **HCNS** (cùng tập mã nhóm trên, trừ người vừa duyệt) — đơn đã duyệt, chờ xác nhận.
  - **Xác nhận:** gửi tới **người tạo đơn**.
  - Đồng thời vẫn emit Socket.IO (`leave:new_request`, `leave:approved`, …) và `notification:new` để làm mới chuông thông báo. Client join phòng `user:<id>` (và phòng `id` để tương thích).
- **Cấu hình (`system_configs`):** `LEAVE_REQUEST_ADVANCE_DAYS` — mặc định **0**: không bắt buộc xin trước; nếu > 0, chỉ kiểm tra khi **ngày bắt đầu nghỉ còn ở tương lai hoặc hôm nay** (số ngày từ hôm nay tới ngày bắt đầu ≥ giá trị cấu hình). **Ngày bắt đầu đã qua** (bổ sung đơn sau khi đã nghỉ) **không** áp quy tắc «xin trước». `LEAVE_REQUEST_APPROVAL_HOURS` — mặc định **0**: **không giới hạn** thời gian duyệt (chỉ gợi ý nghiệp vụ trên tab Cài đặt; backend không hết hạn đơn theo giờ).
- **Loại nghỉ (tạo mới trên FE):** phép năm, ốm, thai sản, cưới, tang, **Khác**. Với **Khác**, bắt buộc nhập **tên loại nghỉ** (`leaveTypeOtherLabel`, tối đa 200 ký tự); lưu cột `leave_requests.leave_type_other_label`. Không còn mở khi tạo: nghỉ không lương, xin đi muộn, xin về sớm (bản ghi cũ vẫn hiển thị được). API tạo chỉ chấp nhận enum `ANNUAL` / `SICK` / `MATERNITY` / `WEDDING` / `FUNERAL` / `OTHER` (không tạo mới `UNPAID`). Migration: `20260328193000_leave_type_other_label`.

### 4.17. Performance, Reports, Dashboard

- Performance: `backend/src/routes/performanceRoutes.ts`
  - `GET /api/performance/marketing` — `VIEW_PERFORMANCE` hoặc `VIEW_REPORTS`. **Công thức doanh thu gán Marketing (theo `marketing_revenue_attribution_days`):** với mỗi khách có `marketingOwnerId`, lấy các đơn `DELIVERED` sắp theo thời gian (mốc **ngày giao** `deliveredAt`). **Doanh thu Sales** = đơn **đầu tiên** + các đơn **sau** mà khoảng cách ngày giao so với đơn giao liền trước ≥ số ngày attribution. **Doanh thu Resales** = các đơn còn lại. **Tổng** = Sales + Resales. (Logic: `computeMarketingAttributionRevenue` trong `performanceController.ts`.)
  - `GET /api/performance/sales` — `VIEW_PERFORMANCE` hoặc `VIEW_REPORTS` hoặc **`VIEW_SALES_EFFECTIVENESS`** (gán qua **Nhóm quyền**). Tab **Hiệu quả & xếp hạng** trên trang **Sales** (`/sales`) gọi API này. **Phạm vi dữ liệu** (backend `resolveEffectivenessReportScope`): quản trị kỹ thuật / `FULL_ACCESS` / `VIEW_PERFORMANCE` / `VIEW_REPORTS` → toàn công ty; nếu user có **cấp dưới theo cây đơn vị** (`departments.manager_id` + nhân viên trong cây con) → mọi nhân viên Sales trong phạm vi đó; **không** quản lý cấp dưới → chỉ xếp hạng nhân viên Sales **cùng đơn vị lá** (`employees.department_id`). Response JSON có `scopeMode` (`COMPANY` | `MANAGER_TREE` | `LEAF_UNIT`) và `scopeDescription` (tiếng Việt).
  - `GET /api/performance/resales` — `VIEW_PERFORMANCE` hoặc `VIEW_REPORTS` hoặc **`VIEW_CSKH_EFFECTIVENESS`**. Tab **Hiệu quả & xếp hạng** trên **CSKH** (`/resales`). **Phạm vi** cùng quy tắc như Sales (áp cho nhân viên CSKH nhận diện qua `resalesEmployeeWhere`).
  - **Lưu ý:** Trước đây toàn `router` performance dùng một `checkPermission('VIEW_PERFORMANCE')`; hiện từng route có bộ quyền riêng (đồng bộ khi gán menu trên FE).
  - `GET /api/performance/dashboard/progress`
  - `GET/PUT /api/performance/targets`
  - `GET /api/performance/comprehensive` (BOD/ADM check trong controller)
  - FE tab **Mục tiêu kinh doanh** (trong Cài đặt / Vận hành) **khóa theo tổ chức mã `KAGRI`**: chỉ các **khối cấp 1** (con trực tiếp của nút gốc COMPANY — `parentId = rootDepartmentId`). Không còn chọn tổ chức khác trên màn này.
  - Trên UI tab này hiển thị **tên tổ chức** và danh sách **khối con trực tiếp** với cột **Mục tiêu năm (VNĐ)** (định dạng `vi-VN`, ví dụ `1.000.000.000 VNĐ`). Khi **đưa chuột vào** (hoặc **focus** bàn phím) ô mục tiêu mới hiện rõ ô nhập; nút **Lưu tất cả** trên thanh tiêu đề chỉ gửi `PUT /api/performance/targets` cho khối có thay đổi, `q1Target`…`q4Target` = `annualTarget/4`. Ẩn khối trùng tên/mã tổ chức (cây Vận hành).
  - `GET /api/dashboard` — khối **Mục tiêu kinh doanh** (`divisionTargets`) dùng cùng quy tắc: tổ chức ưu tiên mã **KAGRI** (`getKagriOrganizationId` trong `organizationHelper`), chỉ các **DIVISION** có `parentId` = nút gốc COMPANY của org đó (không gồm nút COMPANY, không gồm khối con lồng sâu). Mục tiêu năm lấy từ `sales_targets` theo `year` hiện tại; khối **chưa có bản ghi mục tiêu** được coi **target = 0** (không còn mặc định 1 tỷ). **Tổng %** trên dashboard = `tổng doanh thu các khối / tổng mục tiêu các khối` (0% nếu tổng mục tiêu = 0).
  - `GET /api/divisions/targets?organizationId=…&year=…` chỉ trả mục tiêu thuộc các khối **cấp 1** dưới gốc COMPANY của org (đồng bộ với tab mục tiêu KD). API trả `departmentId`; FE map sang `divisionId` khi hiển thị.
  - `GET /api/performance/dashboard/progress`: nếu chưa có mục tiêu cho `divisionId` thì coi mục tiêu năm = 0 và tránh chia cho 0 khi tính %.
- Reports: `backend/src/routes/reportRoutes.ts`
  - `GET /api/reports/revenue`, `/cost`, `/top-sales`, `/growth`
  - `/division-targets` (query `year`, tùy chọn `divisionId` để chỉ một khối cấp 1 — đồng bộ bộ lọc FE), `/crops`, `/regions`, `/business-types`
  - Trang **Báo cáo** (`frontend/src/pages/Reports.tsx`): dropdown **KHỐI** gọi `GET /api/divisions?directUnderCompanyRoot=true` — chỉ các **khối cấp 1** (con trực tiếp nút COMPANY tổ chức **KAGRI**, cùng quy tắc `GET /api/reports/division-targets` và dashboard). Không liệt kê khối con lồng sâu hay đơn vị phòng ban.
- Dashboard:
  - `GET /api/dashboard` và `GET /api/dashboard/trends`
- Division:
  - `GET /api/divisions` (query `directUnderCompanyRoot=true`: chỉ khối cấp 1 dưới nút COMPANY; khi **không** truyền `organizationId`, org mặc định là **KAGRI** — `getKagriOrganizationId`), `/structure`, `/targets`, `/:id`

### 4.18. Seed API (cấu trúc tổ chức) & trạng thái module Operations (data flows)

**Seed có auth (JWT/cookie như API thường):** `backend/src/routes/seedRoutes.ts`, mount trong `api.ts` dưới prefix `/seed` → URL đầy đủ `/api/seed/...`

- `POST /api/seed/to-chuc` — tạo các Khối mặc định trong **tổ chức KAGRI** (dưới gốc COMPANY) nếu chưa có
- `POST /api/seed/to-chuc/migrate` — migrate cấu trúc legacy (division KAGRI → khối; chi tiết trong route)

**Module Vận hành — luồng data:** Luồng Marketing → Sales → CSKH được cấu hình qua **HR** (`targetSalesUnitId` / `targetCsUnitId` trên đơn vị lá), không qua tab riêng trên FE; không dùng `/api/operations/data-flows` (route legacy đã gỡ). Tỷ lệ phân bổ kho số và quản lý **loại nhân viên** dùng màn **Nhân sự** / API tương ứng (không còn tab con trên Vận hành).

**Phân luồng data theo cấu trúc tổ chức (org-aware routing):**

Service lõi: `backend/src/services/orgRoutingService.ts` chứa:
- `resolveTargetDepartments(sourceDeptId, targetFunction)` — tìm đơn vị đích (SALES/CSKH) theo thứ tự ưu tiên:
  1. `targetSalesUnitId`/`targetCsUnitId` (cấu hình trên Department)
  2. Đơn vị cùng DIVISION có function phù hợp
  3. **`externalSalesDivisionId`** (chỉ SALES) / **`externalCsDivisionId`** (chỉ CSKH) — trên bản ghi **khối gốc** của đơn vị nguồn khi trong khối đó không có đơn vị lá tương ứng
  4. Leo lên parent: quét **DIVISION anh em** cùng cấp; sau mỗi lần quét anh em, thử **`external_*` trên khối cha (DIVISION)** — áp khi **chỉ** cấu hình nối luồng trên khối cha (khối con không cần `external_*`); lặp khi leo tiếp
  5. Fallback toàn bộ org
- `getEmployeesInDepartments(deptIds[], filter)` — lấy NV WORKING trong các dept (kể cả subtree)
- `resolveTargetEmployees(sourceDeptId, targetFunction)` — kết hợp 2 hàm trên
- `getDivisionIdForDept(deptId)` — tìm divisionId gốc cho dept

Các luồng đã áp dụng org-aware routing:
- **autoDistribute** (`dataPoolController`): với mỗi lead, `pickNextSalesEmployeeId` (anchor = `marketingOwnerId`) — có tôn trọng `external_sales_division_id` (trên khối gửi) và `externalMarketingToSalesPct` (lưu trên **khối Sales đích**) khi khối Marketing không có Sales
- **claimFromFloatingPool**: ưu tiên lead cùng division với NV đang nhận
- **distributeFromFloatingPool**: resolve NV từ `targetDepartmentId` qua org routing, fallback NV bất kỳ trong dept
- **createMarketingLead** + **pushLeadsToDataPool** + **public lead**: `marketingLeadAutoAssignService` — **trước** `pickNextSalesEmployeeId` (luồng khối), **sau** `assignLeadsUsingTeamRatios` (MKT→Sales luôn tự động theo khối khi có NV neo; không dùng `auto_distribute_lead`); thông báo `NEW_LEAD` + socket + push cho NV Sales được gán
- **autoDistributeCustomerToResales** (`orderController`): resolve CSKH đích từ Sales dept, fallback logic cũ
- **leadRoutingService** (`pickNextSalesEmployeeId`/`pickNextResalesEmployeeId`): config-first — kiểm tra `targetSalesUnitId`/`targetCsUnitId` trước; `external_*` trên khối gốc NV, rồi khối anh em, rồi **`external_*` trên từng khối cha (DIVISION)** cho khớp `orgRoutingService`
- **Cron jobs** (`leadDistribution.ts`): sử dụng `leadRoutingService` đã có config-first

### 4.19. Address & Viettel Post địa chỉ/ship fee

Module ở `backend/src/routes/addressRoutes.ts` (tên controller: `viettelPostController.ts`).

**Auto-seed khi khởi động**: Hàm `ensureAddressCatalog()` được gọi trong `connectDB` (`backend/src/config/database.ts`). Nếu bảng `provinces` rỗng, tự động nạp danh mục địa chỉ từ file JSON (`backend/data/addresses/*.json`) — bao gồm cả dữ liệu trước và sau sáp nhập. Không làm gì nếu đã có data.

**Thứ tự hiển thị địa chỉ (FE)**: Tất cả form địa chỉ (Customer, Marketing Customer, Warehouse, Order) đều hiển thị theo thứ tự: **Địa chỉ chi tiết** → Địa chỉ hành chính (Tỉnh/Huyện/Xã). Mỗi form đều có toggle chọn **Trước sáp nhập** (3 cấp: Tỉnh → Huyện → Xã) hoặc **Sau sáp nhập** (2 cấp: Tỉnh → Xã, `directOnly=1`).

Nhánh Local address (DB):

- Không cần auth:
    - `GET /api/address/provinces`
  - `GET /api/address/districts`
  - `GET /api/address/wards` — `districtId` hoặc `provinceId`; với **địa chỉ sau sáp nhập** dùng `directOnly=1` (lọc `district_id` null). Khi có `directOnly`, API **gộp** các xã trùng nghĩa (cùng tên sau chuẩn hóa Unicode + chữ thường `vi-VN`), trả **một** dòng / địa danh (giữ `id` số nhỏ nhất). Trường `mergedFromIds` (mảng id) liệt kê mọi id tương đương để FE map khách đang lưu id cũ. Cột `name` trong DB, đồng bộ trực tiếp VTP và seed từ JSON vào DB dùng **`storageAdministrativeName`** (chữ thường `vi-VN`). **File JSON** xuất từ VTP (`export:address:vtp`) dùng **`jsonExportTitleCaseAdministrativeName`** (Title Case trong file; khi nạp DB vẫn về chữ thường). **Giao diện (FE)** hiển thị tỉnh/huyện/xã dạng Title Case qua `frontend/src/utils/addressDisplayFormat.ts` (`administrativeTitleCase`, …) — API vẫn trả `name` chữ thường. **Dọn DB** xã trùng nghĩa (gộp FK, xóa bản thừa): sau backup, trong `backend/` chạy `npm run dedupe:wards-direct`.
  - `GET /api/address/search`
- Admin sync từ JSON:
  - `POST /api/address/seed-from-json` (MANAGE_SYSTEM)
  - Hoặc CLI (dev): trong `backend/` chạy `npm run seed:address` (file nguồn `data/addresses/*.json`; `--new` / `--old` tùy chọn). **Trên container production** (sau build): `npm run seed:address:prod` tại `/app/backend` — image đã gồm `data/addresses` và `dist/prisma/seed-address-from-json.js`; cần `DATABASE_URL` trong env.

Nhánh VTP address:

- Auth (JWT), mount tại `/api` + `addressRoutes`:
  - `GET /api/vtp/provinces` (V2 `listProvinceById?provinceId=-1`)
  - `GET /api/vtp/districts?provinceId=`
  - `GET /api/vtp/wards?districtId=`
  - `POST /api/vtp/sync-address` (quyền `MANAGE_SYSTEM`) — đồng bộ danh mục từ API Viettel Post vào bảng `provinces` / `districts` / `wards`:
    - `source=new` — V3 `listProvinceNew` + `listWardsNew` (sau sáp nhập; xã gắn tỉnh, `district_id` null).
    - `source=old` — V2 `listProvinceById` + `listDistrict` + `listWards` (trước sáp nhập; bỏ qua huyện placeholder «NEW» / «Bỏ qua»).
    - `source=both` (mặc định) — nạp `new` rồi `old` (giống `POST /api/address/seed-from-json?source=both`).
    - `clear=true` — trong một transaction: gỡ `province_id`/`district_id`/`ward_id` trên `customers`, xóa `customer_addresses`, xóa toàn bộ `wards`/`districts`/`provinces`, gỡ `province_id` trên `customer_region_ranks`; sau đó nạp lại. **Bắt buộc backup DB** (`npm run backup:db` trong `backend/`) trước khi dùng `clear`.
  - CLI (cùng logic, cần `DATABASE_URL` + `VTP_TOKEN`): trên máy dev, trong `backend/` chạy `npm run sync:address:vtp` (ts-node). **Trong image Docker / Dokploy** (`WORKDIR /app/backend`, không có `ts-node`): `npm run sync:address:vtp:prod -- --clear` (và tuỳ chọn `--old` / `--new`). Trước đó `npm run backup:db` cần có `scripts/backup-db-full.js` và `pg_dump` (image đã cài `postgresql-client` và copy `scripts/`).
  - **Xuất JSON từ VTP** (không ghi DB, chỉ `VTP_TOKEN`): `npm run export:address:vtp` → ghi `backend/data/addresses/*.json` (V2+V3; tên trong file **Title Case** `vi-VN`; khi seed/sync vào DB vẫn chuẩn **chữ thường** `storageAdministrativeName`). Trên container sau build: `npm run export:address:vtp:prod`. **Chỉ xóa danh mục trong DB** (để nạp lại từ JSON, không gọi VTP): sau backup, `npm run clear:address:db -- --yes` (hoặc `clear:address:db:prod -- --yes`). Kịch bản đầy đủ: `backend/data/addresses/README.md`; endpoint và Postman: `Viettel Post API/README.md`.

Nhánh VTP shipping:

- `GET /api/vtp/services`
- `POST /api/vtp/calculate-fee` — gọi VTP **`/order/getPriceAll`**. Body **bắt buộc có `warehouseId`** (kho trong hệ thống); backend suy điểm gửi qua `resolveWarehouseVtpSender` (cùng logic đẩy VTP), không dùng `VTP_SENDER_*`. Thêm `receiverProvince`, `receiverDistrict` (tùy chọn nếu đã suy từ xã V3), `receiverWard`, `productWeight`, `productPrice`, `moneyCollection`. **Mặc định không gửi kích thước**. Token: `VTP_TOKEN` hoặc `VTP_USERNAME`/`VTP_PASSWORD`. Kiểm tra nhanh: `node scripts/test-vtp-getPriceAll.js`. `viettelPostService.calculateFee` (dùng nội bộ): ưu tiên **`serviceType`**, rồi VCN, rồi dòng đầu.
- `POST /api/vtp/create-order` (MANAGE_ORDERS)
- `GET /api/vtp/track/:orderCode`
- `POST /api/vtp/cancel-order` (MANAGE_ORDERS)

Tài liệu VTP/seed địa chỉ:

- `Viettel Post API/README.md`
- `backend/data/addresses/README.md`

### 4.20. Contracts (Hợp đồng)

Module ở `backend/src/routes/contractRoutes.ts` + `backend/src/controllers/contractController.ts`.

Nghiệp vụ chính:

- Upload hợp đồng cho một nhân viên:
  - `POST /api/contracts/upload/:employeeId`
  - quyền: `MANAGE_HR`
  - dùng Multer để upload file (middleware `contractUploadMiddleware`)
- Danh sách/chi tiết hợp đồng:
  - `GET /api/contracts` (list tất cả, lọc trong controller theo status/expiringSoon)
  - `GET /api/contracts/list/:employeeId` (hợp đồng của 1 nhân viên)
  - quyền xem: `VIEW_CONTRACTS` hoặc `MANAGE_HR` (tùy controller)
- Cập nhật & xóa hợp đồng:
  - `PUT /api/contracts/:id` (MANAGE_HR)
  - `DELETE /api/contracts/:id` (MANAGE_HR)
- Tải hợp đồng:
  - `GET /api/contracts/download/:id` (chỉ người có quyền xem)

### 4.21. Products (Sản phẩm) & danh mục

Module ở `backend/src/routes/productRoutes.ts` + `backend/src/controllers/productController.ts`.

Nghiệp vụ chính:

- Xem (yêu cầu authenticate):
  - `GET /api/products` (danh sách)
  - `GET /api/products/:id` (chi tiết)
  - `GET /api/products/units`, `GET /api/products/categories`
  - `GET /api/products/export` (export)
  - `GET /api/products/template` (download template import)
- Quản trị (quyền `MANAGE_PRODUCTS`):
  - CRUD sản phẩm:
    - `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`
  - CRUD danh mục:
    - `POST /api/products/categories`, `PUT /api/products/categories/:id`, `DELETE /api/products/categories/:id`
  - Import Excel:
    - `POST /api/products/import` (excel upload)
  - Upload hình ảnh:
    - `POST /api/products/:id/image` (upload qua Multer memory storage)

- **Màn Sản phẩm (`frontend/src/pages/Products.tsx`):** danh sách & quản lý sản phẩm (`GET /api/products` theo phân trang/tìm kiếm trên API). Thông báo `toast` dùng **`react-hot-toast`** — bắt buộc có **`<Toaster />`** trong `frontend/src/App.tsx` (cùng cấp `ToastNotification`) thì người dùng mới thấy phản hồi khi tạo/sửa/import/xóa; nếu thiếu Toaster, có thể tưởng nút «Tạo sản phẩm» không hoạt động dù API đã trả lỗi (ví dụ **403** khi JWT không có **`MANAGE_PRODUCTS`**). Gán quyền «Quản lý sản phẩm» cho nhóm quyền tại **Hệ thống → Nhóm quyền** nếu cần tạo/sửa sản phẩm.

Quy ước hiện tại cho phân loại sản phẩm:

- Trường **Quy cách đóng gói** (`products.packaging_spec`, tối đa 500 ký tự) dùng cho mọi loại sản phẩm; với **BIO** backend đồng bộ thêm vào `product_bios.pack_type` khi tạo/cập nhật/import. Mẫu Excel và export có cột **Quy cách đóng gói** (sau **Đơn vị tính**); cột `[BIO] Quy cách đóng gói` trong mẫu cũ được gộp vào đây. Migration: `20260324180000_product_packaging_spec` (backfill từ `product_bios.pack_type` khi cột sản phẩm trống).
- Bổ sung loại sản phẩm **Combo** (`COMBO`): khi tạo/sửa sản phẩm loại combo, có thể chọn nhiều sản phẩm thành phần; backend lưu quan hệ tại bảng `product_combo_items` (migration `20260324193000_product_combo_items`). Combo yêu cầu tối thiểu 2 sản phẩm thành phần và chặn xóa sản phẩm nếu đang nằm trong combo.
- Form tạo/sửa combo có danh sách tích chọn sản phẩm thành phần kèm ô tìm kiếm nhanh theo mã/tên (`GET /api/products/options`).
- Trên màn **Sản phẩm**, cột tên hiển thị tối đa **80 ký tự** (thêm dấu `…`); hover/`title` vẫn hiện đủ tên.
- Hệ thống tự đảm bảo tồn tại 3 phân loại mặc định trong danh mục: **Phân bón sinh học** (`BIO`), **Sản phẩm công nghệ** (`TECH`), **Quà tặng** (`GIFT`).
- Màn `Sản phẩm` có phần **Cài đặt phân loại** để CRUD loại sản phẩm.
- Mẫu import sản phẩm (`GET /api/products/template`) đánh dấu trường bắt buộc bằng dấu `*` màu đỏ trên header; các cột danh sách chọn (`Loại sản phẩm`, `Đơn vị tính`, `Trạng thái`) lấy từ danh mục hệ thống và bị ràng buộc chọn trong danh sách (Excel data validation).
- Import sản phẩm trả chi tiết lỗi theo từng dòng (`errors: [{ row, message }]`) để UI hiển thị rõ vị trí và nguyên nhân lỗi.
- **Import một lần từ file nội bộ** `docs/Các sản phẩm phân bón sinh học.xlsx` (sheet đầu, cột `product_code`, `vat_invoice_name`, hai cột `packaging_spec`, `display_name`, `weight_kg`): trong thư mục `backend/`, **bắt buộc `npm run backup:db` trước** (script upsert có thể ghi đè sản phẩm trùng mã). **Nếu import sai hoặc cần trả DB về trạng thái trước khi import:** `pg_restore` từ file `.dump` vừa backup (xem mục 1.1 và mục Khôi phục KAGRI — **cẩn trọng** vì restore có thể ghi đè toàn DB). Sau backup, chạy `npm run import:kagri-bio-products`. Script gán loại **BIO**, upsert theo mã; giá niêm yết và giá tối thiểu = 0, VAT % = 8; khối lượng BIO (g) = `weight_kg` × 1000. Đổi đường dẫn file: `npx ts-node scripts/import-kagri-bio-products-xlsx.ts --path "C:\\đường\\dẫn\\file.xlsx"`.

### 4.22. Warranty (Bảo hành)

Module ở `backend/src/routes/warrantyRoutes.ts` + `backend/src/controllers/warrantyController.ts`.

Nghiệp vụ chính:

- Danh mục serial:
  - `GET /api/warranty/serials`
  - `GET /api/warranty/serials/:id` (chi tiết serial)
- Warranty claims:
  - `GET /api/warranty/claims`
  - `POST /api/warranty/claims` (tạo claim)
  - `PUT /api/warranty/claims/:id` (cập nhật claim)

### 4.23. Customer ranks (Hạng khách hàng / hạng chi tiêu)

Module ở `backend/src/routes/customerRankRoutes.ts` + `backend/src/controllers/customerRankController.ts`.

Nghiệp vụ chính:

- CRUD hạng:
  - `GET/POST/PUT/DELETE /api/customer-ranks/spending-ranks`
  - phân quyền:
    - **GET** (danh sách hạng cho dropdown lọc Sales/CSKH): `VIEW_SETTINGS` **hoặc** một trong `MANAGE_SALES` | `MANAGE_RESALES` | `MANAGE_CUSTOMERS`
    - chỉnh sửa (POST/PUT/DELETE): `EDIT_SETTINGS`
- Recalculate & cập nhật:
  - `POST /api/customer-ranks/spending-ranks/recalculate` (recalc toàn bộ)
  - `POST /api/customer-ranks/spending-ranks/customer/:customerId` (recalc 1 khách)
  - quyền: `EDIT_SETTINGS` / `MANAGE_CUSTOMERS` (tùy endpoint)
- Thống kê:
  - `GET /api/customer-ranks/spending-ranks/statistics` (VIEW_SETTINGS)
- FE tab **Phân hạng khách hàng**:
  - Có nút áp dụng nhanh bộ mức phổ thông: `Phổ thông (BRONZE)` → `Bạc` → `Vàng` → `Bạch kim` → `Kim cương`.
  - Khi áp dụng, hệ thống sẽ **update nếu trùng mã** hoặc **tạo mới nếu chưa có**.
  - Sau khi áp dụng vẫn có thể chỉnh sửa thủ công từng hạng (tên và khoảng chi tiêu).

### 4.24. Marketing Groups (Nhóm marketing)

Module ở `backend/src/routes/marketingGroupRoutes.ts` + `backend/src/controllers/marketingGroupController.ts`.

Quyền áp dụng: `MANAGE_MARKETING_GROUPS` hoặc `MANAGE_CUSTOMERS`.

Nghiệp vụ:

- Quản trị nhóm:
  - `GET /api/marketing-groups/groups`
  - `POST /api/marketing-groups/groups`
  - `PUT /api/marketing-groups/groups/:id`
  - `DELETE /api/marketing-groups/groups/:id`
- Quản trị thành viên:
  - `POST /api/marketing-groups/groups/:id/members`
  - `DELETE /api/marketing-groups/groups/:id/members/:employeeId`
- Gán chi phí cho nhân viên:
  - `POST /api/marketing-groups/costs/assign`
- Báo cáo hiệu quả:
  - `GET /api/marketing-groups/performance`

### 4.25. Logs & Internal Notes

**Logs**

Module ở `backend/src/routes/logRoutes.ts` + `backend/src/controllers/logController.ts`.

- `GET /api/logs`:
  - auth + một trong: `VIEW_LOGS`, `MANAGE_SYSTEM` (và `FULL_ACCESS` như mọi endpoint `checkPermission`)
- `POST /api/logs`:
  - auth (create log, quyền chi tiết do controller/nhánh logic)

**Internal Notes (ghi chú nội bộ)**

Module ở `backend/src/routes/internalNoteRoutes.ts` + `backend/src/controllers/internalNoteController.ts`.

- `GET /api/internal-notes` (MANAGE_INTERNAL_NOTES)
- `POST /api/internal-notes` (MANAGE_INTERNAL_NOTES)
- `PUT /api/internal-notes/:id` (MANAGE_INTERNAL_NOTES)
- `DELETE /api/internal-notes/:id` (MANAGE_INTERNAL_NOTES)

### 4.26. System Configs (Cấu hình hệ thống)

Module ở `backend/src/routes/systemConfigRoutes.ts` + `backend/src/controllers/systemConfigController.ts`.

Nghiệp vụ:

- Lấy categories:
  - `GET /api/system-configs/categories`
- Lấy toàn bộ cấu hình / theo key:
  - `GET /api/system-configs`
  - `GET /api/system-configs/:key`
- Cập nhật:
  - `PUT /api/system-configs/:key`
  - `PUT /api/system-configs` (cập nhật nhiều cấu hình)
  - quyền cập nhật trong route (xem `systemConfigRoutes.ts`): `PUT /:key` — `EDIT_SETTINGS`, `MANAGE_HR`, `CONFIG_OPERATIONS` (hoặc quản trị hệ thống); `PUT /` (nhiều key) — `EDIT_SETTINGS`, `CONFIG_OPERATIONS` (hoặc quản trị hệ thống). `FULL_ACCESS` được `userHasCatalogPermission` chấp nhận như mọi quyền catalog.

## 5. Hướng dẫn chạy dự án

### 5.1. Yêu cầu

- Node.js (phù hợp với package versions)
- PostgreSQL
- Tạo bảng DB theo Prisma schema:
  - chạy `prisma migrate` (nếu bạn dùng migration) hoặc `prisma db push` theo quy trình của team

### 5.2. Backend

1. Cài deps:
   - `cd backend`
   - `npm install`
2. Cấu hình env:
   - Sửa `backend/.env`
   - Các biến quan trọng:
     - `PORT`, `NODE_ENV`
     - `DATABASE_URL`
     - `JWT_SECRET`
     - `API_BASE_URL`
     - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_MAILTO`
     - Viettel Post:
       - `VTP_API_URL`, `VTP_USERNAME`, `VTP_PASSWORD`, `VTP_TOKEN`
       - `VTP_WEBHOOK_SECRET` (comment nếu chưa dùng, nhưng code đã hỗ trợ validate token nếu có)
       - `VTP_ORDER_SERVICE` (tùy chọn — cố định mã dịch vụ khi tạo đơn; để trống thì tự chọn theo `getPriceAll`)
       - `VTP_SENDER_*` — **không** dùng cho tính cước/tạo đơn trong app (chỉ script thử nghiệm CLI nếu cần)
3. Chạy dev:
   - `npm run dev`
4. Seed (nếu cần):
   - `npm run seed` và/hoặc `npm run seed:address`

### 5.3. Frontend

1. Cài deps:
   - `cd frontend`
   - `npm install`
2. Chạy dev:
   - `npm run dev`
3. Lưu ý Vite proxy:
   - Trong `frontend/vite.config.ts`, `/api`, `/uploads`, `/socket.io` được proxy về `http://localhost:3000`.
   - **`timeout` / `proxyTimeout` (ví dụ 300s):** tránh lỗi **502** khi request lâu (upload ảnh đại diện multipart + nén Sharp). Nếu vẫn 502: kiểm tra backend có chạy; ảnh quá lớn có thể làm xử lý chậm.
4. **Màn hình trắng (chỉ thấy tiêu đề tab, không có UI):** thường do thiếu mã nguồn `frontend/src` hoặc `frontend/public` (file `index.html` vẫn tải nhưng script `/src/main.tsx` không còn). Khôi phục từ Git: `git restore frontend/src frontend/public`. Tạm thời có thể xem bản build có sẵn: `npm run preview` (cần thư mục `frontend/dist`). Sau khi khôi phục, dừng Vite cũ và chạy lại `npm run dev`, làm mới cứng trình duyệt nếu cần.
5. **Vùng nội dung trắng sau khi đăng nhập:** thường do URL không khớp route con (ví dụ gõ nhầm `/abc`); app sẽ chuyển về `/`. Nếu backend `/api/me` không phản hồi lâu, phiên kiểm tra có timeout để không kẹt màn “Đang tải dữ liệu…” vô hạn. Trước khi bundle JS chạy, `index.html` hiển thị dòng “Đang tải ứng dụng…” trong `#root`.

### 5.4. Giao diện web xem / sửa database (Prisma Studio)

- Chạy từ thư mục `backend/` (cần `DATABASE_URL` hợp lệ trong `.env`):
  - `npx prisma studio`
- Mặc định mở trình duyệt tại **http://localhost:5555** — duyệt bảng theo schema Prisma, xem và chỉnh bản ghi (thận trọng trên môi trường production).

**Dev cùng lúc (ba terminal):** backend `npm run dev` (thường **http://localhost:3000**), frontend `npm run dev` (**http://localhost:5173**), Prisma Studio (**http://localhost:5555**).

### 5.5. Deploy production

- Backend production có thể phục vụ luôn frontend build (SPA).
- Set `NODE_ENV=production` để backend serve `frontend/dist`.
- **Biến môi trường (Dokploy / Docker):** dùng `backend/.env.example` làm checklist — copy từng dòng đã điền giá trị thật vào màn **Environment** của Dokploy (hoặc tương đương). File `.env` cục bộ không đưa lên Git.
- **`DATABASE_URL`:** dạng `postgresql://USER:PASSWORD@HOST:PORT/DB` — chỉ **một** dấu `@` trước tên host. Nếu mật khẩu chứa `@` hoặc ký tự đặc biệt, phải **URL-encode** (ví dụ `@` → `%40`). Chuỗi dạng `mật_khẩu@@hostname` thường là nhập thừa `@`.
- **Prisma P1001** (Can't reach database server): app container không kết nối được tới Postgres — kiểm tra service DB đã **running**, `HOST:PORT` trong `DATABASE_URL` là **tên DNS nội bộ** đúng với stack (cùng Docker network với app), không dùng hostname chỉ resolve được trên máy khác.
- **Mật khẩu Postgres có ký tự `@` (Dokploy / dashboard):** Không copy nguyên chuỗi nếu UI hiển thị dạng `...matkhau@@hostname...` (hai `@` liên tiếp) — đó **không phải** URL hợp lệ. Trong mật khẩu, ký tự `@` phải ghi **`%40`**, và chỉ **một** dấu `@` ngăn cách `user:password` với `host`. Ví dụ mật khẩu là `MatKhau@123`: `postgresql://postgres:MatKhau%40123@crmn-crmn-rscxzk:5432/CRMN`. Backend log cảnh báo nếu `DATABASE_URL` chứa `@@`.
- **Backup / restore lên server PostgreSQL (Dokploy):**
  1. Trên máy dev, trong `backend/`: `npm run backup:db` → file `backend/backups/hcrm_full_<timestamp>.dump` (thư mục `backups/` bị `.gitignore`; **không** push file dump lên Git).
  2. Upload file `.dump` lên server (SCP/SFTP/volume Dokploy) rồi trên DB production: chạy `npx prisma migrate deploy` (hoặc migration tương đương) **trước** khi restore dữ liệu nếu schema mới hơn DB trống.
  3. Restore: `pg_restore -d "$DATABASE_URL" --no-owner --no-privileges` (hoặc tạo DB trống rồi restore; tùy chính sách hosting — **cẩn trọng** với `--clean` vì có thể xóa object cũ).
- **Frontend build:** nếu build image riêng, set `VITE_API_URL` / `VITE_GOOGLE_MAPS_API_KEY` tại bước build (xem `frontend/.env.example`). Khi backend serve `frontend/dist` cùng origin, có thể dùng `VITE_API_URL=/api`.

#### 5.5.1. Docker / Dokploy (build type: Dockerfile)

- **Dokploy — application `app`:** trên server hiện tại, service ứng dụng HCRM được cấu hình trong Dokploy với **tên application `app`** (điều hướng tới đúng build/deploy, terminal một lần, biến môi trường).
- Ở **gốc repo** có `Dockerfile` + `.dockerignore`. Trên Dokploy: **Build Type = Dockerfile**, đường dẫn file `Dockerfile`, **context build = thư mục gốc** (cùng cấp `backend/`, `frontend/`).
- Image gồm: build **frontend** (Vite) + **backend** (`tsc`, `prisma generate`). **`CMD`:** `backend/scripts/docker-entrypoint.sh` — đợi Postgres bằng **`pg_isready`** (parse host/port từ **`DATABASE_URL`**, tối đa ~120s), rồi **`prisma migrate deploy`**, rồi **`node dist/src/server.js`**. Nếu sau thời gian đợi vẫn không kết nối được DB (host sai, DB không chạy, khác network Docker), container thoát — xem log `[entrypoint] FATAL`. Biến **`SKIP_DB_WAIT=1`** bỏ qua bước đợi (chỉ dùng khi debug). Cổng HTTP theo `PORT` (nên **`PORT=3000`** hoặc đúng proxy Dokploy).
- **`backend/tsconfig.json`:** `tsc` trong image chỉ biên dịch `src/**/*`; thư mục `backend/scripts/` bị loại khỏi build (script bảo trì có thể lệch schema — chạy riêng bằng `ts-node` khi cần).
- **Build arg (tùy chọn):** `VITE_API_URL` (mặc định `/api` khi SPA và API cùng origin). Trên Dokploy thêm build argument nếu API nằm host khác.
- **Bắt buộc khi Postgres trống hoặc mới tạo:** trước khi dùng app, chạy **`npx prisma migrate deploy`** một lần với đúng `DATABASE_URL`. Nếu bỏ qua, log sẽ báo Prisma **P2021** (ví dụ thiếu bảng `organizations`). Trong container image: `WORKDIR` là `/app/backend`, ví dụ `docker exec -it <container> npx prisma migrate deploy` (hoặc shell Dokploy / job one-off cùng env).
- **Sau các lần deploy có migration mới:** image đã chạy **`prisma migrate deploy` lúc start** (xem `CMD` trong `Dockerfile`); nếu cần chạy tay (debug, job một lần): `docker exec -it <container> sh -c "cd /app/backend && npx prisma migrate deploy"`.
- **Prisma P3005 (DB đã có bảng, `migrate deploy` từ chối):** thường gặp khi DB được tạo bằng `db push`, restore tay, hoặc chưa từng ghi `_prisma_migrations`. Cần **baseline**: (1) kiểm tra chênh lệch schema — `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` trong `/app/backend` — nếu còn SQL sinh ra thì **không** được đánh dấu hết migration là đã chạy; xử lý SQL hoặc đồng bộ DB trước. (2) Nếu diff rỗng / đã khớp: lần lượt `npx prisma migrate resolve --applied "<tên_thư_mục_migration>"` theo đúng thứ tự thư mục trong `prisma/migrations/`, sau đó `npx prisma migrate deploy` (sẽ không còn pending). Chi tiết: [Prisma migrate baseline](https://www.prisma.io/docs/guides/migrate/developing-with-prisma-migrate/baselining).
- **Prisma P3009 (migration thất bại trên DB, `migrate deploy` dừng):** một migration đã **bắt đầu** nhưng **không hoàn tất** (`_prisma_migrations.finished_at` null). **Trước khi sửa:** `npm run backup:db` trong `backend/`. **Tự động (migration `20250323120000_organizations_and_department_org_fk` + DB đã khớp SQL):** trong `backend/` chạy `npm run migrate:resolve-p3009` (cần `DATABASE_URL`; `--dry-run` chỉ in lệnh `resolve`/`deploy`, không ghi DB). **Thủ công:** (1) `SELECT migration_name, started_at, finished_at, logs FROM "_prisma_migrations" WHERE finished_at IS NULL;` (2) đối chiếu `backend/prisma/migrations/<tên_thư_mục>/migration.sql`; (3) nếu thay đổi đã áp dụng đủ: `npx prisma migrate resolve --applied "<tên_thư_mục_migration>"`; nếu đã rollback sạch: `--rolled-back`; nếu dở dang thì sửa DB rồi mới `--applied` — dùng `prisma migrate diff` để đối chiếu; (4) `npx prisma migrate deploy`; redeploy container `app`. Chi tiết: [Prisma migrate resolve](https://www.prisma.io/docs/guides/migrate/production-troubleshooting).
- **Uploads:** thư mục `uploads` được tạo trong image; dữ liệu upload **không bền** nếu không gắn **volume** trỏ tới `/app/backend/uploads` (nên cấu hình trên Dokploy khi cần giữ file).
- **File upload (`/uploads/...`):** file lưu trong thư mục **`backend/uploads`** trên đĩa; Express phục vụ tĩnh tại **`/uploads/...`** cùng origin với API. API trả và DB lưu đường dẫn tương đối **`/uploads/...`**. `MAX_UPLOAD_BYTES` (byte) giới hạn kích thước upload Multer (mặc định 20971520 = 20MB). `API_TOKEN` có thể dùng cho tích hợp proxy tùy chỉnh ngoài phạm vi mặc định — **không** đưa token lên Git. **Content-Security-Policy (Helmet):** `img-src` mở rộng `https:` và `blob:` (và `'self'`) để hiển thị ảnh từ host bên ngoài khi cần.
- **Upload ảnh đại diện (multipart) lỗi 413 / «Request Entity Too Large»:** nginx (hoặc proxy trước Node) thường giới hạn body mặc định ~1MB — cần **`client_max_body_size`** (ví dụ `25m`) trong `server`/`location` proxy tới backend. Backend đặt **`trust proxy`** khi chạy sau reverse proxy. Lỗi **403** khi upload cho nhân viên khác: kiểm tra quyền `MANAGE_HR` / tương đương hoặc chỉ đổi ảnh của chính mình (`employeeId` khớp user đăng nhập).
- **Thêm biến môi trường trên Dokploy:** mở project / application → tab **Environment** (hoặc **Variables**) → **Add variable** — nhập tên và giá trị (ví dụ `MAX_UPLOAD_BYTES`, `DATABASE_URL`, …). Với biến chỉ dùng lúc **build** (`VITE_*`), thêm trong phần **Build Arguments** / **Build-time environment** của service (tùy giao diện Dokploy). Lưu và **redeploy** để áp dụng.
- **Sửa đường dẫn production:** `getRootDir()` trong `backend/src/utils/pathHelper.ts` dùng hai cấp `../..` từ `dist/utils` về thư mục `backend/`, khớp Docker layout (`/app/backend`).
- **Cache SPA sau deploy:** `index.html` và fallback SPA gửi kèm `Cache-Control: no-store` để trình duyệt luôn lấy manifest chunk mới; thư mục `assets/` (tên file có hash Vite) dùng cache dài + `immutable`. Nếu vẫn gặp lỗi kiểu *Failed to fetch dynamically imported module* sau khi deploy, thử tải lại không dùng cache (Ctrl+F5) hoặc kiểm tra proxy/CDN phía trước có đang cache `index.html` hay không.
- **Prisma / ERD:** `schema.prisma` không còn generator `prisma-erd-generator` (tránh lỗi Docker: Puppeteer/Chromium và thư mục `frontend/public`). File tĩnh `frontend/public/erd.svg` vẫn dùng được; khi schema thay đổi lớn có thể cập nhật ERD bằng công cụ ngoài hoặc chỉnh tay.

## 5.6. Phân thủ công kho số (Manual Lead Distribution)

Hệ thống hỗ trợ quản lý vận hành **phân chia lead thủ công** từ 3 kho số chính: **Kho thả nổi**, **Kho Sales (chưa phân)** và **Kho CSKH (chưa phân)**.

### 5.6.1. Tổng quan 3 kho số

| Kho số | Trang FE | API phân thủ công | Quyền phân trong phạm vi | Quyền phân cross-org |
|--------|----------|-------------------|--------------------------|----------------------|
| **Kho thả nổi** (Floating Pool) | `/data-pool` | `POST /data-pool/distribute` | `DISTRIBUTE_FLOATING_POOL` | `DISTRIBUTE_FLOATING_CROSS_ORG` |
| **Kho Sales (chưa phân)** | `/sales` | `POST /data-pool/distribute-sales` | `ASSIGN_LEAD` | `DISTRIBUTE_SALES_CROSS_ORG` |
| **Kho CSKH (chưa phân)** | `/resales` | `POST /data-pool/distribute-cskh` | `MANAGE_CSKH_POOL` | `DISTRIBUTE_SALES_CROSS_ORG` |

### 5.6.2. Thao tác trên FE

**A. Kho thả nổi** (`/data-pool`):
- Chọn checkbox → nút **"Phân chia"** → modal chọn nhân viên hoặc đơn vị → xác nhận.
- Quyền cần: `DISTRIBUTE_FLOATING_POOL` (trong phạm vi quản lý) hoặc `DISTRIBUTE_FLOATING_CROSS_ORG` (bất kỳ ai).

**B. Kho Sales chưa phân** (`/sales`):
- Section **"Kho Sales (chưa phân)"** ở đầu trang, hiển thị lead có `poolQueue = SALES_OPEN`, `status = AVAILABLE`.
- Chọn checkbox → nút **"Phân chia (N)"** xuất hiện → modal chọn **nhân viên cụ thể** hoặc **đơn vị chức năng** → xác nhận.
- Quyền cần: `ASSIGN_LEAD` (trong phạm vi quản lý) hoặc `DISTRIBUTE_SALES_CROSS_ORG` (bất kỳ ai) hoặc `MANAGE_DATA_POOL`.

**C. Kho CSKH chưa phân** (`/resales`):
- Section **"Kho CSKH (chưa phân)"** ở đầu trang, hiển thị lead có `poolType = CSKH`, `status = AVAILABLE`.
- Chọn checkbox → nút **"Phân chia (N)"** → modal chọn nhân viên hoặc đơn vị → xác nhận.
- Khi phân, hệ thống tự set: `cskhStage = 1`, `holdUntil` (= `customer_recycle_days`, mặc định 180 ngày), `interactionDeadline` (= `cskh_max_note_days`, mặc định 15 ngày).
- Quyền cần: `MANAGE_CSKH_POOL` (trong phạm vi quản lý) hoặc `DISTRIBUTE_SALES_CROSS_ORG` (bất kỳ ai) hoặc `MANAGE_DATA_POOL`.

### 5.6.3. Quyền đặc biệt: DISTRIBUTE_SALES_CROSS_ORG

Quyền `DISTRIBUTE_SALES_CROSS_ORG` cho phép người được cấp **phân lead từ kho Sales và kho CSKH cho bất kỳ khối/đơn vị/nhân viên** nào trong cây tổ chức mà **không cần là quản lý trực tiếp**. Tương tự `DISTRIBUTE_FLOATING_CROSS_ORG` cho kho thả nổi.

- **Phân quyền:** Vào module Hệ thống → Nhóm quyền → chọn nhóm cần gán → nhóm **"4. Kho số & Phân bổ"** → tick `DISTRIBUTE_SALES_CROSS_ORG`.
- **Kiểm tra phạm vi:** Backend dùng `validateSalesDistributeTarget` (`floatingPoolScopeHelper.ts`) — cross-org nếu có quyền, ngược lại chỉ trong subtree quản lý.

### 5.6.4. Backend API

- **`POST /data-pool/distribute-sales`**: Body `{ leadIds, targetEmployeeId, targetDepartmentId, count }`. Permission check: `ASSIGN_LEAD` / `MANAGE_DATA_POOL` / `DISTRIBUTE_SALES_CROSS_ORG`.
- **`POST /data-pool/distribute-cskh`**: Body tương tự. Permission check: `MANAGE_CSKH_POOL` / `MANAGE_DATA_POOL` / `DISTRIBUTE_SALES_CROSS_ORG`.
- Controller: `dataPoolController.ts` → `distributeFromSalesPool()`, `distributeFromCskhPool()`.
- Scope helper: `floatingPoolScopeHelper.ts` → `validateSalesDistributeTarget()`.

### 5.6.5. Trưởng đơn vị / khối — xem kho theo đơn vị, thu hồi và phân lại trong phạm vi

- **Điều kiện:** Trên HR, nhân viên được gán là **Trưởng đơn vị** (`departments.managerId` trỏ tới nhân viên đó). Cây đơn vị con + nhân viên thuộc các phòng đó quyết định **phạm vi quản lý** (cùng logic `getSubordinateIds` / `getManagedDepartmentSubtreeIds` trong `floatingPoolScopeHelper.ts`).

- **`VIEW_MANAGED_UNIT_POOL`:** Xem danh sách lead **đang gán** (`status=ASSIGNED`) cho NV thuộc phạm vi đơn vị — `GET /api/data-pool?status=ASSIGNED&managedScope=1`. Nếu user **chỉ** có quyền này (không có `VIEW_FLOATING_POOL` / `VIEW_SALES`), API tự áp lọc theo đội; response có thể kèm `viewScopeDescription`. `GET /api/data-pool/stats?managedScope=1` dùng cho thống kê theo đội khi cần.

- **`RECALL_MANAGED_UNIT_LEADS`:** Thu hồi lead đang gán cho NV trong phạm vi — `POST /api/data-pool/recall` với **`leadIds` bắt buộc** (không dùng thu hồi hàng loạt theo ngày như `MANAGE_DATA_POOL`). Hỗ trợ lead `poolType` **SALES** hoặc **CSKH**; sau thu hồi lead về trạng thái **AVAILABLE** tương ứng kho chưa phân.

- **Phân lại cho NV khác trong đơn vị:** Sau thu hồi, lead nằm ở kho Sales/CSKH chưa phân — trưởng đơn vị dùng **`ASSIGN_LEAD`** / **`MANAGE_CSKH_POOL`** với `POST /data-pool/distribute-sales` hoặc `distribute-cskh` như hiện tại; `validateSalesDistributeTarget` đảm bảo đích nằm trong cây đơn vị quản lý (trừ khi có `DISTRIBUTE_SALES_CROSS_ORG` / `MANAGE_DATA_POOL`).

- **FE:** Trang **Kho số thả nổi** (`/data-pool`) chỉ **data đã loại** về `FLOATING` (pool Sales, quy tắc pool push); **không** quản lý kho chưa phân (`SALES_OPEN`) và **không** thống kê trên màn các loại số chưa loại / hàng đợi khác (hai thẻ đầu dùng `totalAvailableFloating` + `todayAdded` khớp khung đó). **Không** tab đơn vị. Vào `/data-pool` khi có `VIEW_FLOATING_POOL` **hoặc** `VIEW_MANAGED_UNIT_POOL`. Lead đơn vị (ASSIGNED): API `GET /api/data-pool?status=ASSIGNED&managedScope=1` hoặc màn khác nếu tích hợp sau.

## 5.7. Quy định Module Sản phẩm (Product)

### 5.7.1. Mã sản phẩm (Product Code)
- **Tự động viết hoa**: Mọi ký tự nhập vào sẽ được chuyển thành IN HOA.
- **Ký tự hợp lệ**: Chỉ cho phép **Chữ cái tiếng Anh in hoa (A-Z)** và **Số (0-9)**.
- **Từ chối**: Bất kỳ khoảng trắng, dấu gạch nối (`-`), dấu gạch dưới (`_`), tiếng Việt có dấu, hoặc ký tự đặc biệt nào khác đều bị loại bỏ tự động và chặn lưu vào DB.

### 5.7.2. Khối lượng sản phẩm bắt buộc
Theo yêu cầu vận hành (phục vụ đối soát, vận chuyển / Viettel Post, và quản lý kho), **tất cả sản phẩm (BIO, TECH, GIFT, COMBO) đều phải có khối lượng**.
- Ở cấp độ hệ thống, cột `weight` đã được khai báo trên bảng chính `products`.
- Trường "Khối lượng" đã được chuyển ra màn hình thông tin chung (General Information) của form Sản Phẩm và là trường **bắt buộc**.
- Khi update hệ thống có dữ liệu sản phẩm cũ, DevOps cần chạy script `npx ts-node scripts/migrate-product-weights.ts` trên server production để đưa dữ liệu khối lượng từ phân đoạn BIO cũ hòa làm khối lượng chung cho sản phẩm, tránh mất mát dữ liệu trước khi chạy `prisma db push` xoá field cũ (nếu có sau này).

## 5.8. Đồng bộ Real-time (Real-time Synchronization)

Hệ thống sử dụng cơ chế sự kiện (Event-driven) qua Socket.io để đồng bộ dữ liệu ngay lập tức giữa Backend và Frontend mà không cần tải lại trang.

### 5.8.1. Cơ chế Backend (Prisma Middleware & broadcastDataChange)
- **Middleware Prisma:** Trong `backend/src/config/database.ts`, một middleware toàn cục tự động bắt các thao tác ghi (`create`, `update`, `upsert`, `delete`, `deleteMany`, `updateMany`) trên mọi Model.
- **Tự động Broadcast:** Khi database thay đổi, backend gọi `broadcastDataChange(entity)` trong `socket.ts` để gửi sự kiện `data_change` tới toàn bộ client đang kết nối. Payload bao gồm tên thực thể (`entity`) bị thay đổi (ví dụ: `Customer`, `Order`, `MarketingCampaign`).

### 5.8.2. Frontend Refresh Hooks
- **`useRealtimeRefresh(entities: string[], onRefresh: () => void)`:** Hook dùng trong các trang (như `Orders.tsx`, `Sales.tsx`, `Marketing.tsx`). Khi nhận sự kiện `data_change` khớp với danh sách `entities` quan sát, hook sẽ thực hiện gọi hàm `onRefresh` để cập nhật dữ liệu cục bộ.
- **`useGlobalRealtime()`:** Hook toàn cục tích hợp trong `MainLayout.tsx`. Chịu trách nhiệm đồng bộ trạng thái hệ thống rộng (như số lượng thông báo chưa đọc, sự kiện `new_lead`, và các cập nhật thông số chung).

### 5.8.3. Danh sách trang đã hỗ trợ
- **Kinh doanh (Sales):** Tự động cập nhật danh sách lead, kho Sales chưa phân và thống kê.
- **CSKH (Resales):** Cập nhật danh sách khách hàng, lịch hẹn và kho CSKH chưa phân.
- **Tiếp thị (Marketing):** Cập nhật Nền tảng, Chiến dịch và danh sách Lead.
- **Đơn hàng (Orders):** Cập nhật danh sách đơn hàng và chỉ tiêu vận đơn.
- **Quản lý khách hàng (CustomerManager):** Cập nhật danh sách khách hàng tập trung.
- **Kho số (DataPool):** Cập nhật số lượng và danh sách trong kho số thả nổi.

## 6. Gợi ý checklist nghiệp vụ khi vận hành

- Đảm bảo cron bật đúng (đặc biệt lead recall & deadline reminder)
- Đảm bảo token Viettel Post + webhook secret đúng
- Đảm bảo bảng `employees` có cột `is_locked` và `session_invalidated_at` (nếu cần lock/logout-employee) để các nhánh “self-healing”/ensureColumns hoạt động mượt
- Kiểm tra thông báo:
  - realtime via Socket.IO
  - push via Web Push subscription

