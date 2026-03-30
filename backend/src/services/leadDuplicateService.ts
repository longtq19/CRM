/**
 * Service: Kiểm tra trùng số khách hàng và xử lý khi Marketing nhập Lead.
 * Nguyên tắc: 1 thời điểm chỉ 1 Marketing được ghi nhận doanh thu; không tạo Lead mới khi trùng.
 */
import { prisma } from '../config/database';
import { logModel } from '../models/logModel';
import { upsertMarketingContributor } from '../utils/customerMarketingContributors';
import { getSubordinateIds as getDepartmentSubordinateIds } from '../utils/viewScopeHelper';

const DEFAULT_ATTRIBUTION_DAYS = 45;
const KVC_DIVISION_CODE = 'KVC';

export function normalizePhone(phone: string): string {
  return String(phone).trim().replace(/\s+/g, '');
}

/** Số ngày Marketing được ghi nhận doanh thu (từ config, mặc định 45). */
export async function getMarketingAttributionDays(): Promise<number> {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key: 'marketing_revenue_attribution_days' }
    });
    if (config && config.dataType === 'INTEGER') {
      const n = parseInt(config.value, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch (_) {}
  return DEFAULT_ATTRIBUTION_DAYS;
}

/** Base ngày attribution + `marketingAttributionExtraDays` trên khách (VIP / ngoại lệ CSKH). */
export async function getMarketingAttributionEffectiveDaysForCustomer(
  customerId: string | null | undefined
): Promise<number> {
  const base = await getMarketingAttributionDays();
  if (!customerId) return base;
  try {
    const c = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { marketingAttributionExtraDays: true },
    });
    const extra = c?.marketingAttributionExtraDays;
    if (extra == null || !Number.isFinite(extra) || extra <= 0) return base;
    return base + extra;
  } catch {
    return base;
  }
}

/** Mặc định true: cho phép marketing xử lý số trùng (1 khách — nhiều lần nhập MKT, doanh số lặp tính resales). */
export async function getMarketingAllowDuplicatePhone(): Promise<boolean> {
  try {
    const cfg = await prisma.systemConfig.findUnique({
      where: { key: 'marketing_allow_duplicate_phone' },
    });
    if (!cfg || cfg.dataType !== 'BOOLEAN') return true;
    return cfg.value === 'true';
  } catch {
    return true;
  }
}

/** Lấy mã division (khối) của nhân viên, ví dụ 'KVC'. */
export async function getEmployeeDivisionCode(employeeId: string | null): Promise<string | null> {
  if (!employeeId) return null;
  try {
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { departmentId: true }
    });
    if (!emp?.departmentId) return null;
    
    let currentId: string | null = emp.departmentId;
    while(currentId) {
       const deptNode: any = await prisma.department.findUnique({ 
           where: { id: currentId }, 
           select: { type: true, code: true, parentId: true } 
       });
       if (!deptNode) break;
       if (deptNode.type === 'DIVISION') return deptNode.code;
       currentId = deptNode.parentId;
    }
    return null;
  } catch (_) {
    return null;
  }
}

/** Lấy tất cả id cấp dưới (trực tiếp + gián tiếp) của manager. */
export async function getSubordinateIds(managerId: string): Promise<Set<string>> {
  try {
    const subs = await getDepartmentSubordinateIds(managerId);
    return new Set<string>(subs);
  } catch (_) {
    return new Set<string>();
  }
}

/** Tìm khách hàng theo phone, kèm employee (sales), marketingOwner, dataPool, department/division. */
export async function findExistingByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return prisma.customer.findFirst({
    where: { phone: normalized },
    include: {
      employee: {
        select: {
          id: true,
          fullName: true,
          departmentId: true
        }
      },
      marketingOwner: {
        select: {
          id: true,
          fullName: true,
          departmentId: true
        }
      },
      dataPool: true
    }
  });
}

export type DuplicateCase =
  | '1'   // Trùng trong phạm vi Marketing
  | '2'   // Số đang Sales/Resales phụ trách
  | '3'   // Số trong kho số chung (pool)
  | '4'   // Trùng nhưng Marketing cũ vẫn trong thời gian hưởng
  | 'kvc1' | 'kvc2' | 'kvc3' | null;

export interface DuplicateResult {
  duplicate: true;
  case: DuplicateCase;
  customerId: string;
  existingCustomer: any;
  duplicateLead?: boolean; // true cho case 3: vẫn đưa vào quy trình chia Sales
  message: string;
}

