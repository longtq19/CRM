import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { isTechnicalAdminRoleCode, userHasCatalogPermission } from '../constants/rbac';
import {
  DEFAULT_POOL_PUSH_PROCESSING_STATUSES,
  POOL_PUSH_STATUS_CODES,
  serializePoolPushStatuses,
} from '../constants/operationParams';

// Lấy tất cả cấu hình theo category
export const getSystemConfigs = async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    
    const where = category ? { category: category as string } : {};
    
    const configs = await prisma.systemConfig.findMany({
      where,
      orderBy: [
        { category: 'asc' },
        { sortOrder: 'asc' }
      ]
    });
    
    res.json(configs);
  } catch (error) {
    console.error('Error fetching system configs:', error);
    res.status(500).json({ error: 'Không thể tải cấu hình hệ thống' });
  }
};

// Lấy một cấu hình theo key
export const getSystemConfigByKey = async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    
    const config = await prisma.systemConfig.findUnique({
      where: { key }
    });
    
    if (!config) {
      return res.status(404).json({ error: 'Không tìm thấy cấu hình' });
    }
    
    res.json(config);
  } catch (error) {
    console.error('Error fetching system config:', error);
    res.status(500).json({ error: 'Không thể tải cấu hình' });
  }
};

// Cập nhật một cấu hình (EDIT_SETTINGS hoặc MANAGE_HR cho category 'hr')
export const updateSystemConfig = async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const { value } = req.body;
    const user = (req as any).user;
    const userId = user?.id;
    const permissions: string[] = user?.permissions || [];
    const roleGroupCode: string | null = user?.roleGroupCode ?? null;

    const existingConfig = await prisma.systemConfig.findUnique({
      where: { key }
    });

    if (!existingConfig) {
      return res.status(404).json({ error: 'Không tìm thấy cấu hình' });
    }

    const canEditOperationsParams =
      existingConfig.category === 'operations_params' &&
      userHasCatalogPermission({ roleGroupCode, permissions }, ['CONFIG_OPERATIONS', 'EDIT_SETTINGS']);

    const canEdit =
      canEditOperationsParams ||
      permissions.includes('EDIT_SETTINGS') ||
      permissions.includes('FULL_ACCESS') ||
      (existingConfig.category === 'hr' && (permissions.includes('MANAGE_HR') || permissions.includes('FULL_ACCESS')));
    if (!canEdit) {
      return res.status(403).json({ error: 'Bạn không có quyền cập nhật cấu hình này' });
    }
    
    // Validate value based on dataType
    if (existingConfig.dataType === 'INTEGER') {
      const intValue = parseInt(value, 10);
      if (isNaN(intValue)) {
        return res.status(400).json({ error: 'Giá trị phải là số nguyên' });
      }
    } else if (existingConfig.dataType === 'BOOLEAN') {
      if (value !== 'true' && value !== 'false') {
        return res.status(400).json({ error: 'Giá trị phải là true hoặc false' });
      }
    } else     if (existingConfig.dataType === 'ENUM' && existingConfig.enumOptions) {
      const options = JSON.parse(existingConfig.enumOptions);
      if (!options.includes(value)) {
        return res.status(400).json({ error: `Giá trị phải là một trong: ${options.join(', ')}` });
      }
    } else if (existingConfig.key === 'pool_push_processing_statuses' && existingConfig.dataType === 'STRING') {
      let arr: unknown;
      try {
        arr = JSON.parse(String(value));
      } catch {
        return res.status(400).json({ error: 'Giá trị phải là mảng JSON hợp lệ' });
      }
      if (!Array.isArray(arr)) {
        return res.status(400).json({ error: 'Giá trị phải là mảng JSON hợp lệ' });
      }
      
      const dbStatuses = await prisma.leadProcessingStatus.findMany({ select: { code: true } });
      const validCodes = new Set(dbStatuses.map((s: { code: string }) => s.code));
      
      if (!arr.every((x: unknown) => typeof x === 'string' && validCodes.has(x))) {
        return res.status(400).json({ error: 'Mỗi phần tử phải là mã trạng thái hợp lệ trong danh mục' });
      }
    }
    
    const updated = await prisma.systemConfig.update({
      where: { key },
      data: {
        value: String(value),
        updatedBy: userId
      }
    });
    
    res.json(updated);
  } catch (error) {
    console.error('Error updating system config:', error);
    res.status(500).json({ error: 'Không thể cập nhật cấu hình' });
  }
};

