import { Request, Response } from 'express';
import { HrService } from './hr.service';
import { logAudit, getAuditUser } from '../../utils/auditLog';
import { getPaginationParams } from '../../utils/pagination';
import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';
import { userBypassesHrEmployeeScope, userHasAnyPermission, MARKETING_OWNER_DROPDOWN_READ_PERMISSIONS } from '../../config/routePermissionPolicy';
import { isTechnicalAdminRoleCode } from '../../constants/rbac';
import { getVisibleEmployeeIds } from '../../utils/viewScopeHelper';
import { normalizeUploadUrlForStorage } from '../../config/publicUploadUrl';

export class HrController {
  static async getOrganizations(req: Request, res: Response) {
    try {
      const orgs = await HrService.getOrganizations();
      res.json(orgs);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách tổ chức', error: (error as Error).message });
    }
  }

  static async createOrganization(req: Request, res: Response) {
    try {
      const org = await HrService.createOrganization(req.body);
      const auditUser = getAuditUser(req);
      logAudit({
        ...auditUser,
        action: 'CREATE',
        object: 'Tổ chức',
        details: `Tạo tổ chức mới: ${org.name} (${org.code})`,
        objectId: org.id,
        result: 'SUCCESS',
      });
      res.status(201).json(org);
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi tạo tổ chức', error: (error as Error).message });
    }
  }

