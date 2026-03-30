import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  getMarketingGroups,
  createMarketingGroup,
  updateMarketingGroup,
  deleteMarketingGroup,
  addMemberToGroup,
  removeMemberFromGroup,
  assignCostToEmployees,
  getMarketingPerformanceStats
} from '../controllers/marketingGroupController';

const router = Router();

router.use(authMiddleware);
router.use(checkPermission(['MANAGE_MARKETING_GROUPS', 'MANAGE_CUSTOMERS']));

// Group management
router.get('/groups', getMarketingGroups);
router.post('/groups', createMarketingGroup);
router.put('/groups/:id', updateMarketingGroup);
router.delete('/groups/:id', deleteMarketingGroup);

// Member management
router.post('/groups/:id/members', addMemberToGroup);
router.delete('/groups/:id/members/:employeeId', removeMemberFromGroup);

// Cost assignment
router.post('/costs/assign', assignCostToEmployees);

// Performance stats
router.get('/performance', getMarketingPerformanceStats);

export default router;