// Cập nhật nhiều cấu hình cùng lúc
export const updateMultipleConfigs = async (req: Request, res: Response) => {
  try {
    const { configs } = req.body; // Array of { key, value, description?, name? }
    const userId = (req as any).user?.id;
    
    if (!Array.isArray(configs)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }
    
    const results = [];
    
    const user = (req as any).user;
    const permissions = user?.permissions || [];
    const canEditDataPoolConfig =
      isTechnicalAdminRoleCode(user?.roleGroupCode) || permissions.includes('DATA_POOL_CONFIG');

    const canEditOperationsParams = userHasCatalogPermission(user, ['CONFIG_OPERATIONS', 'EDIT_SETTINGS']);

    for (const config of configs) {
      const existingConfig = await prisma.systemConfig.findUnique({
        where: { key: config.key }
      });
      
      if (!existingConfig) continue;

      if (existingConfig.category === 'lead_distribution' && !canEditDataPoolConfig) {
        return res.status(403).json({ error: 'Chỉ ADM được cập nhật cấu hình Phân bổ Lead (kho số chung)' });
      }

      if (existingConfig.category === 'operations_params' && !canEditOperationsParams) {
        return res.status(403).json({ error: 'Bạn không có quyền cập nhật Tham số vận hành' });
      }
      
      // Validate value
      let isValid = true;
      if (existingConfig.dataType === 'INTEGER') {
        isValid = !isNaN(parseInt(config.value, 10));
      } else if (existingConfig.dataType === 'BOOLEAN') {
        isValid = config.value === 'true' || config.value === 'false';
      } else if (existingConfig.dataType === 'ENUM' && existingConfig.enumOptions) {
        const options = JSON.parse(existingConfig.enumOptions || '[]');
        isValid = options.includes(config.value);
      } else if (existingConfig.key === 'pool_push_processing_statuses') {
        try {
          const arr = JSON.parse(String(config.value));
          if (!Array.isArray(arr)) {
            isValid = false;
          } else {
            const dbStatuses = await prisma.leadProcessingStatus.findMany({ select: { code: true } });
            const validCodes = new Set(dbStatuses.map((s: { code: string }) => s.code));
            isValid = arr.every((x: unknown) => typeof x === 'string' && validCodes.has(x));
          }
        } catch {
          isValid = false;
        }
      }
      
      if (isValid) {
        const updateData: any = {
          value: String(config.value),
          updatedBy: userId
        };
        
        // Allow updating name and description
        if (config.name !== undefined) {
          updateData.name = config.name;
        }
        if (config.description !== undefined) {
          updateData.description = config.description;
        }
        
        const updated = await prisma.systemConfig.update({
          where: { key: config.key },
          data: updateData
        });
        results.push(updated);
      }
    }
    
    res.json({ updated: results.length, configs: results });
  } catch (error) {
    console.error('Error updating multiple configs:', error);
    res.status(500).json({ error: 'Không thể cập nhật cấu hình' });
  }
};

// Lấy giá trị cấu hình (helper function cho internal use)
export const getConfigValue = async (key: string): Promise<string | number | boolean | null> => {
  try {
    const config = await prisma.systemConfig.findUnique({
      where: { key }
    });
    
    if (!config) return null;
    
    switch (config.dataType) {
      case 'INTEGER':
        return parseInt(config.value, 10);
      case 'BOOLEAN':
        return config.value === 'true';
      default:
        return config.value;
    }
  } catch (error) {
    console.error(`Error getting config value for ${key}:`, error);
    return null;
  }
};

// Lấy tất cả categories
export const getConfigCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.systemConfig.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' }
    });
    
    res.json(categories.map(c => c.category));
  } catch (error) {
    console.error('Error fetching config categories:', error);
    res.status(500).json({ error: 'Không thể tải danh sách danh mục' });
  }
};

