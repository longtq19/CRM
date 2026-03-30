/**
 * Thẻ khách hàng gợi ý cho mô hình thương mại phân bón sinh học + thiết bị IoT nông nghiệp.
 * Đồng bộ qua `ensureDefaultCustomerTags` (upsert theo `code`).
 */
export type DefaultCustomerTagSeed = {
  code: string;
  name: string;
  color: string;
  bgColor: string;
  description?: string;
  category: string;
  sortOrder: number;
};

export const DEFAULT_CUSTOMER_TAGS: DefaultCustomerTagSeed[] = [
  // Ưu tiên / hành vi
  {
    code: 'KAGRI_HOT_LEAD',
    name: 'Hot lead',
    color: '#B91C1C',
    bgColor: '#FEE2E2',
    description: 'Lead cần xử lý ngay',
    category: 'PRIORITY',
    sortOrder: 10,
  },
  {
    code: 'KAGRI_FOLLOW_CLOSE',
    name: 'Theo dõi sát',
    color: '#C2410C',
    bgColor: '#FFEDD5',
    description: 'Cần chăm sóc / follow-up dày',
    category: 'PRIORITY',
    sortOrder: 20,
  },
  {
    code: 'KAGRI_DEMO_IOT',
    name: 'Cần demo IoT',
    color: '#A16207',
    bgColor: '#FEF9C3',
    description: 'Muốn xem thiết bị / demo hiện trường',
    category: 'BEHAVIOR',
    sortOrder: 30,
  },
  {
    code: 'KAGRI_TRIAL_ORDER',
    name: 'Đã mua thử',
    color: '#047857',
    bgColor: '#D1FAE5',
    description: 'Đã đặt hàng thử nghiệm',
    category: 'BEHAVIOR',
    sortOrder: 40,
  },
  {
    code: 'KAGRI_FARM_VIP',
    name: 'VIP nông trại',
    color: '#6D28D9',
    bgColor: '#EDE9FE',
    description: 'Khách trọng điểm / quy mô lớn',
    category: 'BEHAVIOR',
    sortOrder: 50,
  },
  // Sản phẩm / giải pháp
  {
    code: 'KAGRI_BIO_FERTILIZER',
    name: 'Phân bón sinh học',
    color: '#15803D',
    bgColor: '#DCFCE7',
    category: 'PRODUCT_INTEREST',
    sortOrder: 100,
  },
  {
    code: 'KAGRI_MICRO_SOIL',
    name: 'Vi sinh đất',
    color: '#166534',
    bgColor: '#BBF7D0',
    category: 'PRODUCT_INTEREST',
    sortOrder: 110,
  },
  {
    code: 'KAGRI_IOT_IRRIGATION',
    name: 'IoT tưới tiêu',
    color: '#0369A1',
    bgColor: '#E0F2FE',
    category: 'TECH_IOT',
    sortOrder: 120,
  },
  {
    code: 'KAGRI_IOT_SENSOR',
    name: 'Cảm biến đồng ruộng',
    color: '#1D4ED8',
    bgColor: '#DBEAFE',
    category: 'TECH_IOT',
    sortOrder: 130,
  },
  {
    code: 'KAGRI_TECH_CONSULT',
    name: 'Tư vấn kỹ thuật',
    color: '#0F766E',
    bgColor: '#CCFBF1',
    category: 'PRODUCT_INTEREST',
    sortOrder: 140,
  },
  // Cây trồng
  {
    code: 'CROP_FRUIT',
    name: 'Cây ăn trái',
    color: '#BE185D',
    bgColor: '#FCE7F3',
    category: 'CROP_TYPE',
    sortOrder: 200,
  },
  {
    code: 'CROP_VEG',
    name: 'Rau màu',
    color: '#65A30D',
    bgColor: '#ECFCCB',
    category: 'CROP_TYPE',
    sortOrder: 210,
  },
  {
    code: 'CROP_RICE',
    name: 'Lúa',
    color: '#CA8A04',
    bgColor: '#FEF3C7',
    category: 'CROP_TYPE',
    sortOrder: 220,
  },
  {
    code: 'CROP_COFFEE',
    name: 'Cà phê',
    color: '#7C2D12',
    bgColor: '#FFEDD5',
    category: 'CROP_TYPE',
    sortOrder: 230,
  },
  {
    code: 'CROP_PEPPER',
    name: 'Tiêu',
    color: '#854D0E',
    bgColor: '#FEF9C3',
    category: 'CROP_TYPE',
    sortOrder: 240,
  },
  // Quy mô
  {
    code: 'FARM_SMALL',
    name: 'Hộ nhỏ',
    color: '#475569',
    bgColor: '#F1F5F9',
    category: 'FARM_SIZE',
    sortOrder: 300,
  },
  {
    code: 'FARM_MEDIUM',
    name: 'Trang trại vừa',
    color: '#334155',
    bgColor: '#E2E8F0',
    category: 'FARM_SIZE',
    sortOrder: 310,
  },
  {
    code: 'FARM_LARGE',
    name: 'Quy mô lớn',
    color: '#1E293B',
    bgColor: '#CBD5E1',
    category: 'FARM_SIZE',
    sortOrder: 320,
  },
];
