import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Decimal } from '@prisma/client/runtime/library';

// ==========================================
// SPENDING RANK - Hạng chi tiêu khách hàng
// ==========================================

export const getSpendingRanks = async (req: Request, res: Response) => {
  try {
    const ranks = await prisma.customerSpendingRank.findMany({
      orderBy: { minAmount: 'asc' },
      include: {
        _count: { select: { customers: true } }
      }
    });
    res.json(ranks);
  } catch (error) {
    console.error('Get spending ranks error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách hạng chi tiêu' });
  }
};

export const createSpendingRank = async (req: Request, res: Response) => {
  try {
    const { code, name, minAmount, maxAmount, color, icon } = req.body;

    if (!code || !name || minAmount === undefined || maxAmount === undefined) {
      return res.status(400).json({ message: 'Vui lòng điền đầy đủ thông tin' });
    }

    const existing = await prisma.customerSpendingRank.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Mã hạng đã tồn tại' });
    }

    const rank = await prisma.customerSpendingRank.create({
      data: {
        code,
        name,
        minAmount: new Decimal(minAmount),
        maxAmount: new Decimal(maxAmount)
      }
    });

    res.status(201).json(rank);
  } catch (error) {
    console.error('Create spending rank error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo hạng chi tiêu' });
  }
};

export const updateSpendingRank = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { name, minAmount, maxAmount } = req.body;

    const rank = await prisma.customerSpendingRank.update({
      where: { id },
      data: {
        name,
        minAmount: minAmount !== undefined ? new Decimal(minAmount) : undefined,
        maxAmount: maxAmount !== undefined ? new Decimal(maxAmount) : undefined
      }
    });

    res.json(rank);
  } catch (error) {
    console.error('Update spending rank error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật hạng chi tiêu' });
  }
};

export const deleteSpendingRank = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    // Check if any customers have this rank
    const customersCount = await prisma.customer.count({
      where: { spendingRank: { id } }
    });

    if (customersCount > 0) {
      // Reset customers' rank to null before deleting
      const rank = await prisma.customerSpendingRank.findUnique({ where: { id } });
      if (rank) {
        await prisma.customer.updateMany({
          where: { spendingRankCode: rank.code },
          data: { spendingRankCode: null }
        });
      }
    }

    await prisma.customerSpendingRank.delete({ where: { id } });
    res.json({ success: true, message: `Đã xóa hạng và reset ${customersCount} khách hàng` });
  } catch (error) {
    console.error('Delete spending rank error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa hạng chi tiêu' });
  }
};

// Cập nhật hạng cho một khách hàng dựa trên tổng chi tiêu
export const updateCustomerRank = async (customerId: string) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { totalOrdersValue: true }
    });

    if (!customer) return null;

    const totalSpending = customer.totalOrdersValue || 0;

    // Tìm hạng phù hợp
    const appropriateRank = await prisma.customerSpendingRank.findFirst({
      where: {
        minAmount: { lte: totalSpending },
        maxAmount: { gte: totalSpending }
      },
      orderBy: { minAmount: 'desc' }
    });

    // Cập nhật hạng cho khách hàng
    const updated = await prisma.customer.update({
      where: { id: customerId },
      data: {
        spendingRankCode: appropriateRank?.code || null
      },
      include: {
        spendingRank: true
      }
    });

    return updated;
  } catch (error) {
    console.error('Update customer rank error:', error);
    return null;
  }
};

// Cập nhật hạng cho tất cả khách hàng (batch)
export const recalculateAllCustomerRanks = async (req: Request, res: Response) => {
  try {
    const ranks = await prisma.customerSpendingRank.findMany({
      orderBy: { minAmount: 'asc' }
    });

    if (ranks.length === 0) {
      return res.status(400).json({ message: 'Chưa có cấu hình hạng chi tiêu' });
    }

    // Get all customers
    const customers = await prisma.customer.findMany({
      select: { id: true, totalOrdersValue: true }
    });

    let updated = 0;
    for (const customer of customers) {
      const totalSpending = customer.totalOrdersValue || 0;

      // Find appropriate rank
      let newRankCode: string | null = null;
      for (const rank of ranks) {
        if (totalSpending >= Number(rank.minAmount) && totalSpending <= Number(rank.maxAmount)) {
          newRankCode = rank.code;
          break;
        }
      }

      // Check highest rank if spending exceeds all
      const highestRank = ranks[ranks.length - 1];
      if (!newRankCode && totalSpending > Number(highestRank.maxAmount)) {
        newRankCode = highestRank.code;
      }

      await prisma.customer.update({
        where: { id: customer.id },
        data: { spendingRankCode: newRankCode }
      });
      updated++;
    }

    res.json({ 
      success: true, 
      message: `Đã cập nhật hạng cho ${updated} khách hàng`,
      totalCustomers: customers.length
    });
  } catch (error) {
    console.error('Recalculate all ranks error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật hạng khách hàng' });
  }
};

// API endpoint để cập nhật hạng một khách hàng
export const updateSingleCustomerRank = async (req: Request, res: Response) => {
  try {
    const customerId = req.params.customerId as string;
    const result = await updateCustomerRank(customerId);
    
    if (!result) {
      return res.status(404).json({ message: 'Không tìm thấy khách hàng' });
    }

    res.json({
      success: true,
      customer: result,
      newRank: result.spendingRank?.name || 'Chưa xếp hạng'
    });
  } catch (error) {
    console.error('Update single customer rank error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật hạng' });
  }
};

// Thống kê khách hàng theo hạng
export const getRankStatistics = async (req: Request, res: Response) => {
  try {
    const stats = await prisma.customerSpendingRank.findMany({
      orderBy: { minAmount: 'asc' },
      include: {
        _count: { select: { customers: true } },
        customers: {
          select: { totalOrdersValue: true }
        }
      }
    });

    const result = stats.map(rank => ({
      id: rank.id,
      code: rank.code,
      name: rank.name,
      minAmount: rank.minAmount,
      maxAmount: rank.maxAmount,
      customerCount: rank._count.customers,
      totalRevenue: rank.customers.reduce((sum, c) => sum + (c.totalOrdersValue || 0), 0)
    }));

    // Count customers without rank
    const noRankCount = await prisma.customer.count({
      where: { spendingRankCode: null }
    });

    res.json({
      ranks: result,
      noRankCustomers: noRankCount
    });
  } catch (error) {
    console.error('Get rank statistics error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thống kê' });
  }
};
