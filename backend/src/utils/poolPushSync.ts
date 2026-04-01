import { prisma } from '../config/database';
import { parsePoolPushStatusesJson, serializePoolPushStatuses } from '../constants/operationParams';

/** Đồng bộ cờ `isPushToPool` trên `lead_processing_statuses` theo giá trị JSON `pool_push_processing_statuses`. */
export async function syncLeadStatusesIsPushToPoolFromConfigValue(raw: string): Promise<void> {
  const codes = new Set(parsePoolPushStatusesJson(raw));
  const rows = await prisma.leadProcessingStatus.findMany({ select: { code: true } });
  await prisma.$transaction(
    rows.map((r) =>
      prisma.leadProcessingStatus.update({
        where: { code: r.code },
        data: { isPushToPool: codes.has(r.code) },
      })
    )
  );
}

/** Ghi lại `pool_push_processing_statuses` theo các dòng đang `isPushToPool` và `isActive`. */
export async function rebuildPoolPushConfigFromLeadStatuses(): Promise<void> {
  const existing = await prisma.systemConfig.findUnique({ where: { key: 'pool_push_processing_statuses' } });
  if (!existing) return;

  const rows = await prisma.leadProcessingStatus.findMany({
    where: { isPushToPool: true, isActive: true },
    select: { code: true },
  });
  const value = serializePoolPushStatuses(rows.map((r) => r.code));
  await prisma.systemConfig.update({
    where: { key: 'pool_push_processing_statuses' },
    data: { value },
  });
}
