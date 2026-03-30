import cron from 'node-cron';
import { logModel } from '../models/logModel';

const LOG_RETENTION_DAYS = 90;

export const initLogCleanup = () => {
  // Run every day at 00:00 (Midnight)
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('Running log cleanup job...');
      
      const retentionDate = new Date();
      retentionDate.setDate(retentionDate.getDate() - LOG_RETENTION_DAYS);
      
      // Reset time to end of that day to ensure we keep full 90 days
      retentionDate.setHours(23, 59, 59, 999);

      const result = await logModel.deleteOldLogs(retentionDate);
      
      console.log(`Log cleanup completed. Deleted ${result.count} logs older than ${retentionDate.toISOString()}`);
    } catch (error) {
      console.error('Error running log cleanup job:', error);
    }
  });

  console.log(`Log cleanup job scheduled (Retention: ${LOG_RETENTION_DAYS} days)`);
};
