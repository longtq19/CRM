/**
 * Backup DB trước khi thay đổi schema (loại nhân viên).
 * Chạy: cd backend && node scripts/backup-db-optional.js
 * Cần: pg_dump có sẵn và DATABASE_URL trong .env
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL chưa có trong .env. Bỏ qua backup.');
  process.exit(0);
}
const backupDir = path.join(__dirname, '../backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const outFile = path.join(backupDir, `pg_backup_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.sql`);
try {
  execSync(`pg_dump "${url}" --no-owner --no-acl -f "${outFile}"`, { stdio: 'inherit', shell: true });
  console.log('Backup lưu tại:', outFile);
} catch (e) {
  console.error('pg_dump thất bại (có thể chưa cài hoặc DB không chạy). Backup bỏ qua.');
  process.exit(0);
}
