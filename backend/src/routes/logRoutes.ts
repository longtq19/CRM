import { Router } from 'express';
import { getLogs, createLog } from '../controllers/logController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import { SYSTEM_LOGS_READ_PERMISSIONS } from '../config/routePermissionPolicy';

const router = Router();

router.get('/logs', authMiddleware, checkPermission([...SYSTEM_LOGS_READ_PERMISSIONS]), getLogs);
router.post('/logs', authMiddleware, createLog);

export default router;
