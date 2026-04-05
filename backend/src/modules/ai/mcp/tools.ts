import { prisma } from '../../../config/database';

export interface McpTool {
  name: string;
  description: string;
  parameters: any;
  execute: (args: any, userId: string) => Promise<any>;
}

export const AI_TOOLS: McpTool[] = [
  {
    name: 'search_customers',
    description: 'Tìm kiếm khách hàng theo tên, số điện thoại hoặc mã khách hàng.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Từ khóa tìm kiếm (tên, SĐT, mã KH)' },
        limit: { type: 'number', description: 'Số lượng kết quả tối đa (mặc định 10)' }
      },
      required: ['query']
    },
    execute: async (args, userId) => {
      const { query, limit = 10 } = args;
      return await prisma.customer.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } },
            { code: { contains: query, mode: 'insensitive' } }
          ]
        },
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          code: true,
          status: true,
          province: { select: { name: true } }
        }
      });
    }
  },
  {
    name: 'get_customer_details',
    description: 'Lấy thông tin chi tiết và lịch sử tương tác của một khách hàng.',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'string', description: 'ID của khách hàng' }
      },
      required: ['customerId']
    },
    execute: async (args, userId) => {
      const { customerId } = args;
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        include: {
          province: true,
          district: true,
          ward: true,
          employee: { select: { fullName: true, phone: true } },
          dataPool: { select: { processingStatus: true, priority: true } },
          interactions: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true, kind: true, detail: true }
          }
        }
      });
      return customer;
    }
  },
  {
    name: 'search_orders',
    description: 'Tìm kiếm đơn hàng theo mã đơn, tên khách hoặc trạng thái.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Mã đơn hàng hoặc tên khách' },
        status: { type: 'string', description: 'Trạng thái (DRAFT, CONFIRMED, SHIPPING, COMPLETED, CANCELLED)' }
      }
    },
    execute: async (args, userId) => {
      const { query, status } = args;
      const where: any = {};
      if (status) where.orderStatus = status;
      if (query) {
        where.OR = [
          { code: { contains: query, mode: 'insensitive' } },
          { customer: { name: { contains: query, mode: 'insensitive' } } }
        ];
      }
      return await prisma.order.findMany({
        where,
        take: 10,
        orderBy: { orderDate: 'desc' },
        select: {
          id: true,
          code: true,
          orderDate: true,
          orderStatus: true,
          shippingStatus: true,
          finalAmount: true,
          customer: { select: { name: true } }
        }
      });
    }
  },
  {
    name: 'get_organization_structure',
    description: 'Lấy thông tin về sơ đồ tổ chức (Khối, Phòng ban).',
    parameters: {
      type: 'object',
      properties: {}
    },
    execute: async (args, userId) => {
      return await prisma.department.findMany({
        where: { type: { in: ['DIVISION', 'DEPARTMENT', 'TEAM'] } },
        select: {
          id: true,
          name: true,
          code: true,
          type: true,
          parentId: true
        },
        orderBy: { displayOrder: 'asc' }
      });
    }
  },
  {
    name: 'search_employees',
    description: 'Tìm kiếm nhân viên trong hệ thống.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Tên, mã NV hoặc SĐT' }
      }
    },
    execute: async (args, userId) => {
      const { query } = args;
      return await prisma.employee.findMany({
        where: {
          OR: [
            { fullName: { contains: query, mode: 'insensitive' } },
            { code: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query } }
          ],
          isLocked: false
        },
        take: 10,
        select: {
          id: true,
          fullName: true,
          code: true,
          phone: true,
          isOnline: true,
          hrJobTitle: true
        }
      });
    }
  }
];
