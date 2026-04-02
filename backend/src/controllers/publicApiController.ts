import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { formatICTDateTime } from '../utils/dateFormatter';
import crypto from 'crypto';
import { createUserNotification } from './userNotificationController';
import { getIO } from '../socket';
import { sendPushToEmployee } from '../services/pushNotificationService';
import {
  checkDuplicateAndHandle,
  getMarketingAttributionDays,
  getAttributionExpiredAt,
  normalizePhone,
  getDuplicateStaffDisplayForClient,
  notifyDuplicateStakeholders,
} from '../services/leadDuplicateService';
import { assignSingleMarketingPoolToSales } from '../services/marketingLeadAutoAssignService';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';
import { DEFAULT_LEAD_PROCESSING_STATUS_CODE } from '../constants/operationParams';
import { notifySalesMarketingLeadAssigned } from '../utils/notifySalesLeadFromMarketing';
import { canAccessMarketingCampaignByCreator } from '../utils/viewScopeHelper';
import {
  isBeforeCampaignStartDateVietnam,
  isCampaignEndedForApi,
} from '../utils/campaignSchedule';

/** Trường JSON public lead: chỉ SĐT bắt buộc; ghi chú / họ tên / địa chỉ (dòng chữ) là tùy chọn theo chiến dịch. */
export const PUBLIC_LEAD_FIELD_CODES = ['phone', 'name', 'address', 'note'] as const;

/** Gộp `acceptedFields` — luôn có `phone`; chỉ cho phép phone | name | address | note. Luôn reset hierarchy về NONE. */
export function mergePublicLeadAcceptedFields(
  acceptedFields: string[] | undefined,
  _legacyHierarchy?: string | null
): { finalFields: string[]; hierarchy: 'NONE' } {
  const ALLOWED = PUBLIC_LEAD_FIELD_CODES as unknown as string[];
  let finalFields: string[];
  if (Array.isArray(acceptedFields) && acceptedFields.length > 0) {
    finalFields = acceptedFields.filter((f: string) => ALLOWED.includes(f));
  } else {
    finalFields = ['phone'];
  }
  if (!finalFields.includes('phone')) {
    finalFields = ['phone', ...finalFields.filter((f) => f !== 'phone')];
  }
  return { finalFields, hierarchy: 'NONE' };
}

/**
 * Mẫu body JSON cho tài liệu / cURL / fetch.
 */
export function buildSampleLeadBody(
  acceptedFields: string[] | null | undefined,
  _campaignCode?: string | null
): Record<string, string> {
  const defaults: Record<string, string> = {
    phone: '0901234567',
    note: 'Ghi chú từ website',
    name: 'Nguyễn Văn A',
    address: '123 Đường ABC, Quận 1, TP.HCM',
  };
  const ALLOWED = PUBLIC_LEAD_FIELD_CODES as unknown as string[];
  const fields =
    Array.isArray(acceptedFields) && acceptedFields.length > 0
      ? acceptedFields.filter((f) => ALLOWED.includes(f))
      : ['phone'];
  const body: Record<string, string> = {};
  for (const f of fields) {
    if (defaults[f] !== undefined) body[f] = defaults[f];
  }
  if (fields.includes('phone') && body.phone === undefined) body.phone = defaults.phone;
  return body;
}

