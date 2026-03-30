import { prisma } from '../config/database';
import { DEFAULT_CUSTOMER_TAGS } from '../constants/defaultCustomerTags';

/** Upsert thẻ mặc định (theo mã) — an toàn khi khởi động nhiều lần. */
export async function ensureDefaultCustomerTags(): Promise<void> {
  try {
    for (const t of DEFAULT_CUSTOMER_TAGS) {
      await prisma.customerTag.upsert({
        where: { code: t.code },
        create: {
          code: t.code,
          name: t.name,
          color: t.color,
          bgColor: t.bgColor,
          description: t.description ?? null,
          category: t.category,
          sortOrder: t.sortOrder,
          isActive: true,
        },
        update: {
          name: t.name,
          color: t.color,
          bgColor: t.bgColor,
          description: t.description ?? null,
          category: t.category,
          sortOrder: t.sortOrder,
          isActive: true,
        },
      });
    }
    console.log('[HCRM] Đã đồng bộ thẻ khách hàng mặc định (Kagri nông nghiệp / IoT).');
  } catch (e) {
    console.error('[HCRM] ensureDefaultCustomerTags:', e);
  }
}
