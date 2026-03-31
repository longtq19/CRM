import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { validateDivisionDataFlow, divisionHasSalesLeafDepartment } from '../services/divisionDataFlowService';
import { getVisibleEmployeeIds, getSubordinateIds } from '../utils/viewScopeHelper';
import {
  userBypassesHrEmployeeScope,
  userHasAnyPermission,
  EMPLOYEE_TYPE_CATALOG_VIEW_PERMISSIONS,
} from '../config/routePermissionPolicy';
import { describeChangesVi } from '../utils/vietnameseAuditDiff';
import { ROLE_CODES, isTechnicalAdminRoleCode } from '../constants/rbac';
import ExcelJS from 'exceljs';
import { logAudit, getAuditUser } from '../utils/auditLog';
import fs from 'fs';
import path from 'path';
import { getRootDir } from '../utils/pathHelper';
import {
  toPublicUploadUrl,
  normalizeUploadUrlForStorage,
  localRelativePathFromUploadUrl,
} from '../config/publicUploadUrl';
import { logPrismaMigrateHintIfSchemaMissing } from '../utils/prismaMigrateHint';
import { getPaginationParams } from '../utils/pagination';
import { getCompanyRootForOrg, getDefaultOrganizationId, getKagriOrganizationId } from '../utils/organizationHelper';
import { HR_EMPLOYEE_SHEET_COLUMNS } from '../constants/hrEmployeeSpreadsheet';
import {
  isAllowedOrgUnitFunction,
  ORG_FUNC_RELAXED_EMPLOYEE_TYPE_MATCH,
} from '../constants/orgUnitFunctions';
import { KAGRI_SEED_DIVISIONS } from '../constants/kagriSeedDivisions';

export { getCompanyRootForOrg, getDefaultOrganizationId };

const COMPANY_CHAT_GROUP_NAME = 'K-VENTURES I OFFICE';
const COMPANY_GROUP_AVATAR = '/uploads/chat/company-logo.png';

/** Chức năng đơn vị lá ↔ mã `employee_types.code` (seed). */
const ORG_FUNC_TO_EMPLOYEE_TYPE_CODE: Record<string, string> = {
  MARKETING: 'marketing',
  SALES: 'sales',
  CSKH: 'customer_service',
};

type StaffDeptValidationResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * Nhân viên chỉ được gán vào đơn vị lá (DEPARTMENT/TEAM, không có con),
 * không gán vào COMPANY/DIVISION; đơn vị lá phải có `function` và loại NV khớp.
 */
export async function validateEmployeeDepartmentForStaffAssignment(params: {
  departmentId: string;
  employeeTypeId: string | null;
  positionId: string | null | undefined;
}): Promise<StaffDeptValidationResult> {
  const { departmentId, employeeTypeId, positionId } = params;
  const dept = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, type: true, function: true },
  });
  if (!dept) {
    return { ok: false, status: 400, message: 'Phòng ban không tồn tại' };
  }
  if (dept.type === 'COMPANY' || dept.type === 'DIVISION') {
    return {
      ok: false,
      status: 400,
      message: 'Không gán nhân viên trực tiếp vào tổ chức gốc hoặc khối. Chọn đơn vị lá (phòng ban/team).',
    };
  }
  const childCount = await prisma.department.count({ where: { parentId: dept.id } });
  /** Nút có con: giữ tương thích dữ liệu cũ, không áp quy tắc lá–chức năng. */
  if (childCount > 0) {
    return { ok: true };
  }
  if (!dept.function) {
    return {
      ok: false,
      status: 400,
      message:
        'Vui lòng gán chức năng đơn vị lá (Marketing, Sales, CSKH hoặc chức năng ghi nhận doanh thu theo data) trước khi gán nhân viên.',
    };
  }
  if (ORG_FUNC_RELAXED_EMPLOYEE_TYPE_MATCH.has(String(dept.function))) {
    if (!employeeTypeId) {
      return {
        ok: false,
        status: 400,
        message: 'Nhân viên cần có loại nhân viên (cập nhật tại Hồ sơ nhân sự).',
      };
    }
  } else {
    const expectedTypeCode = ORG_FUNC_TO_EMPLOYEE_TYPE_CODE[dept.function];
    if (!expectedTypeCode) {
      return { ok: false, status: 400, message: 'Chức năng đơn vị không hợp lệ' };
    }
    if (!employeeTypeId) {
      return {
        ok: false,
        status: 400,
        message: 'Nhân viên cần có loại nhân viên khớp chức năng đơn vị (cập nhật tại Hồ sơ nhân sự).',
      };
    }
    const et = await prisma.employeeType.findUnique({ where: { id: employeeTypeId }, select: { code: true } });
    if (!et || et.code !== expectedTypeCode) {
      return {
        ok: false,
        status: 400,
        message:
          'Loại nhân viên không khớp chức năng đơn vị: Marketing → loại Marketing; Sales → Sales; CSKH → Chăm sóc khách hàng.',
      };
    }
  }
  if (positionId) {
    const pos = await prisma.position.findUnique({
      where: { id: positionId },
      select: { departmentId: true },
    });
    if (!pos) {
      return { ok: false, status: 400, message: 'Chức danh không tồn tại' };
    }
    if (pos.departmentId !== departmentId) {
      return {
        ok: false,
        status: 400,
        message: 'Chức danh phải thuộc đơn vị đích.',
      };
    }
  }
  return { ok: true };
}

const normalizeHumanName = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Ngày sinh hợp lệ và trước hôm nay (so sánh theo lịch). */
function parseEmployeeBirthDate(
  value: unknown
): { ok: true; date: Date } | { ok: false; message: string } {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: false, message: 'Vui lòng nhập ngày sinh' };
  }
  const d = new Date(String(value).trim());
  if (Number.isNaN(d.getTime())) {
    return { ok: false, message: 'Ngày sinh không hợp lệ' };
  }
  const dob = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dob >= today) {
    return { ok: false, message: 'Ngày sinh phải là ngày trong quá khứ (trước hôm nay)' };
  }
  return { ok: true, date: dob };
}

function normalizeEmailForDuplicate(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Các biến thể SĐT VN thường gặp (Excel số / 0 / +84) để so trùng không báo nhầm. */
function vnPhoneSearchVariants(input: unknown): string[] {
  const raw = String(input ?? '').trim();
  if (!raw) return [];
  const digits = raw.replace(/\D/g, '');
  const set = new Set<string>();
  set.add(raw);
  if (digits) set.add(digits);
  let c = digits;
  if (c.startsWith('84') && c.length >= 10) {
    c = '0' + c.slice(2);
  }
  if (c.length === 9 && /^9/.test(c)) {
    c = '0' + c;
  }
  if (c.length >= 9) {
    set.add(c);
    if (c.startsWith('0')) {
      set.add(c.slice(1));
      set.add('84' + c.slice(1));
      set.add('+84' + c.slice(1));
    }
  }
  return [...set].filter((s) => s.length > 0);
}

/**
 * Quy tắc check trùng nhân sự dùng chung:
 * - Trùng SĐT hoặc Email cá nhân (mọi luồng create/update/import)
 * - SĐT so khớp theo nhiều biến thể (0/84/+84) để trùng định dạng Excel.
 * - Có thể bỏ qua chính bản ghi hiện tại khi cập nhật.
 */
async function findDuplicateEmployeeByPhoneOrEmail(params: {
  phone: unknown;
  emailPersonal: unknown;
  excludeEmployeeId?: string | null;
}) {
  const emailPersonal = normalizeEmailForDuplicate(params.emailPersonal);
  const phoneVariants = vnPhoneSearchVariants(params.phone);

  const or: any[] = [];
  for (const pv of phoneVariants) {
    or.push({ phone: pv });
  }
  if (emailPersonal) {
    or.push({
      emailPersonal: {
        equals: emailPersonal,
        mode: 'insensitive' as const,
      },
    });
  }
  if (or.length === 0) return [];

  return prisma.employee.findMany({
    where: {
      ...(params.excludeEmployeeId ? { id: { not: String(params.excludeEmployeeId) } } : {}),
      OR: or,
    },
    select: {
      id: true,
      code: true,
      fullName: true,
      phone: true,
      emailPersonal: true,
      hrDepartmentUnit: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });
}

function toDuplicateDisplay(list: Array<any>) {
  return list.map((e: any) => ({
    id: e.id,
    code: e.code,
    fullName: e.fullName,
    departmentUnit: e.hrDepartmentUnit?.name || '—',
  }));
}

/** Chuỗi FK hoặc null (gỡ gán); `undefined` = không gửi trường đó. */
function normalizeEmployeeFkInput(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function employeeFkEqual(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const na = a == null || String(a).trim() === '' ? null : String(a).trim();
  const nb = b == null || String(b).trim() === '' ? null : String(b).trim();
  return na === nb;
}

const isSystemAdminEmployee = (employee: { code?: string | null; fullName?: string | null } | null | undefined) => {
  if (!employee) return false;
  const code = String(employee.code ?? '').toUpperCase().trim();
  if (code === 'SUPERADMIN') return true;
  const name = normalizeHumanName(employee.fullName);
  return name === 'admin system' || name === 'super admin' || name === 'quan tri vien he thong';
};

async function resolveOrganizationIdFromRequest(req: Request): Promise<string> {
  const raw = req.query.organizationId ?? (req.body as any)?.organizationId;
  if (raw && String(raw).trim()) {
    const org = await prisma.organization.findUnique({ where: { id: String(raw) } });
    if (org) return org.id;
  }
  const fallback = await getDefaultOrganizationId();
  if (!fallback) throw new Error('NO_ORGANIZATION');
  return fallback;
}

/**
 * Đảm bảo tổ chức KAGRI, nút gốc COMPANY và các khối seed; gắn khối mồ côi vào gốc.
 * Trả về department COMPANY (cấp 0) để tương thích code cũ gọi ensureOrgRootCompany.
 */
export async function ensureOrgRootCompany(): Promise<{ id: string; name: string } | null> {
  try {
    const { company } = await ensureKagriOrganizationAndTree();
    return company ? { id: company.id, name: company.name } : null;
  } catch (e) {
    console.error('ensureOrgRootCompany error:', e);
    logPrismaMigrateHintIfSchemaMissing(e);
    return null;
  }
}

/** Danh mục bộ phận (HR) + gán mặc định cho nhân viên chưa có. */
export async function ensureHrDepartmentUnits(): Promise<void> {
  try {
    let unit = await prisma.hrDepartmentUnit.findFirst({ where: { code: 'CHUNG' } });
    if (!unit) {
      unit = await prisma.hrDepartmentUnit.create({
        data: { code: 'CHUNG', name: 'Chung', sortOrder: 0 },
      });
    }
  } catch (e) {
    console.error('ensureHrDepartmentUnits error:', e);
    logPrismaMigrateHintIfSchemaMissing(e);
  }
}

/** Loại hợp đồng (`employment_types`) — `code` cố định cho API/import; `name` tiếng Việt cho FE. */
const DEFAULT_EMPLOYMENT_TYPES_SEED: {
  code: string;
  name: string;
  description?: string;
  sortOrder: number;
}[] = [
  { code: 'official', name: 'Hợp đồng chính thức', description: 'Làm việc chính thức', sortOrder: 10 },
  { code: 'probation', name: 'Hợp đồng thử việc', description: 'Thử việc có thời hạn', sortOrder: 20 },
  { code: 'intern', name: 'Thực tập sinh', sortOrder: 30 },
  { code: 'collaborator', name: 'Cộng tác viên', sortOrder: 40 },
  { code: 'part_time', name: 'Làm việc bán thời gian', sortOrder: 50 },
  { code: 'fixed_term', name: 'Hợp đồng xác định thời hạn', sortOrder: 60 },
  { code: 'seasonal', name: 'Lao động theo mùa vụ', sortOrder: 70 },
];

/** Upsert danh mục loại hợp đồng (gọi khi khởi động backend). */
export async function ensureEmploymentTypes(): Promise<void> {
  try {
    for (const row of DEFAULT_EMPLOYMENT_TYPES_SEED) {
      await prisma.employmentType.upsert({
        where: { code: row.code },
        update: {
          name: row.name,
          description: row.description ?? null,
          sortOrder: row.sortOrder,
          isActive: true,
        },
        create: {
          code: row.code,
          name: row.name,
          description: row.description ?? null,
          sortOrder: row.sortOrder,
        },
      });
    }
  } catch (e) {
    console.error('ensureEmploymentTypes error:', e);
    logPrismaMigrateHintIfSchemaMissing(e);
  }
}

/** Dùng cho script bảo trì / khôi phục cây tổ chức KAGRI (không gọi từ FE). */
export async function ensureKagriOrganizationAndTree(): Promise<{
  org: { id: string; code: string; name: string };
  company: { id: string; name: string };
}> {
  let org = await prisma.organization.findFirst({ where: { code: 'KAGRI' }, orderBy: { createdAt: 'asc' } });
  if (!org) {
    org = await prisma.organization.create({ data: { code: 'KAGRI', name: 'KAGRI', sortOrder: 0 } });
  }

  let company = await prisma.department.findFirst({
    where: { organizationId: org.id, type: 'COMPANY' },
    orderBy: { createdAt: 'asc' },
  });
  if (!company) {
    company = await prisma.department.create({
      data: {
        organizationId: org.id,
        name: 'KAGRI',
        code: 'KAGRI_ROOT',
        type: 'COMPANY',
        displayOrder: 0,
      },
    });
  }

  await prisma.department.updateMany({
    where: {
      organizationId: org.id,
      type: 'DIVISION',
      parentId: null,
      id: { not: company.id },
    },
    data: { parentId: company.id },
  });

  for (let i = 0; i < KAGRI_SEED_DIVISIONS.length; i++) {
    const spec = KAGRI_SEED_DIVISIONS[i]!;
    const row = await prisma.department.findFirst({
      where: { organizationId: org.id, code: spec.code },
    });
    if (!row) {
      await prisma.department.create({
        data: {
          organizationId: org.id,
          parentId: company.id,
          type: 'DIVISION',
          name: spec.name,
          code: spec.code,
          displayOrder: i,
        },
      });
    } else if (row.type === 'DIVISION') {
      await prisma.department.update({
        where: { id: row.id },
        data: {
          name: spec.name,
          displayOrder: i,
          parentId: company.id,
        },
      });
    }
  }

  return { org, company };
}

function computeDivisionIdForDepartment(
  deptId: string,
  byId: Map<string, { id: string; parentId: string | null; type: string }>
): string | null {
  let cur = byId.get(deptId);
  for (let i = 0; i < 200 && cur; i++) {
    if (cur.type === 'DIVISION') return cur.id;
    if (!cur.parentId) return null;
    cur = byId.get(cur.parentId);
  }
  return null;
}

type DeptMgrNode = { id: string; parentId: string | null; managerId: string | null; type: string };

/** Quản lý trực tiếp theo nghiệp vụ: đi lên cây đơn vị, bản ghi đầu tiên có managerId. */
function directManagerIdForDepartment(deptId: string, byId: Map<string, DeptMgrNode>): string | null {
  let curId: string | null = deptId;
  for (let i = 0; i < 200 && curId; i++) {
    const node = byId.get(curId);
    if (!node) return null;
    if (node.managerId) return node.managerId;
    curId = node.parentId;
  }
  return null;
}

export const ensureCompanyChatGroupForEmployee = async (employeeId: string) => {
  let group = await prisma.chatGroup.findFirst({
    where: { 
      OR: [
        { name: COMPANY_CHAT_GROUP_NAME },
        { name: 'Công ty Kagri Tech' }
      ]
    }
  });

  if (!group) {
    group = await prisma.chatGroup.create({
      data: {
        name: COMPANY_CHAT_GROUP_NAME,
        type: 'GROUP',
        avatarUrl: COMPANY_GROUP_AVATAR
      }
    });
  }

  await prisma.chatMember.upsert({
    where: {
      groupId_employeeId: {
        groupId: group.id,
        employeeId
      }
    },
    update: {},
    create: {
      groupId: group.id,
      employeeId,
      role: 'MEMBER'
    }
  });

  // Trưởng nhóm mặc định: chỉ quản trị hệ thống (system_administrator / legacy ADM).
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { roleGroup: { select: { code: true } } },
  });
  const roleCode = employee?.roleGroup?.code ?? null;
  if (isTechnicalAdminRoleCode(roleCode)) {
    await prisma.chatMember.update({
      where: {
        groupId_employeeId: {
          groupId: group.id,
          employeeId,
        },
      },
      data: { role: 'OWNER' },
    });
  }
};

/** Đồng bộ nhóm công ty: tất cả nhân sự là thành viên; chỉ quản trị hệ thống là trưởng nhóm mặc định. */
export const syncCompanyChatGroupMembers = async () => {
  let group = await prisma.chatGroup.findFirst({
    where: {
      OR: [{ name: COMPANY_CHAT_GROUP_NAME }, { name: 'Công ty Kagri Tech' }],
    },
    select: { id: true },
  });

  if (!group) {
    group = await prisma.chatGroup.create({
      data: { name: COMPANY_CHAT_GROUP_NAME, type: 'GROUP', avatarUrl: COMPANY_GROUP_AVATAR },
      select: { id: true },
    });
  }

  const allEmployees = await prisma.employee.findMany({
    select: { id: true, roleGroup: { select: { code: true } } },
  });
  if (!allEmployees.length) return;

  const memberRows = allEmployees.map((e) => ({
    groupId: group.id,
    employeeId: e.id,
    role: 'MEMBER' as const,
  }));
  await prisma.chatMember.createMany({
    data: memberRows,
    skipDuplicates: true,
  });

  const ownerIds = allEmployees
    .filter((e) => isTechnicalAdminRoleCode(e.roleGroup?.code))
    .map((e) => e.id);

  if (ownerIds.length) {
    await prisma.chatMember.updateMany({
      where: { groupId: group.id, employeeId: { in: ownerIds } },
      data: { role: 'OWNER' },
    });
  }

  // Đảm bảo chỉ nhóm quản trị hệ thống giữ vai trò trưởng nhóm (không theo mã CRM cứng).
  await prisma.chatMember.updateMany({
    where: {
      groupId: group.id,
      role: { in: ['OWNER', 'ADMIN', 'CO_OWNER'] },
      ...(ownerIds.length ? { employeeId: { notIn: ownerIds } } : {}),
    },
    data: { role: 'MEMBER' },
  });
};

// Helper to process subsidiary inputs (IDs or Names)
const processSubsidiaries = async (inputs: any[]) => {
  if (!inputs || !Array.isArray(inputs)) return undefined;
  
  const connect: { id: string }[] = [];
  const create: { name: string; code: string }[] = [];

  for (const input of inputs) {
    const val = typeof input === 'string' ? input : input.value || input.id || input.name;
    if (!val) continue;

    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(val);
    
    if (isUuid) {
        // Check if it exists to be safe, or just connect
        const exists = await prisma.subsidiary.findUnique({ where: { id: val } });
        if (exists) {
            connect.push({ id: val });
        }
    } else {
        const existing = await prisma.subsidiary.findFirst({ 
            where: { name: { equals: val, mode: 'insensitive' } } 
        });
        
        if (existing) {
            connect.push({ id: existing.id });
        } else {
            // Generate 3-char code
            let code = val.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
            if (code.length < 3) code = code.padEnd(3, 'X');
            
            // Ensure uniqueness
            let suffixIndex = 0;
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let finalCode = code;
            
            while (await prisma.subsidiary.findUnique({ where: { code: finalCode } })) {
                 if (suffixIndex >= chars.length) break; // Should unlikely happen
                 finalCode = code.slice(0, 2) + chars[suffixIndex];
                 suffixIndex++;
            }
            
            create.push({ name: val, code: finalCode });
        }
    }
  }
  
  if (connect.length === 0 && create.length === 0) return undefined;
  return { connect, create };
};

// --- Master Data Controllers ---

export const getPositions = async (req: Request, res: Response) => {
  try {
    const { departmentId } = req.query;
    const where: any = {};
    
    if (departmentId) {
      where.departmentId = String(departmentId);
    }

    const data = await prisma.position.findMany({ 
      where,
      include: { department: true } 
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách chức vụ' });
  }
};

export const getDepartments = async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveOrganizationIdFromRequest(req);
    const data = await prisma.department.findMany({
      where: { organizationId, type: { in: ['DEPARTMENT', 'TEAM'] } },
      include: {
        parent: true,
        children: {
            include: {
                manager: {
                    select: { 
                        id: true, 
                        fullName: true, 
                        code: true, 
                        positionId: true,
                        position: {
                            select: { name: true }
                        }
                    }
                },
                _count: { select: { employees: true, positions: true } }
            }
        },
        manager: {
          select: { 
            id: true, 
            fullName: true, 
            code: true, 
            positionId: true,
            position: {
                select: { name: true }
            }
          }
        },
        targetSalesUnit: { select: { id: true, name: true, code: true, type: true, function: true } },
        targetCsUnit: { select: { id: true, name: true, code: true, type: true, function: true } }
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }]
    });
    const flat = await prisma.department.findMany({
      where: { organizationId },
      select: { id: true, parentId: true, type: true },
    });
    const byId = new Map(flat.map((d) => [d.id, d]));
    const enriched = data.map((row: any) => ({
      ...row,
      divisionId:
        row.type === 'DIVISION'
          ? row.id
          : computeDivisionIdForDepartment(row.id, byId as Map<string, { id: string; parentId: string | null; type: string }>),
    }));
    res.json(enriched);
  } catch (error: any) {
    if (error?.message === 'NO_ORGANIZATION') {
      return res.status(503).json({ message: 'Chưa có tổ chức nào trong hệ thống' });
    }
    res.status(500).json({ message: 'Lỗi khi lấy danh sách phòng ban' });
  }
};

