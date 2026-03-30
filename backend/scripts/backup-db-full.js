/**
 * Backup toàn bộ DB PostgreSQL (định dạng custom, pg_restore).
 * Chạy: cd backend && npm run backup:db
 * Cần: DATABASE_URL trong .env; pg_dump (PATH hoặc cài PostgreSQL client Windows).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const url = process.env.DATABASE_URL;
if (!url || !String(url).trim()) {
  console.error('Thiếu DATABASE_URL trong .env');
  process.exit(1);
}

const backupDir = path.join(__dirname, '../backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.join(backupDir, `hcrm_full_${stamp}.dump`);

function pgDumpCandidates() {
  const list = ['pg_dump'];
  if (process.platform === 'win32') {
    list.push('pg_dump.exe');
    const base = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'PostgreSQL');
    try {
      const vers = fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory());
      const bins = vers
        .map((d) => path.join(base, d.name, 'bin', 'pg_dump.exe'))
        .filter((p) => fs.existsSync(p));
      bins.sort();
      list.push(...bins.reverse());
    } catch {
      /* ignore */
    }
  }
  return list;
}

let lastErr;
for (const cmd of pgDumpCandidates()) {
  try {
    execFileSync(cmd, ['-Fc', '-f', outFile, url], { stdio: 'inherit' });
    console.log('Đã backup (custom format):', outFile);
    process.exit(0);
  } catch (e) {
    lastErr = e;
  }
}
console.error('Không chạy được pg_dump. Cài PostgreSQL client hoặc thêm bin vào PATH.');
if (lastErr) console.error(lastErr.message);
process.exit(1);
