import { Request, Response } from 'express';
import { prisma } from '../config/database';
import crypto from 'crypto';
import { createUserNotification } from './userNotificationController';
import { getIO } from '../socket';
import { sendPushToEmployee } from '../services/pushNotificationService';
import {
  checkDuplicateAndHandle,
  getMarketingAttributionDays,
  getAttributionExpiredAt,
  getDuplicateNotificationTargets,
  normalizePhone
} from '../services/leadDuplicateService';
import { pickNextSalesEmployeeId } from '../services/leadRoutingService';
import { DATA_POOL_QUEUE } from '../constants/dataPoolQueue';

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

    const campaign = await prisma.marketingCampaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
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
    const { acceptedFields } = req.body;

    const campaign = await prisma.marketingCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }
    if (!campaign.apiKey) {
      return res.status(400).json({ message: 'Chiến dịch chưa có API key' });
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
    const { allowedOrigins } = req.body;

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

    // Tìm chiến dịch theo API key
    const campaign = await prisma.marketingCampaign.findUnique({
      where: { apiKey },
      include: {
        source: true,
        createdByEmployee: {
          select: { id: true, fullName: true }
        }
      }
    });

    if (!campaign) {
      return res.status(401).json({ 
        success: false,
        message: 'API key không hợp lệ' 
      });
    }

    // Kiểm tra chiến dịch còn hoạt động không
    if (campaign.status !== 'ACTIVE' && campaign.status !== 'RUNNING') {
      return res.status(400).json({ 
        success: false,
        message: 'Chiến dịch không còn hoạt động' 
      });
    }

    // Kiểm tra thời gian chiến dịch
    const now = new Date();
    if (campaign.endDate && now > campaign.endDate) {
      return res.status(400).json({ 
        success: false,
        message: 'Chiến dịch đã kết thúc' 
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
      return res.status(400).json({
        success: false,
        message:
          duplicateResult.message ||
          'Hệ thống không cho phép nhập số trùng.',
      });
    }

    if (duplicateResult.duplicate && duplicateResult.existingCustomer) {
      const title = 'Marketing nhập số trùng';
      const content = `Marketing ${campaignOwnerName} đã nhập số trùng ${trimmedPhone}. Note: ${noteText || '-'}`;
      const targets = getDuplicateNotificationTargets(duplicateResult.existingCustomer);
      for (const employeeId of targets) {
        await createUserNotification(employeeId, title, content, 'DUPLICATE_LEAD', `/customers/${duplicateResult.customerId}`, { customerId: duplicateResult.customerId, phone: trimmedPhone });
      }
      return res.status(200).json({
        success: true,
        message: duplicateResult.message || 'Số điện thoại đã tồn tại trong hệ thống',
        customerId: duplicateResult.customerId,
        isNew: false,
        duplicate: true,
        case: duplicateResult.case
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
          : `[Website] Lead vào hệ thống qua chiến dịch "${campaign.name}" lúc ${now.toLocaleString('vi-VN')}. NV Marketing: ${campaignOwner?.fullName || campaign.createdByEmployeeId}`;
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

    // Kho số: giống createMarketingLead — mặc định AVAILABLE; nếu đơn vị của người tạo chiến dịch bật autoDistributeLead thì tự gán Sales (Lead của tôi).
    const dpEntry = await prisma.dataPool.create({
      data: {
        customerId: customer.id,
        source: 'MARKETING',
        status: 'AVAILABLE',
        priority: 1,
        poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
        note: `Từ chiến dịch: ${campaign.name}`
      }
    });

    const ownerId = campaign.createdByEmployeeId;
    if (ownerId) {
      const ownerEmp = await prisma.employee.findUnique({
        where: { id: ownerId },
        select: { departmentId: true }
      });
      if (ownerEmp?.departmentId) {
        const dept = await prisma.department.findUnique({
          where: { id: ownerEmp.departmentId },
          select: { autoDistributeLead: true }
        });
        if (dept?.autoDistributeLead) {
          const pickId = await pickNextSalesEmployeeId({
            seed: `${dpEntry.id}:${customer.id}`,
            excludeIds: [],
            anchorEmployeeId: ownerId
          });
          if (pickId) {
            const salesKeepDaysCfg = await prisma.systemConfig
              .findUnique({ where: { key: 'data_pool_auto_recall_days' } })
              .catch(() => null);
            const salesKeepDays = salesKeepDaysCfg ? parseInt(salesKeepDaysCfg.value, 10) : 3;
            const maxRoundsCfg = await prisma.systemConfig
              .findUnique({ where: { key: 'max_repartition_rounds' } })
              .catch(() => null);
            const maxRounds = maxRoundsCfg ? parseInt(maxRoundsCfg.value, 10) : 5;
            await prisma.dataPool.update({
              where: { id: dpEntry.id },
              data: {
                status: 'ASSIGNED',
                poolType: 'SALES',
                poolQueue: DATA_POOL_QUEUE.SALES_OPEN,
                assignedToId: pickId,
                assignedAt: now,
                deadline: new Date(now.getTime() + salesKeepDays * 24 * 60 * 60 * 1000),
                maxRounds: Number.isFinite(maxRounds) ? maxRounds : 5
              }
            });
            await prisma.customer.update({
              where: { id: customer.id },
              data: { employeeId: pickId }
            });
            await prisma.leadDistributionHistory.create({
              data: { customerId: customer.id, employeeId: pickId, method: 'AUTO' }
            });
          }
        }
      }
    }

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
        status: true
      }
    });

    if (!campaign) {
      return res.status(404).json({ message: 'Không tìm thấy chiến dịch' });
    }

    const baseUrl = process.env.API_BASE_URL || 'https://crm.kagri.tech/api';
    const acceptedArr = Array.isArray(campaign.acceptedFields)
      ? (campaign.acceptedFields as string[])
      : null;
    const sampleCode = buildPublicLeadSampleCode(baseUrl, campaign.apiKey, acceptedArr, campaign.code);

    res.json({
      ...campaign,
      endpoint: `${baseUrl}/public/lead`,
      sampleCode
    });
  } catch (error) {
    console.error('Get campaign API info error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin API' });
  }
};
