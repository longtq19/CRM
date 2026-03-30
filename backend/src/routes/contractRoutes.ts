import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  uploadContract,
  getContracts,
  listAllContracts,
  updateContract,
  deleteContract,
  downloadContract
} from '../controllers/contractController';
import { contractUploadMiddleware } from '../middleware/contractUploadMiddleware';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

router.use(authMiddleware);

// Quyền: xem hợp đồng (VIEW_CONTRACTS hoặc MANAGE_HR), sửa/xóa/upload (MANAGE_HR)
const canViewContracts = checkPermission(['VIEW_CONTRACTS', 'MANAGE_HR']);
const canManageContracts = checkPermission('MANAGE_HR');

// Wrapper to handle Multer errors
const uploadHandler = (req: Request, res: Response, next: NextFunction) => {
  contractUploadMiddleware.single('file')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'File quá lớn. Giới hạn 5MB.' });
        }
        return res.status(400).json({ message: err.message });
      } else if (err) {
        return res.status(400).json({ message: err.message });
      }
    }
    next();
  });
};

// Upload contract for an employee
router.post('/upload/:employeeId', canManageContracts, uploadHandler, uploadContract);

// List all contracts (HR/Admin, with filters: status, expiringSoon) - must be before /list/:id
router.get('/', canViewContracts, listAllContracts);

// Get list of contracts for an employee
router.get('/list/:employeeId', canViewContracts, getContracts);

// Update contract dates
router.put('/:id', canManageContracts, updateContract);

// Delete a contract
router.delete('/:id', canManageContracts, deleteContract);

// Download a contract
router.get('/download/:id', canViewContracts, downloadContract);

export default router;
