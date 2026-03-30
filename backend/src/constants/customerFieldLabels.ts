/** Nhãn tiếng Việt cho các trường khách hàng (nhật ký + lịch sử tác động) */
export const CUSTOMER_FIELD_LABELS: Record<string, string> = {
  code: 'Mã khách hàng',
  name: 'Họ tên',
  phone: 'Số điện thoại',
  email: 'Email',
  dateOfBirth: 'Ngày sinh',
  gender: 'Giới tính',
  address: 'Địa chỉ',
  wardId: 'Phường/Xã',
  districtId: 'Quận/Huyện',
  provinceId: 'Tỉnh/Thành',
  farmName: 'Tên vườn/nông trại',
  farmArea: 'Diện tích',
  farmAreaUnit: 'Đơn vị diện tích',
  mainCrops: 'Cây trồng chính',
  mainCropsRootCounts: 'Số gốc cây trồng chính',
  farmingYears: 'Số năm kinh nghiệm',
  farmingMethod: 'Phương pháp canh tác',
  irrigationType: 'Loại tưới tiêu',
  soilType: 'Loại đất',
  businessType: 'Loại hình kinh doanh',
  taxCode: 'Mã số thuế',
  bankAccount: 'Số tài khoản',
  bankName: 'Ngân hàng',
  salesChannel: 'Kênh tiếp cận',
  salesChannelNote: 'Ghi chú kênh',
  note: 'Ghi chú',
  leadStatus: 'Trạng thái lead',
  status: 'Trạng thái',
  employeeId: 'Nhân viên phụ trách',
  leadSourceId: 'Nguồn lead',
  campaignId: 'Chiến dịch',
};

export function formatValueForHistory(val: unknown): string {
  if (val === null || val === undefined) return '(trống)';
  if (Array.isArray(val)) return val.length ? val.join(', ') : '(trống)';
  if (val instanceof Date) return val.toISOString().split('T')[0];
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
