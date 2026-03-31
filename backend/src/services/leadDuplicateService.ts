/**
 * Service: Kiểm tra trùng số khách hàng và xử lý khi Marketing nhập Lead.
 * Nguyên tắc: 1 thời điểm chỉ 1 Marketing được ghi nhận doanh thu; không tạo Lead mới khi trùng.
 */
import { prisma } from '../config/database';
import { logModel } from '../models/logModel';
import { upsertMarketingContributor } from '../utils/customerMarketingContributors';
import { getSubordinateIds as getDepartmentSubordinateIds } from '../utils/viewScopeHelper';
import { createUserNotification } from '../controllers/userNotificationController';

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
          phone: true,
          departmentId: true
        }
      },
      marketingOwner: {
        select: {
          id: true,
          fullName: true,
          phone: true,
          departmentId: true
        }
      },
      dataPool: {
        include: {
          assignedTo: {
            select: { id: true, fullName: true, phone: true }
          }
        }
      }
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
  actorName: string,
  note: string,
  actionType: string
): Promise<void> {
  const count = await prisma.customerInteraction.count();
  const code = `INT-${String(count + 1).padStart(6, '0')}`;
  const now = new Date();
  const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const formattedHeader = `${timeStr} ${dateStr} - ${actorName}`;
  const content = note ? `${formattedHeader}: ${note}` : formattedHeader;

  await prisma.customerInteraction.create({
    data: {
      code,
      customerId,
      employeeId,
      type: actionType,
      content,
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
  /** Từ chối trùng: bản ghi khách để FE hiển thị NV phụ trách */
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
    if (actorId) {
      await addDuplicateNote(
        existing.id,
        actorId,
        actorName,
        note || 'Hệ thống từ chối ghi nhận (đã tắt cho phép nhập trùng SĐT).',
        'marketing_duplicate_interaction'
      );
    }
    return {
      isNew: false,
      duplicate: true,
      rejectedDuplicate: true,
      customerId: existing.id,
      existingCustomer: existing,
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
    actorName,
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

/** Dữ liệu hiển thị cho người nhập trùng (Sales / Marketing / CSKH). */
export type DuplicateStaffDisplayForClient = {
  salesOrCareResponsible: { fullName: string; phone: string | null } | null;
  marketingResponsible: { fullName: string; phone: string | null } | null;
};

export function getDuplicateStaffDisplayForClient(existing: any): DuplicateStaffDisplayForClient {
  const salesEmp = existing?.employee;
  const poolAssignee = existing?.dataPool?.assignedTo;
  let salesOrCareResponsible: DuplicateStaffDisplayForClient['salesOrCareResponsible'] = null;
  if (salesEmp?.id) {
    salesOrCareResponsible = {
      fullName: String(salesEmp.fullName || '—').trim() || '—',
      phone: salesEmp.phone != null ? String(salesEmp.phone) : null,
    };
  } else if (
    poolAssignee?.id &&
    existing?.dataPool &&
    String(existing.dataPool.status) === 'ASSIGNED'
  ) {
    salesOrCareResponsible = {
      fullName: String(poolAssignee.fullName || '—').trim() || '—',
      phone: poolAssignee.phone != null ? String(poolAssignee.phone) : null,
    };
  }
  const mo = existing?.marketingOwner;
  const marketingResponsible =
    mo?.id != null
      ? {
          fullName: String(mo.fullName || '—').trim() || '—',
          phone: mo.phone != null ? String(mo.phone) : null,
        }
      : null;
  return { salesOrCareResponsible, marketingResponsible };
}

/**
 * Nhận thông báo: NV Sales/CSKH phụ trách (`employee_id`) hoặc NV được gán kho (`data_pool.assigned_to` khi chưa có employee),
 * và NV Marketing (`marketing_owner_id`). Không gửi lại cho chính người vừa nhập trùng.
 */
export function getDuplicateNotificationTargets(
  existingCustomer: any,
  excludeActorId?: string | null
): string[] {
  const ids: string[] = [];
  if (existingCustomer?.employeeId) ids.push(existingCustomer.employeeId);
  if (existingCustomer?.marketingOwnerId) ids.push(existingCustomer.marketingOwnerId);
  if (
    !existingCustomer?.employeeId &&
    existingCustomer?.dataPool?.assignedToId &&
    String(existingCustomer.dataPool.status) === 'ASSIGNED'
  ) {
    ids.push(existingCustomer.dataPool.assignedToId);
  }
  const ex = excludeActorId && String(excludeActorId).trim() ? String(excludeActorId).trim() : null;
  const filtered = ex ? ids.filter((id) => id !== ex) : ids;
  return [...new Set(filtered)];
}

/**
 * Gửi thông báo đến NV phụ trách + Marketing (trừ người nhập trùng).
 */
export async function notifyDuplicateStakeholders(params: {
  existingCustomer: any;
  normalizedPhone: string;
  actorId: string | null | undefined;
  actorName: string;
  actorPhone?: string | null;
  sourceLabel: string;
  note?: string;
  customerId: string;
}): Promise<void> {
  const { existingCustomer, normalizedPhone, actorId, actorName, actorPhone, sourceLabel, note, customerId } =
    params;
  const targets = getDuplicateNotificationTargets(existingCustomer, actorId ?? null);
  if (targets.length === 0) return;

  const actorPart = `${actorName || '—'}${actorPhone ? ` · SĐT ${actorPhone}` : ''}`;
  const cust = existingCustomer;
  const display = getDuplicateStaffDisplayForClient(existingCustomer);
  const lines: string[] = [
    `${actorPart} đã nhập trùng SĐT ${normalizedPhone} (${sourceLabel}).`,
    cust?.name ? `Khách: ${cust.name} (mã ${cust.code || '—'}).` : `Mã khách: ${cust?.code || customerId}.`,
  ];
  if (display.salesOrCareResponsible) {
    lines.push(
      `NV phụ trách (Sales/CSKH): ${display.salesOrCareResponsible.fullName}${display.salesOrCareResponsible.phone ? ` · ${display.salesOrCareResponsible.phone}` : ''}.`
    );
  }
  if (display.marketingResponsible) {
    lines.push(
      `NV Marketing: ${display.marketingResponsible.fullName}${display.marketingResponsible.phone ? ` · ${display.marketingResponsible.phone}` : ''}.`
    );
  }
  if (note && String(note).trim()) lines.push(`Ghi chú: ${String(note).trim()}`);

  const title = `Trùng số khách hàng (${sourceLabel})`;
  const content = lines.join('\n');
  const link = `/customers/${customerId}`;
  const metadata = { customerId, phone: normalizedPhone, duplicate: true };

  for (const empId of targets) {
    await createUserNotification(empId, title, content, 'DUPLICATE_LEAD', link, metadata);
  }
}
