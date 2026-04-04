export type Role = string;

export interface Province {
  id: string;
  name: string;
  code?: string;
}

export interface District {
  id: string;
  name: string;
  code?: string;
  provinceId?: string;
}

export interface Ward {
  id: string;
  name: string;
  code?: string;
  districtId?: string | null;
  vtpDistrictId?: number | null;
}

export interface Menu {
  id: string;
  label: string;
  path: string;
  icon?: string;
  order: number;
}

export interface Permission {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface RoleGroup {
  id: string;
  name: string;
  code: string;
  menus: Menu[];
  permissions: Permission[];
}

export interface UserRoleGroup {
  id: string;
  code: string;
  name: string;
}

export interface User {
  id: string;
  code?: string;
  name: string;
  phone: string;
  role: Role;
  roleGroupId?: string;
  roleGroupCode?: string;
  roleGroup?: UserRoleGroup | null;
  avatar?: string;
  status?: 'active' | 'inactive';
  managerId?: string;
  managerCode?: string;
  createdAt?: string;
  menus?: Menu[];
  permissions?: string[];
  lastLoginAt?: string;
  lastActiveAt?: string;
}

export interface Customer {
  id: string;
  code?: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  dob?: string;
  membershipTier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  totalOrdersValue: number;
  assignedStaffId: string;
  managerId?: string;
  joinedDate: string;
  interests?: string[];
  /** Địa chỉ hành chính chi tiết (API danh sách khách có thể trả kèm) */
  province?: Province;
  district?: District | null;
  ward?: Ward | null;
  addressRecord?: {
    type: 'NEW' | 'OLD';
    detail: string;
    provinceId: string;
    districtId?: string | null;
    wardId: string;
    province?: { id: string; name: string; code?: string };
    district?: { id: string; name: string; code?: string } | null;
    ward?: {
      id: string;
      name: string;
      code?: string;
      districtId?: string | null;
      vtpDistrictId?: number | null;
    };
  } | null;
  customerStatus?: {
    id: string;
    code: string;
    name: string;
    color: string;
  } | null;
  orders?: Order[];
}


export interface MarketingSource {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { campaigns: number };
}

export interface MarketingCampaignMember {
  id: string;
  employeeId: string;
  employee: { id: string; code: string; fullName: string; avatarUrl?: string | null };
}

export interface MarketingCampaign {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
  startDate: string;
  endDate?: string | null;
  totalBudget?: number | null;
  /** Tổng chi phí thực tế (VND) — từ API danh sách: sum `marketing_campaign_costs.amount` */
  totalSpentActual?: number;
  sourceId?: string | null;
  source?: MarketingSource | null;
  createdByEmployeeId: string;
  /** NONE | OLD | NEW — bộ mã địa chỉ hành chính khi nhận lead qua API công khai */
  publicLeadAddressHierarchy?: string | null;
  createdByEmployee?: { id: string; code: string; fullName: string; avatarUrl?: string | null } | null;
  members?: MarketingCampaignMember[];
  createdAt: string;
  updatedAt: string;
}

export interface MarketingLead extends Customer {
  leadSourceId?: string | null;
  leadSource?: MarketingSource | null;
  campaignId?: string | null;
  campaign?: MarketingCampaign | null;
  leadStatus?: string | null;
  isValidLead?: boolean;
  invalidReason?: string | null;
  /** Gán từ API marketing leads (`tags` + `tag`). */
  tags?: Array<{ tag: { id: string; name: string; color: string; bgColor?: string | null } }>;
  marketingOwner?: { id: string; fullName: string; avatarUrl?: string | null } | null;
  /** NV Sales/CS phụ trách */
  employee?: { id: string; fullName: string; phone?: string | null } | null;
  /** Đơn giao đầu tiên (DELIVERED) — giá trị chốt */
  firstDeliveredOrderAmount?: number | null;
  /** Mô tả khi xử lý trùng số (cross-campaign) */
  duplicatePhoneNote?: string | null;
  /** Tối đa 50 bản ghi từ API danh sách lead */
  impactHistory?: Array<{
    id: string;
    type: string;
    content: string;
    detail: string | null;
    createdAt: string;
    employee?: { fullName: string; phone?: string | null } | null;
  }>;
}

export interface InternalNote {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  date: string;
  relatedTo: string;
  customerId?: string;
}

export interface CustomerStats {
  totalCustomers: number;
  newCustomers: number;
  totalRevenue: number;
  revenueGrowth: number;
  activeCustomers30Days: number;
}

export interface SystemDocument {
  // System Document Interface
  id: string;
  code: string;
  title: string;
  name: string; // Backend returns name
  content: string; // HTML content
  type: 'guide' | 'process' | 'technical' | 'policy' | 'customer_care';
  createdBy: string;
  uploadedBy: string; // Backend returns uploadedBy
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface SystemLog {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userPhone?: string;
  action: string;
  object: string;
  result: string;
  details?: string;
}

export interface NotificationTarget {
  type: 'all' | 'area' | 'crop' | 'rank' | 'customer_phone' | 'staff';
  value?: string | string[];
}

export interface Notification {
  id: string;
  code?: string;
  title: string;
  content: string;
  type: 'system_maintenance' | 'knowledge_share' | 'marketing' | 'maintenance_warranty';
  target: NotificationTarget;
  status: 'DRAFT' | 'SCHEDULED' | 'SENT' | 'DISABLED';
  cta?: {
    label: string;
    url: string;
  };
  scheduledAt?: string;
  sentAt?: string;
  createdAt: string;
  createdBy: string;
  stats: {
    sent: number;
    read: number;
  };
  updatedAt: string;
}

export interface Position {
  id: string;
  name: string;
  code: string;
  departmentId?: string; // Relation 1-N
  department?: Department;
}

/** Tỉ lệ % phân luồng data trong khối (bản ghi DIVISION). */
export interface DivisionDataFlowShares {
  marketingToSalesPct?: Record<string, number>;
  /** Phân % theo khối con trực tiếp (id khối DIVISION con) trước khi chia xuống đơn vị lá */
  marketingToSalesChildDivisionPct?: Record<string, number>;
  salesToCsPct?: Record<string, number>;
  salesToCsChildDivisionPct?: Record<string, number>;
  csOnlyPct?: Record<string, number>;
  /** Tỉ lệ MKT → Sales (luồng từ khối đồng cấp); lưu trên khối nhận có Sales lá */
  externalMarketingToSalesPct?: Record<string, number>;
}

export interface Department {
  id: string;
  name: string;
  code: string;
  divisionId: string;
  /** Mã loại từ category (API có thể chỉ trả category). */
  type?: string;
  function?:
    | 'MARKETING'
    | 'SALES'
    | 'CSKH'
    | 'REV_DATA_BEFORE_20250701'
    | 'REV_DATA_RANGE_20250701_20260131'
    | null;
  division?: Division;
  parentId?: string | null;
  children?: Department[];
  displayOrder?: number;
  managerId?: string | null;
  manager?: {
    id: string;
    fullName: string;
    code: string;
    positionId?: string;
    position?: {
      name: string;
    };
  };
  dataFlowShares?: DivisionDataFlowShares | null;
  /** Đơn vị CSKH đích cố định (target). */
  targetCsUnitId?: string | null;
  targetCsUnit?: { id: string; name: string } | null;
  /** Đơn vị Sales đích cố định (target). */
  targetSalesUnitId?: string | null;
  targetSalesUnit?: { id: string; name: string } | null;
  /** Đơn vị CSKH đồng cấp kết nối (external). */
  externalCsDivisionId?: string | null;
  externalCsDivision?: { id: string; name: string } | null;
  /** Đơn vị Sales đồng cấp kết nối (external). */
  externalSalesDivisionId?: string | null;
  externalSalesDivision?: { id: string; name: string } | null;
}

export interface Division {
  id: string;
  name: string;
  code: string;
  displayOrder?: number;
  parentId?: string | null;
  managerId?: string | null;
  manager?: {
    id: string;
    fullName: string;
    code: string;
    positionId?: string;
    position?: {
      name: string;
    };
  };
  dataFlowShares?: DivisionDataFlowShares | null;
  externalCsDivisionId?: string | null;
  externalCsDivision?: { id: string; name: string } | null;
  externalSalesDivisionId?: string | null;
  externalSalesDivision?: { id: string; name: string } | null;
  /** Đơn vị CSKH đích cố định (target). */
  targetCsUnitId?: string | null;
  targetCsUnit?: { id: string; name: string } | null;
  /** Đơn vị Sales đích cố định (target). */
  targetSalesUnitId?: string | null;
  targetSalesUnit?: { id: string; name: string } | null;
}

export interface Subsidiary {
  id: string;
  name: string;
  code: string;
}

export interface Bank {
  id: string;
  code: string;
  name: string;
  shortName?: string;
}

export interface EmploymentType {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
}

/** Loại nhân viên (BOD, MKT, SAL, RES, ACC, HR, IT, ...) - dùng cho báo cáo, lọc, kế toán */
export interface EmployeeType {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface EmployeeStatus {
  id: string;
  code: string;
  name: string;
  sortOrder?: number;
}

export interface EmployeeBankAccount {
  id: string;
  employeeId: string;
  bankId: string;
  bank: Bank;
  accountNumber: string;
  accountHolder: string;
  isPrimary: boolean;
}

export interface EmployeeVehicle {
  id: string;
  employeeId: string;
  type: string;
  name?: string;
  color?: string;
  licensePlate: string;
}

export interface Employee {
  id: string;
  code: string;
  fullName: string;
  gender: string;
  dateOfBirth?: string;
  avatarUrl?: string;
  phone?: string;
  emailCompany?: string;
  emailPersonal?: string;
  filePath?: string;
  address?: string;
  subsidiaries?: Subsidiary[]; 
  