export function buildPublicLeadSampleCode(
  baseUrl: string,
  apiKey: string | null | undefined,
  acceptedFields: string[] | null | undefined,
  _campaignCode?: string | null
) {
  const key = apiKey || 'YOUR_API_KEY';
  const bodyObj = buildSampleLeadBody(acceptedFields);
  const payload = JSON.stringify(bodyObj);
  const curl = [
    `curl -X POST "${baseUrl}/public/lead"`,
    `  -H "Content-Type: application/json"`,
    `  -H "X-API-Key: ${key}"`,
    `  -d ${JSON.stringify(payload)}`,
  ].join(' \\\n');

  const innerJs = JSON.stringify(bodyObj, null, 2);
  const javascript = `fetch("${baseUrl}/public/lead", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-Key": "${key}"
  },
  body: JSON.stringify(${innerJs})
})
.then((res) => res.json())
.then((data) => console.log(data))
.catch((err) => console.error(err));`;

  const ALLOWED = PUBLIC_LEAD_FIELD_CODES as unknown as string[];
  const af =
    Array.isArray(acceptedFields) && acceptedFields.length > 0
      ? acceptedFields.filter((f) => ALLOWED.includes(f))
      : ['phone'];
  const inputs: string[] = [];
  if (af.includes('phone')) {
    inputs.push('<input type="tel" name="phone" placeholder="Số điện thoại" required>');
  }
  if (af.includes('name')) {
    inputs.push('<input type="text" name="name" placeholder="Họ tên">');
  }
  if (af.includes('address')) {
    inputs.push('<input type="text" name="address" placeholder="Địa chỉ">');
  }
  if (af.includes('note')) {
    inputs.push('<textarea name="note" placeholder="Ghi chú"></textarea>');
  }
  const payloadLines = af
    .map((f) => `  payload[${JSON.stringify(f)}] = formData.get(${JSON.stringify(f)});`)
    .join('\n');

  const html = `<!-- Mẫu form — các trường khớp acceptedFields chiến dịch (${af.join(', ')}) -->
<form id="leadForm">
${inputs.map((line) => `  ${line}`).join('\n')}
  <button type="submit">Gửi</button>
</form>

<script>
document.getElementById('leadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const payload = {};
${payloadLines}
  try {
    const response = await fetch("${baseUrl}/public/lead", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "${key}"
      },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (data.success) {
      alert('Cảm ơn bạn đã đăng ký!');
      e.target.reset();
    } else {
      alert(data.message || 'Có lỗi xảy ra');
    }
  } catch (error) {
    alert('Có lỗi xảy ra, vui lòng thử lại!');
  }
});
</script>`;

  return { curl, javascript, html };
}

/**
 * Tạo API Key cho chiến dịch Marketing
 */
export const generateApiKey = async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const actor = (req as any).user;

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (!(await canAccessMarketingCampaignByCreator(actor, campaign.createdByEmployeeId))) {
      return res.status(403).json({ message: 'Không có quyền cấu hình API cho chiến dịch này' });
    }

    const nowKey = new Date();
    if (isCampaignEndedForApi(nowKey, campaign)) {
      return res.status(400).json({
        message: 'Chiến dịch đã kết thúc; không thể tạo hoặc gia hạn API key.',
      });
    }

    const { acceptedFields } = req.body;
    const { finalFields } = mergePublicLeadAcceptedFields(acceptedFields);

    const apiKey = `mkt_${crypto.randomBytes(24).toString('hex')}`;
    const webhookSecret = crypto.randomBytes(16).toString('hex');

    const updated = await prisma.marketingCampaign.update({
      where: { id: campaignId as string },
      data: {
        apiKey,
        webhookSecret,
        acceptedFields: finalFields,
        publicLeadAddressHierarchy: 'NONE'
      }
    });

    const baseUrl = process.env.API_BASE_URL || 'https://crm.kagri.tech/api';
    const sampleCode = buildPublicLeadSampleCode(baseUrl, updated.apiKey, finalFields, updated.code);

    res.json({
      message: 'Đã tạo API key thành công',
      apiKey: updated.apiKey,
      webhookSecret: updated.webhookSecret,
      acceptedFields: finalFields,
      publicLeadAddressHierarchy: 'NONE',
      endpoint: `${baseUrl}/public/lead`,
      sampleCode
    });
  } catch (error) {
    console.error('Generate API key error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo API key' });
  }
};

/**
 * Cập nhật trường API (không đổi API key)
 */