export const getDivisions = async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveOrganizationIdFromRequest(req);
    const data = await prisma.department.findMany({
      where: { organizationId, type: 'DIVISION' },
      orderBy: { displayOrder: 'asc' },
      include: {
        targetSalesUnit: { select: { id: true, name: true } },
        targetCsUnit: { select: { id: true, name: true } },
        externalCsDivision: { select: { id: true, name: true } },
        externalSalesDivision: { select: { id: true, name: true } },
        manager: {
            select: {
                id: true,
                fullName: true,
                code: true,
                position: {
                    select: { name: true }
                }
            }
        }
      }
    });
    res.json(data);
  } catch (error: any) {
    if (error?.message === 'NO_ORGANIZATION') {
      return res.status(503).json({ message: 'Chưa có tổ chức nào trong hệ thống' });
    }
    res.status(500).json({ message: 'Lỗi khi lấy danh sách khối' });
  }
};

function slugOrganizationCode(name: string): string {
  const s = String(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const raw = s.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'ORG';
  return raw.slice(0, 24);
}

async function deleteDepartmentTreeForOrganization(organizationId: string) {
  const all = await prisma.department.findMany({
    where: { organizationId },
    select: { id: true, parentId: true },
  });
  const childrenByParent = new Map<string, string[]>();
  for (const row of all) {
    const key = row.parentId === null ? '__ROOT__' : row.parentId;
    if (!childrenByParent.has(key)) childrenByParent.set(key, []);
    childrenByParent.get(key)!.push(row.id);
  }
  const ordered: string[] = [];
  const walk = (nodeId: string) => {
    const kids = childrenByParent.get(nodeId) || [];
    for (const k of kids) walk(k);
    ordered.push(nodeId);
  };
  for (const rid of childrenByParent.get('__ROOT__') || []) walk(rid);
  for (const deptId of ordered) {
    await prisma.position.deleteMany({ where: { departmentId: deptId } });
    await prisma.department.delete({ where: { id: deptId } });
  }
}

export const getOrganizations = async (req: Request, res: Response) => {
  try {
    const list = await prisma.organization.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const enriched = await Promise.all(
      list.map(async (o) => {
        const root = await prisma.department.findFirst({
          where: { organizationId: o.id, type: 'COMPANY' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        return { ...o, rootDepartmentId: root?.id ?? null };
      })
    );
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách tổ chức' });
  }
};

export const createOrganization = async (req: Request, res: Response) => {
  try {
    const { name, code } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Vui lòng nhập tên tổ chức' });
    }
    const trimmedName = String(name).trim();
    let finalCode = code ? String(code).toUpperCase().trim().replace(/\s+/g, '_') : slugOrganizationCode(trimmedName);
    if (!/^[A-Z0-9_]{2,32}$/.test(finalCode)) {
      return res.status(400).json({ message: 'Mã tổ chức: 2–32 ký tự A-Z, số hoặc gạch dưới' });
    }
    const dup = await prisma.organization.findUnique({ where: { code: finalCode } });
    if (dup) {
      return res.status(400).json({ message: 'Mã tổ chức đã tồn tại' });
    }
    const maxOrder = await prisma.organization.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;
    const org = await prisma.organization.create({
      data: { code: finalCode, name: trimmedName, sortOrder },
    });
    await getCompanyRootForOrg(org.id);
    res.status(201).json(org);
  } catch (error) {
    console.error('createOrganization error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo tổ chức' });
  }
};

export const updateOrganization = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, sortOrder } = req.body;
    const existing = await prisma.organization.findUnique({ where: { id: String(id) } });
    if (!existing) return res.status(404).json({ message: 'Không tìm thấy tổ chức' });
    const data: { name?: string; code?: string; sortOrder?: number } = {};
    if (name !== undefined && String(name).trim()) data.name = String(name).trim();
    if (code !== undefined && String(code).trim()) {
      const c = String(code).toUpperCase().trim().replace(/\s+/g, '_');
      if (!/^[A-Z0-9_]{2,32}$/.test(c)) {
        return res.status(400).json({ message: 'Mã tổ chức không hợp lệ' });
      }
      const dup = await prisma.organization.findFirst({
        where: { code: c, id: { not: String(id) } },
      });
      if (dup) return res.status(400).json({ message: 'Mã tổ chức đã được dùng' });
      data.code = c;
    }
    if (sortOrder !== undefined && Number.isFinite(Number(sortOrder))) {
      data.sortOrder = Number(sortOrder);
    }
    const updated = await prisma.organization.update({
      where: { id: String(id) },
      data,
    });
    res.json(updated);
  } catch (error) {
    console.error('updateOrganization error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật tổ chức' });
  }
};

export const deleteOrganization = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const org = await prisma.organization.findUnique({ where: { id: String(id) } });
    if (!org) return res.status(404).json({ message: 'Không tìm thấy tổ chức' });
    if (org.code === 'KAGRI') {
      return res.status(400).json({ message: 'Không được xóa tổ chức mặc định KAGRI' });
    }
    const deptIds = await prisma.department.findMany({
      where: { organizationId: org.id },
      select: { id: true },
    });
    const ids = deptIds.map((d) => d.id);
    if (ids.length > 0) {
      const empCount = await prisma.employee.count({ where: { departmentId: { in: ids } } });
      if (empCount > 0) {
        return res.status(400).json({
          message: 'Không xóa được: còn nhân viên thuộc đơn vị trong tổ chức này',
        });
      }
      await deleteDepartmentTreeForOrganization(org.id);
    }
    await prisma.organization.delete({ where: { id: org.id } });
    res.json({ message: 'Đã xóa tổ chức' });
  } catch (error) {
    console.error('deleteOrganization error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa tổ chức' });
  }
};

export const updateDivision = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const oldDivision = await prisma.department.findUnique({ where: { id: String(id), type: 'DIVISION' } });
    const { name, managerId, targetSalesUnitId, targetCsUnitId } = req.body;
    
    const updateData: any = { function: null };
    if (name) updateData.name = name.toUpperCase().trim();
    if (managerId !== undefined) {
      if (managerId) {
        const managerExists = await prisma.employee.findUnique({ where: { id: managerId }, select: { id: true } });
        if (!managerExists) return res.status(400).json({ message: 'Quản lý không tồn tại trong hệ thống' });
      }
      updateData.managerId = managerId || null;
    }
    if (targetSalesUnitId !== undefined) updateData.targetSalesUnitId = targetSalesUnitId || null;
    if (targetCsUnitId !== undefined) updateData.targetCsUnitId = targetCsUnitId || null;

    const updated = await prisma.department.update({
      where: { id: String(id) },
      data: updateData
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'DIVISION',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: oldDivision,
      newValues: updated,
      details: `Updated division ${updated.name}`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Update division error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật khối' });
  }
};

/** Tỉ lệ phân luồng Marketing→Sales / Sales→CSKH / CSKH-only trong khối + khối CS ngoài. */
export const updateDivisionDataFlow = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const div = await prisma.department.findFirst({
      where: { id: String(id), type: 'DIVISION' },
      select: {
        id: true,
        organizationId: true,
        dataFlowShares: true,
        externalCsDivisionId: true,
        externalSalesDivisionId: true,
      },
    });
    if (!div) return res.status(404).json({ message: 'Không tìm thấy khối' });

    if (
      body.dataFlowShares === undefined &&
      body.externalCsDivisionId === undefined &&
      body.externalSalesDivisionId === undefined
    ) {
      return res.status(400).json({
        message: 'Gửi dataFlowShares và/hoặc externalCsDivisionId và/hoặc externalSalesDivisionId',
      });
    }

    const flat = await prisma.department.findMany({
      where: { organizationId: div.organizationId },
      select: { id: true, parentId: true, type: true, function: true },
    });
    const byId = new Map(flat.map((d) => [d.id, d]));
    const computeDivisionId = (deptId: string) => computeDivisionIdForDepartment(deptId, byId);

    const nextShares =
      body.dataFlowShares !== undefined
        ? body.dataFlowShares && typeof body.dataFlowShares === 'object'
          ? body.dataFlowShares
          : {}
        : ((div.dataFlowShares as object) ?? {});

    if (body.dataFlowShares !== undefined && nextShares && typeof nextShares === 'object') {
      if (!divisionHasSalesLeafDepartment(div.id, flat, computeDivisionId)) {
        delete (nextShares as Record<string, unknown>).externalMarketingToSalesPct;
      }
    }

    let nextExt: string | null;
    if (body.externalCsDivisionId !== undefined) {
      nextExt = body.externalCsDivisionId ? String(body.externalCsDivisionId) : null;
      if (nextExt) {
        const target = await prisma.department.findFirst({
          where: { id: nextExt, organizationId: div.organizationId, type: 'DIVISION' },
          select: { id: true },
        });
        if (!target) {
          return res.status(400).json({
            message: 'Khối đích luồng CS ngoài không hợp lệ hoặc không cùng tổ chức',
          });
        }
      }
    } else {
      nextExt = div.externalCsDivisionId;
    }

    let nextExtSales: string | null;
    if (body.externalSalesDivisionId !== undefined) {
      nextExtSales = body.externalSalesDivisionId ? String(body.externalSalesDivisionId) : null;
      if (nextExtSales) {
        const target = await prisma.department.findFirst({
          where: { id: nextExtSales, organizationId: div.organizationId, type: 'DIVISION' },
          select: { id: true },
        });
        if (!target) {
          return res.status(400).json({
            message: 'Khối Sales ngoài không hợp lệ hoặc không cùng tổ chức',
          });
        }
      }
    } else {
      nextExtSales = div.externalSalesDivisionId;
    }

    const val = validateDivisionDataFlow({
      divisionId: div.id,
      organizationId: div.organizationId,
      shares: nextShares as any,
      externalCsDivisionId: nextExt,
      externalSalesDivisionId: nextExtSales,
      departments: flat,
      computeDivisionId,
    });
    if (!val.ok) return res.status(400).json({ message: val.message });

    const updateData: any = {};
    if (body.dataFlowShares !== undefined) updateData.dataFlowShares = nextShares;
    if (body.externalCsDivisionId !== undefined) updateData.externalCsDivisionId = nextExt;
    if (body.externalSalesDivisionId !== undefined) updateData.externalSalesDivisionId = nextExtSales;

    const updated = await prisma.department.update({
      where: { id: div.id },
      data: updateData,
      include: {
        externalCsDivision: { select: { id: true, name: true } },
        externalSalesDivision: { select: { id: true, name: true } },
        manager: {
          select: {
            id: true,
            fullName: true,
            code: true,
            position: { select: { name: true } },
          },
        },
        targetSalesUnit: { select: { id: true, name: true } },
        targetCsUnit: { select: { id: true, name: true } },
      },
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'DIVISION',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: {
        dataFlowShares: div.dataFlowShares,
        externalCsDivisionId: div.externalCsDivisionId,
        externalSalesDivisionId: div.externalSalesDivisionId,
      },
      newValues: {
        dataFlowShares: updated.dataFlowShares,
        externalCsDivisionId: updated.externalCsDivisionId,
        externalSalesDivisionId: updated.externalSalesDivisionId,
      },
      details: `Cập nhật luồng phân data khối ${updated.name}`,
      req,
    });

    res.json(updated);
  } catch (error) {
    console.error('updateDivisionDataFlow error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật luồng phân data khối' });
  }
};

export const updateDivisionOrder = async (req: Request, res: Response) => {
  try {
    const { items } = req.body; // Array of { id, displayOrder }
    if (!Array.isArray(items)) {
      return res.status(400).json({ message: 'Dữ liệu không hợp lệ' });
    }

    await prisma.$transaction(
      items.map((item: any) => 
        prisma.department.update({
          where: { id: item.id },
          data: { displayOrder: item.displayOrder }
        })
      )
    );

    res.json({ message: 'Cập nhật thứ tự thành công' });
  } catch (error) {
    console.error('Update division order error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật thứ tự khối' });
  }
};

export const getRoleGroups = async (req: Request, res: Response) => {
  try {
    const data = await prisma.roleGroup.findMany({
      orderBy: { sortOrder: 'asc' }
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nhóm quyền' });
  }
};

/** Danh mục bộ phận (HR — lọc/hiển thị, không dùng vận hành). */
export const getHrDepartmentUnits = async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.hrDepartmentUnit.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        manager: { select: { id: true, fullName: true, code: true } },
      },
    });
    res.json(rows);
  } catch (error) {
    console.error('getHrDepartmentUnits', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách bộ phận' });
  }
};

export const createHrDepartmentUnit = async (req: Request, res: Response) => {
  try {
    const { name, code, managerId, sortOrder: sortOrderBody } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Tên bộ phận không được để trống' });
    }
    const trimmed = name.trim();
    let c =
      code && String(code).trim()
        ? String(code).trim().toUpperCase().slice(0, 32)
        : slugCode(trimmed).slice(0, 20) || 'BP';
    const dup = await prisma.hrDepartmentUnit.findFirst({
      where: {
        OR: [{ code: c }, { name: { equals: trimmed, mode: 'insensitive' } }],
      },
    });
    if (dup) {
      return res.status(400).json({ message: 'Bộ phận đã tồn tại (mã hoặc tên trùng)' });
    }
    let resolvedManagerId: string | null = null;
    if (managerId !== undefined && managerId !== null && String(managerId).trim() !== '') {
      const mgr = await prisma.employee.findUnique({ where: { id: String(managerId).trim() } });
      if (!mgr) {
        return res.status(400).json({ message: 'Không tìm thấy nhân viên quản lý bộ phận' });
      }
      resolvedManagerId = mgr.id;
    }

    let sortOrderValue: number;
    if (sortOrderBody !== undefined && sortOrderBody !== null && String(sortOrderBody).trim() !== '') {
      const n = parseInt(String(sortOrderBody), 10);
      if (Number.isNaN(n)) {
        return res.status(400).json({ message: 'Thứ tự không hợp lệ' });
      }
      sortOrderValue = n;
    } else {
      const agg = await prisma.hrDepartmentUnit.aggregate({ _max: { sortOrder: true } });
      sortOrderValue = (agg._max.sortOrder ?? 0) + 1;
    }

    const row = await prisma.hrDepartmentUnit.create({
      data: { name: trimmed, code: c, managerId: resolvedManagerId, sortOrder: sortOrderValue },
      include: { manager: { select: { id: true, fullName: true, code: true } } },
    });
    res.status(201).json(row);
  } catch (error) {
    console.error('createHrDepartmentUnit', error);
    res.status(500).json({ message: 'Lỗi khi tạo bộ phận' });
  }
};

