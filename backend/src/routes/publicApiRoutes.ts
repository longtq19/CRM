import { Router } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  generateApiKey,
  revokeApiKey,
  updateAllowedOrigins,
  updateCampaignApiIntegration,
  receivePublicLead,
  getCampaignApiInfo
} from '../controllers/publicApiController';

const router = Router();

// Public endpoint - không cần auth, chỉ cần API key
router.post('/public/lead', receivePublicLead);

// Protected endpoints - cần auth
router.post('/marketing/campaigns/:campaignId/api-key', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), generateApiKey);
router.put('/marketing/campaigns/:campaignId/api-integration', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), updateCampaignApiIntegration);
router.delete('/marketing/campaigns/:campaignId/api-key', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), revokeApiKey);
router.put('/marketing/campaigns/:campaignId/allowed-origins', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), updateAllowedOrigins);
router.get('/marketing/campaigns/:campaignId/api-info', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getCampaignApiInfo);

export default router;
