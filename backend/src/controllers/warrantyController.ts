
import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { getPaginationParams } from '../utils/pagination';

// ----------------------
// PRODUCT SERIALS
// ----------------------

export const getSerials = async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};

    if (search) {
      where.code = { contains: String(search), mode: 'insensitive' };
    }

    if (status) {
      where.status = String(status);
    }

    const [total, serials] = await Promise.all([
      prisma.serial.count({ where }),
      prisma.serial.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          product: {
            select: {
              name: true,
              code: true,
              category: { select: { code: true, name: true } }
            }
          }
        },
      }),
    ]);

    res.json({
      data: serials,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get serials error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách serial' });
  }
};

export const getSerialDetail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const serial = await prisma.serial.findUnique({
      where: { id: String(id) },
      include: {
        product: true,
        claims: {
          orderBy: { createdAt: 'desc' },
          include: {
            technician: {
              select: {
                fullName: true
              }
            }
          }
        },
        logs: {
          orderBy: { performedAt: 'desc' },
          include: {
            performer: {
              select: {
                fullName: true
              }
            }
          }
        }
      }
    });

    if (!serial) {
      return res.status(404).json({ message: 'Không tìm thấy serial' });
    }

    res.json(serial);
  } catch (error) {
    console.error('Get serial detail error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin serial' });
  }
};

// ----------------------
// WARRANTY CLAIMS
// ----------------------

export const getWarrantyClaims = async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};

    if (search) {
      where.OR = [
        { code: { contains: String(search), mode: 'insensitive' } },
        { serial: { code: { contains: String(search), mode: 'insensitive' } } }
      ];
    }

    if (status) {
      where.status = String(status);
    }

    const [total, claims] = await Promise.all([
      prisma.warrantyClaim.count({ where }),
      prisma.warrantyClaim.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          serial: {
            include: {
              product: {
                select: {
                  name: true,
                  code: true
                }
              }
            }
          },
          customer: {
            select: {
              name: true,
              phone: true
            }
          },
          technician: {
            select: {
              fullName: true
            }
          }
        },
      }),
    ]);

    res.json({
      data: claims,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get warranty claims error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách yêu cầu bảo hành' });
  }
};

export const createWarrantyClaim = async (req: Request, res: Response) => {
  try {
    const { serialId, customerId, description, technicianId } = req.body;

    // Generate Claim Code: WC-{YYYYMMDD}-{RANDOM}
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const code = `WC-${dateStr}-${randomSuffix}`;

    const claim = await prisma.warrantyClaim.create({
      data: {
        code,
        serialId,
        customerId,
        description,
        technicianId,
        status: 'PENDING'
      }
    });

    res.status(201).json(claim);
  } catch (error) {
    console.error('Create warranty claim error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo yêu cầu bảo hành' });
  }
};

export const updateWarrantyClaim = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, resolution, cost, technicianId, completedAt } = req.body;

    const claim = await prisma.warrantyClaim.update({
      where: { id: String(id) },
      data: {
        status,
        resolution,
        cost: cost ? Number(cost) : undefined,
        technicianId,
        completedAt: completedAt ? new Date(completedAt) : undefined
      }
    });

    res.json(claim);
  } catch (error) {
    console.error('Update warranty claim error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật yêu cầu bảo hành' });
  }
};