export const updateHrDepartmentUnit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code, sortOrder, managerId } = req.body;
    const row = await prisma.hrDepartmentUnit.findUnique({ where: { id: String(id) } });
    if (!row) {
      return res.status(404).json({ message: 'Không tìm thấy bộ phận' });
    }

    const data: { name?: string; code?: string; sortOrder?: number; managerId?: string | null } = {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return res.status(400).json({ message: 'Tên bộ phận không được để trống' });
      }
      const dupName = await prisma.hrDepartmentUnit.findFirst({
        where: { name: { equals: trimmed, mode: 'insensitive' }, id: { not: String(id) } },
      });
      if (dupName) {
        return res.status(400).json({ message: 'Tên bộ phận đã tồn tại' });
      }
      data.name = trimmed;
    }

    if (code !== undefined && String(code).trim()) {
      const c = String(code).trim().toUpperCase().slice(0, 32);
      if (String(row.code).toUpperCase() === 'CHUNG' && c !== row.code) {
        return res.status(400).json({ message: 'Không thể đổi mã bộ phận mặc định (Chung)' });
      }
      if (c !== row.code) {
        const dup = await prisma.hrDepartmentUnit.findFirst({
          where: { code: c, id: { not: String(id) } },
        });
        if (dup) {
          return res.status(400).json({ message: 'Mã bộ phận đã tồn tại' });
        }
        data.code = c;
      }
    }

    if (sortOrder !== undefined && sortOrder !== null && sortOrder !== '') {
      const n = parseInt(String(sortOrder), 10);
      if (Number.isNaN(n)) {
        return res.status(400).json({ message: 'Thứ tự không hợp lệ' });
      }
      data.sortOrder = n;
    }

    if (managerId !== undefined) {
      if (managerId === null || managerId === '') {
        data.managerId = null;
      } else {
        const mgr = await prisma.employee.findUnique({ where: { id: String(managerId).trim() } });
        if (!mgr) {
          return res.status(400).json({ message: 'Không tìm thấy nhân viên quản lý bộ phận' });
        }
        data.managerId = mgr.id;
      }
    }

    if (Object.keys(data).length === 0) {
      const withMgr = await prisma.hrDepartmentUnit.findUnique({
        where: { id: String(id) },
        include: { manager: { select: { id: true, fullName: true, code: true } } },
      });
      return res.json(withMgr ?? row);
    }

    const updated = await prisma.hrDepartmentUnit.update({
      where: { id: String(id) },
      data,
      include: { manager: { select: { id: true, fullName: true, code: true } } },
    });
    res.json(updated);
  } catch (error) {
    console.error('updateHrDepartmentUnit', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật bộ phận' });
  }
};

export const deleteHrDepartmentUnit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const row = await prisma.hrDepartmentUnit.findUnique({
      where: { id: String(id) },
      include: { _count: { select: { employees: true } } },
    });
    if (!row) {
      return res.status(404).json({ message: 'Không tìm thấy bộ phận' });
    }
    if (String(row.code).toUpperCase() === 'CHUNG') {
      return res.status(400).json({ message: 'Không thể xóa bộ phận mặc định (Chung)' });
    }
    if (row._count.employees > 0) {
      return res.status(400).json({ message: 'Không thể xóa bộ phận đang có nhân viên' });
    }
    await prisma.hrDepartmentUnit.delete({ where: { id: String(id) } });
    res.json({ message: 'Đã xóa bộ phận' });
  } catch (error) {
    console.error('deleteHrDepartmentUnit', error);
    res.status(500).json({ message: 'Lỗi khi xóa bộ phận' });
  }
};

export const getSubsidiaries = async (req: Request, res: Response) => {
  try {
    const data = await prisma.subsidiary.findMany();
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách chi nhánh' });
  }
};

export const getBanks = async (req: Request, res: Response) => {
  try {
    const data = await prisma.bank.findMany({ orderBy: { name: 'asc' } });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách ngân hàng' });
  }
};

export const getEmploymentTypes = async (req: Request, res: Response) => {
  try {
    const data = await prisma.employmentType.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách loại hình nhân sự' });
  }
};

export const getEmployeeStatuses = async (req: Request, res: Response) => {
  try {
    const data = await prisma.employeeStatus.findMany({ orderBy: { sortOrder: 'asc' } });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách trạng thái nhân viên' });
  }
};

const EMPLOYEE_TYPE_AUDIT_LABELS: Record<string, string> = {
  name: 'Tên loại',
  description: 'Mô tả',
  sortOrder: 'Thứ tự',
  isActive: 'Đang dùng',
};

/** Danh mục loại nhân viên — mặc định chỉ bản ghi đang hoạt động; `includeInactive=1` cần quyền xem danh mục. */
export const getEmployeeTypes = async (req: Request, res: Response) => {
  try {
    const includeInactive =
      String(req.query.includeInactive || '') === '1' ||
      String(req.query.includeInactive || '').toLowerCase() === 'true';
    const user = (req as any).user;
    const perms = (user?.permissions || []) as string[];

    if (includeInactive) {
      const canSeeFull = userHasAnyPermission(perms, [
        ...EMPLOYEE_TYPE_CATALOG_VIEW_PERMISSIONS,
        'FULL_ACCESS',
      ]);
      if (!canSeeFull) {
        return res.status(403).json({
          message: 'Không có quyền xem đầy đủ danh mục loại nhân viên (cần quyền xem hoặc quản lý danh mục).',
        });
      }
    }

    const data = await prisma.employeeType.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy danh sách loại nhân viên' });
  }
};

/** Tạo loại nhân viên mới (khi FE nhập không có trong danh sách) */
function slugCode(name: string): string {
  const s = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return s.replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') || 'OTHER';
}

export const createEmployeeType = async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Tên loại nhân viên không được để trống' });
    }
    const trimmedName = name.trim();
    let code = slugCode(trimmedName).slice(0, 20);
    if (!code) code = 'OTHER';
    let existing = await prisma.employeeType.findFirst({ where: { code } });
    let suffix = 0;
    while (existing) {
      suffix++;
      code = `${slugCode(trimmedName).slice(0, 16)}_${suffix}`;
      existing = await prisma.employeeType.findFirst({ where: { code } });
    }
    const maxOrder = await prisma.employeeType.aggregate({ _max: { sortOrder: true } });
    const sortOrder = (maxOrder._max.sortOrder ?? 0) + 1;
    const created = await prisma.employeeType.create({
      data: { code, name: trimmedName, description: description || null, sortOrder },
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'EMPLOYEE_TYPE',
      objectId: created.id,
      result: 'SUCCESS',
      newValues: created,
      details: `Tạo loại nhân viên «${created.name}» (mã ${created.code})`,
      req,
    });

    res.status(201).json(created);
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi tạo loại nhân viên' });
  }
};

export const updateEmployeeType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, sortOrder, isActive } = req.body;

    const old = await prisma.employeeType.findUnique({ where: { id: String(id) } });
    if (!old) {
      return res.status(404).json({ message: 'Không tìm thấy loại nhân viên' });
    }

    const data: { name?: string; description?: string | null; sortOrder?: number; isActive?: boolean } = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ message: 'Tên loại nhân viên không được để trống' });
      }
      data.name = name.trim();
    }
    if (description !== undefined) {
      data.description = description === null || description === '' ? null : String(description);
    }
    if (sortOrder !== undefined) {
      const n = Number(sortOrder);
      if (!Number.isFinite(n)) {
        return res.status(400).json({ message: 'Thứ tự không hợp lệ' });
      }
      data.sortOrder = Math.round(n);
    }
    if (isActive !== undefined) {
      data.isActive = Boolean(isActive);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: 'Không có dữ liệu cập nhật' });
    }

    const updated = await prisma.employeeType.update({
      where: { id: String(id) },
      data,
    });

    const before = {
      name: old.name,
      description: old.description,
      sortOrder: old.sortOrder,
      isActive: old.isActive,
    };
    const after = {
      name: updated.name,
      description: updated.description,
      sortOrder: updated.sortOrder,
      isActive: updated.isActive,
    };
    const details =
      describeChangesVi(before, after, EMPLOYEE_TYPE_AUDIT_LABELS) ||
      `Cập nhật loại nhân viên «${updated.name}» (mã ${updated.code})`;

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'EMPLOYEE_TYPE',
      objectId: updated.id,
      result: 'SUCCESS',
      oldValues: old,
      newValues: updated,
      details,
      req,
    });

    res.json(updated);
  } catch (error) {
    console.error('updateEmployeeType error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật loại nhân viên' });
  }
};

export const deleteEmployeeType = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const existing = await prisma.employeeType.findUnique({ where: { id: String(id) } });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy loại nhân viên' });
    }
    const empCount = await prisma.employee.count({ where: { employeeTypeId: String(id) } });
    if (empCount > 0) {
      return res.status(400).json({
        message: `Không thể xóa: còn ${empCount} nhân viên đang dùng loại này. Có thể tắt «Đang dùng» thay vì xóa.`,
      });
    }

    await prisma.employeeType.delete({ where: { id: String(id) } });

    await logAudit({
      ...getAuditUser(req),
      action: 'DELETE',
      object: 'EMPLOYEE_TYPE',
      objectId: existing.id,
      result: 'SUCCESS',
      oldValues: existing,
      details: `Xóa loại nhân viên «${existing.name}» (mã ${existing.code})`,
      req,
    });

    res.json({ message: 'Đã xóa loại nhân viên' });
  } catch (error) {
    console.error('deleteEmployeeType error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa loại nhân viên' });
  }
};

// --- Employee Controllers ---

function sanitizeEmployeeForHr(emp: Record<string, any>) {
  if (!emp || typeof emp !== 'object') return emp;
  const { department, manager, division, ...rest } = emp;
  if (rest.position && typeof rest.position === 'object') {
    rest.position = {
      id: rest.position.id,
      name: rest.position.name,
      code: rest.position.code,
    };
  }
  return rest;
}

/** Loại HĐ thử việc — đồng bộ kỳ thử việc từ ngày hiệu lực / hết hạn hợp đồng. */
function employmentTypeImpliesProbation(code: string | null | undefined): boolean {
  const c = (code || '').toLowerCase();
  return (
    c === 'probation' ||
    c === 'thu_viec' ||
    c.includes('probation') ||
    c.includes('thu_viec')
  );
}

function parseOptionalContractDate(value: unknown): Date | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Prisma P2022 khi PostgreSQL chưa có cột (chưa chạy migrate) — dùng select dự phòng. */
function isEmployeeTableMissingOptionalColumnP2022(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; meta?: { column?: string } };
  if (e.code !== 'P2022') return false;
  const col = String(e.meta?.column || '');
  return (
    col === 'employees.is_locked' ||
    col === 'employees.session_invalidated_at' ||
    col === 'employees.contract_effective_date' ||
    col === 'employees.contract_end_date' ||
    col === 'employees.hr_job_title'
  );
}

function isContractDateColumnMissingP2022(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; meta?: { column?: string } };
  if (e.code !== 'P2022') return false;
  const col = String(e.meta?.column || '');
  return (
    col === 'employees.contract_effective_date' ||
    col === 'employees.contract_end_date' ||
    col === 'employees.hr_job_title'
  );
}

const employeeHrDetailInclude = {
  position: true,
  hrDepartmentUnit: true,
  roleGroup: true,
  employeeType: true,
  subsidiaries: true,
  employmentType: true,
  status: true,
  bankAccounts: { include: { bank: true } },
  vehicles: true,
} as const;

const employeeHrDetailSelectWhenSchemaLags = {
  id: true,
  code: true,
  fullName: true,
  gender: true,
  dateOfBirth: true,
  avatarUrl: true,
  phone: true,
  emailCompany: true,
  emailPersonal: true,
  filePath: true,
  address: true,
  employmentTypeId: true,
  statusId: true,
  positionId: true,
  departmentId: true,
  hrDepartmentUnitId: true,
  roleGroupId: true,
  employeeTypeId: true,
  isOnline: true,
  lastActiveAt: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  personalTaxCode: true,
  salesType: true,
  contractReminderDaysBefore: true,
  contractReminderRepeatDays: true,
  probationStartDate: true,
  probationEndDate: true,
  probationStatus: true,
  notifyOnNewContractUpload: true,
  position: true,
  hrDepartmentUnit: true,
  roleGroup: true,
  employeeType: true,
  subsidiaries: true,
  employmentType: true,
  status: true,
  bankAccounts: { include: { bank: true } },
  vehicles: true,
} as const;

/** Chi tiết / cập nhật nhân viên — tolerate DB chưa migrate (thiếu cột optional). */
async function findEmployeeByIdWithHrRelations(id: string): Promise<any | null> {
  const wid = String(id);
  try {
    return await prisma.employee.findUnique({
      where: { id: wid },
      include: employeeHrDetailInclude as any,
    });
  } catch (err: unknown) {
    if (!isEmployeeTableMissingOptionalColumnP2022(err)) throw err;
    return prisma.employee.findUnique({
      where: { id: wid },
      select: employeeHrDetailSelectWhenSchemaLags as any,
    });
  }
}

export const getEmployees = async (req: Request, res: Response) => {
  try {
    const { search, positionId, roleGroupId, employeeTypeId, status, salesType } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const organizationIdRaw = req.query.organizationId;
    const organizationId =
      organizationIdRaw && String(organizationIdRaw).trim() ? String(organizationIdRaw).trim() : '';

    const hrDepartmentUnitIdRaw = req.query.hrDepartmentUnitId;
    const hrDepartmentUnitId =
      hrDepartmentUnitIdRaw &&
      String(hrDepartmentUnitIdRaw) !== 'undefined' &&
      String(hrDepartmentUnitIdRaw).trim() !== ''
        ? String(hrDepartmentUnitIdRaw).trim()
        : '';

    const departmentIdRaw = req.query.departmentId;
    const departmentId =
      departmentIdRaw &&
      String(departmentIdRaw) !== 'undefined' &&
      String(departmentIdRaw).trim() !== ''
        ? String(departmentIdRaw).trim()
        : '';

    const subsidiaryIdRaw = req.query.subsidiaryId;
    const subsidiaryId =
      subsidiaryIdRaw &&
      String(subsidiaryIdRaw) !== 'undefined' &&
      String(subsidiaryIdRaw).trim() !== ''
        ? String(subsidiaryIdRaw).trim()
        : '';

    const where: any = { AND: [] };

    const currentUser = (req as any).user;
    const perms = (currentUser?.permissions || []) as string[];
    const skipHrScopeForRbac = userBypassesHrEmployeeScope(perms);

    let hrVisibleIds: string[] | null = null;
    if (currentUser?.id && !skipHrScopeForRbac) {
      const emp = await prisma.employee.findUnique({
        where: { id: currentUser.id },
        select: { id: true, departmentId: true, roleGroupId: true },
      });
      if (emp) {
        hrVisibleIds = await getVisibleEmployeeIds(
          {
            id: emp.id,
            roleGroupId: emp.roleGroupId,
            departmentId: emp.departmentId,
            permissions: currentUser.permissions,
            roleGroupCode: currentUser.roleGroupCode ?? null,
          },
          'HR'
        );
        if (hrVisibleIds !== null && hrVisibleIds.length === 0) {
          hrVisibleIds = [currentUser.id];
        }
      }
    }

    // Chỉ lọc theo tổ chức khi không giới hạn theo danh sách id phạm vi HR (toàn công ty / đủ quyền bypass).
    // Nếu đã có hrVisibleIds, thêm organizationId từ FE có thể loại hết NV (đơn vị thuộc org khác dropdown mặc định).
    if (organizationId && hrVisibleIds === null) {
      // NV chưa có đơn vị vận hành (department_id null) vẫn hiện trong danh sách HR theo org đang lọc.
      // Lưu ý đa tổ chức: chưa có trường org trên employee — các bản ghi chưa gán đơn vị xuất hiện kèm mọi org (thực tế thường một org).
      where.AND.push({
        OR: [{ department: { organizationId } }, { departmentId: null }],
      });
    }

    if (search) {
      const searchStr = String(search).trim();
      where.AND.push({
        OR: [
          { fullName: { contains: searchStr, mode: 'insensitive' } },
          { code: { contains: searchStr, mode: 'insensitive' } },
          { phone: { contains: searchStr } },
          { emailCompany: { contains: searchStr, mode: 'insensitive' } },
        ],
      });
    }

    if (positionId) where.AND.push({ positionId: String(positionId) });
    if (roleGroupId && String(roleGroupId) !== 'undefined' && String(roleGroupId) !== '') {
      where.AND.push({ roleGroupId: String(roleGroupId) });
    }
    if (employeeTypeId && String(employeeTypeId) !== 'undefined' && String(employeeTypeId) !== '') {
      where.AND.push({ employeeTypeId: String(employeeTypeId) });
    }
    if (departmentId) {
      where.AND.push({ departmentId });
    }
    if (hrDepartmentUnitId) {
      where.AND.push({ hrDepartmentUnitId });
    }
    if (subsidiaryId) {
      where.AND.push({ subsidiaries: { some: { id: subsidiaryId } } });
    }
    if (status) where.AND.push({ status: { code: String(status) } });

    if (salesType && String(salesType) !== 'undefined' && String(salesType) !== '') {
      where.AND.push({ salesType: String(salesType) });
    }

    if (currentUser?.id && !skipHrScopeForRbac && hrVisibleIds !== null) {
      where.AND.push({ id: { in: hrVisibleIds } });
    }

    const employeeSelectWithoutNewColumns = {
      id: true,
      code: true,
      fullName: true,
      gender: true,
      dateOfBirth: true,
      avatarUrl: true,
      phone: true,
      phoneHash: true,
      emailCompany: true,
      emailPersonal: true,
      passwordHash: true,
      filePath: true,
      address: true,
      employmentTypeId: true,
      statusId: true,
      positionId: true,
      departmentId: true,
      hrDepartmentUnitId: true,
      roleGroupId: true,
      employeeTypeId: true,
      isOnline: true,
      lastActiveAt: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      id_card_back_image: true,
      id_card_front_image: true,
      id_card_issued_date: true,
      id_card_issued_place: true,
      id_card_number: true,
      personalTaxCode: true,
      salesType: true,
      contractReminderDaysBefore: true,
      contractReminderRepeatDays: true,
      probationStartDate: true,
      probationEndDate: true,
      probationStatus: true,
      notifyOnNewContractUpload: true,
      position: true,
      hrDepartmentUnit: true,
      subsidiaries: true,
      employmentType: true,
      status: true,
      roleGroup: true,
      employeeType: true,
      bankAccounts: { include: { bank: true } },
      vehicles: true,
    } as const;

    const includeBlock = {
      position: true,
      hrDepartmentUnit: true,
      department: { include: { division: true } },
      subsidiaries: true,
      employmentType: true,
      status: true,
      roleGroup: true,
      employeeType: true,
      bankAccounts: { include: { bank: true } },
      vehicles: true,
    } as const;

    const fetchEmployeesPage = async () => {
      const baseArgs: any = {
        where,
        skip,
        take: limit,
        include: includeBlock,
        orderBy: { createdAt: 'desc' as const },
      };
      try {
        return await prisma.employee.findMany(baseArgs);
      } catch (err: any) {
        if (isEmployeeTableMissingOptionalColumnP2022(err)) {
          return await prisma.employee.findMany({
            where,
            skip,
            take: limit,
            select: { ...employeeSelectWithoutNewColumns },
            orderBy: { createdAt: 'desc' },
          });
        }
        throw err;
      }
    };

    const total = await prisma.employee.count({ where });
    const employees = await fetchEmployeesPage();

    res.json({
      data: employees.map(sanitizeEmployeeForHr),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách nhân viên' });
  }
};

/**
 * Nhân sự có sinh nhật trong tháng hiện tại
 */
export const getEmployeesBirthdaysInMonth = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;

    const where: any = {
      AND: [
        { dateOfBirth: { not: null } },
        { status: { isActive: true } },
      ],
    };

    const currentUser = (req as any).user;
    const permListBirth = (currentUser?.permissions || []) as string[];
    const skipHrBirth = userBypassesHrEmployeeScope(permListBirth);
    if (currentUser?.id && !skipHrBirth) {
      const emp = await prisma.employee.findUnique({
        where: { id: currentUser.id },
        select: { id: true, departmentId: true, roleGroupId: true },
      });
      if (emp) {
        let visibleIds = await getVisibleEmployeeIds(
          {
            id: emp.id,
            roleGroupId: emp.roleGroupId,
            departmentId: emp.departmentId,
            permissions: currentUser.permissions,
            roleGroupCode: currentUser.roleGroupCode ?? null,
          },
          'HR'
        );
        if (visibleIds !== null && visibleIds.length === 0) {
          visibleIds = [currentUser.id];
        }
        if (visibleIds !== null) {
          where.AND.push({ id: { in: visibleIds } });
        }
      }
    }

    const allWithDob = await prisma.employee.findMany({
      where,
      select: {
        id: true,
        code: true,
        fullName: true,
        dateOfBirth: true,
        avatarUrl: true,
        hrDepartmentUnit: { select: { name: true } },
      },
    });

    const employees = allWithDob
      .filter((e) => {
        const d = e.dateOfBirth as Date | null;
        return d && new Date(d).getMonth() + 1 === currentMonth;
      })
      .sort((a, b) => {
        const dayA = new Date(a.dateOfBirth!).getDate();
        const dayB = new Date(b.dateOfBirth!).getDate();
        return dayA - dayB;
      });

    res.json({ count: employees.length, data: employees });
  } catch (error) {
    console.error('Get birthdays in month error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách sinh nhật' });
  }
};