export const updateCampaignApiIntegration = async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const actor = (req as any).user;
    const { acceptedFields } = req.body;

    const campaign = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (!(await canAccessMarketingCampaignByCreator(actor, campaign.createdByEmployeeId))) {
      return res.status(403).json({ message: 'Không có quyền cấu hình API cho chiến dịch này' });
    }
    if (!campaign.apiKey) {
      return res.status(400).json({ message: 'Chiến dịch chưa có API key' });
    }

    const nowInt = new Date();
    if (isCampaignEndedForApi(nowInt, campaign)) {
      return res.status(400).json({
        message: 'Chiến dịch đã kết thúc; không thể cập nhật cấu hình API.',
      });
    }

    const { finalFields } = mergePublicLeadAcceptedFields(acceptedFields);

    const updated = await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        acceptedFields: finalFields,
        publicLeadAddressHierarchy: 'NONE'
      }
    });

    const baseUrl = process.env.API_BASE_URL || 'https://crm.kagri.tech/api';
    const sampleCode = buildPublicLeadSampleCode(baseUrl, updated.apiKey, finalFields, updated.code);

    res.json({
      message: 'Đã cập nhật cấu hình API',
      acceptedFields: finalFields,
      publicLeadAddressHierarchy: 'NONE',
      sampleCode
    });
  } catch (error) {
    console.error('Update campaign API integration error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật cấu hình API' });
  }
};

/**
 * Thu hồi API Key
 */
export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const actor = (req as any).user;

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { createdByEmployeeId: true },
    });
    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (!(await canAccessMarketingCampaignByCreator(actor, campaign.createdByEmployeeId))) {
      return res.status(403).json({ message: 'Không có quyền thu hồi API key cho chiến dịch này' });
    }

    await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: {
        apiKey: null,
        webhookSecret: null
      }
    });

    res.json({ message: 'Đã thu hồi API key' });
  } catch (error) {
    console.error('Revoke API key error:', error);
    res.status(500).json({ message: 'Lỗi khi thu hồi API key' });
  }
};

/**
 * Cập nhật allowed origins cho CORS
 */
export const updateAllowedOrigins = async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const actor = (req as any).user;
    const { allowedOrigins } = req.body;

    const existing = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: { createdByEmployeeId: true },
    });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (!(await canAccessMarketingCampaignByCreator(actor, existing.createdByEmployeeId))) {
      return res.status(403).json({ message: 'Không có quyền cập nhật chiến dịch này' });
    }

    const updated = await prisma.marketingCampaign.update({
      where: { id: campaignId },
      data: { allowedOrigins }
    });

    res.json({
      message: 'Đã cập nhật allowed origins',
      allowedOrigins: updated.allowedOrigins
    });
  } catch (error) {
    console.error('Update allowed origins error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật allowed origins' });
  }
};

/**
 * PUBLIC API: Nhận lead từ website bên ngoài
 * Không cần authentication, chỉ cần API key
 */
