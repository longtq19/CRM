/**
 * Định nghĩa cột Excel chuẩn cho Import/Export khách hàng.
 * Đồng nhất dùng cho: Marketing, Kho số chung, Sales, CSKH.
 * Đầy đủ các trường trong bảng Customer (schema Prisma) có thể nhập/xuất.
 */

export interface ExcelColumnDef {
  header: string;
  key: string;
  width: number;
}

/** Cột file mẫu import + export (đủ trường DB có thể nhập/xuất) */
export const CUSTOMER_EXCEL_COLUMNS: ExcelColumnDef[] = [
  { header: 'Số điện thoại (*)', key: 'phone', width: 18 },
  { header: 'Họ và tên', key: 'name', width: 25 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Giới tính', key: 'gender', width: 10 },
  { header: 'Ngày sinh', key: 'dateOfBirth', width: 14 },
  { header: 'Địa chỉ', key: 'address', width: 32 },
  { header: 'Tỉnh/TP', key: 'province', width: 18 },
  { header: 'Quận/Huyện', key: 'district', width: 18 },
  { header: 'Phường/Xã', key: 'ward', width: 18 },
  { header: 'Loại hình KD (*)', key: 'businessType', width: 18 },
  { header: 'Kênh tiếp cận (*)', key: 'salesChannel', width: 28 },
  { header: 'Ghi chú kênh', key: 'salesChannelNote', width: 24 },
  { header: 'Thẻ khách hàng (*)', key: 'tags', width: 26 },
  { header: 'Ghi chú', key: 'note', width: 28 },
  { header: 'Vườn/Nông trại', key: 'farmName', width: 20 },
  { header: 'Diện tích', key: 'farmArea', width: 10 },
  { header: 'Đơn vị DT', key: 'farmAreaUnit', width: 12 },
  { header: 'Cây trồng chính', key: 'mainCrops', width: 24 },
  { header: 'Số gốc', key: 'mainCropsRootCounts', width: 16 },
  { header: 'Số năm KN', key: 'farmingYears', width: 10 },
  { header: 'Loại đất', key: 'soilType', width: 14 },
  { header: 'Phương pháp canh tác', key: 'farmingMethod', width: 18 },
  { header: 'Loại tưới tiêu', key: 'irrigationType', width: 14 },
  { header: 'MST', key: 'taxCode', width: 14 },
  { header: 'Số TK', key: 'bankAccount', width: 18 },
  { header: 'Ngân hàng', key: 'bankName', width: 18 },
  { header: 'Trạng thái lead', key: 'leadStatus', width: 14 },
  { header: 'Nguồn lead (tên/mã)', key: 'leadSource', width: 20 },
  { header: 'Chiến dịch (tên/mã)', key: 'campaign', width: 22 },
  { header: 'Trạng thái', key: 'status', width: 12 },
  { header: 'NV phụ trách (mã)', key: 'employeeCode', width: 16 },
  { header: 'NV Marketing (mã)', key: 'marketingOwnerCode', width: 18 },
  { header: 'Hạng chi tiêu (mã)', key: 'spendingRankCode', width: 14 },
  { header: 'Hạng khu vực (mã)', key: 'regionRankCode', width: 14 },
  { header: 'Lead hợp lệ', key: 'isValidLead', width: 12 },
  { header: 'Lý do không hợp lệ', key: 'invalidReason', width: 22 },
  { header: 'Ngày tham gia', key: 'joinedDate', width: 14 },
  { header: 'Hết hạn attribution', key: 'attributionExpiredAt', width: 18 },
  { header: 'Nguồn tạo', key: 'createdByRole', width: 12 },
];

/** Tên file mẫu import thống nhất cho 4 module */
export const CUSTOMER_IMPORT_TEMPLATE_FILENAME = 'mau-import-khach-hang.xlsx';

/** Tên file export thống nhất (prefix) */
export const CUSTOMER_EXPORT_FILENAME_PREFIX = 'khach-hang';