/**
 * Kiểm tra quyền xem/sửa nhân sự (theo **quyền** gán trên Nhóm quyền trong DB, không theo mã nhóm HCNS cứng).
 * - system_administrator / legacy ADM: full (ngoại lệ cố định)
 * - MANAGE_HR / FULL_ACCESS: xem + sửa (trong phạm vi đã lọc ở route/controller)
 * - VIEW_HR: xem (không sửa) trong phạm vi
 * - Quản lý đơn vị: xem cấp dưới; NV: xem bản thân
 */
const checkEmployeeAccess = async (
  userId: string,
  targetEmployeeId: string,
  permissions: string[] | undefined
) => {
  const user = await prisma.employee.findUnique({
    where: { id: userId },
    select: { id: true, roleGroupId: true, roleGroup: true },
  });

  if (!user) return { canView: false, canEdit: false };

  const perms = permissions || [];

  if (isTechnicalAdminRoleCode(user.roleGroup?.code)) {
    return { canView: true, canEdit: true, isAdmin: true };
  }

  if (userHasAnyPermission(perms, ['MANAGE_HR', 'FULL_ACCESS'])) {
    return { canView: true, canEdit: true, isHRManager: true };
  }

  if (userHasAnyPermission(perms, ['VIEW_HR'])) {
    return { canView: true, canEdit: false, isHRStaff: true };
  }

  if (userId === targetEmployeeId) {
    return { canView: true, canEdit: false, isOwner: true };
  }

  const subordinates = await getSubordinateIds(userId);
  if (subordinates.includes(targetEmployeeId)) {
    return { canView: true, canEdit: false, isManager: true };
  }

  return { canView: false, canEdit: false };
};

export const getEmployeeById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const targetId = String(id);

    const permList = (user.permissions || []) as string[];
    const skipHrScopeForRbac = userBypassesHrEmployeeScope(permList);

    const viewer = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { id: true, departmentId: true, roleGroupId: true },
    });
    if (viewer && !skipHrScopeForRbac) {
      let visibleIds = await getVisibleEmployeeIds(
        {
          id: viewer.id,
          roleGroupId: viewer.roleGroupId,
          departmentId: viewer.departmentId,
          permissions: user.permissions,
          roleGroupCode: user.roleGroupCode ?? null,
        },
        'HR'
      );
      if (visibleIds !== null && visibleIds.length === 0) {
        visibleIds = [user.id];
      }
      if (visibleIds !== null && !visibleIds.includes(targetId)) {
        return res.status(403).json({ message: 'Bạn không có quyền xem thông tin nhân sự này' });
      }
    }

    const access = await checkEmployeeAccess(user.id, targetId, user.permissions);
    const canEdit = access.canEdit;

    const employee: any = await findEmployeeByIdWithHrRelations(String(id));

    if (!employee) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const sanitized = sanitizeEmployeeForHr(employee);

    res.json({
      ...sanitized,
      access: {
        canView: true,
        canEdit,
        isOwner: access.isOwner || false,
        isAdmin: access.isAdmin || false,
        isHRManager: access.isHRManager || false,
        isHRStaff: access.isHRStaff || false,
        isManager: access.isManager || false,
      },
    });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin nhân viên' });
  }
};

export const createEmployee = async (req: Request, res: Response) => {
  try {
    const data = req.body;

    // Module HR — `POST /employees`: không gán đơn vị/chức danh vận hành qua body (kể cả client gửi nhầm).
    // Gán tại Vận hành: `PUT .../departments/:departmentId/staff-assignment`.
    delete data.departmentId;
    delete data.positionId;
    
    // Validate required fields
    if (
      !data.fullName ||
      !data.phone ||
      !data.dateOfBirth ||
      !data.emailPersonal ||
      (!data.employeeTypeId && !data.employeeType)
    ) {
      return res.status(400).json({
        message:
          'Vui lòng điền đầy đủ thông tin bắt buộc: Họ tên, SĐT, Ngày sinh, Email cá nhân, Loại nhân viên',
      });
    }

    const birthParsed = parseEmployeeBirthDate(data.dateOfBirth);
    if (!birthParsed.ok) {
      return res.status(400).json({ message: birthParsed.message });
    }

    // Validate Bank Info (Optional Group)
    if (data.bankName || data.bankAccountNumber || data.bankAccountHolder) {
        if (!data.bankName || !data.bankAccountNumber || !data.bankAccountHolder) {
            return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin ngân hàng hoặc để trống tất cả' });
        }
    }

    // Validate Vehicle Info (Optional Group)
    if (data.vehicleType || data.vehicleColor || data.vehicleLicensePlate) {
        if (!data.vehicleType || !data.vehicleColor || !data.vehicleLicensePlate) {
            return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin phương tiện hoặc để trống tất cả' });
        }
    }

    // Auto-generate code if not provided
    if (!data.code) {
      // New logic: NV + xxxx (0000-9999)
      const prefix = 'NV';
      
      const lastEmp = await prisma.employee.findFirst({
        where: { code: { startsWith: prefix } },
        orderBy: { code: 'desc' }
      });
      
      let sequence = '0000';
      if (lastEmp) {
         const lastSeqStr = lastEmp.code.slice(prefix.length);
         if (/^\d+$/.test(lastSeqStr)) {
             const lastSeq = parseInt(lastSeqStr);
             sequence = (lastSeq + 1).toString().padStart(4, '0');
         }
      }
      
      data.code = `${prefix}${sequence}`;
    }

    // Check unique code
    const existingCode = await prisma.employee.findUnique({
      where: { code: data.code }
    });
    if (existingCode) {
      return res.status(400).json({ message: 'Mã nhân viên đã tồn tại' });
    }

    const duplicatedByContact = await findDuplicateEmployeeByPhoneOrEmail({
      phone: data.phone,
      emailPersonal: data.emailPersonal,
    });
    if (duplicatedByContact.length > 0) {
      return res.status(400).json({
        message:
          'Nhân sự bị trùng theo số điện thoại hoặc email cá nhân. Vui lòng kiểm tra danh sách trùng bên dưới.',
        duplicates: toDuplicateDisplay(duplicatedByContact),
      });
    }

    // Handle subsidiaries
    const subsidiaryData = await processSubsidiaries(data.subsidiaries);

    // Resolve Master Data
    const empTypeCode = data.employmentType || 'official';
    let empType = await prisma.employmentType.findUnique({ where: { code: empTypeCode } });
    if (!empType) empType = await prisma.employmentType.findUnique({ where: { code: 'official' } });

    const statusCode = data.status || 'WORKING';
    let status = await prisma.employeeStatus.findUnique({ where: { code: statusCode } });
    if (!status) status = await prisma.employeeStatus.findUnique({ where: { code: 'WORKING' } });

    let employeeTypeId: string | null = data.employeeTypeId || null;
    if (!employeeTypeId && data.employeeType) {
      const et = await prisma.employeeType.findUnique({ where: { code: String(data.employeeType) } });
      employeeTypeId = et?.id ?? null;
    }
    if (!employeeTypeId) {
      return res.status(400).json({
        message: 'Vui lòng chọn Loại nhân viên hợp lệ (danh mục trong hệ thống)',
      });
    }

    if (!data.hrDepartmentUnitId) {
      return res.status(400).json({ message: 'Vui lòng chọn Bộ phận' });
    }
    const hdu = await prisma.hrDepartmentUnit.findUnique({ where: { id: String(data.hrDepartmentUnitId) } });
    if (!hdu) {
      return res.status(400).json({ message: 'Bộ phận không hợp lệ' });
    }

    const departmentId: string | null = null;
    const positionId: string | null = null;

    const impliesProbation = employmentTypeImpliesProbation(empType?.code);

    let contractEffectiveDate = parseOptionalContractDate(data.contractEffectiveDate);
    let contractEndDate = parseOptionalContractDate(data.contractEndDate);
    if (!contractEffectiveDate && data.probationStartDate) {
      contractEffectiveDate = parseOptionalContractDate(data.probationStartDate);
    }
    if (!contractEndDate && data.probationEndDate) {
      contractEndDate = parseOptionalContractDate(data.probationEndDate);
    }
    if (contractEffectiveDate && contractEndDate && contractEndDate < contractEffectiveDate) {
      return res.status(400).json({
        message: 'Ngày hết hạn hợp đồng phải sau hoặc bằng ngày hiệu lực.',
      });
    }

    let probationStatus: 'NONE' | 'ON_PROBATION' | 'PASSED' | 'FAILED' | undefined;
    if (data.probationStatus && ['NONE', 'ON_PROBATION', 'PASSED', 'FAILED'].includes(String(data.probationStatus))) {
      probationStatus = data.probationStatus;
    } else if (impliesProbation) {
      probationStatus = 'ON_PROBATION';
    }

    // Prepare Relations
    const bankAccounts: any[] = [];
    if (data.bankName && data.bankAccountNumber) {
        // Find or Create Bank
        // Try to find by name or code? Assuming name for now as per old field
        let bank = await prisma.bank.findFirst({ where: { name: { equals: data.bankName, mode: 'insensitive' } } });
        if (!bank) {
             // Create new bank if not exists (or could throw error if strict)
             // Generating a code for new bank
             const bankCode = 'BANK-' + data.bankName.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 1000);
             bank = await prisma.bank.create({
                 data: { name: data.bankName, code: bankCode }
             });
        }
        
        bankAccounts.push({
            bankId: bank.id,
            accountNumber: data.bankAccountNumber,
            accountHolder: data.bankAccountHolder || data.fullName,
            isPrimary: true
        });
    }

    const vehicles: any[] = [];
    if (data.vehicleLicensePlate) {
        vehicles.push({
            type: data.vehicleType || 'Xe máy',
            name: data.vehicleName,
            color: data.vehicleColor,
            licensePlate: data.vehicleLicensePlate
        });
    }

    const createData: any = {
      code: data.code,
      fullName: data.fullName,
      avatarUrl: normalizeUploadUrlForStorage(data.avatarUrl ?? null),
      gender: data.gender || 'Khác',
      dateOfBirth: birthParsed.date,
      phone: data.phone,
      emailCompany: data.emailCompany,
      emailPersonal: data.emailPersonal,
      address: data.address,

      employmentTypeId: empType?.id!,
      statusId: status?.id!,

      positionId,
      departmentId,
      hrDepartmentUnitId: hdu.id,
      hrJobTitle: data.hrJobTitle ? String(data.hrJobTitle).trim() : null,
      employeeTypeId,

      ...(contractEffectiveDate ? { contractEffectiveDate } : {}),
      ...(contractEndDate ? { contractEndDate } : {}),
      ...(impliesProbation && contractEffectiveDate ? { probationStartDate: contractEffectiveDate } : {}),
      ...(impliesProbation && contractEndDate ? { probationEndDate: contractEndDate } : {}),
      ...(probationStatus ? { probationStatus } : {}),

      ...(bankAccounts.length > 0 ? { bankAccounts: { create: bankAccounts } } : {}),
      ...(vehicles.length > 0 ? { vehicles: { create: vehicles } } : {}),

      subsidiaries: subsidiaryData
        ? {
            connect: subsidiaryData.connect,
            create: subsidiaryData.create,
          }
        : undefined,
    };

    let newEmployee: any;
    try {
      newEmployee = await prisma.employee.create({ data: createData });
    } catch (createErr: unknown) {
      if (isContractDateColumnMissingP2022(createErr)) {
        const retryData = { ...createData };
        delete retryData.contractEffectiveDate;
        delete retryData.contractEndDate;
        delete retryData.hrJobTitle;
        newEmployee = await prisma.employee.create({ data: retryData });
      } else {
        throw createErr;
      }
    }
    
    try {
      await ensureCompanyChatGroupForEmployee(newEmployee.id);
    } catch (err) {
      console.error('Failed to add employee to company chat group:', err);
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'EMPLOYEE',
      objectId: newEmployee.id,
      result: 'SUCCESS',
      newValues: newEmployee,
      details: `Created employee ${newEmployee.fullName} (${newEmployee.code})`,
      req
    });

    res.status(201).json(newEmployee);
  } catch (error) {
    console.error('Create employee error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        const targets = error.meta?.target;
        const t = Array.isArray(targets) ? targets.join(', ') : String(targets || '');
        if (t.includes('code')) {
          return res.status(400).json({ message: 'Mã nhân viên đã tồn tại' });
        }
        return res.status(400).json({
          message: 'Dữ liệu trùng với bản ghi khác (ràng buộc duy nhất trong hệ thống).',
        });
      }
      if (error.code === 'P2011') {
        return res.status(503).json({
          message:
            'Cơ sở dữ liệu chưa cho phép tạo nhân viên chưa gán đơn vị vận hành. Sau khi backup DB, trong thư mục backend chạy: npx prisma migrate deploy',
        });
      }
      if (error.code === 'P2022') {
        return res.status(503).json({
          message:
            'Cơ sở dữ liệu chưa khớp schema (thiếu cột). Sau khi backup DB, trong thư mục backend chạy: npx prisma migrate deploy',
        });
      }
    }
    const rawMsg = error instanceof Error ? error.message : '';
    if (
      /department_id|position_id/i.test(rawMsg) &&
      /not null|null value|violates not-null/i.test(rawMsg)
    ) {
      return res.status(503).json({
        message:
          'Cơ sở dữ liệu chưa cho phép tạo nhân viên chưa gán đơn vị vận hành. Sau khi backup DB, trong thư mục backend chạy: npx prisma migrate deploy',
      });
    }
    res.status(500).json({ message: 'Lỗi khi tạo nhân viên' });
  }
};

