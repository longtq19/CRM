/**
 * Gộp trong DB các xã **sau sáp nhập** trùng nghĩa: cùng `province_id`, `district_id` null,
 * tên giống nhau sau chuẩn hóa chữ hoa/thường (vd. "Phường X" vs "PHƯỜNG X").
 * Giữ bản ghi có `id` (số) nhỏ nhất; chuyển `customers.ward_id` / `customer_addresses.ward_id` sang id đó rồi xóa bản ghi thừa.
 *
 * Bắt buộc backup trước: `npm run backup:db`
 * Chạy: `cd backend && npx ts-node scripts/dedupe-direct-wards.ts`
 */
import path from 'path';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { normalizeWardNameKey, preferredNameAmongDuplicates } from '../src/utils/addressDisplayNormalize';

dotenv.config({ path: path.join(__dirname, '..', '.env'), override: true });

const prisma = new PrismaClient();

async function main() {
  const wards = await prisma.ward.findMany({
    where: { districtId: null },
    select: { id: true, name: true, provinceId: true }
  });

  const groups = new Map<string, typeof wards>();
  for (const w of wards) {
    const key = `${w.provinceId}|${normalizeWardNameKey(w.name)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }

  let mergedGroups = 0;
  let deletedRows = 0;

  for (const list of groups.values()) {
    if (list.length < 2) continue;
    mergedGroups++;
    const sorted = [...list].sort((a, b) => {
      const na = parseInt(a.id, 10);
      const nb = parseInt(b.id, 10);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.id.localeCompare(b.id);
    });
    const keep = sorted[0];
    const losers = sorted.slice(1);
    const newName = preferredNameAmongDuplicates(sorted.map((x) => x.name));

    await prisma.$transaction(async (tx) => {
      for (const L of losers) {
        await tx.customer.updateMany({ where: { wardId: L.id }, data: { wardId: keep.id } });
        await tx.customerAddress.updateMany({ where: { wardId: L.id }, data: { wardId: keep.id } });
        await tx.ward.delete({ where: { id: L.id } });
        deletedRows++;
      }
      await tx.ward.update({
        where: { id: keep.id },
        data: { name: newName }
      });
    });
  }

  console.log(JSON.stringify({ mergedGroups, deletedWards: deletedRows }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
