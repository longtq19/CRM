/**
 * Nhập danh sách phân bón sinh học từ file Excel nội bộ (cột tiếng Anh).
 *
 * File mặc định: docs/Các sản phẩm phân bón sinh học.xlsx (sheet đầu tiên)
 * Cột: product_code | vat_invoice_name | packaging_spec (đơn vị đóng) | packaging_spec (quy cách thùng) | display_name | weight_kg
 *
 * Gán loại BIO (Phân bón sinh học), upsert theo mã sản phẩm.
 * Giá niêm yết / tối thiểu = 0, VAT % = 8 (cập nhật sau trên UI nếu cần).
 * Khối lượng BIO (g) = weight_kg × 1000 khi có số hợp lệ.
 *
 * Chạy từ thư mục backend (cần DATABASE_URL):
 *   npm run import:kagri-bio-products
 *   npx ts-node scripts/import-kagri-bio-products-xlsx.ts --path "C:\\path\\to\\file.xlsx"
 *
 * An toàn dữ liệu (theo quy tắc dự án): **backup DB trước** (`npm run backup:db` trong `backend/`).
 * Script upsert theo mã → có thể **ghi đè** sản phẩm đã tồn tại. **Restore** (`pg_restore` từ file `.dump`) **chỉ khi cần hoàn tác** — không restore sau mỗi lần chạy thành công nếu muốn giữ dữ liệu mới.
 */
import 'dotenv/config';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { Prisma, PrismaClient, Status } from '@prisma/client';
import { ensureDefaultProductCategories } from '../src/controllers/productController';

const DEFAULT_PRODUCT_UNITS = ['Cái', 'Chiếc', 'Chai', 'Lọ', 'Can', 'Túi', 'Gói'];

const prisma = new PrismaClient();

const toCellText = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'object' && value && 'text' in (value as any)) {
    return String((value as any).text ?? '').trim();
  }
  return String(value).trim();
};

const parseNumberOrNull = (value: unknown): number | null => {
  const text = toCellText(value);
  if (!text) return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const toHeaderKey = (value: unknown): string => {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
};

function resolveExcelPath(argv: string[]): string {
  const idx = argv.indexOf('--path');
  if (idx >= 0 && argv[idx + 1]) {
    return path.resolve(argv[idx + 1]);
  }
  return path.resolve(__dirname, '../../docs/Các sản phẩm phân bón sinh học.xlsx');
}

function normalizeUnit(raw: string, extraFromDb: string[]): string {
  const t = raw.trim();
  if (!t) throw new Error('Thiếu đơn vị đóng gói (cột packaging_spec thứ nhất)');
  const pool = [...DEFAULT_PRODUCT_UNITS, ...extraFromDb.map((u) => u.trim()).filter(Boolean)];
  const hit = pool.find((u) => u.toLowerCase() === t.toLowerCase());
  if (!hit) {
    throw new Error(`Đơn vị không hợp lệ: "${raw}" (thêm vào hệ thống hoặc sửa Excel)`);
  }
  return hit;
}

async function main() {
  const filePath = resolveExcelPath(process.argv.slice(2));
  await ensureDefaultProductCategories();
  const bio = await prisma.productCategory.findUnique({ where: { code: 'BIO' } });
  if (!bio) {
    throw new Error('Không tìm thấy danh mục BIO');
  }

  const unitRows = await prisma.product.findMany({ select: { unit: true }, distinct: ['unit'] });
  const extraUnits = unitRows.map((u) => toCellText(u.unit)).filter(Boolean);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.worksheets[0];
  if (!ws || ws.rowCount < 2) {
    throw new Error('File Excel trống hoặc không có sheet');
  }

  const headerRow = ws.getRow(1);
  const headerCells: { col: number; key: string }[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
    const key = toHeaderKey(cell.value);
    if (key) headerCells.push({ col, key });
  });
  const colOf = (k: string) => headerCells.find((h) => h.key === k)?.col;
  const colsOf = (k: string) =>
    headerCells
      .filter((h) => h.key === k)
      .map((h) => h.col)
      .sort((a, b) => a - b);

  const colCode = colOf('product_code');
  const colVat = colOf('vat_invoice_name');
  const packagingCols = colsOf('packaging_spec');
  if (colCode == null || colVat == null || packagingCols.length < 1) {
    throw new Error(
      'Thiếu cột bắt buộc: product_code, vat_invoice_name và ít nhất một cột packaging_spec'
    );
  }
  const colPackUnit = packagingCols[0];
  const colPackCarton = packagingCols[1];

  const colDisplay = colOf('display_name');
  const colWeightKg = colOf('weight_kg');
  if (colDisplay == null || colWeightKg == null) {
    throw new Error('Thiếu cột: display_name hoặc weight_kg');
  }

  let ok = 0;
  let skip = 0;
  const errors: { row: number; code: string; message: string }[] = [];

  const zero = new Prisma.Decimal(0);
  const vatRate = 8;
  const status: Status = 'ACTIVE';

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const code = toCellText(row.getCell(colCode).value).toUpperCase();
    if (!code) {
      skip++;
      continue;
    }

    try {
      const vatName = toCellText(row.getCell(colVat).value);
      const unitRaw = toCellText(row.getCell(colPackUnit).value);
      const carton =
        colPackCarton != null ? toCellText(row.getCell(colPackCarton).value) : '';
      const name = toCellText(row.getCell(colDisplay).value);
      const weightKg = parseNumberOrNull(row.getCell(colWeightKg).value);

      if (!name) throw new Error('Thiếu display_name');
      if (!vatName) throw new Error('Thiếu vat_invoice_name');

      const unit = normalizeUnit(unitRaw, extraUnits);
      const packType = [unitRaw.trim(), carton].filter(Boolean).join(' / ') || null;

      let bioWeight: number | null = null;
      if (weightKg != null) {
        bioWeight = Math.round(weightKg * 1000 * 1e6) / 1e6;
      }

      await prisma.$transaction(async (tx) => {
        const product = await tx.product.upsert({
          where: { code },
          create: {
            code,
            name,
            vatName,
            vatRate,
            categoryId: bio.id,
            listPriceNet: zero,
            minSellPriceNet: zero,
            unit,
            description: null,
            status,
            packagingSpec: packType,
          },
          update: {
            name,
            vatName,
            vatRate,
            categoryId: bio.id,
            listPriceNet: zero,
            minSellPriceNet: zero,
            unit,
            status,
            packagingSpec: packType,
          },
        });

        await tx.productBio.upsert({
          where: { productId: product.id },
          create: {
            productId: product.id,
            volume: null,
            weight: bioWeight,
            packType,
            ingredients: null,
            usage: null,
            expiryPeriod: null,
          },
          update: {
            weight: bioWeight,
            packType,
          },
        });
        await tx.productTech.deleteMany({ where: { productId: product.id } });
      });
      ok++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push({ row: r, code, message });
    }
  }

  console.log('File:', filePath);
  console.log('Upsert OK:', ok, '| Dòng bỏ qua (không mã):', skip, '| Lỗi:', errors.length);
  if (errors.length) {
    console.error('Chi tiết lỗi (tối đa 30):');
    errors.slice(0, 30).forEach((e) => console.error(`  dòng ${e.row} [${e.code}]: ${e.message}`));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