export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = (req as any).user;
    const oldEmployee = await findEmployeeByIdWithHrRelations(String(id));
    const data = req.body;
    
    if (!oldEmployee) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    // Kiểm tra quyền sửa
    const access = await checkEmployeeAccess(user.id, String(id), user.permissions);
    
    if (!access.canEdit) {
      return res.status(403).json({ message: 'Bạn không có quyền chỉnh sửa thông tin nhân sự này' });
    }

    // Validate Bank Info (Optional Group)
    if (data.bankName || data.bankAccountNumber || data.bankAccountHolder) {
        if (!data.bankName || !data.bankAccountNumber || !data.bankAccountHolder) {
            return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin ngân hàng hoặc để trống tất cả' });
        }
    }

    // Validate Vehicle Info (Optional Group)
    if (data.vehicleType || data.vehicleColor || data.vehicleLicensePlate) {
        if (!data.vehicleType || !data.vehicleColor || !data.vehicleLicensePlate) {
            return res.status(400).json({ message: 'Vui lòng nhập đầy đủ thông tin phương tiện hoặc để trống tất cả' });
        }
    }

    // Handle subsidiaries
    const subsidiaryData = await processSubsidiaries(data.subsidiaries);

    let dateOfBirthForUpdate: Date | undefined;
    if (data.dateOfBirth !== undefined && data.dateOfBirth !== null && String(data.dateOfBirth).trim() !== '') {
      const birthUpd = parseEmployeeBirthDate(data.dateOfBirth);
      if (!birthUpd.ok) {
        return res.status(400).json({ message: birthUpd.message });
      }
      dateOfBirthForUpdate = birthUpd.date;
    }
    
    const updateData: any = {
        fullName: data.fullName,
        avatarUrl:
          data.avatarUrl !== undefined ? normalizeUploadUrlForStorage(data.avatarUrl) : undefined,
        gender: data.gender,
        dateOfBirth: dateOfBirthForUpdate,
        phone: data.phone,
        emailCompany: data.emailCompany,
        emailPersonal: data.emailPersonal,
        address: data.address,
        hrJobTitle:
          data.hrJobTitle === undefined
            ? undefined
            : data.hrJobTitle === null || String(data.hrJobTitle).trim() === ''
              ? null
              : String(data.hrJobTitle).trim(),
        
        // Thông tin pháp lý
        idCardNumber: data.idCardNumber,
        idCardIssuedDate: data.idCardIssuedDate ? new Date(data.idCardIssuedDate) : undefined,
        idCardIssuedPlace: data.idCardIssuedPlace,
        idCardFrontImage: data.idCardFrontImage,
        idCardBackImage: data.idCardBackImage,
        personalTaxCode: data.personalTaxCode,
    };

    const newDeptId = normalizeEmployeeFkInput(data.departmentId);
    const newPosId = normalizeEmployeeFkInput(data.positionId);
    if (newDeptId !== undefined) {
      updateData.departmentId = newDeptId;
    }
    if (newDeptId === null) {
      updateData.positionId = null;
    } else if (newPosId !== undefined) {
      updateData.positionId = newPosId;
    }

    if (data.hrDepartmentUnitId !== undefined && data.hrDepartmentUnitId !== null && data.hrDepartmentUnitId !== '') {
      const unit = await prisma.hrDepartmentUnit.findUnique({ where: { id: String(data.hrDepartmentUnitId) } });
      if (!unit) {
        return res.status(400).json({ message: 'Bộ phận không hợp lệ' });
      }
      updateData.hrDepartmentUnitId = unit.id;
    }

    const phoneForDup =
      data.phone !== undefined ? data.phone : oldEmployee.phone;
    const emailForDup =
      data.emailPersonal !== undefined ? data.emailPersonal : oldEmployee.emailPersonal;
    const duplicatedByContact = await findDuplicateEmployeeByPhoneOrEmail({
      phone: phoneForDup,
      emailPersonal: emailForDup,
      excludeEmployeeId: String(id),
    });
    if (duplicatedByContact.length > 0) {
      return res.status(400).json({
        message:
          'Số điện thoại hoặc email cá nhân đã được dùng cho nhân sự khác. Vui lòng kiểm tra danh sách trùng bên dưới.',
        duplicates: toDuplicateDisplay(duplicatedByContact),
      });
    }

    // Cập nhật loại hình nhân sự (Employment Type)
    if (data.employmentType) {
        const type = await prisma.employmentType.findUnique({ where: { code: data.employmentType } });
        if (type) updateData.employmentTypeId = type.id;
    }

    // Cập nhật trạng thái nhân viên
    if (data.status) {
        const status = await prisma.employeeStatus.findUnique({ where: { code: data.status } });
        if (status) updateData.statusId = status.id;
    }

    // Cập nhật loại nhân viên (EmployeeType)
    if (data.employeeTypeId !== undefined) {
        updateData.employeeTypeId = data.employeeTypeId || null;
    } else if (data.employeeType) {
        const et = await prisma.employeeType.findUnique({ where: { code: String(data.employeeType) } });
        if (et) updateData.employeeTypeId = et.id;
    }

    // Ngày hiệu lực / hết hạn hợp đồng (tùy chọn); với loại HĐ thử việc đồng bộ sang kỳ thử việc.
    if (data.contractEffectiveDate !== undefined) {
      if (data.contractEffectiveDate === null || data.contractEffectiveDate === '') {
        updateData.contractEffectiveDate = null;
      } else {
        const d = new Date(data.contractEffectiveDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ message: 'Ngày hiệu lực hợp đồng không hợp lệ.' });
        }
        updateData.contractEffectiveDate = d;
      }
    }
    if (data.contractEndDate !== undefined) {
      if (data.contractEndDate === null || data.contractEndDate === '') {
        updateData.contractEndDate = null;
      } else {
        const d = new Date(data.contractEndDate);
        if (Number.isNaN(d.getTime())) {
          return res.status(400).json({ message: 'Ngày hết hạn hợp đồng không hợp lệ.' });
        }
        updateData.contractEndDate = d;
      }
    }

    const mergedTypeId = updateData.employmentTypeId ?? oldEmployee.employmentTypeId;
    const mergedEmpTypeRow = mergedTypeId
      ? await prisma.employmentType.findUnique({ where: { id: mergedTypeId } })
      : null;
    const impliesP = employmentTypeImpliesProbation(mergedEmpTypeRow?.code);

    const storedEff = (oldEmployee as any).contractEffectiveDate as Date | null | undefined;
    const storedEnd = (oldEmployee as any).contractEndDate as Date | null | undefined;
    const nextContractEff =
      updateData.contractEffectiveDate !== undefined
        ? updateData.contractEffectiveDate
        : storedEff ?? (oldEmployee as any).probationStartDate;
    const nextContractEnd =
      updateData.contractEndDate !== undefined
        ? updateData.contractEndDate
        : storedEnd ?? (oldEmployee as any).probationEndDate;

    if (nextContractEff && nextContractEnd && nextContractEnd < nextContractEff) {
      return res.status(400).json({
        message: 'Ngày hết hạn hợp đồng phải sau hoặc bằng ngày hiệu lực.',
      });
    }

    if (impliesP) {
      updateData.probationStartDate = nextContractEff ?? null;
      updateData.probationEndDate = nextContractEnd ?? null;
      if (
        data.probationStatus &&
        ['NONE', 'ON_PROBATION', 'PASSED', 'FAILED'].includes(String(data.probationStatus))
      ) {
        updateData.probationStatus = data.probationStatus;
      }
    } else {
      updateData.probationStartDate = null;
      updateData.probationEndDate = null;
      updateData.probationStatus = 'NONE';
    }

    // Nhắc hẹn hợp đồng (theo từng nhân sự)
    if (data.contractReminderDaysBefore !== undefined) {
        const v = data.contractReminderDaysBefore === '' || data.contractReminderDaysBefore === null ? null : parseInt(String(data.contractReminderDaysBefore), 10);
        updateData.contractReminderDaysBefore = Number.isNaN(v) ? null : v;
    }
    if (data.contractReminderRepeatDays !== undefined) {
        const v = data.contractReminderRepeatDays === '' || data.contractReminderRepeatDays === null ? null : parseInt(String(data.contractReminderRepeatDays), 10);
        updateData.contractReminderRepeatDays = Number.isNaN(v) ? null : v;
    }
    if (data.notifyOnNewContractUpload !== undefined) {
        updateData.notifyOnNewContractUpload = data.notifyOnNewContractUpload === true || data.notifyOnNewContractUpload === 'true';
    }

    // Update Bank Accounts
    if (data.bankName !== undefined || data.bankAccountNumber !== undefined) {
         if (data.bankName && data.bankAccountNumber) {
            let bank = await prisma.bank.findFirst({ where: { name: { equals: data.bankName, mode: 'insensitive' } } });
            if (!bank) {
                 const bankCode = 'BANK-' + data.bankName.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 1000);
                 bank = await prisma.bank.create({
                     data: { name: data.bankName, code: bankCode }
                 });
            }
            updateData.bankAccounts = {
                deleteMany: {},
                create: [{
                    bankId: bank.id,
                    accountNumber: data.bankAccountNumber,
                    accountHolder: data.bankAccountHolder || data.fullName,
                    isPrimary: true
                }]
            };
         } else {
             // If fields are empty/null, clear bank accounts?
             // Only if they are explicitly sent as empty
             if (data.bankName === "" || data.bankName === null) {
                 updateData.bankAccounts = { deleteMany: {} };
             }
         }
    }

    // Update Vehicles
    if (data.vehicleLicensePlate !== undefined || data.vehicleName !== undefined) {
        if (data.vehicleLicensePlate) {
            updateData.vehicles = {
                deleteMany: {},
                create: [{
                    type: data.vehicleType || 'Xe máy',
                    name: data.vehicleName,
                    color: data.vehicleColor,
                    licensePlate: data.vehicleLicensePlate
                }]
            };
        } else {
             if (data.vehicleLicensePlate === "" || data.vehicleLicensePlate === null) {
                 updateData.vehicles = { deleteMany: {} };
             }
        }
    }


    if (subsidiaryData) {
        if (subsidiaryData.connect && subsidiaryData.connect.length > 0) {
            updateData.subsidiaries = {
                set: subsidiaryData.connect, 
                create: subsidiaryData.create
            };
        } else if (subsidiaryData.create && subsidiaryData.create.length > 0) {
             updateData.subsidiaries = {
                set: [], 
                create: subsidiaryData.create
            };
        } else {
             updateData.subsidiaries = { set: [] };
        }
    }

    if (
      newDeptId !== undefined &&
      newDeptId !== null &&
      !employeeFkEqual(newDeptId, oldEmployee.departmentId)
    ) {
      if (newPosId === undefined) {
        const pos = await prisma.position.findFirst({
          where: { departmentId: newDeptId },
          orderBy: { code: 'asc' },
        });
        if (!pos) {
          return res.status(400).json({
            message:
              'Phòng ban đích chưa có chức danh. Vui lòng thêm chức danh hoặc chỉ định chức danh.',
          });
        }
        updateData.positionId = pos.id;
      }
    }

    // Đồng bộ đơn vị lá ↔ loại NV: chỉ kiểm tra khi **thay đổi** gán vận hành trong lần cập nhật này.
    // Tránh chặn sửa email/Hồ sơ khác khi NV vẫn gắn đơn vị lá cũ (vd. chưa có `function` hoặc tài khoản SUPERADMIN).
    const staffAssignmentChanged =
      (updateData.departmentId !== undefined &&
        !employeeFkEqual(updateData.departmentId, oldEmployee.departmentId)) ||
      (updateData.employeeTypeId !== undefined &&
        !employeeFkEqual(
          (updateData.employeeTypeId as string | null) ?? null,
          oldEmployee.employeeTypeId ?? null
        )) ||
      (updateData.positionId !== undefined &&
        !employeeFkEqual(updateData.positionId, oldEmployee.positionId));

    const finalDepartmentId =
      updateData.departmentId !== undefined
        ? updateData.departmentId
        : oldEmployee.departmentId ?? null;
    const finalEmployeeTypeId: string | null =
      updateData.employeeTypeId !== undefined
        ? (updateData.employeeTypeId as string | null)
        : oldEmployee.employeeTypeId ?? null;
    const finalPositionId =
      updateData.positionId !== undefined ? updateData.positionId : oldEmployee.positionId ?? null;

    if (finalDepartmentId && staffAssignmentChanged) {
      const staffVal = await validateEmployeeDepartmentForStaffAssignment({
        departmentId: finalDepartmentId,
        employeeTypeId: finalEmployeeTypeId,
        positionId: finalPositionId,
      });
      if (!staffVal.ok) {
        return res.status(staffVal.status).json({ message: staffVal.message });
      }
    }

    let updated: any;
    try {
      updated = await prisma.employee.update({
        where: { id: String(id) },
        data: updateData,
      });
    } catch (updErr: unknown) {
      if (isContractDateColumnMissingP2022(updErr)) {
        const dataWithoutContractDates = { ...updateData };
        delete dataWithoutContractDates.contractEffectiveDate;
        delete dataWithoutContractDates.contractEndDate;
        delete dataWithoutContractDates.hrJobTitle;
        updated = await prisma.employee.update({
          where: { id: String(id) },
          data: dataWithoutContractDates,
        });
      } else {
        throw updErr;
      }
    }

    // Tự động tạo nhắc lịch ký HĐ chính thức khi đạt thử việc
    try {
      const oldProbationStatus = (oldEmployee as any).probationStatus;
      const newProbationStatus = (updated as any).probationStatus;
      const probationEndDate = (updated as any).probationEndDate as Date | null;

      if (
        oldProbationStatus !== 'PASSED' &&
        newProbationStatus === 'PASSED' &&
        probationEndDate
      ) {
        await prisma.hrReminder.create({
          data: {
            employeeId: updated.id,
            contractId: null,
            type: 'SIGN_OFFICIAL_CONTRACT',
            dueDate: probationEndDate,
            status: 'PENDING',
            note: 'Nhắc ký HĐ chính thức sau khi đạt thử việc',
            createdById: user.id || null
          }
        });
      }
    } catch (err) {
      // Không chặn luồng chính nếu tạo nhắc lịch lỗi, chỉ log để kiểm tra
      console.error('Failed to create HR reminder for probation:', err);
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'EMPLOYEE',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: oldEmployee,
      newValues: updated,
      details: `Updated employee ${updated.fullName} (${updated.code})`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Update employee error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật nhân viên' });
  }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const employeeId = String(id);
    const beforeDelete = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, fullName: true, code: true },
    });
    if (!beforeDelete) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên để xóa' });
    }

    // Dọn các bản ghi con thuần hồ sơ HR trước khi xóa nhân viên.
    const deleted = await prisma.$transaction(async (tx) => {
      await tx.employeeBankAccount.deleteMany({ where: { employeeId } });
      await tx.employeeVehicle.deleteMany({ where: { employeeId } });
      await tx.pushSubscription.deleteMany({ where: { employeeId } });
      return tx.employee.delete({ where: { id: employeeId } });
    });
    
    await logAudit({
      ...getAuditUser(req),
      action: 'DELETE',
      object: 'EMPLOYEE',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: deleted,
      details: `Deleted employee ${deleted.fullName} (${deleted.code})`,
      req
    });

    res.json({ message: 'Đã xóa Nhân viên' });
  } catch (error) {
    console.error('Delete employee error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        return res.status(404).json({ message: 'Không tìm thấy nhân viên để xóa' });
      }
      if (error.code === 'P2003') {
        const fieldName = String((error.meta as any)?.field_name || '').trim();
        return res.status(400).json({
          message:
            'Không thể xóa nhân viên vì đang có dữ liệu liên quan trong hệ thống. ' +
            (fieldName ? `Ràng buộc: ${fieldName}. ` : '') +
            'Vui lòng chuyển trạng thái nhân viên thay vì xóa.',
        });
      }
    }
    const raw = error instanceof Error ? error.message : String(error);
    const restrictHit =
      /violates RESTRICT setting of foreign key constraint/i.test(raw) ||
      /is referenced from table/i.test(raw);
    if (restrictHit) {
      const tableMatch = raw.match(/referenced from table \"([^\"]+)\"/i);
      const fkMatch = raw.match(/foreign key constraint \"([^\"]+)\"/i);
      const table = tableMatch?.[1];
      const fk = fkMatch?.[1];
      return res.status(400).json({
        message:
          'Không thể xóa nhân viên vì đang được tham chiếu bởi dữ liệu nghiệp vụ khác. ' +
          (table ? `Bảng tham chiếu: ${table}. ` : '') +
          (fk ? `Ràng buộc: ${fk}. ` : '') +
          'Khuyến nghị: chuyển trạng thái nhân viên thay vì xóa.',
      });
    }
    res.status(500).json({ message: 'Lỗi khi xóa nhân viên' });
  }
};

