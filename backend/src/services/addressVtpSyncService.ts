import { prisma } from '../config/database';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  jsonExportTitleCaseAdministrativeName,
  storageAdministrativeName
} from '../utils/addressDisplayNormalize';

function getV2BaseUrl(): string {
  return (process.env.VTP_API_URL || 'https://partner.viettelpost.vn/v2').replace(/\/$/, '');
}

/** V3 danh mục sau sáp nhập: cùng host, đổi /v2 → /v3 */
function getV3BaseUrl(): string {
  const v2 = getV2BaseUrl();
  if (/\/v2$/i.test(v2)) return v2.replace(/\/v2$/i, '/v3');
  return `${v2.replace(/\/v2\/.*$/i, '')}/v3`;
}

function getVtpToken(): string {
  const t = process.env.VTP_TOKEN || '';
  if (!t.trim()) throw new Error('Thiếu VTP_TOKEN trong môi trường (.env)');
  return t.trim();
}

function extractRows(payload: unknown): any[] {
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload)) return payload;
  const j = payload as Record<string, unknown>;
  if (j.error === true) return [];
  if (Array.isArray(j.data)) return j.data as any[];
  const d = j.data;
  if (d && typeof d === 'object') {
    const o = d as Record<string, unknown>;
    if (Array.isArray(o.PROVINCES)) return o.PROVINCES as any[];
    if (Array.isArray(o.DISTRICTS)) return o.DISTRICTS as any[];
    if (Array.isArray(o.WARDS)) return o.WARDS as any[];
  }
  if (Array.isArray(j.PROVINCES)) return j.PROVINCES as any[];
  if (Array.isArray(j.DISTRICTS)) return j.DISTRICTS as any[];
  if (Array.isArray(j.WARDS)) return j.WARDS as any[];
  return [];
}

