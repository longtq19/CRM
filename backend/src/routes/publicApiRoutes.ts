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
router.post('/marketing/campaigns/:campaignId/api-key', authMiddleware, checkPermission('UPDATE_MARKETING_CAMPAIGN'), generateApiKey);
router.put('/marketing/campaigns/:campaignId/api-integration', authMiddleware, checkPermission('UPDATE_MARKETING_CAMPAIGN'), updateCampaignApiIntegration);
router.delete('/marketing/campaigns/:campaignId/api-key', authMiddleware, checkPermission('UPDATE_MARKETING_CAMPAIGN'), revokeApiKey);
router.put('/marketing/campaigns/:campaignId/allowed-origins', authMiddleware, checkPermission('UPDATE_MARKETING_CAMPAIGN'), updateAllowedOrigins);
router.get(
  '/marketing/campaigns/:campaignId/api-info',
  authMiddleware,
  checkPermission(['VIEW_MARKETING_CAMPAIGNS', 'MANAGE_CUSTOMERS']),
  getCampaignApiInfo
);

export default router;
