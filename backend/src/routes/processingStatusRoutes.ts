import { Router } from 'express';
import * as controller from '../controllers/processingStatusController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

router.get('/', authMiddleware, controller.getProcessingStatuses);
router.get('/active', authMiddleware, controller.getActiveProcessingStatuses);
router.post('/', authMiddleware, checkPermission('CONFIG_OPERATIONS'), controller.createProcessingStatus);
router.put('/:id', authMiddleware, checkPermission('CONFIG_OPERATIONS'), controller.updateProcessingStatus);
router.delete('/:id', authMiddleware, checkPermission('CONFIG_OPERATIONS'), controller.deleteProcessingStatus);
router.post('/seed', authMiddleware, checkPermission('FULL_ACCESS'), controller.seedProcessingStatuses);

export default router;
