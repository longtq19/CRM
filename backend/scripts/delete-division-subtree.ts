/**
 * Xóa một khối (DIVISION) và toàn bộ cây đơn vị con, khi không còn nhân viên gắn các đơn vị đó.
 * Usage (từ thư mục backend):
 *   npx ts-node scripts/delete-division-subtree.ts "KINH DOANH"
 * Nếu còn nhân viên: thêm --move-employees để gán tạm sang một đơn vị DEPARTMENT/TEAM khác cùng tổ chức (không thuộc cây sẽ xóa).
 */
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Tx = Prisma.TransactionClient;

async function collectSubtreeIds(rootId: string): Promise<string[]> {
  const out: string[] = [];
  const q = [rootId];
  while (q.length) {
    const id = q.shift()!;
    out.push(id);
    const children = await prisma.department.findMany({
      where: { parentId: id },
      select: { id: true },
    });
    for (const c of children) q.push(c.id);
  }
  return out;
}

function leavesInSet(
  ids: Set<string>,
  nodes: { id: string; parentId: string | null }[]
): string[] {
  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (!ids.has(n.id)) continue;
    const p = n.parentId;
    if (p && ids.has(p)) {
      childCount.set(p, (childCount.get(p) || 0) + 1);
    }
  }
  return [...ids].filter((id) => (childCount.get(id) || 0) === 0);
}

async function deleteDepartmentsBottomUpTx(tx: Tx, ids: string[]) {
  const idSet = new Set(ids);
  while (idSet.size > 0) {
    const nodes = await tx.department.findMany({
      where: { id: { in: [...idSet] } },
      select: { id: true, parentId: true },
    });
    const leaves = leavesInSet(idSet, nodes);
    if (leaves.length === 0) {
      throw new Error('Không xác định được nút lá để xóa (có thể có vòng tham chiếu).');
    }
    for (const leaf of leaves) {
      await tx.department.delete({ where: { id: leaf } });
      idSet.delete(leaf);
    }
  }
}

async function pickFallbackDepartment(organizationId: string, excludeIds: string[]) {
  const withPosition = await prisma.department.findFirst({
    where: {
      organizationId,
      id: { notIn: excludeIds },
      type: { in: ['DEPARTMENT', 'TEAM'] },
      positions: { some: {} },
    },
    orderBy: [{ code: 'asc' }],
    select: { id: true, code: true, name: true },
  });
  if (withPosition) return withPosition;
  const fallback = await prisma.department.findFirst({
    where: {
      organizationId,
      id: { notIn: excludeIds },
      type: { in: ['DEPARTMENT', 'TEAM'] },
    },
    orderBy: [{ code: 'asc' }],
    select: { id: true, code: true, name: true },
  });
  if (fallback) return fallback;
  return prisma.department.findFirst({
    where: {
      organizationId,
      id: { notIn: excludeIds },
      type: 'DIVISION',
    },
    orderBy: [{ code: 'asc' }],
    select: { id: true, code: true, name: true },
  });
}

async function main() {
  const moveEmployees = process.argv.includes('--move-employees');
  const nameArgs = process.argv.slice(2).filter((a) => a !== '--move-employees');
  const needle = (nameArgs[0] || 'KINH DOANH').trim();
  if (!needle) {
    console.error('Thiếu tên khối. Ví dụ: npx ts-node scripts/delete-division-subtree.ts "KINH DOANH"');
    process.exit(1);
  }

  let roots = await prisma.department.findMany({
    where: { type: 'DIVISION', name: { equals: needle, mode: 'insensitive' } },
    select: { id: true, code: true, name: true, organizationId: true },
  });

  if (roots.length === 0) {
    roots = await prisma.department.findMany({
      where: {
        type: 'DIVISION',
        OR: [
          { code: { equals: 'DIV_KINH_DOANH', mode: 'insensitive' } },
          { code: { contains: 'KINH_DOANH', mode: 'insensitive' } },
        ],
      },
      select: { id: true, code: true, name: true, organizationId: true },
    });
  }

  if (roots.length === 0) {
    console.error(`Không tìm thấy khối DIVISION khớp tên/mã: "${needle}"`);
    process.exit(1);
  }

  for (const root of roots) {
    const subtree = await collectSubtreeIds(root.id);
    const empCount = await prisma.employee.count({
      where: { departmentId: { in: subtree } },
    });
    if (empCount > 0 && !moveEmployees) {
      console.error(
        `Khối "${root.name}" (${root.code}): còn ${empCount} nhân viên trong cây đơn vị — cần chuyển nhân viên sang đơn vị khác trước khi xóa, hoặc chạy lại với --move-employees.`
      );
      process.exit(1);
    }

    if (empCount > 0 && moveEmployees) {
      const fb = await pickFallbackDepartment(root.organizationId, subtree);
      if (!fb) {
        console.error('Không tìm thấy đơn vị dự phòng cùng tổ chức để chuyển nhân viên.');
        process.exit(1);
      }
      const pos = await prisma.position.findFirst({
        where: { departmentId: fb.id },
        orderBy: { code: 'asc' },
        select: { id: true },
      });
      if (!pos) {
        console.error(
          `Đơn vị dự phòng "${fb.name}" (${fb.code}) chưa có chức vụ — tạo ít nhất một Position rồi chạy lại.`
        );
        process.exit(1);
      }
      const moved = await prisma.employee.updateMany({
        where: { departmentId: { in: subtree } },
        data: { departmentId: fb.id, positionId: pos.id },
      });
      console.log(
        `Đã chuyển ${moved.count} nhân viên sang "${fb.name}" (${fb.code}), chức vụ mặc định positionId=${pos.id}.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.department.updateMany({
        where: { id: { in: subtree } },
        data: {
          managerId: null,
          targetSalesUnitId: null,
          targetCsUnitId: null,
        },
      });
      await tx.department.updateMany({
        where: { targetSalesUnitId: { in: subtree } },
        data: { targetSalesUnitId: null },
      });
      await tx.department.updateMany({
        where: { targetCsUnitId: { in: subtree } },
        data: { targetCsUnitId: null },
      });

      await tx.leadAssignment.deleteMany({
        where: {
          OR: [
            { fromDepartmentId: { in: subtree } },
            { toDepartmentId: { in: subtree } },
          ],
        },
      });
      await tx.salesTarget.deleteMany({ where: { departmentId: { in: subtree } } });
      await tx.teamDistributionRatio.deleteMany({
        where: { departmentId: { in: subtree } },
      });
      await tx.documentPermission.deleteMany({
        where: { departmentId: { in: subtree } },
      });
      await tx.position.deleteMany({ where: { departmentId: { in: subtree } } });

      await deleteDepartmentsBottomUpTx(tx, subtree);
    });

    console.log(`Đã xóa khối "${root.name}" (${root.code}) và ${subtree.length} nút trong cây.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
