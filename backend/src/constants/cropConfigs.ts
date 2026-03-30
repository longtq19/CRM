export type CropGroupName =
  | 'Ngũ cốc'
  | 'Rau màu'
  | 'Cây công nghiệp'
  | 'Cây ăn quả'
  | 'Cây ăn quả khác'
  | 'Hoa & Cây cảnh'
  | 'Khác';

export interface CropDef {
  value: string;
  group: CropGroupName;
  // True nếu nghiệp vụ cần nhập "số gốc" (đếm theo gốc/cây).
  isRootCountable: boolean;
}

// Danh mục cây trồng chính dùng cho Customer.mainCrops trên toàn hệ thống.
// Lưu ý: FE/BE đều dựa trên cấu hình này để điều kiện "số gốc" nhất quán.
export const CROP_DEFS: CropDef[] = [
  // Ngũ cốc
  { value: 'Lúa', group: 'Ngũ cốc', isRootCountable: false },
  { value: 'Ngô', group: 'Ngũ cốc', isRootCountable: false },
  { value: 'Khoai', group: 'Ngũ cốc', isRootCountable: false },
  { value: 'Sắn', group: 'Ngũ cốc', isRootCountable: false },

  // Cây công nghiệp
  { value: 'Cà phê', group: 'Cây công nghiệp', isRootCountable: true },
  { value: 'Tiêu', group: 'Cây công nghiệp', isRootCountable: true },
  { value: 'Cao su', group: 'Cây công nghiệp', isRootCountable: true },
  { value: 'Điều', group: 'Cây công nghiệp', isRootCountable: true },

  // Cây ăn quả
  { value: 'Cam', group: 'Cây ăn quả', isRootCountable: true },
  { value: 'Bưởi', group: 'Cây ăn quả', isRootCountable: true },
  { value: 'Xoài', group: 'Cây ăn quả', isRootCountable: true },
  { value: 'Sầu riêng', group: 'Cây ăn quả', isRootCountable: true },

  // Cây ăn quả khác
  { value: 'Thanh long', group: 'Cây ăn quả khác', isRootCountable: true },

  // Rau màu
  { value: 'Rau xanh', group: 'Rau màu', isRootCountable: false },
  { value: 'Cà chua', group: 'Rau màu', isRootCountable: false },
  { value: 'Dưa hấu', group: 'Rau màu', isRootCountable: false },
  { value: 'Dưa lưới', group: 'Rau màu', isRootCountable: false },

  // Hoa & cây cảnh
  { value: 'Hoa', group: 'Hoa & Cây cảnh', isRootCountable: false },
  { value: 'Cây cảnh', group: 'Hoa & Cây cảnh', isRootCountable: false },
];

export const CROP_GROUP_BY_NAME: Record<string, CropGroupName> = CROP_DEFS.reduce(
  (acc, c) => {
    acc[c.value] = c.group;
    return acc;
  },
  {} as Record<string, CropGroupName>,
);

export const ROOT_COUNTABLE_CROPS = new Set(
  CROP_DEFS.filter((c) => c.isRootCountable).map((c) => c.value),
);

export const ALL_CROPS_SET = new Set(CROP_DEFS.map((c) => c.value));

