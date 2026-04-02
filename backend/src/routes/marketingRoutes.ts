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

/** Chi phí / hiệu quả / xếp hạng NV Marketing: NV Tiếp thị có VIEW/CREATE/UPDATE chiến dịch phải gọi được API; phạm vi từng chiến dịch do controller (`canAccessMarketingCampaignByCreator`, …). Không chỉ `MANAGE_CUSTOMERS` (Kinh doanh). */
const CAMPAIGN_COSTS_AND_MARKETING_REPORTS = [
  'VIEW_MARKETING_CAMPAIGNS',
  'CREATE_MARKETING_CAMPAIGN',
  'UPDATE_MARKETING_CAMPAIGN',
  'MANAGE_CUSTOMERS',
] as const;

// Sources — nền tảng (marketing_sources): danh mục chung công ty — GET chỉ cần đăng nhập; POST/PUT/DELETE theo quyền CRUD
router.get('/marketing/sources', authMiddleware, getMarketingSources);
router.post(
  '/marketing/sources',
  authMiddleware,
  checkPermission('CREATE_MARKETING_PLATFORM'),
  createMarketingSource
);
router.put(
  '/marketing/sources/:id',
  authMiddleware,
  checkPermission('UPDATE_MARKETING_PLATFORM'),
  updateMarketingSource
);
router.delete(
  '/marketing/sources/:id',
  authMiddleware,
  checkPermission('DELETE_MARKETING_PLATFORM'),
  deleteMarketingSource
);

// Campaigns — R/U/C/D tách quyền; GET cho phép VIEW hoặc MANAGE_CUSTOMERS (tương thích dropdown Kinh doanh).
router.get(
  '/marketing/campaigns',
  authMiddleware,
  checkPermission(['VIEW_MARKETING_CAMPAIGNS', 'MANAGE_CUSTOMERS']),
  getMarketingCampaigns
);
router.post('/marketing/campaigns', authMiddleware, checkPermission('CREATE_MARKETING_CAMPAIGN'), createMarketingCampaign);
router.put('/marketing/campaigns/:id', authMiddleware, checkPermission('UPDATE_MARKETING_CAMPAIGN'), updateMarketingCampaign);
router.delete('/marketing/campaigns/:id', authMiddleware, checkPermission('DELETE_MARKETING_CAMPAIGN'), deleteMarketingCampaign);

// Leads
router.get('/marketing/leads/import-template', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getMarketingLeadImportTemplate);
router.get('/marketing/leads', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getMarketingLeads);
router.post('/marketing/leads/push-to-pool', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), pushLeadsToDataPool);
router.post('/marketing/leads/import', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), excelUploadMiddleware.single('file'), importMarketingLeads);
router.get('/marketing/leads/:id', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), getMarketingLeadDetail);
router.put('/marketing/leads/:id/status', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), updateMarketingLeadStatus);
router.post('/marketing/leads', authMiddleware, checkPermission('MANAGE_CUSTOMERS'), createMarketingLead);

// Campaign Costs
router.get(
  '/marketing/campaigns/:campaignId/costs',
  authMiddleware,
  checkPermission([...CAMPAIGN_COSTS_AND_MARKETING_REPORTS]),
  getCampaignCosts
);
router.post(
  '/marketing/campaigns/:campaignId/costs',
  authMiddleware,
  checkPermission([...CAMPAIGN_COSTS_AND_MARKETING_REPORTS]),
  createCampaignCost
);
router.put(
  '/marketing/costs/:costId',
  authMiddleware,
  checkPermission([...CAMPAIGN_COSTS_AND_MARKETING_REPORTS]),
  updateCampaignCost
);
router.delete(
  '/marketing/costs/:costId',
  authMiddleware,
  checkPermission([...CAMPAIGN_COSTS_AND_MARKETING_REPORTS]),
  deleteCampaignCost
);

// Effectiveness Reports
router.get(
  '/marketing/effectiveness',
  authMiddleware,
  checkPermission([...CAMPAIGN_COSTS_AND_MARKETING_REPORTS]),
  getMarketingEffectiveness
);
router.get(
  '/marketing/campaigns/:campaignId/effectiveness',
  authMiddleware,
  checkPermission([...CAMPAIGN_COSTS_AND_MARKETING_REPORTS]),
  getCampaignEffectiveness
);

// Employee Rankings
router.get(
  '/marketing/employee-rankings',
  authMiddleware,
  checkPermission([...CAMPAIGN_COSTS_AND_MARKETING_REPORTS]),
  getEmployeeRankings
);

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

