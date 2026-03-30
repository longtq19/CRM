import { Request, Response } from 'express';
import { prisma } from '../config/database';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getUploadDir } from '../utils/pathHelper';
import { capUploadFileSize } from '../config/publicUploadUrl';
import { isTechnicalAdminRoleCode } from '../constants/rbac';

const UPLOAD_SUB_DIR = 'support-tickets';

const uploadDir = getUploadDir(UPLOAD_SUB_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

export const supportTicketUpload = multer({
  storage,
  limits: { fileSize: capUploadFileSize(10 * 1024 * 1024) },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.zip', '.rar'
    ];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Loại file không được hỗ trợ.'));
    }
  }
});

const isAdminUser = async (userId: string): Promise<boolean> => {
  const employee = await prisma.employee.findUnique({
    where: { id: userId },
    select: { roleGroup: { select: { code: true } } },
  });
  return isTechnicalAdminRoleCode(employee?.roleGroup?.code);
};

async function generateTicketCode(): Promise<string> {
  const last = await prisma.supportTicket.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { code: true }
  });
  let nextNum = 1;
  if (last?.code) {
    const match = last.code.match(/TK-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `TK-${String(nextNum).padStart(4, '0')}`;
}

const ticketInclude = {
  createdBy: { select: { id: true, fullName: true, phone: true, avatarUrl: true, code: true } },
  assignedTo: { select: { id: true, fullName: true, phone: true, avatarUrl: true, code: true } },
  attachments: { orderBy: { createdAt: 'asc' as const } }
};

export const getTickets = async (req: Request, res: Response) => {
  try {
    const userId: string = (req as any).user?.id;
    const admin = await isAdminUser(userId);
    const status = String(req.query.status || 'ALL');

    const where: any = {};
    if (!admin) where.createdById = userId;
    if (status !== 'ALL') where.status = status;

    const tickets = await prisma.supportTicket.findMany({
      where,
      include: ticketInclude,
      orderBy: { createdAt: 'desc' }
    });

    const counts = { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, ALL: 0 };
    const allTickets = await prisma.supportTicket.findMany({
      where: admin ? {} : { createdById: userId },
      select: { status: true }
    });
    for (const t of allTickets) {
      counts[t.status as keyof typeof counts]++;
      counts.ALL++;
    }

    res.json({ tickets, counts });
  } catch (error) {
    console.error('getTickets error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getTicketById = async (req: Request, res: Response) => {
  try {
    const userId: string = (req as any).user?.id;
    const admin = await isAdminUser(userId);
    const id = String(req.params.id);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: ticketInclude
    });

    if (!ticket) return res.status(404).json({ message: 'Không tìm thấy ticket.' });
    if (!admin && ticket.createdById !== userId) {
      return res.status(403).json({ message: 'Bạn không có quyền xem ticket này.' });
    }

    res.json(ticket);
  } catch (error) {
    console.error('getTicketById error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const createTicket = async (req: Request, res: Response) => {
  try {
    const userId: string = (req as any).user?.id;
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();

    if (!title || !description) {
      return res.status(400).json({ message: 'Tiêu đề và mô tả là bắt buộc.' });
    }

    const code = await generateTicketCode();
    const files = (req.files as Express.Multer.File[]) || [];

    const ticket = await prisma.supportTicket.create({
      data: {
        code,
        title,
        description,
        createdById: userId,
        attachments: {
          create: files.map(f => ({
            fileName: f.originalname,
            filePath: `/uploads/${UPLOAD_SUB_DIR}/${f.filename}`,
            fileSize: f.size,
            fileType: f.mimetype
          }))
        }
      },
      include: ticketInclude
    });

    res.status(201).json(ticket);
  } catch (error) {
    console.error('createTicket error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const userId: string = (req as any).user?.id;
    // Quyền cập nhật trạng thái đã kiểm tra ở route (MANAGE_SUPPORT_TICKETS)

    const id = String(req.params.id);
    const newStatus = String(req.body.status || '');
    const note = req.body.adminNote as string | undefined;

    if (!['NEW', 'IN_PROGRESS', 'RESOLVED'].includes(newStatus)) {
      return res.status(400).json({ message: 'Trạng thái không hợp lệ.' });
    }

    const ticket = await prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) return res.status(404).json({ message: 'Không tìm thấy ticket.' });

    const updateData: any = { status: newStatus, assignedToId: userId };
    if (note !== undefined) updateData.adminNote = note;
    if (newStatus === 'RESOLVED') updateData.resolvedAt = new Date();

    const updated = await prisma.supportTicket.update({
      where: { id },
      data: updateData,
      include: ticketInclude
    });

    res.json(updated);
  } catch (error) {
    console.error('updateTicketStatus error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const deleteTicket = async (req: Request, res: Response) => {
  try {
    const userId: string = (req as any).user?.id;
    const id = String(req.params.id);

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: { attachments: true }
    });
    if (!ticket) return res.status(404).json({ message: 'Không tìm thấy ticket.' });

    const admin = await isAdminUser(userId);
    if (!admin && ticket.createdById !== userId) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa ticket này.' });
    }
    if (!admin && ticket.status !== 'NEW') {
      return res.status(400).json({ message: 'Chỉ có thể xóa ticket ở trạng thái Mới.' });
    }

    for (const att of ticket.attachments) {
      try {
        const fullPath = path.join(getUploadDir(''), '..', att.filePath);
        fs.unlinkSync(fullPath);
      } catch { /* ignore */ }
    }

    await prisma.supportTicket.delete({ where: { id } });
    res.json({ message: 'Đã xóa ticket.' });
  } catch (error) {
    console.error('deleteTicket error:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