  employmentTypeId?: string;
  employmentType?: EmploymentType | string; 
  statusId?: string;
  status?: EmployeeStatus | string; 
  
  positionId?: string | null;
  departmentId?: string | null;
  divisionId: string;
  /** Danh mục bộ phận (HR — lọc/hiển thị). */
  hrDepartmentUnitId?: string | null;
  /** Chức danh nội bộ của HR (không phải chức danh vận hành). */
  hrJobTitle?: string | null;
  managerId?: string | null;
  roleGroupId?: string | null;
  employeeTypeId?: string | null;
  employeeType?: EmployeeType | null;

  // Relations
  bankAccounts?: EmployeeBankAccount[];
  vehicles?: EmployeeVehicle[];

  // Legacy/Form fields (Optional)
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  vehicleType?: string;
  vehicleName?: string;
  vehicleColor?: string;
  vehicleLicensePlate?: string;

  // Existing Relations
  position?: Position;
  department?: Department;
  division?: Division;
  /** Bộ phận (danh mục HR). */
  hrDepartmentUnit?: { id: string; name: string; code: string } | null;
  manager?: Employee;
  roleGroup?: RoleGroup;
  contracts?: Contract[];
  
  isOnline?: boolean;
  lastActiveAt?: string;
  isLocked?: boolean;
  sessionInvalidatedAt?: string | null;