async function vtpGetJson(baseUrl: string, pathAndQuery: string): Promise<unknown> {
  const token = getVtpToken();
  const suffix = pathAndQuery.startsWith('/') ? pathAndQuery : `/${pathAndQuery}`;
  const url = `${baseUrl}${suffix}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Token: token, 'Content-Type': 'application/json' }
  });
  return response.json();
}

function assertVtpOk(payload: unknown): void {
  if (payload && typeof payload === 'object' && (payload as any).error === true) {
    throw new Error((payload as any).message || 'Viettel Post API trả lỗi');
  }
}

async function vtpGetRows(baseUrl: string, pathAndQuery: string): Promise<any[]> {
  const json = await vtpGetJson(baseUrl, pathAndQuery);
  assertVtpOk(json);
  return extractRows(json);
}

/** API đôi khi trả trùng WARDS_ID trong cùng payload; giữ bản ghi sau cùng. */
function dedupeWardsById(rows: any[]): any[] {
  const map = new Map<string, any>();
  for (const w of rows) {
    if (w?.WARDS_ID == null) continue;
    map.set(String(w.WARDS_ID), w);
  }
  return [...map.values()];
}

const PLACEHOLDER_DISTRICT = (d: any): boolean =>
  String(d?.DISTRICT_VALUE || '')
    .toUpperCase()
    .trim() === 'NEW' ||
  String(d?.DISTRICT_NAME || '').includes('Bỏ qua');

export type VtpAddressSource = 'old' | 'new' | 'both';

export interface RunVtpAddressSyncOptions {
  source?: VtpAddressSource;
  /** Xóa danh mục provinces/districts/wards (và gỡ liên kết khách) trước khi nạp */
  clear?: boolean;
}

export interface RunVtpAddressSyncResult {
  source: VtpAddressSource;
  cleared: boolean;
  stats: { provinces: number; districts: number; wards: number };
}

/**
 * Gỡ FK khách hàng → danh mục địa chỉ, xóa địa chỉ lưu trong customer_addresses, rồi xóa wards/districts/provinces.
 * Cần trước khi làm mới toàn bộ danh mục khi DB đã có dữ liệu nghiệp vụ.
 */
export async function clearAddressCatalogForReseed(): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.customerRegionRank.updateMany({ data: { provinceId: null } });
    await tx.customer.updateMany({ data: { provinceId: null, districtId: null, wardId: null } });
    await tx.customerFarm.updateMany({ data: { provinceId: null, districtId: null, wardId: null } });
    await tx.warehouse.updateMany({ data: { provinceId: null, districtId: null, wardId: null } });
    
    // Using TRUNCATE CASCADE to clean all address-related tables safely
    await tx.$executeRawUnsafe(`TRUNCATE TABLE "customer_addresses", "wards", "districts", "provinces" CASCADE`);
  });
}

async function syncNewAdministrativeDivisions(stats: {
  provinces: number;
  districts: number;
  wards: number;
}): Promise<void> {
  const v3 = getV3BaseUrl();
  const provinces = await vtpGetRows(v3, '/categories/listProvinceNew');
  for (const p of provinces) {
    if (p.PROVINCE_ID == null) continue;
    const pName = storageAdministrativeName(String(p.PROVINCE_NAME || ''));
    await prisma.province.upsert({
      where: { id: String(p.PROVINCE_ID) },
      update: {
        name: pName,
        code: String(p.PROVINCE_CODE || p.PROVINCE_ID)
      },
      create: {
        id: String(p.PROVINCE_ID),
        name: pName,
        code: String(p.PROVINCE_CODE || p.PROVINCE_ID)
      }
    });
    stats.provinces++;
  }

  let wardsAll = await vtpGetRows(v3, '/categories/listWardsNew?provinceId=-1');
  const missingProvinceOnWard = wardsAll.some(
    (w: any) => w.WARDS_ID != null && (w.PROVINCE_ID == null || w.PROVINCE_ID === '')
  );
  if (!wardsAll.length || missingProvinceOnWard) {
    wardsAll = [];
    for (const p of provinces) {
      if (p.PROVINCE_ID == null) continue;
      const chunk = await vtpGetRows(v3, `/categories/listWardsNew?provinceId=${p.PROVINCE_ID}`);
      for (const w of chunk) {
        wardsAll.push({
          ...w,
          PROVINCE_ID: w.PROVINCE_ID ?? p.PROVINCE_ID
        });
      }
    }
  }

  wardsAll = dedupeWardsById(wardsAll);

  for (const w of wardsAll) {
    if (w.WARDS_ID == null) continue;
    const provinceId = w.PROVINCE_ID;
    if (provinceId == null || provinceId === '') continue;
    const wName = storageAdministrativeName(String(w.WARDS_NAME || ''));
    const vtpDistRaw = w.DISTRICT_ID;
    const vtpDistrictId =
      vtpDistRaw != null && vtpDistRaw !== '' && !Number.isNaN(Number(vtpDistRaw))
        ? Number(vtpDistRaw)
        : null;
    await prisma.ward.upsert({
      where: { id: String(w.WARDS_ID) },
      update: {
        name: wName,
        code: String(w.WARDS_ID),
        provinceId: String(provinceId),
        districtId: null,
        vtpDistrictId,
      },
      create: {
        id: String(w.WARDS_ID),
        name: wName,
        code: String(w.WARDS_ID),
        provinceId: String(provinceId),
        districtId: null,
        vtpDistrictId,
      },
    });
    stats.wards++;
  }
}

async function syncOldAdministrativeDivisions(stats: {
  provinces: number;
  districts: number;
  wards: number;
}): Promise<void> {
  const v2 = getV2BaseUrl();
  const provinces = await vtpGetRows(v2, '/categories/listProvinceById?provinceId=-1');
  for (const p of provinces) {
    if (p.PROVINCE_ID == null) continue;
    const pNameOld = storageAdministrativeName(String(p.PROVINCE_NAME || ''));
    await prisma.province.upsert({
      where: { id: String(p.PROVINCE_ID) },
      update: {
        name: pNameOld,
        code: String(p.PROVINCE_CODE || p.PROVINCE_ID)
      },
      create: {
        id: String(p.PROVINCE_ID),
        name: pNameOld,
        code: String(p.PROVINCE_CODE || p.PROVINCE_ID)
      }
    });
    stats.provinces++;
  }

  const districts = await vtpGetRows(v2, '/categories/listDistrict?provinceId=-1');
  const skippedDistrictIds = new Set<number>();
  for (const d of districts) {
    if (d.DISTRICT_ID == null) continue;
    if (PLACEHOLDER_DISTRICT(d)) {
      skippedDistrictIds.add(Number(d.DISTRICT_ID));
      continue;
    }
    const pid = d.PROVINCE_ID;
    if (pid == null) continue;
    const dName = storageAdministrativeName(String(d.DISTRICT_NAME || ''));
    await prisma.district.upsert({
      where: { id: String(d.DISTRICT_ID) },
      update: {
        name: dName,
        code: String(d.DISTRICT_VALUE || d.DISTRICT_ID),
        provinceId: String(pid)
      },
      create: {
        id: String(d.DISTRICT_ID),
        name: dName,
        code: String(d.DISTRICT_VALUE || d.DISTRICT_ID),
        provinceId: String(pid)
      }
    });
    stats.districts++;
  }

  let wards = await vtpGetRows(v2, '/categories/listWards?districtId=-1');
  wards = dedupeWardsById(wards);
  const districtToProvince = new Map<number, number>();
  for (const d of districts) {
    if (d.DISTRICT_ID != null && d.PROVINCE_ID != null && !skippedDistrictIds.has(Number(d.DISTRICT_ID))) {
      districtToProvince.set(Number(d.DISTRICT_ID), Number(d.PROVINCE_ID));
    }
  }

  for (const w of wards) {
    if (w.WARDS_ID == null || w.DISTRICT_ID == null) continue;
    const did = Number(w.DISTRICT_ID);
    if (skippedDistrictIds.has(did)) continue;
    const provinceId = districtToProvince.get(did);
    if (provinceId == null) continue;
    const wNameOld = storageAdministrativeName(String(w.WARDS_NAME || ''));
    await prisma.ward.upsert({
      where: { id: String(w.WARDS_ID) },
      update: {
        name: wNameOld,
        code: String(w.WARDS_ID),
        districtId: String(did),
        provinceId: String(provinceId)
      },
      create: {
        id: String(w.WARDS_ID),
        name: wNameOld,
        code: String(w.WARDS_ID),
        districtId: String(did),
        provinceId: String(provinceId)
      }
    });
    stats.wards++;
  }
}

export async function runVtpAddressSync(options: RunVtpAddressSyncOptions = {}): Promise<RunVtpAddressSyncResult> {
  const source: VtpAddressSource = options.source || 'both';
  const clear = Boolean(options.clear);

  getVtpToken();

  if (clear) {
    await clearAddressCatalogForReseed();
  }

  const stats = { provinces: 0, districts: 0, wards: 0 };

  // Giống seed JSON: nạp "new" rồi "old" khi both — bản ghi trùng WARDS_ID do id cũ/mới sẽ do bước sau ghi đè
  if (source === 'new' || source === 'both') {
    await syncNewAdministrativeDivisions(stats);
  }
  if (source === 'old' || source === 'both') {
    await syncOldAdministrativeDivisions(stats);
  }

  return { source, cleared: clear, stats };
}

/**
 * Xuất 5 file JSON vào `outDir` (định dạng giống seed), **chỉ HTTP VTP**, không ghi DB.
 * Tên địa danh trong file: `jsonExportTitleCaseAdministrativeName` (mỗi từ viết hoa đầu, vi-VN).
 * Nạp DB (`seed-from-json` / sync) vẫn chuẩn hóa về `storageAdministrativeName` (chữ thường).
 */
export async function exportAddressJsonFromVtp(outDir: string): Promise<void> {
  getVtpToken();
  await fs.mkdir(outDir, { recursive: true });
  const v2 = getV2BaseUrl();
  const v3 = getV3BaseUrl();

  const provincesOld = await vtpGetRows(v2, '/categories/listProvinceById?provinceId=-1');
  const PROVINCES_O = provincesOld
    .filter((p: any) => p.PROVINCE_ID != null)
    .map((p: any) => ({
      PROVINCE_ID: p.PROVINCE_ID,
      PROVINCE_CODE: p.PROVINCE_CODE,
      PROVINCE_NAME: jsonExportTitleCaseAdministrativeName(String(p.PROVINCE_NAME || ''))
    }));
  await fs.writeFile(path.join(outDir, 'provinces-old.json'), JSON.stringify({ PROVINCES: PROVINCES_O }));

  const districtsRaw = await vtpGetRows(v2, '/categories/listDistrict?provinceId=-1');
  const skippedDistrictIds = new Set<number>();
  for (const d of districtsRaw) {
    if (d.DISTRICT_ID != null && PLACEHOLDER_DISTRICT(d)) {
      skippedDistrictIds.add(Number(d.DISTRICT_ID));
    }
  }
  const DISTRICTS_JSON = districtsRaw
    .filter((d: any) => d.DISTRICT_ID != null && !PLACEHOLDER_DISTRICT(d))
    .map((d: any) => ({
      DISTRICT_ID: d.DISTRICT_ID,
      DISTRICT_VALUE: d.DISTRICT_VALUE,
      DISTRICT_NAME: jsonExportTitleCaseAdministrativeName(String(d.DISTRICT_NAME || '')),
      PROVINCE_ID: d.PROVINCE_ID
    }));
  await fs.writeFile(path.join(outDir, 'districts-old.json'), JSON.stringify({ DISTRICTS: DISTRICTS_JSON }));

  let wardsOld = await vtpGetRows(v2, '/categories/listWards?districtId=-1');
  wardsOld = dedupeWardsById(wardsOld);
  const districtToProvince = new Map<number, number>();
  for (const d of districtsRaw) {
    if (d.DISTRICT_ID != null && d.PROVINCE_ID != null && !skippedDistrictIds.has(Number(d.DISTRICT_ID))) {
      districtToProvince.set(Number(d.DISTRICT_ID), Number(d.PROVINCE_ID));
    }
  }
  const WARDS_O: any[] = [];
  for (const w of wardsOld) {
    if (w.WARDS_ID == null || w.DISTRICT_ID == null) continue;
    const did = Number(w.DISTRICT_ID);
    if (skippedDistrictIds.has(did)) continue;
    if (districtToProvince.get(did) == null) continue;
    WARDS_O.push({
      WARDS_ID: w.WARDS_ID,
      WARDS_NAME: jsonExportTitleCaseAdministrativeName(String(w.WARDS_NAME || '')),
      DISTRICT_ID: w.DISTRICT_ID
    });
  }
  await fs.writeFile(path.join(outDir, 'wards-old.json'), JSON.stringify({ WARDS: WARDS_O }));

  const provincesNew = await vtpGetRows(v3, '/categories/listProvinceNew');
  const PROVINCES_N = provincesNew
    .filter((p: any) => p.PROVINCE_ID != null)
    .map((p: any) => ({
      PROVINCE_ID: p.PROVINCE_ID,
      PROVINCE_CODE: p.PROVINCE_CODE,
      PROVINCE_NAME: jsonExportTitleCaseAdministrativeName(String(p.PROVINCE_NAME || ''))
    }));
  await fs.writeFile(path.join(outDir, 'provinces-new.json'), JSON.stringify({ PROVINCES: PROVINCES_N }));

  let wardsNew = await vtpGetRows(v3, '/categories/listWardsNew?provinceId=-1');
  const missingProvinceOnWard = wardsNew.some(
    (w: any) => w.WARDS_ID != null && (w.PROVINCE_ID == null || w.PROVINCE_ID === '')
  );
  if (!wardsNew.length || missingProvinceOnWard) {
    wardsNew = [];
    for (const p of provincesNew) {
      if (p.PROVINCE_ID == null) continue;
      const chunk = await vtpGetRows(v3, `/categories/listWardsNew?provinceId=${p.PROVINCE_ID}`);
      for (const w of chunk) {
        wardsNew.push({
          ...w,
          PROVINCE_ID: w.PROVINCE_ID ?? p.PROVINCE_ID
        });
      }
    }
  }
  wardsNew = dedupeWardsById(wardsNew);
  const WARDS_N = wardsNew
    .filter((w: any) => w.WARDS_ID != null && w.PROVINCE_ID != null && w.PROVINCE_ID !== '')
    .map((w: any) => ({
      WARDS_ID: w.WARDS_ID,
      WARDS_NAME: jsonExportTitleCaseAdministrativeName(String(w.WARDS_NAME || '')),
      PROVINCE_ID: w.PROVINCE_ID
    }));
  await fs.writeFile(path.join(outDir, 'wards-new.json'), JSON.stringify({ WARDS: WARDS_N }));
}