export const receivePublicLead = async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      return res.status(401).json({ 
        success: false,
        message: 'Thiếu API key. Vui lòng thêm header X-API-Key' 
      });
    }

    const keyTrim = String(apiKey).trim();
    /** Key do hệ thống sinh: `mkt_` + 48 ký tự hex — từ chối sớm không cần DB (tránh 500 khi DB lỗi / test không có DB). */
    const PUBLIC_LEAD_API_KEY_FORMAT = /^mkt_[a-f0-9]{48}$/;
    if (!PUBLIC_LEAD_API_KEY_FORMAT.test(keyTrim)) {
      return res.status(401).json({
        success: false,
        message: 'API key không hợp lệ',
      });
    }

    // Tìm chiến dịch theo API key
    const campaign = await prisma.marketingCampaign.findUnique({
      where: { apiKey: keyTrim },
      include: {
        source: true,
        createdByEmployee: {
          select: { id: true, fullName: true, phone: true }
        }
      }
    });

    if (!campaign) {
      return res.status(401).json({ 
        success: false,
        message: 'API key không hợp lệ' 
      });
    }

    const now = new Date();
    if (isCampaignEndedForApi(now, campaign)) {
      return res.status(400).json({
        success: false,
        message: 'Chiến dịch đã kết thúc',
      });
    }

    if (isBeforeCampaignStartDateVietnam(now, campaign.startDate)) {
      return res.status(400).json({
        success: false,
        message: 'Chiến dịch chưa bắt đầu',
      });
    }

    if (campaign.status !== 'ACTIVE' && campaign.status !== 'RUNNING') {
      return res.status(400).json({
        success: false,
        message: 'Chiến dịch không còn hoạt động',
      });
    }

    const body = req.body;

    const ALLOWED = PUBLIC_LEAD_FIELD_CODES as unknown as string[];
    const rawAccepted = Array.isArray(campaign.acceptedFields) ? (campaign.acceptedFields as string[]) : null;
    const campaignAcceptedFields: string[] =
      rawAccepted && rawAccepted.length > 0
        ? ALLOWED.filter((f) => rawAccepted.includes(f))
        : ['phone'];
    if (!campaignAcceptedFields.includes('phone')) {
      campaignAcceptedFields.unshift('phone');
    }

    const pick = (key: string) => (campaignAcceptedFields.includes(key) ? body[key] : undefined);

    const phone = body.phone;
    if (!phone) {
      return res.status(400).json({ 
        success: false,
        message: 'Số điện thoại là bắt buộc' 
      });
    }

    const note = pick('note');
    const name = pick('name');
    const address = pick('address');

    const str = (key: string) => {
      const v = pick(key);
      return typeof v === 'string' && v.trim() ? v.trim() : undefined;
    };

    const trimmedPhone = normalizePhone(String(phone));
    const noteText =
      campaignAcceptedFields.includes('note') && note !== undefined && note !== null && String(note).trim() !== ''
        ? String(note).trim()
        : '';

    // Kiểm tra trùng: không tạo Lead mới, cho phép thêm note + ghi lịch sử + gửi notification
    const campaignOwnerName = campaign.createdByEmployee?.fullName ?? 'Marketing';
    const duplicateResult = await checkDuplicateAndHandle({
      phone: trimmedPhone,
      actorId: campaign.createdByEmployeeId,
      actorName: campaignOwnerName,
      note: noteText || undefined
    });

    if (duplicateResult.rejectedDuplicate) {
      if (duplicateResult.existingCustomer) {
        await notifyDuplicateStakeholders({
          existingCustomer: duplicateResult.existingCustomer,
          normalizedPhone: trimmedPhone,
          actorId: campaign.createdByEmployeeId,
          actorName: campaignOwnerName,
          actorPhone: campaign.createdByEmployee?.phone ?? null,
          sourceLabel: 'Form công khai (từ chối trùng)',
          note: noteText || undefined,
          customerId: duplicateResult.customerId!,
        });
      }
      return res.status(400).json({
        success: false,
        message:
          duplicateResult.message ||
          'Hệ thống không cho phép nhập số trùng.',
        responsibleStaff: duplicateResult.existingCustomer
          ? getDuplicateStaffDisplayForClient(duplicateResult.existingCustomer)
          : undefined,
      });
    }

    if (duplicateResult.duplicate && duplicateResult.existingCustomer) {
      await notifyDuplicateStakeholders({
        existingCustomer: duplicateResult.existingCustomer,
        normalizedPhone: trimmedPhone,
        actorId: campaign.createdByEmployeeId,
        actorName: campaignOwnerName,
        actorPhone: campaign.createdByEmployee?.phone ?? null,
        sourceLabel: 'Form công khai (website)',
        note: noteText || undefined,
        customerId: duplicateResult.customerId!,
      });
      return res.status(200).json({
        success: true,
        message: duplicateResult.message || 'Số điện thoại đã tồn tại trong hệ thống',
        customerId: duplicateResult.customerId,
        isNew: false,
        duplicate: true,
        case: duplicateResult.case,
        responsibleStaff: getDuplicateStaffDisplayForClient(duplicateResult.existingCustomer),
      });
    }

    // Tạo mã khách hàng mới
    const count = await prisma.customer.count();
    const customerCode = `KH${String(count + 1).padStart(6, '0')}`;

    const attributionDays = await getMarketingAttributionDays();
    const attributionExpiredAt = getAttributionExpiredAt(now, attributionDays);

    const displayName =
      campaignAcceptedFields.includes('name') && name !== undefined && String(name).trim() !== ''
        ? String(name).trim()
        : `Khách hàng ${trimmedPhone}`;
    const displayAddress =
      campaignAcceptedFields.includes('address') && address !== undefined && String(address).trim() !== ''
        ? String(address).trim()
        : null;

    const customerData: Record<string, any> = {
      code: customerCode,
      name: displayName,
      phone: trimmedPhone,
      email: null,
      address: displayAddress,
      note: noteText || null,
      createdByRole: 'MARKETING',
      createdById: campaign.createdByEmployeeId,
      marketingOwnerId: campaign.createdByEmployeeId,
      employeeId: null,
      attributionExpiredAt,
      leadSourceId: campaign.sourceId,
      campaignId: campaign.id,
      leadStatus: 'NEW',
      isValidLead: true,
    };

    const num = (key: string) => {
      const v = pick(key);
      const n = Number(v);
      return !isNaN(n) && v !== undefined && v !== '' ? n : undefined;
    };

    if (str('dateOfBirth')) { const d = new Date(str('dateOfBirth')!); if (!isNaN(d.getTime())) customerData.dateOfBirth = d; }
    if (str('gender')) customerData.gender = str('gender');
    if (str('province')) customerData.provinceId = str('province');
    if (str('district')) customerData.districtId = str('district');
    if (str('ward')) customerData.wardId = str('ward');
    if (str('farmName')) customerData.farmName = str('farmName');
    if (num('farmArea') !== undefined) customerData.farmArea = num('farmArea');
    if (str('farmAreaUnit')) customerData.farmAreaUnit = str('farmAreaUnit');
    if (pick('mainCrops')) {
      const crops = Array.isArray(body.mainCrops) ? body.mainCrops : typeof body.mainCrops === 'string' ? body.mainCrops.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      if (crops.length) customerData.mainCrops = crops;
    }
    if (num('farmingYears') !== undefined) customerData.farmingYears = num('farmingYears');
    if (str('farmingMethod')) customerData.farmingMethod = str('farmingMethod');
    if (str('soilType')) customerData.soilType = str('soilType');
    if (str('irrigationType')) customerData.irrigationType = str('irrigationType');
    if (str('businessType')) customerData.businessType = str('businessType');
    if (str('taxCode')) customerData.taxCode = str('taxCode');
    if (str('bankAccount')) customerData.bankAccount = str('bankAccount');
    if (str('bankName')) customerData.bankName = str('bankName');
    if (str('salesChannel')) customerData.salesChannel = str('salesChannel');
    if (str('salesChannelNote')) customerData.salesChannelNote = str('salesChannelNote');

    const customer = await prisma.customer.create({ data: customerData as any });

    // Ghi lịch sử tác động: Lead vào hệ thống từ website qua API chiến dịch
    if (campaign.createdByEmployeeId) {
      try {
        const intCount = await prisma.customerInteraction.count();
        const campaignOwner = campaign.createdByEmployee;
        const interactionContent = noteText
          ? noteText
          : `[Website] Lead vào hệ thống qua chiến dịch "${campaign.name}" lúc ${formatICTDateTime(now)}. NV Marketing: ${campaignOwner?.fullName || campaign.createdByEmployeeId}`;
        await prisma.customerInteraction.create({
          data: {
            code: `INT-${String(intCount + 1).padStart(6, '0')}`,
            customerId: customer.id,
            employeeId: campaign.createdByEmployeeId,
            type: 'lead_created',
            content: interactionContent,
          }
        });
      } catch (intErr) {
        console.warn('Could not create lead_created interaction (public API):', intErr);
      }
    }

    // Kho số: như createMarketingLead — ưu tiên luồng khối (dataFlowShares) + chia đều NV trong đơn vị lá; fallback team_distribution_ratios
    const dpEntry = await prisma.dataPool.create({
      data: {
        customerId: customer.id,
        source: 'MARKETING',
        status: 'AVAILABLE',
        priority: 1,
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
        note: `Từ chiến dịch: ${campaign.name}`,
        processingStatus: DEFAULT_LEAD_PROCESSING_STATUS_CODE,
      }
    });

    const ownerId = campaign.createdByEmployeeId;
    if (ownerId) {
      await assignSingleMarketingPoolToSales({
        dpEntryId: dpEntry.id,
        customerId: customer.id,
        anchorEmployeeId: ownerId,
        now,
      });
    }

    await notifySalesMarketingLeadAssigned([dpEntry.id]);

    // Cập nhật số lượng lead của chiến dịch
    await prisma.marketingCampaign.update({
      where: { id: campaign.id },
      data: {
        leadCount: { increment: 1 }
      }
    });

    // Tạo thông báo trong database
    const notificationTitle = 'Lead mới từ Marketing';
    const notificationContent = `Có lead mới từ chiến dịch "${campaign.name}": ${customer.name} - ${customer.phone}`;
    const notificationMetadata = {
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      campaignId: campaign.id,
      campaignName: campaign.name
    };

    // Lưu thông báo cho người tạo chiến dịch
    const ownerNotification = await createUserNotification(
      campaign.createdByEmployeeId,
      notificationTitle,
      notificationContent,
      'NEW_LEAD',
      '/data-pool',
      notificationMetadata
    );

    // Lưu thông báo cho members của chiến dịch
    const members = await prisma.marketingCampaignMember.findMany({
      where: { campaignId: campaign.id },
      select: { employeeId: true }
    });

    const memberNotifications = await Promise.all(
      members.map(member => 
        createUserNotification(
          member.employeeId,
          notificationTitle,
          notificationContent,
          'NEW_LEAD',
          '/data-pool',
          notificationMetadata
        )
      )
    );

    // Emit socket event để thông báo realtime (room = userId, khớp với socket.join(userId) trong socket.ts)
    try {
      const io = getIO();
      const notificationData = {
        type: 'new_lead',
        id: ownerNotification?.id,
        title: notificationTitle,
        content: notificationContent,
        customerId: customer.id,
        customerName: customer.name,
        customerPhone: customer.phone,
        campaignId: campaign.id,
        campaignName: campaign.name,
        link: '/data-pool',
        timestamp: new Date().toISOString()
      };

      io.to(campaign.createdByEmployeeId).emit('new_lead', notificationData);
      for (const member of members) {
        io.to(member.employeeId).emit('new_lead', notificationData);
      }
    } catch (e) {
      console.warn('Socket emit new_lead skipped:', (e as Error).message);
    }

    // Web Push: hiển thị thông báo khi màn hình khóa / app nền
    const pushPayload = {
      title: notificationTitle,
      body: notificationContent,
      link: '/data-pool',
      data: { customerId: customer.id, campaignId: campaign.id, type: 'NEW_LEAD' }
    };
    sendPushToEmployee(campaign.createdByEmployeeId, pushPayload).catch(e =>
      console.warn('Push to campaign owner failed:', (e as Error).message)
    );
    for (const member of members) {
      sendPushToEmployee(member.employeeId, pushPayload).catch(e =>
        console.warn('Push to campaign member failed:', (e as Error).message)
      );
    }

    res.status(201).json({
      success: true,
      message: 'Đã nhận lead thành công',
      customerId: customer.id,
      customerCode: customer.code,
      isNew: true
    });

  } catch (error: any) {
    console.error('Receive public lead error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Lỗi hệ thống, vui lòng thử lại sau' 
    });
  }
};