  contractReminderDaysBefore?: number | null;
  contractReminderRepeatDays?: number | null;
  notifyOnNewContractUpload?: boolean | null;

  /** Ngày hiệu lực HĐ (tùy chọn, mọi loại HĐ). */
  contractEffectiveDate?: string | null;
  /** Ngày hết hạn HĐ nếu có (tùy chọn). */
  contractEndDate?: string | null;

  probationStartDate?: string | null;
  probationEndDate?: string | null;
  probationStatus?: 'NONE' | 'ON_PROBATION' | 'PASSED' | 'FAILED' | null;

  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  employeeId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  uploadedBy?: string;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
}

export type ProductType = 'BIO' | 'TECH' | 'GIFT' | (string & {});
export type ProductStatus = 'ACTIVE' | 'INACTIVE';

// Order Types
export type OrderStatus = 'DRAFT' | 'CONFIRMED' | 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'RETURNED';
export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'REFUNDED';
export type ShippingStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPING' | 'DELIVERED' | 'RETURNED' | 'CANCELLED';

export interface OrderItem {
  id: string;
  code?: string;
  orderId?: string;
  orderDate?: string;
  productId: string;
  product?: Product;
  quantity: number;
  unitPrice?: number;
  price?: number; // compat
  totalPrice?: number;
  total?: number; // compat
}

export interface ShippingLog {
  id: string;
  orderId: string;
  orderDate: string;
  status: string;
  statusCode: string;
  description: string;
  note?: string;
  timestamp: string;
  vtpOrderCode?: string;
  rawData?: string;
}

export interface Order {
  id: string;
  code: string;
  orderDate: string;
  customerId: string;
  customer?: Customer;
  employeeId?: string;
  employee?: Employee;
  