export const createDivision = async (req: Request, res: Response) => {
  try {
    const { name, code, managerId, parentId, targetSalesUnitId, targetCsUnitId, organizationId: bodyOrgId } = req.body;
    if (!name) return res.status(400).json({ message: 'Vui lòng nhập tên' });

    if (managerId) {
      const managerExists = await prisma.employee.findUnique({ where: { id: managerId }, select: { id: true } });
      if (!managerExists) return res.status(400).json({ message: 'Quản lý không tồn tại trong hệ thống' });
    }

    let organizationId: string;
    try {
      if (bodyOrgId && String(bodyOrgId).trim()) {
        const o = await prisma.organization.findUnique({ where: { id: String(bodyOrgId) } });
        if (!o) return res.status(400).json({ message: 'Tổ chức không tồn tại' });
        organizationId = o.id;
      } else {
        organizationId = await resolveOrganizationIdFromRequest(req);
      }
    } catch {
      return res.status(503).json({ message: 'Chưa có tổ chức nào trong hệ thống' });
    }

    const companyRoot = await getCompanyRootForOrg(organizationId);
    const effectiveParentId =
      parentId && String(parentId).length > 0 ? String(parentId) : companyRoot.id;

    const parentRow = await prisma.department.findUnique({
      where: { id: effectiveParentId },
      select: { type: true, organizationId: true },
    });
    if (!parentRow || parentRow.organizationId !== organizationId) {
      return res.status(400).json({ message: 'Nút cha không thuộc tổ chức đã chọn' });
    }
    if (parentRow.type !== 'COMPANY' && parentRow.type !== 'DIVISION') {
      return res.status(400).json({
        message: 'Khối chỉ được tạo dưới gốc tổ chức (COMPANY) hoặc dưới một khối cha',
      });
    }

    const upperName = name.toUpperCase().trim();

    const existing = await prisma.department.findFirst({
      where: {
        organizationId,
        name: { equals: upperName, mode: 'insensitive' },
        type: 'DIVISION',
      },
    });
    if (existing) {
      return res.status(400).json({ message: 'Tên Khối đã tồn tại trong tổ chức này' });
    }

    let finalCode = code ? String(code).toUpperCase().trim().replace(/\s+/g, '_') : '';

    if (!finalCode) {
      // Mã phải duy nhất trong **toàn bộ** departments của tổ chức (không chỉ DIVISION).
      const allCodes = await prisma.department.findMany({
        where: { organizationId },
        select: { code: true },
      });

      let maxSeq = 0;
      for (const row of allCodes) {
        const match = String(row.code).match(/^K(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }

      let seq = maxSeq + 1;
      if (seq > 99) {
        return res.status(400).json({ message: 'Đã hết mã Khối tự động (K01-K99) trong tổ chức này' });
      }
      for (; seq <= 99; seq++) {
        finalCode = `K${seq.toString().padStart(2, '0')}`;
        const taken = await prisma.department.findUnique({
          where: { organizationId_code: { organizationId, code: finalCode } },
        });
        if (!taken) break;
      }
      if (seq > 99 || !finalCode) {
        return res.status(400).json({ message: 'Đã hết mã Khối tự động (K01-K99) trong tổ chức này' });
      }
    } else {
      if (!/^[A-Z0-9_]{2,32}$/.test(finalCode)) {
        return res.status(400).json({ message: 'Mã khối: 2–32 ký tự A-Z, số hoặc gạch dưới' });
      }
      const existingCode = await prisma.department.findUnique({
        where: { organizationId_code: { organizationId, code: finalCode } },
      });
      if (existingCode) {
        return res.status(400).json({ message: 'Mã khối đã tồn tại trong tổ chức này' });
      }
    }

    const division = await prisma.department.create({
      data: {
        organizationId,
        name: upperName,
        code: finalCode,
        type: 'DIVISION',
        parentId: effectiveParentId,
        managerId: managerId || null,
        function: null,
        targetSalesUnitId: targetSalesUnitId || null,
        targetCsUnitId: targetCsUnitId || null,
      },
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'DIVISION',
      objectId: division.id,
      result: 'SUCCESS',
      newValues: division,
      details: `Created division ${division.name}`,
      req
    });

    res.status(201).json(division);
  } catch (error: any) {
    console.error('Create division error:', error);
    if (error?.code === 'P2002') {
      return res.status(400).json({
        message: 'Mã khối hoặc tên đã trùng với bản ghi khác trong tổ chức (mã đơn vị là duy nhất trên mọi loại nút).',
      });
    }
    res.status(500).json({ message: 'Lỗi khi tạo Khối' });
  }
};

export const createDepartment = async (req: Request, res: Response) => {
  try {
    const { name, code, divisionId, managerId, parentId, function: func, targetSalesUnitId, targetCsUnitId } = req.body;
    if (!name || (!divisionId && !parentId)) return res.status(400).json({ message: 'Vui lòng nhập tên và chọn cấp cha' });

    if (func != null && func !== '' && !isAllowedOrgUnitFunction(String(func))) {
      return res.status(400).json({ message: 'Chức năng đơn vị lá không hợp lệ' });
    }

    if (managerId) {
      const managerExists = await prisma.employee.findUnique({ where: { id: managerId }, select: { id: true } });
      if (!managerExists) return res.status(400).json({ message: 'Quản lý không tồn tại trong hệ thống' });
    }

    // FE gửi cả divisionId và parentId khi tạo đơn vị con dưới một đơn vị: parentId mới là cha trực tiếp.
    // Trước đây dùng divisionId || parentId khiến mọi bản ghi mới bám vào khối, không vào đơn vị cha → cây FE thiếu con.
    const parentRef = String(
      parentId != null && String(parentId).trim() !== '' ? parentId : divisionId
    );
    const parentNode = await prisma.department.findUnique({
      where: { id: parentRef },
      select: { id: true, organizationId: true, type: true },
    });
    if (!parentNode) {
      return res.status(400).json({ message: 'Cấp cha không tồn tại' });
    }
    if (parentNode.type === 'COMPANY') {
      return res.status(400).json({ message: 'Không tạo đơn vị trực tiếp dưới gốc COMPANY — hãy tạo khối hoặc chọn khối/đơn vị cha' });
    }
    const organizationId = parentNode.organizationId;

    const existing = await prisma.department.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: 'insensitive' },
        parentId: parentRef,
      },
    });
    if (existing) {
      return res.status(400).json({ message: 'Tên Đơn vị đã tồn tại trong cấp này' });
    }

    let finalCode = code ? code.toUpperCase().trim() : '';

    if (!finalCode) {
      const prefix = 'P';

      const departments = await prisma.department.findMany({
        where: { organizationId, code: { startsWith: prefix } },
        select: { code: true },
      });

      let maxSeq = 0;
      for (const dept of departments) {
        const match = dept.code.match(/^P(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (num > maxSeq) maxSeq = num;
        }
      }

      const sequence = (maxSeq + 1).toString().padStart(3, '0');

      finalCode = `${prefix}${sequence}`;

      if (maxSeq + 1 > 999) {
        return res.status(400).json({ message: 'Đã hết mã Đơn vị tự động (P001-P999) trong tổ chức này' });
      }
    } else {
      if (!/^P\d{3}$/.test(finalCode)) {
        return res.status(400).json({ message: 'Mã đơn vị phải có định dạng Pxxx (ví dụ P001)' });
      }
      const existingCode = await prisma.department.findUnique({
        where: { organizationId_code: { organizationId, code: finalCode } },
      });
      if (existingCode) {
        return res.status(400).json({ message: 'Mã phòng ban đã tồn tại trong tổ chức này' });
      }
    }

    const department = await prisma.department.create({
      data: {
        organizationId,
        name,
        code: finalCode,
        type: 'DEPARTMENT',
        parentId: parentRef,
        managerId: managerId || null,
        function: func || null,
        targetSalesUnitId: targetSalesUnitId || null,
        targetCsUnitId: targetCsUnitId || null,
      },
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'DEPARTMENT',
      objectId: department.id,
      result: 'SUCCESS',
      newValues: department,
      details: `Created department ${department.name}`,
      req
    });

    res.status(201).json(department);
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo Đơn vị' });
  }
};

/** Gán / chuyển nhân viên vào đơn vị lá (Vận hành — CONFIG_ORG_STRUCTURE hoặc MANAGE_HR). */
export const assignEmployeeToDepartmentUnit = async (req: Request, res: Response) => {
  try {
    const { departmentId } = req.params;
    const { employeeId, positionId: bodyPositionId, allowReassignFromOtherUnit } = req.body || {};
    if (!employeeId) {
      return res.status(400).json({ message: 'Thiếu employeeId' });
    }

    const targetDeptId = String(departmentId);
    const emp = await prisma.employee.findUnique({
      where: { id: String(employeeId) },
      select: {
        id: true,
        employeeTypeId: true,
        fullName: true,
        code: true,
        departmentId: true,
        positionId: true,
      },
    });
    if (!emp) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const allowMove =
      allowReassignFromOtherUnit === true ||
      allowReassignFromOtherUnit === 'true' ||
      allowReassignFromOtherUnit === 1;
    if (
      emp.departmentId &&
      emp.departmentId !== targetDeptId &&
      !allowMove
    ) {
      const curDept = await prisma.department.findUnique({
        where: { id: emp.departmentId },
        select: { name: true },
      });
      const unitLabel = (curDept?.name && String(curDept.name).trim()) || emp.departmentId;
      return res.status(400).json({
        message: `Không thể thêm nhân viên «${emp.fullName}» (${emp.code}) vào đơn vị này vì nhân viên đang làm việc tại đơn vị «${unitLabel}». Vui lòng gỡ nhân viên khỏi đơn vị đó trước khi gán sang đơn vị khác.`,
      });
    }

    let positionId: string | null = bodyPositionId ? String(bodyPositionId) : null;
    if (!positionId) {
      const pos = await prisma.position.findFirst({
        where: { departmentId: targetDeptId },
        orderBy: { code: 'asc' },
      });
      if (!pos) {
        return res.status(400).json({ message: 'Đơn vị chưa có chức danh. Vui lòng thêm chức danh trước.' });
      }
      positionId = pos.id;
    }

    const v = await validateEmployeeDepartmentForStaffAssignment({
      departmentId: targetDeptId,
      employeeTypeId: emp.employeeTypeId,
      positionId,
    });
    if (!v.ok) {
      return res.status(v.status).json({ message: v.message });
    }

    const updated = await prisma.employee.update({
      where: { id: emp.id },
      data: { departmentId: targetDeptId, positionId },
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'EMPLOYEE',
      objectId: emp.id,
      result: 'SUCCESS',
      oldValues: { departmentId: emp.departmentId, positionId: emp.positionId },
      newValues: { departmentId: updated.departmentId, positionId: updated.positionId },
      details: `Gán nhân viên ${emp.fullName} (${emp.code}) vào đơn vị ${targetDeptId}`,
      req,
    });

    res.json(updated);
  } catch (error) {
    console.error('assignEmployeeToDepartmentUnit error:', error);
    res.status(500).json({ message: 'Lỗi khi gán nhân viên vào đơn vị' });
  }
};

/**
 * Gỡ nhân viên khỏi đơn vị lá vận hành (đặt department_id / position_id = null).
 * Chỉ Quản trị hệ thống / Quản trị CRM (route middleware).
 * Nếu NV là quản lý đơn vị, gỡ luôn manager_id trên các bản ghi department liên quan.
 */
export const removeEmployeeFromDepartmentUnit = async (req: Request, res: Response) => {
  try {
    const { departmentId, employeeId } = req.params;
    const targetDeptId = String(departmentId);
    const empId = String(employeeId);

    const dept = await prisma.department.findUnique({
      where: { id: targetDeptId },
      select: { id: true, type: true },
    });
    if (!dept) {
      return res.status(404).json({ message: 'Đơn vị không tồn tại' });
    }
    if (dept.type === 'COMPANY' || dept.type === 'DIVISION') {
      return res.status(400).json({ message: 'Chỉ gỡ nhân viên khỏi đơn vị DEPARTMENT/TEAM, không phải khối hay nút gốc tổ chức.' });
    }

    const emp = await prisma.employee.findUnique({
      where: { id: empId },
      select: {
        id: true,
        fullName: true,
        code: true,
        departmentId: true,
        positionId: true,
      },
    });
    if (!emp) {
      return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }
    if (emp.departmentId !== targetDeptId) {
      return res.status(400).json({ message: 'Nhân viên không thuộc đơn vị này.' });
    }

    await prisma.$transaction([
      prisma.department.updateMany({
        where: { managerId: empId },
        data: { managerId: null },
      }),
      prisma.employee.update({
        where: { id: empId },
        data: { departmentId: null, positionId: null },
      }),
    ]);

    const updated = await prisma.employee.findUnique({ where: { id: empId } });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'EMPLOYEE',
      objectId: emp.id,
      result: 'SUCCESS',
      oldValues: { departmentId: emp.departmentId, positionId: emp.positionId },
      newValues: { departmentId: null, positionId: null },
      details: `Gỡ nhân viên ${emp.fullName} (${emp.code}) khỏi đơn vị vận hành ${targetDeptId}`,
      req,
    });

    res.json(updated);
  } catch (error) {
    console.error('removeEmployeeFromDepartmentUnit error:', error);
    res.status(500).json({ message: 'Lỗi khi gỡ nhân viên khỏi đơn vị' });
  }
};

export const updateDepartment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, divisionId, managerId, managerPositionId, parentId, function: func, targetSalesUnitId, targetCsUnitId } = req.body;
    
    // Get current department to handle partial updates
    const currentDept = await prisma.department.findUnique({ where: { id: String(id) } });
    if (!currentDept) {
        return res.status(404).json({ message: 'Đơn vị không tồn tại' });
    }

    const targetName = name !== undefined ? name : currentDept.name;
    const targetParentId =
      divisionId !== undefined
        ? divisionId
        : parentId !== undefined
          ? parentId
          : currentDept.parentId;

    if (divisionId !== undefined || parentId !== undefined) {
      if (targetParentId == null) {
        return res.status(400).json({ message: 'Cấp cha không hợp lệ' });
      }
      const p = await prisma.department.findUnique({
        where: { id: String(targetParentId) },
        select: { organizationId: true, type: true },
      });
      if (!p) {
        return res.status(400).json({ message: 'Cấp cha không tồn tại' });
      }
      if (p.organizationId !== currentDept.organizationId) {
        return res.status(400).json({ message: 'Không di chuyển đơn vị sang tổ chức khác' });
      }
      if (p.type === 'COMPANY') {
        return res.status(400).json({ message: 'Không gán đơn vị trực tiếp dưới gốc COMPANY' });
      }
    }

    // Check for duplicate name in the same division AND parent (siblings)
    // Only check if name, division, or parent is changing
    const isMovingOrRenaming = (name && name !== currentDept.name) || 
                               (targetParentId !== currentDept.parentId);

    if (isMovingOrRenaming) {
        const existing = await prisma.department.findFirst({
            where: { 
                organizationId: currentDept.organizationId,
                name: { equals: targetName, mode: 'insensitive' },
                parentId: targetParentId,
                id: { not: String(id) }
            }
        });
        if (existing) {
            return res.status(400).json({ message: 'Tên Đơn vị đã tồn tại trong cấp này' });
        }
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (divisionId !== undefined) updateData.parentId = divisionId;
    if (managerId !== undefined) {
      if (managerId) {
        const managerExists = await prisma.employee.findUnique({ where: { id: managerId }, select: { id: true } });
        if (!managerExists) return res.status(400).json({ message: 'Quản lý không tồn tại trong hệ thống' });
      }
      updateData.managerId = managerId || null;
    }
    if (parentId !== undefined) updateData.parentId = parentId;
    if (func !== undefined) {
      if (func != null && func !== '' && !isAllowedOrgUnitFunction(String(func))) {
        return res.status(400).json({ message: 'Chức năng đơn vị lá không hợp lệ' });
      }
      if (func) {
        const childCount = await prisma.department.count({ where: { parentId: String(id) } });
        if (childCount > 0) {
          return res.status(400).json({
            message: 'Chỉ đơn vị lá (không có đơn vị con) mới được gán chức năng Marketing / Sales / Chăm sóc khách hàng',
          });
        }
      }
      updateData.function = func || null;
    }
    const orgId = currentDept.organizationId;
    if (targetSalesUnitId !== undefined) {
      const tid = targetSalesUnitId || null;
      if (tid) {
        const t = await prisma.department.findUnique({ where: { id: tid }, select: { organizationId: true } });
        if (!t || t.organizationId !== orgId) {
          return res.status(400).json({ message: 'Đơn vị Sales đích phải cùng tổ chức' });
        }
      }
      updateData.targetSalesUnitId = tid;
    }
    if (targetCsUnitId !== undefined) {
      const tid = targetCsUnitId || null;
      if (tid) {
        const t = await prisma.department.findUnique({ where: { id: tid }, select: { organizationId: true } });
        if (!t || t.organizationId !== orgId) {
          return res.status(400).json({ message: 'Đơn vị CSKH đích phải cùng tổ chức' });
        }
      }
      updateData.targetCsUnitId = tid;
    }

    const department = await prisma.department.update({
      where: { id: String(id) },
      data: updateData
    });

    // Update Manager's Position if provided
    if (managerId && managerPositionId) {
        await prisma.employee.update({
            where: { id: managerId },
            data: { positionId: managerPositionId }
        });
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'DEPARTMENT',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: currentDept,
      newValues: department,
      details: `Updated department ${department.name}`,
      req
    });

    res.json(department);
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật Đơn vị' });
  }
};

export const deleteDepartment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deptId = String(id);

    const dept = await prisma.department.findUnique({
      where: { id: deptId },
      include: {
        _count: {
          select: { employees: true, children: true },
        },
      },
    });

    if (!dept) {
      return res.status(404).json({ message: 'Không tìm thấy Đơn vị' });
    }

    if (dept.type !== 'DEPARTMENT' && dept.type !== 'TEAM') {
      return res.status(400).json({ message: 'Chỉ xóa được đơn vị loại phòng ban/team qua API này' });
    }

    if (dept._count.children > 0) {
      return res.status(400).json({ message: 'Không thể xóa Đơn vị đang có đơn vị con' });
    }

    if (dept._count.employees > 0) {
      return res.status(400).json({ message: 'Không thể xóa Đơn vị đang có nhân viên' });
    }

    const leadRef = await prisma.leadAssignment.count({
      where: {
        OR: [{ fromDepartmentId: deptId }, { toDepartmentId: deptId }],
      },
    });
    if (leadRef > 0) {
      return res.status(400).json({
        message:
          'Không thể xóa: còn lịch sử phân lead gắn đơn vị này (cần xử lý dữ liệu liên quan trước)',
      });
    }

    const deleted = await prisma.$transaction(async (tx) => {
      await tx.department.updateMany({
        where: { targetSalesUnitId: deptId },
        data: { targetSalesUnitId: null },
      });
      await tx.department.updateMany({
        where: { targetCsUnitId: deptId },
        data: { targetCsUnitId: null },
      });
      await tx.department.update({
        where: { id: deptId },
        data: { managerId: null },
      });

      const positions = await tx.position.findMany({
        where: { departmentId: deptId },
        select: { id: true },
      });
      const posIds = positions.map((p) => p.id);
      if (posIds.length > 0) {
        await tx.employee.updateMany({
          where: { positionId: { in: posIds } },
          data: { positionId: null },
        });
        await tx.position.deleteMany({ where: { departmentId: deptId } });
      }

      await tx.salesTarget.deleteMany({ where: { departmentId: deptId } });
      await tx.teamDistributionRatio.deleteMany({ where: { departmentId: deptId } });

      return tx.department.delete({ where: { id: deptId } });
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'DELETE',
      object: 'DEPARTMENT',
      objectId: deptId,
      result: 'SUCCESS',
      oldValues: deleted,
      details: `Deleted department ${deleted.name}`,
      req
    });

    res.json({ message: 'Đã xóa Đơn vị' });
  } catch (error) {
    console.error('Delete department error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa Đơn vị' });
  }
};




export const deleteDivision = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Check dependencies
    const div = await prisma.department.findUnique({
      where: { id: String(id) },
      include: { _count: { select: { children: true } } }
    });

    if (div && div._count.children > 0) {
        return res.status(400).json({ message: 'Không thể xóa Khối đang có Đơn vị trực thuộc' });
    }

    await prisma.department.updateMany({
      where: { externalCsDivisionId: String(id) },
      data: { externalCsDivisionId: null },
    });
    await prisma.department.updateMany({
      where: { externalSalesDivisionId: String(id) },
      data: { externalSalesDivisionId: null },
    });

    const deleted = await prisma.department.delete({ where: { id: String(id) } });

    await logAudit({
      ...getAuditUser(req),
      action: 'DELETE',
      object: 'DIVISION',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: deleted,
      details: `Deleted division ${deleted.name}`,
      req
    });

    res.json({ message: 'Đã xóa Khối' });
  } catch (error) {
    console.error('Delete division error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa Khối' });
  }
};

export const createPosition = async (req: Request, res: Response) => {
  try {
    const { name, code, departmentId } = req.body;
    if (!name) return res.status(400).json({ message: 'Vui lòng nhập tên chức vụ' });
    if (!departmentId) return res.status(400).json({ message: 'Vui lòng chọn Phòng ban' });
    
    // Check if position with same name exists in THIS department
    const existing = await prisma.position.findFirst({
        where: { 
            name: { equals: name, mode: 'insensitive' },
            departmentId: departmentId
        }
    });

    if (existing) {
        return res.status(400).json({ message: 'Tên chức vụ đã tồn tại trong phòng ban này' });
    }

    // Fetch Department Code
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) return res.status(404).json({ message: 'Phòng ban không tồn tại' });

    // Generate code if missing. Ensure uniqueness GLOBALLY
    let finalCode = code;
    if (!finalCode) {
         // Convention: {DeptCode}_{Acronym}
         const getAcronym = (str: string) => {
            return str
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .toUpperCase()
                .split(/[\s-]+/)
                .map(w => w.charAt(0))
                .join('');
         };
         
         const acronym = getAcronym(name);
         const baseCode = `${dept.code}_${acronym}`;
         finalCode = baseCode;

         // Ensure unique code globally
         let counter = 1;
         while (await prisma.position.findUnique({ where: { code: finalCode } })) {
             finalCode = `${baseCode}_${counter}`;
             counter++;
         }
    } else {
        // Check provided code uniqueness globally
        const existingCode = await prisma.position.findUnique({ where: { code: finalCode } });
        if (existingCode) {
            return res.status(400).json({ message: 'Mã chức vụ đã tồn tại' });
        }
    }
    
    const data: any = { name, code: finalCode, departmentId };

    const position = await prisma.position.create({
      data
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'POSITION',
      objectId: position.id,
      result: 'SUCCESS',
      newValues: position,
      details: `Created position ${position.name} (${position.code})`,
      req
    });

    res.status(201).json(position);
  } catch (error) {
    console.error('Create position error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo chức vụ' });
  }
};