/** Phân loại trường hợp trùng. Trả về null nếu không trùng. */
export async function classifyDuplicate(
  existingCustomer: NonNullable<Awaited<ReturnType<typeof findExistingByPhone>>>,
  actorId: string,
  actorDivisionCode: string | null,
  now: Date
): Promise<DuplicateResult | null> {
  const salesOwnerId = existingCustomer.employeeId ?? null;
  const marketingOwnerId = existingCustomer.marketingOwnerId ?? null;
  const attributionExpiredAt = existingCustomer.attributionExpiredAt ?? null;
  const leadStatus = existingCustomer.leadStatus ?? null;
  const salesDivisionCode = salesOwnerId ? await getEmployeeDivisionCode(salesOwnerId) : null;
  const marketingDivisionCode = marketingOwnerId ? await getEmployeeDivisionCode(marketingOwnerId) : null;

  const isKVC = (code: string | null) => code === KVC_DIVISION_CODE;
  const actorIsKVC = isKVC(actorDivisionCode);

  // KVC 1: Marketing KVC nhập trùng với khách đang do Sales/Resales khối khác chăm sóc
  if (actorIsKVC && salesOwnerId && salesDivisionCode && !isKVC(salesDivisionCode)) {
    return {
      duplicate: true,
      case: 'kvc1',
      customerId: existingCustomer.id,
      existingCustomer,
      message: 'Số trùng với khách đang được Sales/Resales khối khác chăm sóc. Cho phép thêm note, ghi lịch sử; Marketing KVC vẫn được ghi nhận Attribution nếu đủ điều kiện.'
    };
  }

  // KVC 3: Marketing khối khác nhập trùng khách đang do Sales KVC chăm sóc
  if (!actorIsKVC && salesOwnerId && isKVC(salesDivisionCode)) {
    return {
      duplicate: true,
      case: 'kvc3',
      customerId: existingCustomer.id,
      existingCustomer,
      message: 'Số trùng với khách đang do Sales KVC chăm sóc. Cho phép thêm note, ghi lịch sử; Attribution theo rule hệ thống.'
    };
  }

  // Trường hợp 1: Trùng trong phạm vi Marketing (chính mình hoặc cấp dưới)
  if (marketingOwnerId) {
    if (marketingOwnerId === actorId) {
      return {
        duplicate: true,
        case: '1',
        customerId: existingCustomer.id,
        existingCustomer,
        message: 'Số trùng trong phạm vi quản lý của bạn. Không tạo Lead mới; có thể thêm note và ghi lịch sử.'
      };
    }
    const subordinateIds = await getSubordinateIds(marketingOwnerId);
    if (subordinateIds.has(actorId)) {
      return {
        duplicate: true,
        case: '1',
        customerId: existingCustomer.id,
        existingCustomer,
        message: 'Số trùng trong phạm vi quản lý của bạn (cấp dưới). Không tạo Lead mới; có thể thêm note và ghi lịch sử.'
      };
    }
  }

  // Trường hợp 2: Số đang được Sales/Resales phụ trách
  if (salesOwnerId) {
    return {
      duplicate: true,
      case: '2',
      customerId: existingCustomer.id,
      existingCustomer,
      message: 'Số đang được Sales/Resales phụ trách. Cho phép thêm note, ghi lịch sử; không thay đổi sales_owner.'
    };
  }

  // Trường hợp 3: Số trong kho số chung (pool)
  if (leadStatus === 'pool' || (!salesOwnerId && existingCustomer.dataPool)) {
    return {
      duplicate: true,
      case: '3',
      customerId: existingCustomer.id,
      existingCustomer,
      duplicateLead: true,
      message: 'Số trùng đang trong kho số chung. Lead vẫn đưa vào quy trình chia Sales; không tạo Lead mới.'
    };
  }

  // Trường hợp 4: Trùng nhưng Marketing cũ vẫn trong thời gian hưởng
  if (attributionExpiredAt && now < attributionExpiredAt) {
    return {
      duplicate: true,
      case: '4',
      customerId: existingCustomer.id,
      existingCustomer,
      message: 'Số trùng; Marketing hiện tại vẫn trong thời gian được ghi nhận doanh thu. Bạn có thể thêm note và ghi lịch sử.'
    };
  }

  // Trùng nhưng không rơi vào case đặc biệt (ví dụ đã hết attribution, chưa có sales) -> coi như case 2 hoặc 3
  if (salesOwnerId) {
    return {
      duplicate: true,
      case: '2',
      customerId: existingCustomer.id,
      existingCustomer,
      message: 'Số đã tồn tại và đang được Sales/Resales phụ trách.'
    };
  }
  return {
    duplicate: true,
    case: '3',
    customerId: existingCustomer.id,
    existingCustomer,
    duplicateLead: true,
    message: 'Số trùng, đang trong kho số chung. Không tạo Lead mới.'
  };
}