  totalAmount: number;
  discount: number;
  /** Đã cọc — trừ khỏi COD VTP */
  depositAmount?: number;
  shippingFee: number;
  finalAmount: number;
  /** Tiền thu hộ khi đẩy VTP (sau trừ cọc); null/undefined → tương thích đơn cũ */
  codAmount?: number | null;
  
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  shippingStatus: ShippingStatus;
  
  shippingProvider?: string;
  trackingNumber?: string;
  
  receiverName?: string;
  receiverPhone?: string;
  receiverAddress?: string;
  receiverProvince?: string;
  receiverDistrict?: string;
  receiverWard?: string;
  receiverProvinceId?: number | null;
  receiverDistrictId?: number | null;
  receiverWardId?: number | null;
  warehouseId?: string | null;
  warehouse?: { id: string; code: string; name: string; address?: string | null; detailAddress?: string | null } | null;
  isPrinted: boolean;
  
  note?: string;
  
  confirmedById?: string;
  confirmedBy?: Employee;
  confirmedAt?: string;
  shippedAt?: string;
  deliveredAt?: string;
  
  items: OrderItem[];
  shippingLogs?: ShippingLog[];
  printLogs?: Array<{
    id: string;
    employeeId: string;
    createdAt: string;
    employee: { fullName: string; code: string };
  }>;
  
  createdAt: string;
  updatedAt: string;
}

export interface OrderStats {
  totalOrders: number;
  byStatus: {
    pending: number;
    confirmed: number;
    shipping: number;
    delivered: number;
    returned: number;
    cancelled: number;
  };
  totalRevenue: number;
}

export interface ProductBio {
  productId: string;
  volume?: number | null;
  weight?: number | null;
  packType?: string | null;
  ingredients?: string | null;
  usage?: string | null;
  expiryPeriod?: number | null;
}

export interface ProductTech {
  productId: string;
  specifications?: any | null; // JSON
  warrantyDuration: number;
  maintenancePeriod?: number | null;
  manufacturer?: string | null;
  modelYear?: number | null;
}

export interface ProductComboItem {
  id: string;
  comboProductId: string;
  componentProductId: string;
  componentProduct?: Pick<Product, 'id' | 'code' | 'name' | 'thumbnail' | 'unit' | 'status'>;
}

export interface ProductCategory {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  _count?: { products: number };
}

export interface ProductBatch {
  id: string;
  code: string;
  productId: string;
  quantity: number;
  manufactureDate: string;
  expiryDate: string;
  warehouseId?: string | null;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  vatName?: string | null;
  vatRate?: number;
  categoryId?: string | null;
  category?: ProductCategory | null;
  /** Mã loại (khi API map từ category.code). */
  type?: string;
  /** Quy cách đóng gói (mọi loại sản phẩm; BIO đồng bộ với chi tiết BIO). */
  packagingSpec?: string | null;
  description?: string | null;
  listPriceNet: number;
  minSellPriceNet: number;
  unit: string;
  thumbnail?: string | null;
  gallery: string[];
  status: ProductStatus;
  lowStockThreshold: number;
  weight?: number | null;
  
  bioDetail?: ProductBio | null;
  techDetail?: ProductTech | null;
  comboItems?: ProductComboItem[];
  batches?: ProductBatch[];
  stocks?: { quantity: number; warehouse?: { name: string } }[];
  warehouseId?: string | null;
  
  createdAt: string;
  updatedAt: string;
}

export type SupportTicketStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED';

export interface SupportTicketAttachment {
  id: string;
  ticketId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileType: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  code: string;
  title: string;
  description: string;
  status: SupportTicketStatus;
  createdById: string;
  assignedToId?: string | null;
  resolvedAt?: string | null;
  adminNote?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; fullName: string; phone: string; avatarUrl?: string | null; code: string };
  assignedTo?: { id: string; fullName: string; phone: string; avatarUrl?: string | null; code: string } | null;
  attachments: SupportTicketAttachment[];
}
export interface LeadProcessingStatus {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isPushToPool: boolean;
  createdAt: string;
  updatedAt: string;
}