export const updatePosition = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, code } = req.body;
    
    const position = await prisma.position.findUnique({ where: { id: String(id) } });
    if (!position) return res.status(404).json({ message: 'Chức vụ không tồn tại' });

    // If name changed, check duplicate in same department
    if (name && name !== position.name) {
        const existing = await prisma.position.findFirst({
            where: { 
                name: { equals: name, mode: 'insensitive' },
                departmentId: position.departmentId,
                id: { not: String(id) }
            }
        });
        if (existing) {
            return res.status(400).json({ message: 'Tên chức vụ đã tồn tại trong phòng ban này' });
        }
    }

    const updateData: any = { name };
    if (code && code !== position.code) {
         const existingCode = await prisma.position.findUnique({ where: { code } });
         if (existingCode) return res.status(400).json({ message: 'Mã chức vụ đã tồn tại' });
         updateData.code = code;
    }

    const updated = await prisma.position.update({
        where: { id: String(id) },
        data: updateData
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'POSITION',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: position,
      newValues: updated,
      details: `Updated position ${updated.name}`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Update position error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật chức vụ' });
  }
};

export const deletePosition = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check usage
    const usedByEmp = await prisma.employee.count({ where: { positionId: String(id) } });
    if (usedByEmp > 0) {
        return res.status(400).json({ message: `Không thể xóa: Đang có ${usedByEmp} nhân viên giữ chức vụ này` });
    }

    const deleted = await prisma.position.delete({ where: { id: String(id) } });

    await logAudit({
      ...getAuditUser(req),
      action: 'DELETE',
      object: 'POSITION',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: deleted,
      details: `Deleted position ${deleted.name}`,
      req
    });

    res.json({ message: 'Xóa chức vụ thành công' });
  } catch (error) {
    console.error('Delete position error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa chức vụ' });
  }
};

export const updateEmployeeAvatar = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { avatarUrl } = req.body;
    const currentUser = (req as any).user;
    const targetId = String(id);
    const uid = currentUser?.id != null ? String(currentUser.id) : '';

    // Check permissions: MANAGE_HR, FULL_ACCESS, or current user is the target
    const isAllowed = 
        currentUser.permissions?.includes('MANAGE_HR') || 
        currentUser.permissions?.includes('FULL_ACCESS') || 
        uid === targetId;

    if (!isAllowed) {
        return res.status(403).json({ message: 'Không có quyền thay đổi ảnh đại diện' });
    }

    const currentEmp = await prisma.employee.findUnique({ where: { id: targetId } });
    if (!currentEmp) {
        return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
    }

    const nextStored = normalizeUploadUrlForStorage(avatarUrl);

    const updated = await prisma.employee.update({
        where: { id: targetId },
        data: { avatarUrl: nextStored }
    });

    // Delete old avatar if exists and different
    // IMPORTANT: If filenames are identical (Code_Name.jpg), the middleware already overwrote the file on disk.
    // We only need to delete if the filename CHANGED (e.g. name changed, or old format).
    // If currentEmp.avatarUrl === avatarUrl, it means the filename is the same, so we do nothing (the new file is already there).
    if (currentEmp.avatarUrl && normalizeUploadUrlForStorage(currentEmp.avatarUrl) !== nextStored) {
        try {
            const relativePath = localRelativePathFromUploadUrl(currentEmp.avatarUrl);
            if (relativePath) {
                const absolutePath = path.join(getRootDir(), relativePath);
                if (fs.existsSync(absolutePath)) {
                    fs.unlinkSync(absolutePath);
                }
            }
        } catch (err) {
            console.error('Failed to delete old avatar:', err);
            // Don't fail the request, just log
        }
    }

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'EMPLOYEE',
      objectId: targetId,
      result: 'SUCCESS',
      details: `Updated avatar for ${updated.fullName}`,
      req
    });

    res.json(updated);
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật ảnh đại diện' });
  }
};

export const uploadAvatar = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Chưa chọn file tải lên' });
    }

    const body = req.body as { employeeId?: string };
    const employeeId = body?.employeeId != null ? String(body.employeeId).trim() : '';
    if (employeeId) {
      const currentUser = (req as any).user;
      const canUpload =
        String(currentUser?.id) === employeeId ||
        currentUser?.permissions?.includes('MANAGE_HR') ||
        currentUser?.permissions?.includes('FULL_ACCESS') ||
        isTechnicalAdminRoleCode(currentUser?.roleGroupCode);
      if (!canUpload) {
        try {
          const p = (req.file as Express.Multer.File & { path?: string }).path;
          if (p && fs.existsSync(p)) {
            fs.unlinkSync(p);
          }
        } catch {
          /* ignore */
        }
        return res.status(403).json({ message: 'Không có quyền tải ảnh đại diện cho nhân viên này' });
      }
    }

    const fileUrl = `/uploads/avatars/${req.file.filename}`;
    res.json({ url: toPublicUploadUrl(fileUrl) });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: 'Lỗi khi tải lên ảnh đại diện' });
  }
};

// --- Subsidiary Controllers ---

export const createSubsidiary = async (req: Request, res: Response) => {
  try {
    const { name, code } = req.body;
    if (!name) return res.status(400).json({ message: 'Vui lòng nhập tên công ty con' });
    // Generate Cxx code (01-99) if not provided
    if (!code) {
        const prefix = 'C';
        const lastSub = await prisma.subsidiary.findFirst({
            where: { code: { startsWith: prefix } },
            orderBy: { code: 'desc' }
        });

        let sequence = '01';
        if (lastSub) {
             const lastSeqStr = lastSub.code.slice(prefix.length);
             if (/^\d+$/.test(lastSeqStr)) {
                 const lastSeq = parseInt(lastSeqStr);
                 sequence = (lastSeq + 1).toString().padStart(2, '0');
             }
        }
        
        const finalCode = `${prefix}${sequence}`;
        
        // Ensure within limit
        if (parseInt(sequence) > 99) {
             return res.status(400).json({ message: 'Đã hết mã Công ty con tự động (C01-C99)' });
        }
        
        const subsidiary = await prisma.subsidiary.create({
          data: { name, code: finalCode }
        });

        await logAudit({
          ...getAuditUser(req),
          action: 'CREATE',
          object: 'SUBSIDIARY',
          objectId: subsidiary.id,
          result: 'SUCCESS',
          newValues: subsidiary,
          details: `Created subsidiary ${subsidiary.name} (${subsidiary.code})`,
          req
        });

        return res.status(201).json(subsidiary);
    }

    if (!/^C\d{2}$/.test(code)) return res.status(400).json({ message: 'Mã công ty con phải có định dạng Cxx (ví dụ C01)' });

    const upperCode = code.toUpperCase();

    // Check code uniqueness
    const existingCode = await prisma.subsidiary.findUnique({ where: { code: upperCode } });
    if (existingCode) {
        return res.status(400).json({ message: 'Mã công ty con đã tồn tại' });
    }

    const subsidiary = await prisma.subsidiary.create({
      data: { name, code: upperCode }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'CREATE',
      object: 'SUBSIDIARY',
      objectId: subsidiary.id,
      result: 'SUCCESS',
      newValues: subsidiary,
      details: `Created subsidiary ${subsidiary.name} (${subsidiary.code})`,
      req
    });

    res.status(201).json(subsidiary);
  } catch (error) {
    console.error('Create subsidiary error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo công ty con' });
  }
};

export const updateSubsidiary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const oldSubsidiary = await prisma.subsidiary.findUnique({ where: { id: String(id) } });
    const { name, code } = req.body;
    
    if (!name) return res.status(400).json({ message: 'Vui lòng nhập tên công ty con' });
    if (code && code.length !== 3) return res.status(400).json({ message: 'Mã công ty con phải có đúng 3 ký tự' });

    const upperCode = code ? code.toUpperCase() : undefined;

    if (upperCode) {
        const existingCode = await prisma.subsidiary.findUnique({ where: { code: upperCode } });
        if (existingCode && existingCode.id !== id) {
            return res.status(400).json({ message: 'Mã công ty con đã tồn tại' });
        }
    }

    const subsidiary = await prisma.subsidiary.update({
      where: { id: String(id) },
      data: { name, code: upperCode }
    });

    await logAudit({
      ...getAuditUser(req),
      action: 'UPDATE',
      object: 'SUBSIDIARY',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: oldSubsidiary,
      newValues: subsidiary,
      details: `Updated subsidiary ${subsidiary.name}`,
      req
    });

    res.json(subsidiary);
  } catch (error) {
    console.error('Update subsidiary error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật công ty con' });
  }
};

export const deleteSubsidiary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Check dependencies (employees)
    const sub = await prisma.subsidiary.findUnique({
      where: { id: String(id) },
      include: { _count: { select: { employees: true } } }
    });

    if (sub && sub._count.employees > 0) {
        return res.status(400).json({ message: 'Không thể xóa công ty con đang có nhân viên trực thuộc' });
    }

    const deleted = await prisma.subsidiary.delete({ where: { id: String(id) } });

    await logAudit({
      ...getAuditUser(req),
      action: 'DELETE',
      object: 'SUBSIDIARY',
      objectId: String(id),
      result: 'SUCCESS',
      oldValues: deleted,
      details: `Deleted subsidiary ${deleted.name}`,
      req
    });

    res.json({ message: 'Đã xóa công ty con' });
  } catch (error) {
    console.error('Delete subsidiary error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa công ty con' });
  }
};

export const assignRoleGroup = async (req: Request, res: Response) => {
  try {
    const { roleGroupId, employeeIds, departmentId, divisionId } = req.body;
    
    if (!roleGroupId) {
        return res.status(400).json({ message: 'Vui lòng chọn Nhóm quyền' });
    }

    // Kiểm tra nhóm ADM - chỉ cho phép 1 người duy nhất
    const roleGroup = await prisma.roleGroup.findUnique({ where: { id: roleGroupId } });
    if (roleGroup?.code === ROLE_CODES.SYSTEM_ADMINISTRATOR) {
        // Đếm số người sẽ được gán
        let targetCount = 0;
        if (employeeIds && Array.isArray(employeeIds)) {
            targetCount = employeeIds.length;
        } else if (departmentId || divisionId) {
            // Không cho phép gán ADM cho cả phòng/khối
            return res.status(400).json({ 
                message: 'Nhóm quyền "Quản trị viên hệ thống" chỉ được gán cho 1 người duy nhất. Không thể gán cho cả Phòng ban hoặc Khối.' 
            });
        }

        if (targetCount > 1) {
            return res.status(400).json({ 
                message: 'Nhóm quyền "Quản trị viên hệ thống" chỉ được gán cho 1 người duy nhất.' 
            });
        }

        // Kiểm tra đã có ai thuộc nhóm ADM chưa
        const existingAdmin = await prisma.employee.findFirst({
            where: { roleGroupId: roleGroupId },
            select: { id: true, fullName: true }
        });

        if (existingAdmin && employeeIds && !employeeIds.includes(existingAdmin.id)) {
            return res.status(400).json({ 
                message: `Nhóm quyền "Quản trị viên hệ thống" đã được gán cho "${existingAdmin.fullName}". Chỉ được phép 1 người duy nhất.` 
            });
        }
    }

    const where: any = {};
    
    if (employeeIds && Array.isArray(employeeIds) && employeeIds.length > 0) {
        where.id = { in: employeeIds };
    } else if (departmentId) {
        // Recursive department logic to include sub-departments
        const allDepts = await prisma.department.findMany({ select: { id: true, parentId: true } });
        
        const getChildIds = (parentId: string): string[] => {
            const children = allDepts.filter(d => d.parentId === parentId);
            let ids = children.map(c => c.id);
            for (const child of children) {
                ids = [...ids, ...getChildIds(child.id)];
            }
            return ids;
        };
        
        const targetDeptIds = [departmentId, ...getChildIds(departmentId)];
        where.departmentId = { in: targetDeptIds };
    } else if (divisionId) {
        where.department = { divisionId };
    } else {
        return res.status(400).json({ message: 'Vui lòng chọn đối tượng (Nhân viên, Phòng ban hoặc Khối)' });
    }

    const result = await prisma.employee.updateMany({
        where,
        data: { roleGroupId }
    });

    await logAudit({
        ...getAuditUser(req),
        action: 'UPDATE',
        object: 'EMPLOYEE_ROLE_GROUP',
        result: 'SUCCESS',
        details: `Assigned RoleGroup ${roleGroupId} to ${result.count} employees`,
        req
    });

    res.json({ success: true, count: result.count, message: `Đã cập nhật quyền cho ${result.count} nhân viên` });
  } catch (error) {
    console.error('Assign Role Group error:', error);
    res.status(500).json({ message: 'Lỗi hệ thống khi gán quyền' });
  }
};