  static async updateOrganization(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const org = await HrService.updateOrganization(String(id), req.body);
      const auditUser = getAuditUser(req);
      logAudit({
        ...auditUser,
        action: 'UPDATE',
        object: 'Tổ chức',
        details: `Cập nhật tổ chức: ${org.name}`,
        objectId: org.id,
        result: 'SUCCESS',
      });
      res.json(org);
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi cập nhật tổ chức', error: (error as Error).message });
    }
  }

  static async deleteOrganization(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await HrService.deleteOrganization(String(id));
      const auditUser = getAuditUser(req);
      logAudit({
        ...auditUser,
        action: 'DELETE',
        object: 'Tổ chức',
        details: `Xóa tổ chức ID: ${id}`,
        objectId: String(id),
        result: 'SUCCESS',
      });
      res.json({ success: true, message: 'Đã xóa tổ chức' });
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi xóa tổ chức', error: (error as Error).message });
    }
  }

  // --- HR Catalogs ---
  static async getBanks(req: Request, res: Response) {
    try {
      const banks = await HrService.getBanks();
      res.json(banks);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách ngân hàng' });
    }
  }

  static async getEmploymentTypes(req: Request, res: Response) {
    try {
      const types = await HrService.getEmploymentTypes();
      res.json(types);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách loại hợp đồng' });
    }
  }

  static async getEmployeeStatuses(req: Request, res: Response) {
    try {
      const statuses = await HrService.getEmployeeStatuses();
      res.json(statuses);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách trạng thái nhân viên' });
    }
  }

  static async getEmployeeTypes(req: Request, res: Response) {
    try {
      const includeInactive = req.query.includeInactive === '1';
      const types = await HrService.getEmployeeTypes(includeInactive);
      res.json(types);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách loại nhân viên' });
    }
  }

  static async getRoleGroups(req: Request, res: Response) {
    try {
      const roles = await HrService.getRoleGroups();
      res.json(roles);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách nhóm quyền' });
    }
  }

  static async getHrDepartmentUnits(req: Request, res: Response) {
    try {
      const units = await HrService.getHrDepartmentUnits();
      res.json(units);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách bộ phận HR' });
    }
  }

  static async getSubsidiaries(req: Request, res: Response) {
    try {
      const subs = await HrService.getSubsidiaries();
      res.json(subs);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách công ty con' });
    }
  }

  static async createSubsidiary(req: Request, res: Response) {
    try {
      const sub = await HrService.createSubsidiary(req.body);
      res.status(201).json(sub);
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi tạo công ty con' });
    }
  }

  static async updateSubsidiary(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const sub = await HrService.updateSubsidiary(String(id), req.body);
      res.json(sub);
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi cập nhật công ty con' });
    }
  }

  static async deleteSubsidiary(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await HrService.deleteSubsidiary(String(id));
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi xóa công ty con' });
    }
  }

  static async createEmployeeType(req: Request, res: Response) {
    try {
      const type = await HrService.createEmployeeType(req.body);
      res.status(201).json(type);
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi tạo loại nhân viên' });
    }
  }

  static async updateEmployeeType(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const type = await HrService.updateEmployeeType(String(id), req.body);
      res.json(type);
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi cập nhật loại nhân viên' });
    }
  }

  static async deleteEmployeeType(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await HrService.deleteEmployeeType(String(id));
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi xóa loại nhân viên' });
    }
  }

  static async createHrDepartmentUnit(req: Request, res: Response) {
    try {
      const unit = await HrService.createHrDepartmentUnit(req.body);
      res.status(201).json(unit);
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi tạo bộ phận HR' });
    }
  }

  static async updateHrDepartmentUnit(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const unit = await HrService.updateHrDepartmentUnit(String(id), req.body);
      res.json(unit);
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi cập nhật bộ phận HR' });
    }
  }

  static async deleteHrDepartmentUnit(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await HrService.deleteHrDepartmentUnit(String(id));
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ message: 'Lỗi khi xóa bộ phận HR' });
    }
  }

  // --- Employee Reading ---
  static async getEmployees(req: Request, res: Response) {
    try {
      const { search, positionId, roleGroupId, employeeTypeId, status, salesType } = req.query;
      const marketingOwnerOptionsRaw = req.query.marketingOwnerOptions;
      const marketingOwnerOptions =
        marketingOwnerOptionsRaw === '1' ||
        marketingOwnerOptionsRaw === 'true' ||
        String(marketingOwnerOptionsRaw || '').toLowerCase() === 'yes';
      
      const { page, limit, skip } = getPaginationParams(req.query);

      const organizationId = String(req.query.organizationId || '').trim();
      const hrDepartmentUnitId = String(req.query.hrDepartmentUnitId || '').trim();
      const departmentId = String(req.query.departmentId || '').trim();
      const subsidiaryId = String(req.query.subsidiaryId || '').trim();

      const where: any = { AND: [] };

      const currentUser = (req as any).user;
      const perms = (currentUser?.permissions || []) as string[];
      const skipHrScopeForRbac = userBypassesHrEmployeeScope(perms);

      if (marketingOwnerOptions) {
        const canUseMarketingOwnerList =
          isTechnicalAdminRoleCode(currentUser?.roleGroupCode) ||
          perms.includes('FULL_ACCESS') ||
          userHasAnyPermission(perms, [...MARKETING_OWNER_DROPDOWN_READ_PERMISSIONS]);
        if (!canUseMarketingOwnerList) {
          return res.status(403).json({
            message: 'Không có quyền lấy danh sách nhân viên Marketing cho gán khách.',
          });
        }
      }

      let hrVisibleIds: string[] | null = null;
      if (currentUser?.id && !skipHrScopeForRbac) {
        const emp = await prisma.employee.findUnique({
          where: { id: String(currentUser.id) },
          select: { id: true, departmentId: true, roleGroupId: true },
        });
        if (emp) {
          hrVisibleIds = await getVisibleEmployeeIds(
            {
              id: emp.id,
              roleGroupId: String(emp.roleGroupId),
              departmentId: emp.departmentId,
              permissions: currentUser.permissions,
              roleGroupCode: currentUser.roleGroupCode ?? null,
            },
            'HR'
          );
          if (hrVisibleIds !== null && hrVisibleIds.length === 0) {
            hrVisibleIds = [String(currentUser.id)];
          }
        }
      }

      if (organizationId && hrVisibleIds === null) {
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
      if (departmentId) where.AND.push({ departmentId });
      if (hrDepartmentUnitId) where.AND.push({ hrDepartmentUnitId });
      if (subsidiaryId) where.AND.push({ subsidiaries: { some: { id: subsidiaryId } } });
      if (status) where.AND.push({ status: { code: String(status) } });
      if (salesType && String(salesType) !== 'undefined' && String(salesType) !== '') {
        where.AND.push({ salesType: String(salesType) });
      }

      if (marketingOwnerOptions) {
        where.AND.push({
          OR: [
            { employeeType: { code: 'marketing' } },
            { salesType: 'MARKETING' },
            { salesType: 'marketing' },
          ],
        });
      }

      const { employees, total } = await HrService.getEmployees({
        where, skip, take: limit, marketingOwnerOptions
      }, hrVisibleIds);

      res.json({
        data: employees,
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
  }

  static async getEmployeeById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const employee = await HrService.getEmployeeById(String(id));
      if (!employee) return res.status(404).json({ message: 'Không tìm thấy nhân viên' });
      res.json(employee);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy thông tin nhân viên' });
    }
  }

  static async getEmployeesBirthdaysInMonth(req: Request, res: Response) {
    try {
      const month = Number(req.query.month) || new Date().getMonth() + 1;
      
      const currentUser = (req as any).user;
      const perms = (currentUser?.permissions || []) as string[];
      const skipHrScope = userBypassesHrEmployeeScope(perms);
      
      let hrVisibleIds: string[] | null = null;
      if (currentUser?.id && !skipHrScope) {
        const emp = await prisma.employee.findUnique({
          where: { id: String(currentUser.id) },
          select: { id: true, departmentId: true, roleGroupId: true },
        });
        if (emp) {
          hrVisibleIds = await getVisibleEmployeeIds(
            {
              id: emp.id,
              roleGroupId: String(emp.roleGroupId),
              departmentId: emp.departmentId,
              permissions: currentUser.permissions,
              roleGroupCode: currentUser.roleGroupCode ?? null,
            },
            'HR'
          );
          if (hrVisibleIds !== null && hrVisibleIds.length === 0) {
            hrVisibleIds = [String(currentUser.id)];
          }
        }
      }

      const result = await HrService.getEmployeesBirthdaysInMonth(month, hrVisibleIds);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: 'Lỗi khi lấy danh sách sinh nhật nhân viên' });
    }
  }

  static async createEmployee(req: Request, res: Response) {
    try {
      const data = { ...req.body };
      delete data.departmentId;
      delete data.positionId;

      const newEmployee = await HrService.createEmployee(data);

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
    } catch (error: any) {
      console.error('Create employee error:', error);
      if (error.duplicates) {
        return res.status(400).json({
          message: error.message,
          duplicates: error.duplicates
        });
      }
      
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          return res.status(400).json({ message: 'Dữ liệu trùng (Mã NV hoặc SĐT/Email)' });
        }
      }

      res.status(400).json({ message: error.message || 'Lỗi khi tạo nhân viên' });
    }
  }
}
