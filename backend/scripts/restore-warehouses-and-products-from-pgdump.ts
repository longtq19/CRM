/**
 * Khôi phục thông tin kho (theo snapshot trong file pg_dump plain SQL) và đảm bảo
 * mọi sản phẩm trong dump tồn tại trên từng kho mục tiêu (mặc định: biohn, biohcm),
 * kèm dòng tồn kho quantity=0 nếu chưa có.
 *
 * Trước khi chạy: **backup DB** (`npm run backup:db` trong `backend/`).
 *
 * Chạy từ thư mục backend:
 *   npx ts-node scripts/restore-warehouses-and-products-from-pgdump.ts [đường-dẫn-file.sql]
 *
 * Mặc định file: `<repo>/backup_2026-03-30_18-00-12.sql` (một cấp trên `backend/`).
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient, Status, WarehouseType } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_WAREHOUSE_CODES = ['biohn', 'biohcm'] as const;

/** Map category id trong dump cũ → mã danh mục hiện tại (tra DB). */
const BACKUP_CATEGORY_ID_TO_CODE: Record<string, string> = {
  'a005ef2a-8a78-44f2-b5a9-d9b44b9ffc05': 'BIO',
  'b52c2920-a37d-4f39-b644-acbd9893707d': 'GIFT',
  'b79c0d35-7032-46ca-b45c-a16e1f74b05b': 'TECH',
  '6d24eeff-663a-4f12-8b80-57c7de9cd5d8': 'COMBO',
};

function extractCopyBlock(sql: string, table: string): string[] {
  const re = new RegExp(
    `COPY public\\.${table} \\([^\\)]+\\) FROM stdin;\\r?\\n([\\s\\S]*?)\\r?\\n\\\\\\.`,
    'm',
  );
  const m = sql.match(re);
  if (!m) return [];
  return m[1].split(/\r?\n/).filter((l) => l.length > 0);
}

function parseNull(s: string): string | null {
  if (s === '\\N' || s === '') return null;
  return s;
}

function parseWarehouseLine(line: string) {
  const p = line.split('\t');
  if (p.length < 15) throw new Error(`Dòng warehouses không hợp lệ: ${line.slice(0, 80)}…`);
  return {
    id: p[0],
    code: p[1],
    name: p[2],
    address: parseNull(p[3]),
    manager: parseNull(p[4]),
    type: p[5] as WarehouseType,
    status: p[6] as Status,
    contactName: parseNull(p[9]),
    contactPhone: parseNull(p[10]),
    detailAddress: parseNull(p[11]),
    provinceId: parseNull(p[12]),
    districtId: parseNull(p[13]),
    wardId: parseNull(p[14]),
  };
}

type SnapshotProduct = {
  snapshotId: string;
  code: string;
  name: string;
  description: string | null;
  listPriceNet: string;
  minSellPriceNet: string;
  vatRate: number;
  vatName: string | null;
  unit: string;
  thumbnail: string | null;
  gallery: string[];
  status: Status;
  categoryIdBackup: string;
  lowStockThreshold: number;
  packagingSpec: string | null;
  weight: number;
};

function parseProductLine(line: string): SnapshotProduct {
  const p = line.split('\t');
  if (p.length < 18) throw new Error(`Dòng products không hợp lệ (${p.length} cột): ${line.slice(0, 100)}…`);
  let gallery: string[] = [];
  const gRaw = p[10];
  if (gRaw && gRaw !== '\\N' && gRaw !== '{}') {
    try {
      const j = JSON.parse(gRaw);
      if (Array.isArray(j)) gallery = j.map(String);
    } catch {
      gallery = [];
    }
  }
  return {
    snapshotId: p[0],
    code: p[1],
    name: p[2],
    description: parseNull(p[3]),
    listPriceNet: p[4],
    minSellPriceNet: p[5],
    vatRate: Number(p[6]),
    vatName: parseNull(p[7]),
    unit: p[8],
    thumbnail: parseNull(p[9]),
    gallery,
    status: p[11] as Status,
    categoryIdBackup: p[14],
    lowStockThreshold: Number(p[15]),
    packagingSpec: parseNull(p[16]),
    weight: Number(p[17]),
  };
}

function parseProductBioLine(line: string) {
  const p = line.split('\t');
  return {
    productId: p[0],
    volume: p[1] === '\\N' ? null : Number(p[1]),
    weight: p[2] === '\\N' ? null : Number(p[2]),
    packType: parseNull(p[3]),
    ingredients: parseNull(p[4]),
    usage: parseNull(p[5]),
    expiryPeriod: p[6] === '\\N' ? null : Number(p[6]),
  };
}

