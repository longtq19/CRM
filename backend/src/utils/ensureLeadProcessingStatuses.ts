import { prisma } from '../config/database';
import {
  POOL_PUSH_STATUS_DEFINITIONS,
  DEFAULT_POOL_PUSH_PROCESSING_STATUSES,
  DEFAULT_LEAD_PROCESSING_STATUS_CODE,
} from '../constants/operationParams';
import { syncLeadStatusesIsPushToPoolFromConfigValue } from './poolPushSync';

/**
 * Upsert danh mục `lead_processing_statuses` theo hằng số + thứ tự;
 * gán `data_pool.processing_status = NEW` cho bản ghi còn null.
 */
export async function ensureLeadProcessingStatuses(): Promise<void> {
  for (let i = 0; i < POOL_PUSH_STATUS_DEFINITIONS.length; i++) {
    const def = POOL_PUSH_STATUS_DEFINITIONS[i];
    const isPushToPool = DEFAULT_POOL_PUSH_PROCESSING_STATUSES.includes(def.code);
    await prisma.leadProcessingStatus.upsert({
      where: { code: def.code },
      update: {
        name: def.label,
        sortOrder: i,
      },
      create: {
        code: def.code,
        name: def.label,
        isPushToPool,
        sortOrder: i,
        color: '#9CA3AF',
      },
    });
  }
  await prisma.dataPool.updateMany({
    where: { processingStatus: null },
    data: { processingStatus: DEFAULT_LEAD_PROCESSING_STATUS_CODE },
  });

  const pushRow = await prisma.systemConfig.findUnique({ where: { key: 'pool_push_processing_statuses' } });
  await syncLeadStatusesIsPushToPoolFromConfigValue(pushRow?.value ?? '');
}
