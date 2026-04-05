import { Router } from 'express';
import { AiController } from './ai.controller';
import { authMiddleware, checkPermission } from '../../middleware/authMiddleware';

const router = Router();

// Toàn bộ AI module yêu cầu đăng nhập
router.use(authMiddleware as any);

/**
 * Chat với Zeno AI
 * @request POST /api/ai/chat
 */
router.post('/chat', AiController.chat);

/**
 * Lấy danh sách Tools (MCP metadata)
 * @request GET /api/ai/tools
 */
router.get('/tools', AiController.getTools);

export default router;
