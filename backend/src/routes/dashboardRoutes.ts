import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import { getDashboardData, getDashboardTrends } from '../controllers/dashboardController';

const router = Router();

// Không dùng router.use(authMiddleware) toàn router: router này mount cả tại `api.ts` với `use('/')`
// nên sẽ chặn mọi request tới `/api/*` (vd: POST /api/public/lead) trước khi tới route public.
router.get('/', authMiddleware, checkPermission('VIEW_DASHBOARD'), getDashboardData);
router.get('/trends', authMiddleware, checkPermission('VIEW_DASHBOARD'), getDashboardTrends);

export default router;
