/**
 * Copy & normalize address JSON from "Viettel Post API" to backend/data/addresses.
 * Tên địa danh (PROVINCE_NAME, DISTRICT_NAME, WARDS_NAME) → Title Case vi-VN (khớp jsonExportTitleCaseAdministrativeName / export VTP).
 *
 * Run from repo root: node backend/scripts/copy-address-json.js
 * (Hoặc từ backend: node scripts/copy-address-json.js — cwd phải là thư mục backend.)
 *
 * Khuyến nghị: `npm run export:address:vtp` (gọi API trực tiếp) thay vì copy tay từ Postman.
 *
 * Hai loại dữ liệu:
 * - Trước sáp nhập (V2): provinces-old, districts-old, wards-old
 * - Sau sáp nhập (V3): provinces-new, wards-new
 */
const fs = require('fs');
const path = require('path');

const vi = 'vi-VN';

function titleCaseVi(str) {
  if (str == null || str === '') return str;
  const s = String(str).normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!s) return s;
  return s
    .split(' ')
    .map((word) => {
      if (!word) return word;
      const lower = word.toLocaleLowerCase(vi);
      return lower.charAt(0).toLocaleUpperCase(vi) + lower.slice(1);
    })
    .join(' ');
}

function mapProvinces(arr) {
  return (arr || []).map((p) => ({
    ...p,
    PROVINCE_NAME: titleCaseVi(p.PROVINCE_NAME)
  }));
}

function mapDistricts(arr) {
  return (arr || []).map((d) => ({
    ...d,
    DISTRICT_NAME: titleCaseVi(d.DISTRICT_NAME)
  }));
}

function mapWardsOld(arr) {
  return (arr || []).map((w) => ({
    ...w,
    WARDS_NAME: titleCaseVi(w.WARDS_NAME)
  }));
}

function mapWardsNew(arr) {
  return (arr || []).map((w) => ({
    ...w,
    WARDS_NAME: titleCaseVi(w.WARDS_NAME)
  }));
}

const backendDir = path.resolve(__dirname, '..');
const root = path.resolve(backendDir, '..');
const srcDir = path.join(root, 'Viettel Post API');
const destDir = path.join(backendDir, 'data', 'addresses');

if (!fs.existsSync(srcDir)) {
  console.log('Viettel Post API folder not found at', srcDir);
  process.exit(1);
}

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

function normalizeArrayPayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  if (raw && Array.isArray(raw.PROVINCES)) return raw.PROVINCES;
  if (raw && Array.isArray(raw.DISTRICTS)) return raw.DISTRICTS;
  if (raw && Array.isArray(raw.WARDS)) return raw.WARDS;
  return [];
}

// provinces-old: ưu tiên Provinces-Old.json (export V2); không có thì dùng Provinces.json
const provincesOldPath = path.join(srcDir, 'Provinces-Old.json');
const provincesPath = path.join(srcDir, 'Provinces.json');
let provincesOldArr;
if (fs.existsSync(provincesOldPath)) {
  provincesOldArr = mapProvinces(normalizeArrayPayload(JSON.parse(fs.readFileSync(provincesOldPath, 'utf8'))));
  console.log('provinces-old: from Provinces-Old.json');
} else if (fs.existsSync(provincesPath)) {
  provincesOldArr = mapProvinces(normalizeArrayPayload(JSON.parse(fs.readFileSync(provincesPath, 'utf8'))));
  console.log('provinces-old: fallback Provinces.json (nên thay bằng export V2 listProvinceById nếu ID không khớp huyện/xã cũ)');
} else {
  console.error('Thiếu Provinces-Old.json hoặc Provinces.json');
  process.exit(1);
}
fs.writeFileSync(
  path.join(destDir, 'provinces-old.json'),
  JSON.stringify({ PROVINCES: provincesOldArr }, null, 0)
);
console.log('Written provinces-old.json');

// districts-old
const oldDistricts = JSON.parse(fs.readFileSync(path.join(srcDir, 'District-Old.json'), 'utf8'));
const districtsArr = mapDistricts(normalizeArrayPayload(oldDistricts));
fs.writeFileSync(
  path.join(destDir, 'districts-old.json'),
  JSON.stringify({ DISTRICTS: districtsArr }, null, 0)
);
console.log('Written districts-old.json');

// wards-old (large file)
const oldWards = JSON.parse(fs.readFileSync(path.join(srcDir, 'Wards-Old.json'), 'utf8'));
const wardsOldArr = mapWardsOld(normalizeArrayPayload(oldWards));
fs.writeFileSync(
  path.join(destDir, 'wards-old.json'),
  JSON.stringify({ WARDS: wardsOldArr }, null, 0)
);
console.log('Written wards-old.json');

// Sau sáp nhập: Provinces.json + Wards.json (xã gắn PROVINCE_ID) → provinces-new, wards-new
if (fs.existsSync(provincesPath)) {
  const provNew = JSON.parse(fs.readFileSync(provincesPath, 'utf8'));
  const provList = provNew.PROVINCES ? mapProvinces(provNew.PROVINCES) : mapProvinces(normalizeArrayPayload(provNew));
  fs.writeFileSync(
    path.join(destDir, 'provinces-new.json'),
    JSON.stringify({ PROVINCES: provList }, null, 0)
  );
  console.log('Written provinces-new.json');
}

const wardsPath = path.join(srcDir, 'Wards.json');
if (fs.existsSync(wardsPath)) {
  const wardsNew = JSON.parse(fs.readFileSync(wardsPath, 'utf8'));
  const wardList = wardsNew.WARDS ? mapWardsNew(wardsNew.WARDS) : mapWardsNew(normalizeArrayPayload(wardsNew));
  fs.writeFileSync(
    path.join(destDir, 'wards-new.json'),
    JSON.stringify({ WARDS: wardList }, null, 0)
  );
  console.log('Written wards-new.json');
}

console.log(
  'Done. Tiếp theo: POST /api/address/seed-from-json?source=old|new|both hoặc npm run seed:address (nếu có script seed).'
);