/**
 * Lấy thông tin API integration của chiến dịch
 */
export const getCampaignApiInfo = async (req: Request, res: Response) => {
  try {
    const campaignId = req.params.campaignId as string;
    const actor = (req as any).user;

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        code: true,
        name: true,
        apiKey: true,
        webhookSecret: true,
        allowedOrigins: true,
        acceptedFields: true,
        publicLeadAddressHierarchy: true,
        leadCount: true,
        status: true,
        startDate: true,
        endDate: true,
        createdByEmployeeId: true,
      }
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (!(await canAccessMarketingCampaignByCreator(actor, campaign.createdByEmployeeId))) {
      return res.status(403).json({ message: 'Không có quyền xem cấu hình API chiến dịch này' });
    }

    const baseUrl = process.env.API_BASE_URL || 'https://crm.kagri.tech/api';
    const acceptedArr = Array.isArray(campaign.acceptedFields)
      ? (campaign.acceptedFields as string[])
      : null;
    const sampleCode = buildPublicLeadSampleCode(baseUrl, campaign.apiKey, acceptedArr, campaign.code);

    const { createdByEmployeeId: _creatorOmit, ...campaignRest } = campaign;
    res.json({
      ...campaignRest,
      endpoint: `${baseUrl}/public/lead`,
      sampleCode
    });
  } catch (error) {
    console.error('Get campaign API info error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin API' });
  }
};