export const importEmployees = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng tải lên file Excel' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(req.file.buffer) as any);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount <= 1) {
      return res.status(400).json({ message: 'File Excel trống' });
    }

    const headerRow = sheet.getRow(1);
    const headerCellText = (value: any): string => {
      if (value == null) return '';
      if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
      if (typeof value === 'object' && Array.isArray((value as any).richText)) {
        return String(
          (value as any).richText.map((rt: any) => String(rt?.text ?? '')).join('')
        ).trim();
      }
      return String(value).trim();
    };
    const normalizeHeader = (s: string) => s.replace(/\s*\*+\s*$/, '').trim();
    const headers: string[] = [];
    const colToSpecKey = new Map<number, string>();
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const raw = normalizeHeader(headerCellText(cell.value));
      headers[colNumber] = raw;
      const spec = HR_EMPLOYEE_SHEET_COLUMNS.find((c) => c.header.trim() === raw);
      if (spec) colToSpecKey.set(colNumber, spec.key);
    });

    const data: any[] = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      const obj: any = {};
      let hasValue = false;
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const headerKey = headers[colNumber];
        if (headerKey) {
          obj[headerKey] = cell.value;
          const sk = colToSpecKey.get(colNumber);
          if (sk) obj[sk] = cell.value;
        }
        if (cell.value != null && cell.value !== '') hasValue = true;
      });
      if (hasValue) data.push(obj);
    }

    if (data.length === 0) {
      return res.status(400).json({ message: 'File Excel trống' });
    }

    await ensureOrgRootCompany();
    const impOrgId = (await getKagriOrganizationId()) ?? (await getDefaultOrganizationId());
    if (!impOrgId) {
      return res.status(503).json({ message: 'Chưa có tổ chức trong hệ thống — không thể import' });
    }
    await getCompanyRootForOrg(impOrgId);

    const [employmentTypes, statuses, employeeTypes, roleGroups] = await Promise.all([
      prisma.employmentType.findMany(),
      prisma.employeeStatus.findMany(),
      prisma.employeeType.findMany(),
      prisma.roleGroup.findMany({ select: { id: true, name: true, code: true } }),
    ]);

    const results = {
      total: data.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
      duplicates: [] as {
        row: number;
        phone?: string;
        emailPersonal?: string;
        reason?: string;
        existing: { id: string; code: string; fullName: string; departmentUnit?: string };
      }[],
    };

    const hrUnits = await prisma.hrDepartmentUnit.findMany();

    const normalize = (str: string) => str?.trim().toLowerCase();

    const rowGet = (row: any, specKey: string, ...legacyKeys: string[]) => {
      const v = row[specKey];
      if (v != null && v !== '') return v;
      for (const k of legacyKeys) {
        const x = row[k];
        if (x != null && x !== '') return x;
      }
      return undefined;
    };

    const parseDate = (value: any): Date | null => {
      if (value === null || value === undefined || value === '') return null;

      if (value instanceof Date) {
        const d = new Date(value.getTime());
        return isNaN(d.getTime()) ? null : d;
      }

      if (typeof value === 'number') {
        const excelEpoch = new Date(1899, 11, 30);
        const d = new Date(excelEpoch.getTime() + value * 86400000);
        return isNaN(d.getTime()) ? null : d;
      }

      const s = String(value).trim();
      if (!s) return null;

      const iso = new Date(s);
      if (!isNaN(iso.getTime())) return iso;

      const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) {
        const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return isNaN(d.getTime()) ? null : d;
      }

      return null;
    };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rowNum = i + 2; // Excel row number (1-header)

      try {
        const fullName = rowGet(row, 'fullName', 'Họ và tên', 'Full Name');
        const phone = rowGet(row, 'phone', 'Số điện thoại', 'Phone');
        const emailPersonal = rowGet(row, 'emailPersonal', 'Email cá nhân', 'Personal Email');
        const emailCompany = rowGet(
          row,
          'emailCompany',
          'Email công ty',
          'Email Công ty',
          'Company Email'
        );
        const genderRaw = rowGet(row, 'gender', 'Giới tính', 'Gender');
        const dobRaw = rowGet(row, 'dob', 'Ngày sinh', 'Date of Birth');
        const hrUnitRaw = rowGet(row, 'departmentUnit', 'Bộ phận', 'bộ phận');

        if (!fullName || !phone || !emailPersonal) {
          throw new Error(`Thiếu thông tin bắt buộc (Họ tên, SĐT, Email cá nhân)`);
        }

        if (!genderRaw) {
          throw new Error('Thiếu thông tin Giới tính');
        }

        if (!dobRaw) {
          throw new Error('Thiếu thông tin Ngày sinh');
        }

        if (!hrUnitRaw || !String(hrUnitRaw).trim()) {
          throw new Error('Thiếu thông tin Bộ phận');
        }

        const dob = parseDate(dobRaw);
        if (!dob) throw new Error('Ngày sinh không hợp lệ');

        const genderNormalized = normalize(String(genderRaw));
        let gender = 'Khác';
        if (['nam', 'male', 'm'].includes(genderNormalized)) {
          gender = 'Nam';
        } else if (['nữ', 'nu', 'female', 'f'].includes(genderNormalized)) {
          gender = 'Nữ';
        } else if (['khác', 'khac', 'other', 'o'].includes(genderNormalized)) {
          gender = 'Khác';
        } else {
          throw new Error('Giới tính không hợp lệ (chỉ chấp nhận Nam, Nữ, Khác)');
        }

        const codeFromFileEarly = rowGet(row, 'code', 'Mã NV');
        const trimmedCodeEarly =
          codeFromFileEarly && String(codeFromFileEarly).trim() ? String(codeFromFileEarly).trim() : null;

        let updateTargetId: string | null = null;
        if (trimmedCodeEarly) {
          const existingByCode = await prisma.employee.findUnique({
            where: { code: trimmedCodeEarly },
            select: { id: true },
          });
          if (existingByCode) {
            updateTargetId = existingByCode.id;
            const dupOther = await findDuplicateEmployeeByPhoneOrEmail({
              phone,
              emailPersonal,
              excludeEmployeeId: existingByCode.id,
            });
            if (dupOther.length) {
              const e0 = dupOther[0]!;
              results.duplicates.push({
                row: rowNum,
                phone: String(phone),
                emailPersonal: String(emailPersonal),
                existing: {
                  id: e0.id,
                  code: e0.code,
                  fullName: e0.fullName,
                  departmentUnit: e0.hrDepartmentUnit?.name || '—',
                },
                reason: 'SĐT hoặc email khác với mã NV này đã thuộc nhân viên khác',
              });
              results.failed++;
              continue;
            }
          }
        }

        if (!updateTargetId) {
          const existingList = await findDuplicateEmployeeByPhoneOrEmail({
            phone,
            emailPersonal,
          });
          const existing = existingList[0];

          if (existing) {
            results.duplicates.push({
              row: rowNum,
              phone: String(phone),
              emailPersonal: String(emailPersonal),
              existing: {
                id: existing.id,
                code: existing.code,
                fullName: existing.fullName,
                departmentUnit: existing.hrDepartmentUnit?.name || '—',
              },
            });
            results.failed++;
            continue;
          }
        }

        const hrJobTitleRaw = rowGet(row, 'hrJobTitle', 'Chức danh', 'Vị trí', 'Position');
        const statusName = rowGet(row, 'status', 'Trạng thái', 'Status');
        const typeName = rowGet(row, 'employmentType', 'Loại hợp đồng', 'Contract Type');
        const employeeTypeRaw = rowGet(row, 'employeeType', 'Loại nhân viên');
        if (!employeeTypeRaw) {
          throw new Error('Thiếu thông tin Loại nhân viên');
        }
        const employeeTypeRow = employeeTypes.find(
          (t) =>
            normalize(String(t.name || '')) === normalize(String(employeeTypeRaw)) ||
            normalize(String(t.code || '')) === normalize(String(employeeTypeRaw))
        );
        if (!employeeTypeRow) {
          throw new Error(`Không tìm thấy Loại nhân viên: ${employeeTypeRaw}`);
        }

        const roleGroupRaw = rowGet(row, 'roleGroup', 'Nhóm quyền');
        let roleGroupResolved: { id: string } | null = null;
        if (roleGroupRaw) {
          roleGroupResolved =
            roleGroups.find(
              (rg) =>
                normalize(String(rg.name || '')) === normalize(String(roleGroupRaw)) ||
                normalize(String(rg.code || '')) === normalize(String(roleGroupRaw))
            ) || null;
          if (!roleGroupResolved) {
            throw new Error(`Không tìm thấy Nhóm quyền: ${roleGroupRaw}`);
          }
        }

        let hrUnit = hrUnits.find(
          (u) =>
            normalize(String(u.name)) === normalize(String(hrUnitRaw)) ||
            normalize(String(u.code || '')) === normalize(String(hrUnitRaw))
        );
        if (!hrUnit) {
          const nm = String(hrUnitRaw).trim();
          let code = slugCode(nm).slice(0, 20) || 'BP';
          let n = 0;
          while (await prisma.hrDepartmentUnit.findFirst({ where: { code } })) {
            n++;
            code = `${slugCode(nm).slice(0, 16)}_${n}`;
          }
          hrUnit = await prisma.hrDepartmentUnit.create({
            data: { name: nm, code, sortOrder: hrUnits.length },
          });
          hrUnits.push(hrUnit);
        }

        const hrJobTitle =
          hrJobTitleRaw && String(hrJobTitleRaw).trim() ? String(hrJobTitleRaw).trim() : null;

        let status = statuses.find((s) => normalize(s.name) === normalize(statusName) || s.code === statusName);
        if (!status) status = statuses.find((s) => s.code === 'WORKING');

        let empType = employmentTypes.find((t) => normalize(t.name) === normalize(typeName));
        if (!empType) empType = employmentTypes.find((t) => t.code === 'PROBATION' || t.code === 'probation');
        if (!empType && employmentTypes.length > 0) empType = employmentTypes[0];

        const subsidiaryRaw = rowGet(row, 'subsidiary', 'Công ty con', 'Subsidiary');
        let subsidiariesInput: any[] | undefined;
        if (typeof subsidiaryRaw === 'string') {
          const parts = subsidiaryRaw.split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);
          if (parts.length > 0) {
            subsidiariesInput = parts;
          }
        } else if (Array.isArray(subsidiaryRaw)) {
          subsidiariesInput = subsidiaryRaw;
        }

        let subsidiaryData;
        if (subsidiariesInput && subsidiariesInput.length > 0) {
          subsidiaryData = await processSubsidiaries(subsidiariesInput);
        }

        const bankName = rowGet(row, 'bankName', 'Tên ngân hàng', 'Ngân hàng', 'Bank Name');
        const bankAccountNumber = rowGet(row, 'bankAccount', 'Số tài khoản', 'Account Number');
        const bankAccountHolder = rowGet(row, 'bankHolder', 'Chủ tài khoản', 'Account Holder');

        if (bankName || bankAccountNumber || bankAccountHolder) {
          if (!bankName || !bankAccountNumber || !bankAccountHolder) {
            throw new Error('Thông tin ngân hàng phải đầy đủ (Tên, Số tài khoản, Chủ tài khoản) hoặc để trống hết');
          }
        }

        const vehicleTypeRaw = rowGet(row, 'vehicleType', 'Loại xe', 'Vehicle Type');
        const vehicleName = rowGet(row, 'vehicleName', 'Tên xe', 'Vehicle Name');
        const vehicleLicensePlate = rowGet(row, 'vehiclePlate', 'Biển số', 'License Plate');
        const vehicleColor = rowGet(row, 'vehicleColor', 'Màu xe', 'Vehicle Color');
        const filePath = rowGet(row, 'filePath', 'Đường dẫn tệp', 'File Path');
        const address = rowGet(row, 'address', 'Địa chỉ', 'Address');

        const contractEffRaw = rowGet(row, 'contractEffective', 'Ngày hiệu lực HĐ');
        const contractEndRaw = rowGet(row, 'contractEnd', 'Ngày hết hạn HĐ');
        const rowContractEffective = contractEffRaw ? parseDate(contractEffRaw) : null;
        const rowContractEnd = contractEndRaw ? parseDate(contractEndRaw) : null;
        if (rowContractEffective && rowContractEnd && rowContractEnd < rowContractEffective) {
          throw new Error('Ngày hết hạn HĐ phải sau hoặc bằng ngày hiệu lực');
        }
        const importImpliesProbation = employmentTypeImpliesProbation(empType?.code);

        if (vehicleTypeRaw || vehicleLicensePlate || vehicleColor || vehicleName) {
          if (!vehicleTypeRaw || !vehicleLicensePlate || !vehicleColor || !vehicleName) {
            throw new Error('Thông tin phương tiện phải đầy đủ (Loại xe, Tên xe, Biển số, Màu xe) hoặc để trống hết');
          }
        }

        const bankAccounts: any[] = [];
        if (bankName && bankAccountNumber) {
          let bank = await prisma.bank.findFirst({
            where: { name: { equals: String(bankName), mode: 'insensitive' } }
          });
          if (!bank) {
            const base = String(bankName).substring(0, 3).toUpperCase();
            const bankCode = 'BANK-' + base + Math.floor(Math.random() * 1000);
            bank = await prisma.bank.create({
              data: { name: String(bankName), code: bankCode }
            });
          }
          bankAccounts.push({
            bankId: bank.id,
            accountNumber: String(bankAccountNumber),
            accountHolder: String(bankAccountHolder || fullName),
            isPrimary: true
          });
        }

        const vehicles: any[] = [];
        if (vehicleLicensePlate) {
          const vtNorm = normalize(String(vehicleTypeRaw || ''));
          let vehicleType = String(vehicleTypeRaw || '');
          if (!vehicleType) {
            vehicleType = 'motorbike';
          } else if (['xe máy', 'xe may', 'motorbike', 'moto'].includes(vtNorm)) {
            vehicleType = 'motorbike';
          } else if (['ô tô', 'oto', 'car', 'xe ô tô', 'xe oto'].includes(vtNorm)) {
            vehicleType = 'car';
          }
          vehicles.push({
            type: vehicleType,
            name: vehicleName ? String(vehicleName) : null,
            color: vehicleColor ? String(vehicleColor) : null,
            licensePlate: String(vehicleLicensePlate)
          });
        }

        const codeFromFile = rowGet(row, 'code', 'Mã NV');
        const prefix = 'NV';
        let finalCode: string;
        if (updateTargetId && trimmedCodeEarly) {
          finalCode = trimmedCodeEarly;
        } else if (codeFromFile && String(codeFromFile).trim()) {
          finalCode = String(codeFromFile).trim();
        } else {
          const lastEmp = await prisma.employee.findFirst({
            where: { code: { startsWith: prefix } },
            orderBy: { code: 'desc' },
          });
          let sequence = '0000';
          if (lastEmp) {
            const lastSeq = lastEmp.code.replace(prefix, '');
            if (!isNaN(Number(lastSeq))) {
              sequence = String(Number(lastSeq) + 1).padStart(4, '0');
            }
          }
          finalCode = `${prefix}${sequence}`;
        }

        const employeeCreateOrUpdateData = {
          fullName: String(fullName),
          phone: String(phone),
          emailPersonal: String(emailPersonal),
          emailCompany: emailCompany ? String(emailCompany) : null,
          filePath: filePath ? String(filePath) : null,
          address: address ? String(address) : null,
          gender,
          dateOfBirth: dob,
          positionId: null,
          departmentId: null,
          hrDepartmentUnitId: hrUnit.id,
          hrJobTitle,
          statusId: status!.id,
          employmentTypeId: empType!.id,
          employeeTypeId: employeeTypeRow.id,
          roleGroupId: roleGroupResolved?.id ?? null,
          ...(rowContractEffective ? { contractEffectiveDate: rowContractEffective } : {}),
          ...(rowContractEnd ? { contractEndDate: rowContractEnd } : {}),
          ...(importImpliesProbation && rowContractEffective
            ? { probationStartDate: rowContractEffective }
            : {}),
          ...(importImpliesProbation && rowContractEnd ? { probationEndDate: rowContractEnd } : {}),
          ...(importImpliesProbation ? { probationStatus: 'ON_PROBATION' as const } : {}),
        };

        if (updateTargetId) {
          await prisma.employee.update({
            where: { id: updateTargetId },
            data: {
              ...employeeCreateOrUpdateData,
              bankAccounts: bankAccounts.length > 0 ? { deleteMany: {}, create: bankAccounts } : undefined,
              vehicles: vehicles.length > 0 ? { deleteMany: {}, create: vehicles } : undefined,
              subsidiaries: subsidiaryData
                ? {
                    connect: subsidiaryData.connect,
                    create: subsidiaryData.create,
                  }
                : undefined,
            },
          });
          try {
            await ensureCompanyChatGroupForEmployee(updateTargetId);
          } catch (err: any) {
            console.error('Failed to add imported employee to company chat group:', err);
          }
        } else {
          const newEmployee = await prisma.employee.create({
            data: {
              code: finalCode,
              ...employeeCreateOrUpdateData,
              bankAccounts: bankAccounts.length > 0 ? { create: bankAccounts } : undefined,
              vehicles: vehicles.length > 0 ? { create: vehicles } : undefined,
              subsidiaries: subsidiaryData
                ? {
                    connect: subsidiaryData.connect,
                    create: subsidiaryData.create,
                  }
                : undefined,
            },
          });

          try {
            await ensureCompanyChatGroupForEmployee(newEmployee.id);
          } catch (err: any) {
            console.error('Failed to add imported employee to company chat group:', err);
          }
        }

        results.success++;

      } catch (err: any) {
        let errMessage = err?.message || 'Lỗi không xác định';
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          const targets = Array.isArray(err.meta?.target)
            ? err.meta?.target.join(', ')
            : String(err.meta?.target || '');
          if (targets.includes('license_plate')) {
            errMessage =
              'Biển số xe đã tồn tại trong hệ thống. Vui lòng để trống thông tin xe hoặc dùng biển số khác.';
          } else if (targets.includes('code')) {
            errMessage = 'Mã nhân viên đã tồn tại.';
          } else if (targets.includes('phone') || targets.includes('email_personal')) {
            errMessage = 'Số điện thoại hoặc Email cá nhân đã tồn tại.';
          }
        }
        results.failed++;
        results.errors.push(
          `Dòng ${rowNum} (${rowGet(row, 'fullName', 'Họ và tên') || 'N/A'}): ${errMessage}`
        );
      }
    }

    res.json(results);

  } catch (error) {
    console.error('Import employees error:', error);
    res.status(500).json({ message: 'Lỗi khi import file Excel' });
  }
};

export const getEmployeeImportTemplate = async (req: Request, res: Response) => {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template');
    const dataSheet = workbook.addWorksheet('DanhMuc');

    worksheet.columns = HR_EMPLOYEE_SHEET_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width,
    }));

    const [employeeTypes, hrUnits, subsidiaries] = await Promise.all([
      prisma.employeeType.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.hrDepartmentUnit.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.subsidiary.findMany({
        orderBy: { name: 'asc' },
      }),
    ]);

    dataSheet.getCell('A1').value = 'Loại nhân viên';
    employeeTypes.forEach((x, i) => {
      dataSheet.getCell(`A${i + 2}`).value = x.name;
    });
    dataSheet.getCell('B1').value = 'Bộ phận';
    hrUnits.forEach((x, i) => {
      dataSheet.getCell(`B${i + 2}`).value = x.name;
    });
    dataSheet.getCell('C1').value = 'Công ty con';
    subsidiaries.forEach((x, i) => {
      dataSheet.getCell(`C${i + 2}`).value = x.name;
    });
    dataSheet.state = 'veryHidden';

    const sampleRow = worksheet.addRow({
      code: '',
      fullName: 'Nguyễn Văn A',
      gender: 'Nam',
      dob: '1990-01-01',
      phone: '0901234567',
      emailCompany: 'a.nguyen@company.com',
      emailPersonal: 'nguyenvana@gmail.com',
      address: '123 Đường ABC, Phường X, Quận Y, TP.HCM',
      employmentType: 'Chính thức',
      employeeType: 'sales',
      roleGroup: '',
      subsidiary: 'KAGRI',
      departmentUnit: 'Chung',
      hrJobTitle: 'Nhân viên kinh doanh',
      status: 'Đang làm việc',
      contractEffective: '',
      contractEnd: '',
      bankName: 'Vietcombank',
      bankAccount: '0123456789',
      bankHolder: 'Nguyễn Văn A',
      vehicleType: '',
      vehicleName: '',
      vehiclePlate: '',
      vehicleColor: '',
      filePath: 'https://example.com/cv/nguyen-van-a.pdf',
    });

    // Style header + đánh dấu cột bắt buộc bằng dấu * đỏ
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    const requiredKeys = new Set([
      'fullName',
      'gender',
      'dob',
      'phone',
      'emailPersonal',
      'employeeType',
      'departmentUnit',
    ]);
    headerRow.eachCell((cell, col) => {
      const key = String(worksheet.getColumn(col).key || '');
      if (requiredKeys.has(key)) {
        const title = String(cell.value ?? '').trim();
        cell.value = {
          richText: [
            { text: title, font: { bold: true } },
            { text: ' *', font: { bold: true, color: { argb: 'FFFF0000' } } },
          ],
        };
      }
    });

    // Dropdown chọn theo danh mục đang có trên hệ thống
    const keyToCol = new Map<string, number>();
    worksheet.columns.forEach((c: any, idx: number) => keyToCol.set(String(c.key), idx + 1));
    const employeeTypeCol = keyToCol.get('employeeType');
    const departmentUnitCol = keyToCol.get('departmentUnit');
    const subsidiaryCol = keyToCol.get('subsidiary');
    const maxRows = 500;

    const employeeTypeEnd = Math.max(employeeTypes.length + 1, 2);
    const hrUnitEnd = Math.max(hrUnits.length + 1, 2);
    const subsidiaryEnd = Math.max(subsidiaries.length + 1, 2);

    for (let rowIdx = 2; rowIdx <= maxRows; rowIdx++) {
      if (employeeTypeCol) {
        worksheet.getCell(rowIdx, employeeTypeCol).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`DanhMuc!$A$2:$A$${employeeTypeEnd}`],
          showErrorMessage: true,
          errorTitle: 'Giá trị không hợp lệ',
          error: 'Vui lòng chọn Loại nhân viên trong danh sách.',
        };
      }
      if (departmentUnitCol) {
        worksheet.getCell(rowIdx, departmentUnitCol).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`DanhMuc!$B$2:$B$${hrUnitEnd}`],
          showErrorMessage: true,
          errorTitle: 'Giá trị không hợp lệ',
          error: 'Vui lòng chọn Bộ phận trong danh sách.',
        };
      }
      if (subsidiaryCol) {
        worksheet.getCell(rowIdx, subsidiaryCol).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`DanhMuc!$C$2:$C$${subsidiaryEnd}`],
          showErrorMessage: true,
          errorTitle: 'Giá trị không hợp lệ',
          error: 'Vui lòng chọn Công ty con trong danh sách.',
        };
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Employee_Import_Template.xlsx"');

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Get import template error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo file mẫu' });
  }
};
