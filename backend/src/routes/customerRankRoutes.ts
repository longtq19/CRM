import express from 'express';
import { authenticate, checkPermission } from '../middleware/authMiddleware';
import {
  getSpendingRanks,
  createSpendingRank,
  updateSpendingRank,
  deleteSpendingRank,
  recalculateAllCustomerRanks,
  updateSingleCustomerRank,
  getRankStatistics
} from '../controllers/customerRankController';

const router = express.Router();

router.use(authenticate);

// Spending Ranks CRUD
router.get(
  '/spending-ranks',
  checkPermission(['VIEW_SETTINGS', 'MANAGE_SALES', 'MANAGE_RESALES', 'MANAGE_CUSTOMERS']),
  getSpendingRanks,
);
router.post('/spending-ranks', checkPermission('EDIT_SETTINGS'), createSpendingRank);
router.put('/spending-ranks/:id', checkPermission('EDIT_SETTINGS'), updateSpendingRank);
router.delete('/spending-ranks/:id', checkPermission('EDIT_SETTINGS'), deleteSpendingRank);

// Recalculate ranks
router.post('/spending-ranks/recalculate', checkPermission('EDIT_SETTINGS'), recalculateAllCustomerRanks);
router.post('/spending-ranks/customer/:customerId', checkPermission('MANAGE_CUSTOMERS'), updateSingleCustomerRank);

// Statistics
router.get('/spending-ranks/statistics', checkPermission('VIEW_SETTINGS'), getRankStatistics);

export default router;
