
import express from 'express';
import {
  getSerials,
  getSerialDetail,
  getWarrantyClaims,
  createWarrantyClaim,
  updateWarrantyClaim
} from '../controllers/warrantyController';
import { authenticate } from '../middleware/authMiddleware';

const router = express.Router();

router.use(authenticate);

// Serials
router.get('/serials', getSerials);
router.get('/serials/:id', getSerialDetail);

// Warranty Claims
router.get('/claims', getWarrantyClaims);
router.post('/claims', createWarrantyClaim);
router.put('/claims/:id', updateWarrantyClaim);

export default router;
