import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { isTechnicalAdminRoleCode } from '../constants/rbac';
import { getCompanyRootForOrg, getDefaultOrganizationId, getKagriOrganizationId } from '../utils/organizationHelper';

async function resolveDivisionOrgId(req: Request): Promise<string | null> {
  const q = req.query.organizationId;
  if (q && String(q).trim()) {
    const o = await prisma.organization.findUnique({ where: { id: String(q) } });
    if (o) return o.id;
  }
  return getDefaultOrganizationId();
}

export const getDivisions = async (req: Request, res: Response) => {
  try {
    const { function: orgFunc, type } = req.query;
    const directUnderRaw = req.query.directUnderCompanyRoot;
    const directUnderCompanyRoot =
      directUnderRaw === 'true' ||
      directUnderRaw === '1' ||
      String(directUnderRaw || '').toLowerCase() === 'true';

    let organizationId = await resolveDivisionOrgId(req);
    if (directUnderCompanyRoot && !req.query.organizationId) {
      organizationId = (await getKagriOrganizationId()) ?? organizationId;
    }

    if (!organizationId) {
      return res.json([]);
    }

    const where: any = { type: 'DIVISION', organizationId };

    if (orgFunc) {
      where.function = orgFunc;
    }

    if (type) {
      where.type = type;
    }

    if (directUnderCompanyRoot) {
      const companyRoot = await getCompanyRootForOrg(organizationId);
      where.parentId = companyRoot.id;
    }

    const divisions = await prisma.department.findMany({
      where,
      orderBy: { displayOrder: 'asc' },
      include: {
        manager: {
          select: { id: true, code: true, fullName: true, avatarUrl: true }
        },
        _count: {
          select: { children: true }
        }
      }
    });
    
    res.json(divisions);
  } catch (error) {
    console.error('Get divisions error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách KHỐI' });
  }
};

export const getDivisionById = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    
    const division = await prisma.department.findUnique({
      where: { id },
      include: {
        manager: {
          select: { id: true, code: true, fullName: true, avatarUrl: true, phone: true, emailCompany: true }
        },
        children: {
          include: {
            manager: { select: { id: true, fullName: true, avatarUrl: true } },
            _count: { select: { employees: true } }
          }
        },
        salesTargets: {
          where: { year: new Date().getFullYear() }
        }
      }
    });
    
    if (!division || division.type !== 'DIVISION') {
      return res.status(404).json({ message: 'Không tìm thấy KHỐI' });
    }
    
    res.json(division);
  } catch (error) {
    console.error('Get division by id error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin KHỐI' });
  }
};

export const updateDivision = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    const updates = req.body;
    
    const employee = await prisma.employee.findUnique({
      where: { id: user.id },
      select: { roleGroup: { select: { code: true } } },
    });

    if (!isTechnicalAdminRoleCode(employee?.roleGroup?.code)) {
      return res.status(403).json({ message: 'Chỉ quản trị viên mới có quyền cập nhật KHỐI' });
    }
    
    const updateData: any = {};
    
    const allowedFields = [
      'name', 'type', 'function',
      'leadDistributeMethod',
      'autoDistributeCustomer', 'customerDistributeMethod',
      'targetSalesUnitId', 'targetCsUnitId',
      'managerId', 'displayOrder'
    ];
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    }
    
    const division = await prisma.department.update({
      where: { id },
      data: updateData
    });
    
    res.json(division);
  } catch (error) {
    console.error('Update division error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật KHỐI' });
  }
};

export const getDivisionStructure = async (req: Request, res: Response) => {
  try {
    const organizationId = await resolveDivisionOrgId(req);
    if (!organizationId) {
      return res.json({
        developing: [],
        salesOnly: [],
        independent: [],
        resales: [],
      });
    }
    const divisions = await prisma.department.findMany({
      where: { type: 'DIVISION', organizationId },
      orderBy: { displayOrder: 'asc' },
      include: {
        manager: { select: { id: true, fullName: true, avatarUrl: true } },
        salesTargets: {
          where: { year: new Date().getFullYear() },
          select: { annualTarget: true, revenueCalculationNote: true }
        }
      }
    });
    
    const structure = {
      developing: [], 
      salesOnly: divisions.filter(d => d.function === 'SALES'),
      independent: divisions.filter(d => !d.targetSalesUnitId && !d.targetCsUnitId),
      resales: divisions.filter(d => d.function === 'CSKH')
    };
    
    res.json(structure);
  } catch (error) {
    console.error('Get division structure error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy cấu trúc KHỐI' });
  }
};

export const getDivisionTargets = async (req: Request, res: Response) => {
  try {
    const { year } = req.query;
    const currentYear = year ? parseInt(year as string) : new Date().getFullYear();
    const organizationId = await resolveDivisionOrgId(req);
    if (!organizationId) {
      return res.json({
        year: currentYear,
        targets: [],
        summary: { totalTarget: 0, activeCount: 0, developingCount: 0 },
      });
    }

    const companyRoot = await getCompanyRootForOrg(organizationId);

    const targets = await prisma.salesTarget.findMany({
      where: {
        year: currentYear,
        department: {
          type: 'DIVISION',
          organizationId,
          parentId: companyRoot.id,
        },
      },
      include: {
        department: {
          select: { id: true, code: true, name: true, type: true, function: true }
        }
      },
      orderBy: { department: { displayOrder: 'asc' } }
    });
    
    const totalTarget = targets.reduce((sum, t) => sum + Number(t.annualTarget), 0);
    
    res.json({
      year: currentYear,
      targets,
      summary: { totalTarget: totalTarget, activeCount: targets.length, developingCount: 0 }
    });
  } catch (error) {
    console.error('Get division targets error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy mục tiêu KHỐI' });
  }
};
