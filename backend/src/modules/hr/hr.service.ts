import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { 
  ORG_FUNC_RELAXED_EMPLOYEE_TYPE_MATCH 
} from '../../constants/orgUnitFunctions';

const COMPANY_CHAT_GROUP_NAME = 'Zeno ERP Office';
const COMPANY_GROUP_AVATAR = '/uploads/chat/company-logo.png';

const ORG_FUNC_TO_EMPLOYEE_TYPE_CODE: Record<string, string> = {
  MARKETING: 'marketing',
  SALES: 'sales',
  CSKH: 'customer_service',
};

function normalizeEmailForDuplicate(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

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

function normalizeUploadUrlForStorage(value: string | null): string | null {
  if (!value) return null;
  // Simple normalization for now, might need full implementation later
  return value;
}

export type StaffDeptValidationResult = { ok: true } | { ok: false; status: number; message: string };

export class HrService {
  /**
   * Nhân viên chỉ được gán vào đơn vị lá (DEPARTMENT/TEAM, không có con),
   * không gán vào COMPANY/DIVISION; đơn vị lá phải có `function` và loại NV khớp.
   */
  static async validateEmployeeDepartmentForStaffAssignment(params: {
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

  // --- Org Structure Logic ---
  static async getOrganizations() {
    return prisma.organization.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  static async createOrganization(data: any) {
    return prisma.organization.create({ data });
  }

  static async updateOrganization(id: string, data: any) {
    return prisma.organization.update({ where: { id }, data });
  }

  static async deleteOrganization(id: string) {
    return prisma.organization.delete({ where: { id } });
  }

  // --- HR Catalogs ---
  static async getBanks() {
    return prisma.bank.findMany({ orderBy: { name: 'asc' } });
  }

  static async getEmploymentTypes() {
    return prisma.employmentType.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  static async getEmployeeStatuses() {
    return prisma.employeeStatus.findMany({ orderBy: { sortOrder: 'asc' } });
  }

  static async getEmployeeTypes(includeInactive: boolean = false) {
    const where = includeInactive ? {} : { isActive: true };
    return prisma.employeeType.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });
  }

  static async getRoleGroups() {
    return prisma.roleGroup.findMany({
      include: {
        _count: { select: { employees: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  static async getHrDepartmentUnits() {
    return prisma.hrDepartmentUnit.findMany({
      include: {
        manager: { select: { id: true, fullName: true, code: true } },
        _count: { select: { employees: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  static async getSubsidiaries() {
    return prisma.subsidiary.findMany({ orderBy: { name: 'asc' } });
  }

  static async createHrDepartmentUnit(data: any) {
    return prisma.hrDepartmentUnit.create({ data });
  }

  static async updateHrDepartmentUnit(id: string, data: any) {
    return prisma.hrDepartmentUnit.update({ where: { id }, data });
  }

  static async deleteHrDepartmentUnit(id: string) {
    return prisma.hrDepartmentUnit.delete({ where: { id } });
  }

  static async createEmployeeType(data: any) {
    return prisma.employeeType.create({ data });
  }

  static async updateEmployeeType(id: string, data: any) {
    return prisma.employeeType.update({ where: { id }, data });
  }

  static async deleteEmployeeType(id: string) {
    return prisma.employeeType.delete({ where: { id } });
  }

  static async createSubsidiary(data: any) {
    return prisma.subsidiary.create({ data });
  }

  static async updateSubsidiary(id: string, data: any) {
    return prisma.subsidiary.update({ where: { id }, data });
  }

  static async deleteSubsidiary(id: string) {
    return prisma.subsidiary.delete({ where: { id } });
  }

  // --- Employee Reading ---
  static async getEmployees(params: any, hrVisibleIds: string[] | null) {
    const { 
      where, 
      skip, 
      take, 
      marketingOwnerOptions 
    } = params;

    const baseWhere = { ...where };
    if (hrVisibleIds !== null && !marketingOwnerOptions) {
      baseWhere.id = { in: hrVisibleIds };
    }

    const includeBlock = {
      position: true,
      hrDepartmentUnit: true,
      department: true,
      subsidiaries: true,
      employmentType: true,
      status: true,
      roleGroup: true,
      employeeType: true,
      bankAccounts: { include: { bank: true } },
      vehicles: true,
    } as const;

    const total = await prisma.employee.count({ where: baseWhere });
    let employees;

    try {
      employees = await prisma.employee.findMany({
        where: baseWhere,
        skip,
        take,
        include: includeBlock,
        orderBy: { createdAt: 'desc' },
      });
    } catch (err: any) {
      if (this.isEmployeeTableMissingOptionalColumnP2022(err)) {
        employees = await prisma.employee.findMany({
          where: baseWhere,
          skip,
          take,
          select: this.employeeSelectWithoutNewColumns,
          orderBy: { createdAt: 'desc' },
        });
      } else {
        throw err;
      }
    }

    return {
      employees: employees.map(this.sanitizeEmployeeForHr),
      total,
    };
  }

  static async getEmployeeById(id: string) {
    const employee = await prisma.employee.findUnique({
      where: { id },
      include: {
        position: true,
        hrDepartmentUnit: true,
        department: true,
        subsidiaries: true,
        employmentType: true,
        status: true,
        roleGroup: true,
        employeeType: true,
        bankAccounts: { include: { bank: true } },
        vehicles: true,
      },
    });
    return employee ? this.sanitizeEmployeeForHr(employee) : null;
  }

  // --- Helpers ---
  private static sanitizeEmployeeForHr(emp: any) {
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

  private static isEmployeeTableMissingOptionalColumnP2022(err: unknown): boolean {
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

  private static employeeSelectWithoutNewColumns = {
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

  static async getEmployeesBirthdaysInMonth(month: number, hrVisibleIds: string[] | null) {
    const where: any = {
      AND: [
        { dateOfBirth: { not: null } },
        { status: { isActive: true } },
      ],
    };

    if (hrVisibleIds !== null) {
      where.AND.push({ id: { in: hrVisibleIds } });
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
        return d && new Date(d).getMonth() + 1 === month;
      })
      .sort((a, b) => {
        const dayA = new Date(a.dateOfBirth!).getDate();
        const dayB = new Date(b.dateOfBirth!).getDate();
        return dayA - dayB;
      });

    return {
      count: employees.length,
      data: employees,
    };
  }

  // --- Employee Mutations ---
  static async findDuplicateEmployeeByPhoneOrEmail(params: {
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

  static async generateEmployeeCode(): Promise<string> {
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
    return `${prefix}${sequence}`;
  }

  static async createEmployee(data: any) {
    // Data validation and preparation logic moved from controller
    const birthParsed = parseEmployeeBirthDate(data.dateOfBirth);
    if (!birthParsed.ok) throw new Error(birthParsed.message);

    if (!data.code) {
      data.code = await this.generateEmployeeCode();
    }

    const duplicatedByContact = await this.findDuplicateEmployeeByPhoneOrEmail({
      phone: data.phone,
      emailPersonal: data.emailPersonal,
    });
    if (duplicatedByContact.length > 0) {
      const error: any = new Error('Nhân sự bị trùng theo số điện thoại hoặc email cá nhân.');
      error.duplicates = duplicatedByContact.map((e: any) => ({
        id: e.id,
        code: e.code,
        fullName: e.fullName,
        departmentUnit: e.hrDepartmentUnit?.name || '—',
      }));
      throw error;
    }

    // Resolve master data IDs if needed (skipped for simplicity in this draft, assuming IDs provided)
    // Actually we should resolve them for safety if they are just codes
    
    const impliesProbation = employmentTypeImpliesProbation(data.employmentTypeCode);
    let contractEffectiveDate = parseOptionalContractDate(data.contractEffectiveDate);
    let contractEndDate = parseOptionalContractDate(data.contractEndDate);

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
      employmentTypeId: data.employmentTypeId,
      statusId: data.statusId,
      hrDepartmentUnitId: data.hrDepartmentUnitId,
      hrJobTitle: data.hrJobTitle ? String(data.hrJobTitle).trim() : null,
      employeeTypeId: data.employeeTypeId,
      ...(contractEffectiveDate ? { contractEffectiveDate } : {}),
      ...(contractEndDate ? { contractEndDate } : {}),
      ...(data.probationStatus ? { probationStatus: data.probationStatus } : impliesProbation ? { probationStatus: 'ON_PROBATION' } : {}),
    };

    try {
      const newEmployee = await prisma.employee.create({ data: createData });
      await this.ensureCompanyChatGroupForEmployee(newEmployee.id);
      return newEmployee;
    } catch (err) {
      if (this.isContractDateColumnMissingP2022(err)) {
        const retryData = { ...createData };
        delete retryData.contractEffectiveDate;
        delete retryData.contractEndDate;
        delete retryData.hrJobTitle;
        const newEmployee = await prisma.employee.create({ data: retryData });
        await this.ensureCompanyChatGroupForEmployee(newEmployee.id);
        return newEmployee;
      }
      throw err;
    }
  }

  static async ensureCompanyChatGroupForEmployee(employeeId: string) {
    let group = await prisma.chatGroup.findFirst({
      where: { 
        OR: [
          { name: COMPANY_CHAT_GROUP_NAME },
          { name: 'Zeno ERP' },
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
  }

  private static isContractDateColumnMissingP2022(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { code?: string; meta?: { column?: string } };
    if (e.code !== 'P2022') return false;
    const col = String(e.meta?.column || '');
    return (
      col === 'employees.contract_effective_date' ||
      col === 'employees.contract_end_date'
    );
  }
}
