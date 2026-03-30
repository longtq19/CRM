import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  getTickets,
  getTicketById,
  createTicket,
  updateTicketStatus,
  deleteTicket,
  supportTicketUpload
} from '../controllers/supportTicketController';

const router = Router();

router.use(authMiddleware);

const uploadHandler = (req: Request, res: Response, next: NextFunction) => {
  supportTicketUpload.array('files', 5)(req, res, (err: any) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ message: 'Tối đa 5 file đính kèm.' });
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ message: 'Mỗi file tối đa 10MB.' });
      }
      return res.status(400).json({ message: err.message || 'Lỗi upload file.' });
    }
    next();
  });
};

// Danh sách/chi tiết: controller lọc theo chủ ticket hoặc quyền xem tất cả
router.get('/', getTickets);
router.get('/:id', getTicketById);
router.post('/', uploadHandler, createTicket);
// Cập nhật trạng thái (phân công, resolved): chỉ người có quyền quản lý
router.put('/:id/status', checkPermission(['MANAGE_SUPPORT_TICKETS']), updateTicketStatus);
// Xóa: controller cho phép chủ ticket xóa hoặc MANAGE_SUPPORT_TICKETS
router.delete('/:id', deleteTicket);

export default router;