/** Thêm interaction (note) cho khách hàng khi trùng. */
export async function addDuplicateNote(
  customerId: string,
  employeeId: string,
  note: string,
  actionType: string
): Promise<void> {
  const count = await prisma.customerInteraction.count();
  const code = `INT-${String(count + 1).padStart(6, '0')}`;
  await prisma.customerInteraction.create({
    data: {
      code,
      customerId,
      employeeId,
      type: actionType,
      content: note || '(Marketing nhập trùng - đã ghi nhận)'
    }
  });
}

/** Ghi activity log khi phát hiện trùng. */
export function logDuplicateAction(
  userId: string,
  userName: string,
  userPhone: string | undefined,
  actionType: string,
  leadId: string,
  details: string
): void {
  logModel.create({
    userId,
    userName: userName || 'Unknown',
    userPhone,
    action: actionType,
    object: 'Lead',
    result: 'Thành công',
    details: details ? `${details} (ID: ${leadId})` : `Lead ID: ${leadId}`
  });
}

export interface CheckDuplicateInput {
  phone: string;
  actorId: string;
  actorName: string;
  actorPhone?: string;
  note?: string;
  campaignId?: string;
  campaignName?: string;
}

export interface CheckDuplicateOutput {
  isNew: boolean;
  duplicate?: boolean;
  /** Tắt «cho phép trùng» → từ chối tạo lead, không ghi note. */
  rejectedDuplicate?: boolean;
  case?: DuplicateCase;
  customerId?: string;
  message?: string;
  duplicateLead?: boolean;
  existingCustomer?: any;
}

/**
 * Kiểm tra trùng và nếu trùng thì xử lý (thêm note, log, trả về kết quả).
 * Controller sẽ gửi notification dựa trên kết quả.
 */
export async function checkDuplicateAndHandle(input: CheckDuplicateInput): Promise<CheckDuplicateOutput> {
  const { phone, actorId, actorName, actorPhone, note } = input;
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { isNew: true }; // coi như không trùng, để controller validate
  }

  const existing = await findExistingByPhone(normalized);
  if (!existing) {
    return { isNew: true };
  }

  const allowDup = await getMarketingAllowDuplicatePhone();
  if (!allowDup) {
    return {
      isNew: false,
      duplicate: true,
      rejectedDuplicate: true,
      customerId: existing.id,
      message:
        'Hệ thống đang tắt «cho phép marketing nhập số trùng». Không thể ghi nhận lead trùng số điện thoại.',
    };
  }

  const now = new Date();
  const actorDivisionCode = await getEmployeeDivisionCode(actorId);
  const dup = await classifyDuplicate(existing, actorId, actorDivisionCode, now);
  if (!dup) return { isNew: true };

  // Thêm note (interaction)
  await addDuplicateNote(
    existing.id,
    actorId,
    note || '',
    'marketing_duplicate_interaction'
  );

  if (actorId) {
    await upsertMarketingContributor(existing.id, actorId);
  }

  // Activity log
  logDuplicateAction(
    actorId,
    actorName,
    actorPhone,
    'duplicate_lead_detected',
    existing.id,
    `Marketing nhập số trùng ${normalized}. ${dup.message}. Note: ${note || '-'}`
  );

  return {
    isNew: false,
    duplicate: true,
    case: dup.case,
    customerId: existing.id,
    message: dup.message,
    duplicateLead: dup.duplicateLead,
    existingCustomer: dup.existingCustomer
  };
}

/** Trả về ngày hết hạn attribution khi tạo Lead mới. */
export function getAttributionExpiredAt(createdAt: Date, attributionDays: number): Date {
  const d = new Date(createdAt);
  d.setDate(d.getDate() + attributionDays);
  return d;
}

/**
 * Khi trùng số giữa các chiến dịch: thông báo nhân viên phụ trách khách (Sales/CS — employee_id).
 */
export function getDuplicateNotificationTargets(existingCustomer: any): string[] {
  const ids: string[] = [];
  if (existingCustomer?.employeeId) ids.push(existingCustomer.employeeId);
  return [...new Set(ids)];
}
