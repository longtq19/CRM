import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { marketingEmployeeWhere } from '../constants/roleIdentification';

// Lấy danh sách nhóm nhân viên Marketing
export const getMarketingGroups = async (req: Request, res: Response) => {
  try {
    const groups = await prisma.marketingEmployeeGroup.findMany({
      include: {
        members: {
          include: {
            // We need to manually join employee since it's not a direct relation
          }
        },
        _count: {
          select: { members: true, costs: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    // Get employee details for each group
    const groupsWithEmployees = await Promise.all(groups.map(async (group) => {
      const memberIds = group.members.map(m => m.employeeId);
      const employees = await prisma.employee.findMany({
        where: { id: { in: memberIds } },
        select: {
          id: true,
          code: true,
          fullName: true,
          avatarUrl: true,
          department: { select: { name: true } }
        }
      });

      return {
        ...group,
        employees,
        memberCount: group._count.members,
        costCount: group._count.costs
      };
    }));

    res.json({ success: true, data: groupsWithEmployees });
  } catch (error: any) {
    console.error('Error fetching marketing groups:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Tạo nhóm mới
export const createMarketingGroup = async (req: Request, res: Response) => {
  try {
    const { name, description, employeeIds } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, message: 'Tên nhóm là bắt buộc' });
    }

    // Generate code
    const count = await prisma.marketingEmployeeGroup.count();
    const code = `MKT-GRP-${String(count + 1).padStart(3, '0')}`;

    const group = await prisma.marketingEmployeeGroup.create({
      data: {
        code,
        name,
        description,
        members: employeeIds?.length ? {
          create: employeeIds.map((empId: string) => ({
            employeeId: empId
          }))
        } : undefined
      },
      include: {
        members: true
      }
    });

    res.json({ success: true, data: group, message: 'Tạo nhóm thành công' });
  } catch (error: any) {
    console.error('Error creating marketing group:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Cập nhật nhóm
export const updateMarketingGroup = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, description, isActive, employeeIds } = req.body;

    // Update group info
    const group = await prisma.marketingEmployeeGroup.update({
      where: { id },
      data: {
        name,
        description,
        isActive
      }
    });

    // Update members if provided
    if (employeeIds !== undefined) {
      // Remove all existing members
      await prisma.marketingEmployeeGroupMember.deleteMany({
        where: { groupId: id }
      });

      // Add new members
      if (employeeIds.length > 0) {
        await prisma.marketingEmployeeGroupMember.createMany({
          data: employeeIds.map((empId: string) => ({
            groupId: id,
            employeeId: empId
          }))
        });
      }
    }

    res.json({ success: true, data: group, message: 'Cập nhật nhóm thành công' });
  } catch (error: any) {
    console.error('Error updating marketing group:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Xóa nhóm
export const deleteMarketingGroup = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Check if group has costs assigned
    const costsCount = await prisma.marketingCampaignCost.count({
      where: { employeeGroupId: id }
    });

    if (costsCount > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Không thể xóa nhóm này vì đã có ${costsCount} chi phí được phân bổ` 
      });
    }

    await prisma.marketingEmployeeGroup.delete({
      where: { id }
    });

    res.json({ success: true, message: 'Xóa nhóm thành công' });
  } catch (error: any) {
    console.error('Error deleting marketing group:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Thêm nhân viên vào nhóm
export const addMemberToGroup = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { employeeId } = req.body;

    const member = await prisma.marketingEmployeeGroupMember.create({
      data: {
        groupId: id,
        employeeId
      }
    });

    res.json({ success: true, data: member, message: 'Thêm thành viên thành công' });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ success: false, message: 'Nhân viên đã có trong nhóm' });
    }
    console.error('Error adding member:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Xóa nhân viên khỏi nhóm
export const removeMemberFromGroup = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const employeeId = req.params.employeeId as string;

    await prisma.marketingEmployeeGroupMember.delete({
      where: {
        groupId_employeeId: {
          groupId: id,
          employeeId
        }
      }
    });

    res.json({ success: true, message: 'Xóa thành viên thành công' });
  } catch (error: any) {
    console.error('Error removing member:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Phân bổ chi phí cho nhân viên/nhóm
export const assignCostToEmployees = async (req: Request, res: Response) => {
  try {
    const { costId, employeeIds, groupId } = req.body;

    if (!costId) {
      return res.status(400).json({ success: false, message: 'costId là bắt buộc' });
    }

    // Get the cost
    const cost = await prisma.marketingCampaignCost.findUnique({
      where: { id: costId }
    });

    if (!cost) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy chi phí' });
    }

    let assignedEmployeeIds: string[] = [];

    // If groupId provided, get employees from group
    if (groupId) {
      const groupMembers = await prisma.marketingEmployeeGroupMember.findMany({
        where: { groupId }
      });
      assignedEmployeeIds = groupMembers.map(m => m.employeeId);

      // Update cost with groupId
      await prisma.marketingCampaignCost.update({
        where: { id: costId },
        data: { employeeGroupId: groupId }
      });
    } else if (employeeIds?.length) {
      assignedEmployeeIds = employeeIds;
    }

    if (assignedEmployeeIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Phải chọn ít nhất 1 nhân viên hoặc 1 nhóm' });
    }

    // Calculate allocated amount per employee
    const allocatedAmount = Number(cost.amount) / assignedEmployeeIds.length;

    // Remove existing assignments
    await prisma.marketingCostAssignment.deleteMany({
      where: { costId }
    });

    // Create new assignments
    await prisma.marketingCostAssignment.createMany({
      data: assignedEmployeeIds.map(empId => ({
        costId,
        employeeId: empId,
        allocatedAmount
      }))
    });

    res.json({ 
      success: true, 
      message: `Đã phân bổ chi phí cho ${assignedEmployeeIds.length} nhân viên`,
      allocatedAmount,
      employeeCount: assignedEmployeeIds.length
    });
  } catch (error: any) {
    console.error('Error assigning cost:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Lấy thống kê hiệu suất Marketing với ROAS, CPL, CPA
export const getMarketingPerformanceStats = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, period } = req.query;

    const dateFilter: any = {};
    
    // Handle period parameter
    if (period) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      
      switch (period) {
        case 'day':
          dateFilter.gte = today;
          dateFilter.lte = new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1);
          break;
        case 'week':
          const startOfWeek = new Date(today);
          startOfWeek.setDate(today.getDate() - today.getDay() + 1); // Monday
          dateFilter.gte = startOfWeek;
          dateFilter.lte = now;
          break;
        case 'month':
          dateFilter.gte = new Date(now.getFullYear(), now.getMonth(), 1);
          dateFilter.lte = now;
          break;
        case 'year':
          dateFilter.gte = new Date(now.getFullYear(), 0, 1);
          dateFilter.lte = now;
          break;
        case 'last_year':
          dateFilter.gte = new Date(now.getFullYear() - 1, 0, 1);
          dateFilter.lte = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
          break;
      }
    } else {
      if (startDate) dateFilter.gte = new Date(startDate as string);
      if (endDate) dateFilter.lte = new Date(endDate as string);
    }

    // Get all marketing employees (nguồn chân lý chung + có khách do Marketing sở hữu)
    const marketingEmployees = await prisma.employee.findMany({
      where: {
        OR: [
          ...marketingEmployeeWhere().OR,
          { marketingCustomers: { some: {} } }
        ]
      },
      select: {
        id: true,
        code: true,
        fullName: true,
        avatarUrl: true,
        department: { select: { name: true } }
      }
    });

    const performanceData = await Promise.all(marketingEmployees.map(async (emp) => {
      // Get allocated costs for this employee
      const costAssignments = await prisma.marketingCostAssignment.findMany({
        where: {
          employeeId: emp.id,
          cost: {
            costDate: Object.keys(dateFilter).length > 0 ? dateFilter : undefined
          }
        },
        include: {
          cost: true
        }
      });

      const totalCost = costAssignments.reduce((sum, ca) => sum + Number(ca.allocatedAmount), 0);

      // Get leads created by this employee
      const leads = await prisma.customer.findMany({
        where: {
          marketingOwnerId: emp.id,
          createdAt: Object.keys(dateFilter).length > 0 ? dateFilter : undefined
        },
        select: {
          id: true,
          leadStatus: true,
          totalOrdersValue: true
        }
      });

      const totalLeads = leads.length;
      const qualifiedLeads = leads.filter(l => l.leadStatus === 'QUALIFIED' || l.leadStatus === 'CONVERTED').length;
      const convertedCustomers = leads.filter(l => l.leadStatus === 'CONVERTED').length;

      // Get revenue from converted leads
      const totalRevenue = leads
        .filter(l => l.leadStatus === 'CONVERTED')
        .reduce((sum, l) => sum + Number(l.totalOrdersValue || 0), 0);

      // Calculate metrics
      const cvr = totalLeads > 0 ? (convertedCustomers / totalLeads) * 100 : 0;
      const cpl = totalLeads > 0 ? totalCost / totalLeads : 0;
      const cpa = convertedCustomers > 0 ? totalCost / convertedCustomers : 0;
      const roas = totalCost > 0 ? totalRevenue / totalCost : 0;

      // Calculate composite score (weighted)
      // ROAS: 25%, CVR: 20%, Revenue: 20%, CPL (inverted): 15%, Qualified: 10%, Converted: 10%
      const maxRoas = 10; // Assume max ROAS of 10
      const maxCvr = 50; // Assume max CVR of 50%
      const maxCpl = 500000; // Assume max CPL of 500k (lower is better)
      
      const roasScore = Math.min(roas / maxRoas, 1) * 25;
      const cvrScore = Math.min(cvr / maxCvr, 1) * 20;
      const revenueScore = totalRevenue > 0 ? 20 : 0; // Simplified
      const cplScore = totalCost > 0 ? Math.max(0, (1 - cpl / maxCpl)) * 15 : 0;
      const qualifiedScore = qualifiedLeads > 0 ? 10 : 0;
      const convertedScore = convertedCustomers > 0 ? 10 : 0;

      const compositeScore = roasScore + cvrScore + revenueScore + cplScore + qualifiedScore + convertedScore;

      return {
        employeeId: emp.id,
        employeeCode: emp.code,
        employeeName: emp.fullName,
        avatarUrl: emp.avatarUrl,
        department: emp.department?.name || '',
        
        // Raw metrics
        totalLeads,
        qualifiedLeads,
        convertedCustomers,
        totalCost,
        totalRevenue,
        
        // Calculated KPIs
        cvr: Math.round(cvr * 100) / 100,
        cpl: Math.round(cpl),
        cpa: Math.round(cpa),
        roas: Math.round(roas * 100) / 100,
        
        // Composite score
        compositeScore: Math.round(compositeScore * 100) / 100,
        
        // Individual scores for transparency
        scores: {
          roas: Math.round(roasScore * 100) / 100,
          cvr: Math.round(cvrScore * 100) / 100,
          revenue: Math.round(revenueScore * 100) / 100,
          cpl: Math.round(cplScore * 100) / 100,
          qualified: Math.round(qualifiedScore * 100) / 100,
          converted: Math.round(convertedScore * 100) / 100
        }
      };
    }));

    // Sort by composite score
    performanceData.sort((a, b) => b.compositeScore - a.compositeScore);

    res.json({
      success: true,
      data: performanceData,
      weights: {
        roas: '25%',
        cvr: '20%',
        revenue: '20%',
        cpl: '15%',
        qualified: '10%',
        converted: '10%'
      }
    });
  } catch (error: any) {
    console.error('Error getting performance stats:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