async function main() {
  const defaultSql = path.join(__dirname, '..', '..', 'backup_2026-03-30_18-00-12.sql');
  const sqlPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSql;
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Không tìm thấy file SQL: ${sqlPath}`);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const warehouseLines = extractCopyBlock(sql, 'warehouses');
  const snapshotWarehouses = warehouseLines.map(parseWarehouseLine);
  const snapshotByCode = new Map(snapshotWarehouses.map((w) => [w.code, w]));

  const productLines = extractCopyBlock(sql, 'products');
  const snapshotProducts = productLines.map(parseProductLine);

  const bioLines = extractCopyBlock(sql, 'product_bios');
  const bioBySnapshotProductId = new Map<string, ReturnType<typeof parseProductBioLine>>();
  for (const bl of bioLines) {
    const b = parseProductBioLine(bl);
    bioBySnapshotProductId.set(b.productId, b);
  }

  const categoryCache = new Map<string, { id: string; code: string }>();
  async function resolveCategory(backupCatId: string) {
    const code = BACKUP_CATEGORY_ID_TO_CODE[backupCatId];
    if (!code) {
      throw new Error(`Không map được category_id từ dump: ${backupCatId}`);
    }
    if (categoryCache.has(code)) return categoryCache.get(code)!;
    const cat = await prisma.productCategory.findUnique({ where: { code } });
    if (!cat) throw new Error(`Thiếu danh mục sản phẩm mã "${code}" trong DB.`);
    const v = { id: cat.id, code: cat.code };
    categoryCache.set(code, v);
    return v;
  }

  // --- Tạo hoặc cập nhật kho mục tiêu theo snapshot dump ---
  for (const code of TARGET_WAREHOUSE_CODES) {
    const snap = snapshotByCode.get(code);
    if (!snap) {
      throw new Error(`Thiếu dòng kho mã "${code}" trong file dump — không thể khôi phục.`);
    }

    const byCode = await prisma.warehouse.findUnique({ where: { code } });
    if (byCode) {
      await prisma.warehouse.update({
        where: { id: byCode.id },
        data: {
          name: snap.name,
          address: snap.address,
          manager: snap.manager,
          type: snap.type,
          status: snap.status,
          contactName: snap.contactName,
          contactPhone: snap.contactPhone,
          detailAddress: snap.detailAddress,
          provinceId: snap.provinceId,
          districtId: snap.districtId,
          wardId: snap.wardId,
        },
      });
      console.log(`Đã cập nhật kho "${code}" (${snap.name}) theo snapshot dump.`);
    } else {
      await prisma.warehouse.create({
        data: {
          id: snap.id,
          code: snap.code,
          name: snap.name,
          address: snap.address,
          manager: snap.manager,
          type: snap.type,
          status: snap.status,
          contactName: snap.contactName,
          contactPhone: snap.contactPhone,
          detailAddress: snap.detailAddress,
          provinceId: snap.provinceId,
          districtId: snap.districtId,
          wardId: snap.wardId,
        },
      });
      console.log(`Đã tạo kho "${code}" (${snap.name}) từ snapshot dump (id ${snap.id}).`);
    }
  }

  const targetWarehouses = await prisma.warehouse.findMany({
    where: { code: { in: [...TARGET_WAREHOUSE_CODES] } },
    orderBy: { code: 'asc' },
  });
  if (targetWarehouses.length !== TARGET_WAREHOUSE_CODES.length) {
    throw new Error(`Sau khi tạo/cập nhật vẫn thiếu kho: ${TARGET_WAREHOUSE_CODES.join(', ')}`);
  }

  let productsUpserted = 0;
  let stocksEnsured = 0;
  let biosUpserted = 0;

  for (const wh of targetWarehouses) {
    for (const row of snapshotProducts) {
      const cat = await resolveCategory(row.categoryIdBackup);

      const dataCommon = {
        name: row.name,
        description: row.description,
        listPriceNet: new Prisma.Decimal(row.listPriceNet),
        minSellPriceNet: new Prisma.Decimal(row.minSellPriceNet),
        vatRate: row.vatRate,
        vatName: row.vatName,
        unit: row.unit,
        thumbnail: row.thumbnail,
        gallery: row.gallery,
        status: row.status,
        categoryId: cat.id,
        lowStockThreshold: row.lowStockThreshold,
        packagingSpec: row.packagingSpec,
        weight: row.weight,
        warehouseId: wh.id,
      };

      const product = await prisma.product.upsert({
        where: {
          code_warehouseId: {
            code: row.code,
            warehouseId: wh.id,
          },
        } as any,
        create: {
          code: row.code,
          ...dataCommon,
        } as any,
        update: {
          ...dataCommon,
        } as any,
      });
      productsUpserted += 1;

      if (cat.code === 'BIO') {
        const bio = bioBySnapshotProductId.get(row.snapshotId);
        if (bio) {
          await prisma.productBio.upsert({
            where: { productId: product.id },
            create: {
              productId: product.id,
              volume: bio.volume,
              weight: bio.weight,
              packType: bio.packType,
              ingredients: bio.ingredients,
              usage: bio.usage,
              expiryPeriod: bio.expiryPeriod,
            },
            update: {
              volume: bio.volume,
              weight: bio.weight,
              packType: bio.packType,
              ingredients: bio.ingredients,
              usage: bio.usage,
              expiryPeriod: bio.expiryPeriod,
            },
          });
          biosUpserted += 1;
        }
      }

      const existingStock = await prisma.stock.findFirst({
        where: {
          warehouseId: wh.id,
          productId: product.id,
          batchId: null,
        },
      });
      if (!existingStock) {
        await prisma.stock.create({
          data: {
            warehouseId: wh.id,
            productId: product.id,
            batchId: null,
            quantity: 0,
          },
        });
        stocksEnsured += 1;
      }
    }
  }

  console.log('---');
  console.log(`Sản phẩm (upsert theo cặp mã+kho): ${productsUpserted} thao tác.`);
  console.log(`ProductBio (BIO): ${biosUpserted} thao tác upsert.`);
  console.log(`Dòng tồn kho mới (sl=0): ${stocksEnsured}.`);
  console.log('Hoàn tất.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
