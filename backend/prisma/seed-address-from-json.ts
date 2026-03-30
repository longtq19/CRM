/**
 * Nạp địa chỉ từ backend/data/addresses/*.json vào PostgreSQL (logic khớp POST /api/address/seed-from-json).
 *
 * Chạy từ thư mục backend:
 *   npx ts-node prisma/seed-address-from-json.ts           # both
 *   npx ts-node prisma/seed-address-from-json.ts --new     # sau sáp nhập
 *   npx ts-node prisma/seed-address-from-json.ts --old     # trước sáp nhập
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { storageAdministrativeName } from '../src/utils/addressDisplayNormalize';

/** Thư mục gốc backend: `prisma/` (ts-node) hoặc `dist/prisma/` (node build). */
function getBackendRoot(): string {
  const base = path.basename(path.dirname(__dirname));
  if (base === 'dist') {
    return path.resolve(__dirname, '../..');
  }
  return path.resolve(__dirname, '..');
}

const backendRoot = getBackendRoot();
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

const prisma = new PrismaClient();
const dataDir = path.join(backendRoot, 'data', 'addresses');

function resolveSource(): 'new' | 'old' | 'both' {
  const a = process.argv.slice(2);
  const hasNew = a.includes('--new');
  const hasOld = a.includes('--old');
  if (hasNew && !hasOld) return 'new';
  if (hasOld && !hasNew) return 'old';
  return 'both';
}

function loadJson(filename: string): unknown | null {
  const p = path.join(dataDir, filename);
  if (!fs.existsSync(p)) {
    console.warn('Thiếu file:', p);
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8')) as unknown;
}

async function main() {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`Thư mục không tồn tại: ${dataDir}`);
  }

  const source = resolveSource();
  const stats = { provinces: 0, districts: 0, wards: 0 };

  const load = loadJson;

  if (source === 'new' || source === 'both') {
    const provincesNew = load('provinces-new.json') as
      | { PROVINCES?: Array<{ PROVINCE_ID: number; PROVINCE_CODE?: string; PROVINCE_NAME: string }> }
      | null;
    const wardsNew = load('wards-new.json') as
      | { WARDS?: Array<{ WARDS_ID: number; WARDS_NAME: string; PROVINCE_ID: number }> }
      | null;

    if (provincesNew?.PROVINCES) {
      for (const p of provincesNew.PROVINCES) {
        const nm = storageAdministrativeName(p.PROVINCE_NAME);
        await prisma.province.upsert({
          where: { id: String(p.PROVINCE_ID) },
          update: { name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) },
          create: {
            id: String(p.PROVINCE_ID),
            name: nm,
            code: p.PROVINCE_CODE || String(p.PROVINCE_ID)
          }
        });
        stats.provinces++;
      }
    }
    if (wardsNew?.WARDS) {
      for (const w of wardsNew.WARDS) {
        const wnm = storageAdministrativeName(w.WARDS_NAME);
        await prisma.ward.upsert({
          where: { id: String(w.WARDS_ID) },
          update: {
            name: wnm,
            code: String(w.WARDS_ID),
            provinceId: String(w.PROVINCE_ID),
            districtId: null
          },
          create: {
            id: String(w.WARDS_ID),
            name: wnm,
            code: String(w.WARDS_ID),
            provinceId: String(w.PROVINCE_ID),
            districtId: null
          }
        });
        stats.wards++;
      }
    }
  }

  if (source === 'old' || source === 'both') {
    const provincesOld = load('provinces-old.json') as
      | { PROVINCES?: Array<{ PROVINCE_ID: number; PROVINCE_CODE?: string; PROVINCE_NAME: string }> }
      | null;
    const districtsOld = load('districts-old.json') as
      | { DISTRICTS?: Array<{ DISTRICT_ID: number; DISTRICT_VALUE?: string; DISTRICT_NAME: string; PROVINCE_ID: number }> }
      | null;
    const wardsOld = load('wards-old.json') as
      | { WARDS?: Array<{ WARDS_ID: number; WARDS_NAME: string; DISTRICT_ID: number }> }
      | null;

    if (provincesOld?.PROVINCES) {
      for (const p of provincesOld.PROVINCES) {
        const nm = storageAdministrativeName(p.PROVINCE_NAME);
        await prisma.province.upsert({
          where: { id: String(p.PROVINCE_ID) },
          update: { name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) },
          create: {
            id: String(p.PROVINCE_ID),
            name: nm,
            code: p.PROVINCE_CODE || String(p.PROVINCE_ID)
          }
        });
        stats.provinces++;
      }
    }
    const districtToProvince: Record<number, number> = {};
    if (districtsOld?.DISTRICTS) {
      for (const d of districtsOld.DISTRICTS) {
        districtToProvince[d.DISTRICT_ID] = d.PROVINCE_ID;
        const dnm = storageAdministrativeName(d.DISTRICT_NAME);
        await prisma.district.upsert({
          where: { id: String(d.DISTRICT_ID) },
          update: {
            name: dnm,
            code: d.DISTRICT_VALUE || String(d.DISTRICT_ID),
            provinceId: String(d.PROVINCE_ID)
          },
          create: {
            id: String(d.DISTRICT_ID),
            name: dnm,
            code: d.DISTRICT_VALUE || String(d.DISTRICT_ID),
            provinceId: String(d.PROVINCE_ID)
          }
        });
        stats.districts++;
      }
    }
    if (wardsOld?.WARDS && Object.keys(districtToProvince).length) {
      for (const w of wardsOld.WARDS) {
        const provinceId = districtToProvince[w.DISTRICT_ID];
        if (provinceId == null) continue;
        const wnm = storageAdministrativeName(w.WARDS_NAME);
        await prisma.ward.upsert({
          where: { id: String(w.WARDS_ID) },
          update: {
            name: wnm,
            code: String(w.WARDS_ID),
            districtId: String(w.DISTRICT_ID),
            provinceId: String(provinceId)
          },
          create: {
            id: String(w.WARDS_ID),
            name: wnm,
            code: String(w.WARDS_ID),
            districtId: String(w.DISTRICT_ID),
            provinceId: String(provinceId)
          }
        });
        stats.wards++;
      }
    }
  }

  console.log('Nạp địa chỉ xong.', stats);
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
  if (process.exitCode) process.exit(process.exitCode);
})();