// Seed default configs (chạy một lần khi khởi tạo)
export const seedDefaultConfigs = async () => {
  const poolPushDefault = serializePoolPushStatuses(DEFAULT_POOL_PUSH_PROCESSING_STATUSES);

  /** Chỉ hiển thị trên tab «Tham số vận hành» (category operations_params). */
  const operationsParams = [
    {
      key: 'min_note_characters',
      value: '10',
      dataType: 'INTEGER' as const,
      category: 'operations_params',
      name: 'Số ký tự tối thiểu nội dung ghi chú lịch sử tác động',
      description:
        'Áp dụng khi nhân sự ghi lịch sử tác động khách (Sales / CSKH / …).',
      sortOrder: 1,
    },
    {
      key: 'marketing_allow_duplicate_phone',
      value: 'true',
      dataType: 'BOOLEAN' as const,
      category: 'operations_params',
      name: 'Cho phép marketing nhập số trùng',
      description:
        'Bật: cho phép ghi nhận trùng SĐT (1 khách — nhiều lần nhập marketing; doanh số lặp theo nghiệp vụ resales). Tắt: hệ thống từ chối tạo lead trùng SĐT.',
      sortOrder: 2,
    },
    {
      key: 'marketing_revenue_attribution_days',
      value: '45',
      dataType: 'INTEGER' as const,
      category: 'operations_params',
      name: 'Số ngày không phát sinh đơn (kể từ ngày nhận hàng gần nhất) để marketing được ghi nhận doanh số sales',
      description:
        'Kể từ đơn giao thành công gần nhất: hết kỳ này marketing hết attribution mặc định. Ngoại lệ: CSKH có thể gia hạn trên từng khách (VIP) qua «Số ngày gia hạn attribution» trên khách; sales vẫn chăm sóc đơn mới.',
      sortOrder: 3,
    },
    {
      key: 'pool_push_processing_statuses',
      value: poolPushDefault,
      dataType: 'STRING' as const,
      category: 'operations_params',
      name: 'Trạng thái xử lý đẩy số về kho thả nổi',
      description:
        'Danh sách mã trạng thái (JSON). Khi sales chọn một mã thuộc danh sách, số được trả về kho thả nổi (AVAILABLE). Các mã không nằm trong danh sách (ví dụ Không nghe máy / Không nhu cầu) vẫn có thể kích hoạt luồng phân bổ lại theo «Số vòng phân bộ lại».',
      sortOrder: 4,
    },
    {
      key: 'data_pool_auto_recall_days',
      value: '3',
      dataType: 'INTEGER' as const,
      category: 'operations_params',
      name: 'Số ngày Sales được giữ số (kể từ nhận data)',
      description:
        'Hết hạn: thu hồi và phân lại sales khác (theo khối / không trùng sales cũ) hoặc chuyển bước CSKH nếu là luồng sau CSKH.',
      sortOrder: 5,
    },
    {
      key: 'max_repartition_rounds',
      value: '5',
      dataType: 'INTEGER' as const,
      category: 'operations_params',
      name: 'Số vòng phân bộ lại Sales tối đa',
      description:
        'Khi sales không chốt: thu hồi về kho sales trong khối, phân sales mới (không trùng người cũ); hết sales trong đơn vị thì sang đơn vị khác cùng khối, hết khối thì sang khối khác. Sau đủ số vòng: trả số về kho thả nổi.',
      sortOrder: 6,
    },
    {
      key: 'sales_orders_before_cs_handoff',
      value: '1',
      dataType: 'INTEGER' as const,
      category: 'operations_params',
      name: 'Số đơn giao thành công trước khi chuyển sang CSKH',
      description:
        'Sau khi đủ số đơn DELIVERED (mặc định 1 = đơn đầu), khách chuyển về kho CSKH và phân chăm sóc. Tham số dự phòng đổi nghiệp vụ.',
      sortOrder: 7,
    },
    {
      key: 'customer_recycle_days',
      value: '180',
      dataType: 'INTEGER' as const,
      category: 'operations_params',
      name: 'Số ngày CSKH lần 1 được giữ số',
      description: 'Kể từ khi bắt đầu chăm sóc sau đơn đầu (hoặc theo cấu hình số đơn).',
      sortOrder: 8,
    },
    {
      key: 'cskh_max_note_days',
      value: '15',
      dataType: 'INTEGER' as const,
      category: 'operations_params',
      name: 'Số ngày CSKH phải có ghi chú lịch sử (mặc định hệ thống)',
      description:
        'Quá hạn không ghi chú: thu hồi. CSKH có thể chỉnh hạn riêng trên từng khách (API / form cập nhật khách).',
      sortOrder: 9,
    },
    {
      key: 'resales_hold_days',
      value: '90',
      dataType: 'INTEGER' as const,
      category: 'operations_params',
      name: 'Số ngày CSKH lần 2+ được giữ số',
      description:
        'Sau khi sales (sau thu hồi CSKH) không chốt đơn trong thời hạn giữ số, phân lại CSKH khác; ưu tiên cùng đơn vị → cùng khối → khối khác.',
      sortOrder: 10,
    },
  ];

  const leadDistributionOnly = [
    {
      key: 'auto_assign_lead',
      value: 'true',
      dataType: 'BOOLEAN' as const,
      category: 'lead_distribution',
      name: 'Tự động phân bổ lead',
      description: 'Bật/tắt chức năng tự động phân bổ lead (kho số chung)',
      sortOrder: 1,
    },
    {
      key: 'lead_assign_method',
      value: 'round_robin',
      dataType: 'ENUM' as const,
      enumOptions: JSON.stringify(['round_robin', 'random', 'manual']),
      category: 'lead_distribution',
      name: 'Phương pháp phân bổ lead',
      description: 'round_robin / random / manual',
      sortOrder: 2,
    },
  ];

  const allSeed = [...operationsParams, ...leadDistributionOnly];

  for (const config of allSeed) {
    const row = config as typeof config & { enumOptions?: string };
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {
        value: String(config.value),
        dataType: config.dataType,
        enumOptions: row.enumOptions ?? null,
        category: config.category,
        name: config.name,
        description: config.description ?? null,
        sortOrder: config.sortOrder,
      },
      create: {
        key: config.key,
        value: String(config.value),
        dataType: config.dataType,
        enumOptions: row.enumOptions ?? null,
        category: config.category,
        name: config.name,
        description: config.description ?? null,
        sortOrder: config.sortOrder,
      },
    });
  }

  const deprecatedKeys = [
    'marketing_revenue_attribution_orders',
    'marketing_revenue_attribution_min_days_between_orders',
    'marketing_lead_ownership_days',
    'lead_recycle_days',
    'telesales_lead_hold_days',
    'telesales_inactive_revoke_days',
    'telesales_followup_cycle_days',
    'min_telesales_contact_attempts',
    'resales_transfer_after_first_order_days',
    'resales_customer_care_cycle_days',
  ];
  await prisma.systemConfig.updateMany({
    where: { key: { in: deprecatedKeys } },
    data: { category: 'deprecated_internal' },
  });

  console.log('Default system configs seeded successfully');
};
