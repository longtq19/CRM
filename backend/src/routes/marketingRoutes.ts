import { Router, Request, Response } from 'express';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import { marketingCostUpload } from '../middleware/marketingCostUploadMiddleware';
import { excelUploadMiddleware } from '../middleware/excelUploadMiddleware';
import { toPublicUploadUrl } from '../config/publicUploadUrl';
import {
  getMarketingSources,
  createMarketingSource,
  updateMarketingSource,
  deleteMarketingSource,
  getMarketingCampaigns,
  createMarketingCampaign,
  updateMarketingCampaign,
  deleteMarketingCampaign,
  getMarketingLeads,
  getMarketingLeadDetail,
  createMarketingLead,
  importMarketingLeads,
  getMarketingLeadImportTemplate,
  getCampaignCosts,
  createCampaignCost,
  updateCampaignCost,
  deleteCampaignCost,
  getMarketingEffectiveness,
  getCampaignEffectiveness,
  getEmployeeRankings,
  exportMarketingLeads,
  pushLeadsToDataPool,
  updateMarketingLeadStatus
} from '../controllers/marketingController';

const router = Router();

// Sources — nền tảng (marketing_sources): GET cho dropdown lead/chiến dịch (MANAGE_CUSTOMERS); CRUD chỉ MANAGE_MARKETING_PLATFORMS
router.get(
  '/marketing/sources',
  authMiddleware,
  checkPermission(['VIEW_MARKETING_PLATFORMS', 'MANAGE_MARKETING_PLATFORMS', 'MANAGE_CUSTOMERS']),
  getMarketingSources
);
router.post(
  '/marketing/sources',
  authMiddleware,
  checkPermission('MANAGE_MARKETING_PLATFORMS'),
  createMarketingSource
);
router.put(
  '/marketing/sources/:id',
  authMiddleware,
  checkPermission('MANAGE_MARKETING_PLATFORMS'),
  updateMarketingSource
);
router.delete(
  '/marketing/sources/:id',
  authMiddleware,
  checkPermission('MANAGE_MARKETING_PLATFORMS'),
  deleteMarketingSource
);

// Campaigns
router.get('/marketing/campaigns', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getMarketingCampaigns);
router.post('/marketing/campaigns', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), createMarketingCampaign);
router.put('/marketing/campaigns/:id', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), updateMarketingCampaign);
router.delete('/marketing/campaigns/:id', authMiddleware, checkPermission('DELETE_MARKETING_CAMPAIGN'), deleteMarketingCampaign);

// Leads
router.get('/marketing/leads/export', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), exportMarketingLeads);
router.get('/marketing/leads/import-template', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getMarketingLeadImportTemplate);
router.get('/marketing/leads', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getMarketingLeads);
router.post('/marketing/leads/push-to-pool', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), pushLeadsToDataPool);
router.post('/marketing/leads/import', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), excelUploadMiddleware.single('file'), importMarketingLeads);
router.get('/marketing/leads/:id', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getMarketingLeadDetail);
router.put('/marketing/leads/:id/status', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), updateMarketingLeadStatus);
router.post('/marketing/leads', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), createMarketingLead);

// Campaign Costs
router.get('/marketing/campaigns/:campaignId/costs', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getCampaignCosts);
router.post('/marketing/campaigns/:campaignId/costs', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), createCampaignCost);
router.put('/marketing/costs/:costId', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), updateCampaignCost);
router.delete('/marketing/costs/:costId', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), deleteCampaignCost);

// Effectiveness Reports
router.get('/marketing/effectiveness', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getMarketingEffectiveness);
router.get('/marketing/campaigns/:campaignId/effectiveness', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getCampaignEffectiveness);

// Employee Rankings
router.get('/marketing/employee-rankings', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getEmployeeRankings);

// File Upload for marketing costs
router.post('/upload/marketing-costs', authMiddleware, marketingCostUpload.array('files', 10), (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ message: 'Không có file nào được tải lên' });
  }
  const urls = files.map(f => toPublicUploadUrl(`/uploads/marketing-costs/${f.filename}`));
  res.json({
    success: true,
    urls,
    files: files.map(f => ({
      url: toPublicUploadUrl(`/uploads/marketing-costs/${f.filename}`),
      name: f.originalname,
      size: f.size
    }))
  });
});

export default router;

