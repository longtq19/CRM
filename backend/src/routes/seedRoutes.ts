import { Router } from 'express';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/authMiddleware';
import { ensureKagriOrganizationAndTree } from '../controllers/hrController';
import { getCompanyRootForOrg, getDefaultOrganizationId } from '../utils/organizationHelper';
import { KAGRI_SEED_DIVISIONS } from '../constants/kagriSeedDivisions';

const router = Router();

/** Đồng bộ với `ensureKagriOrganizationAndTree` — mã khối cố định `DIV_*`, không dùng K01… tránh trùng mã đơn vị. */
router.post('/to-chuc', authenticate, async (_req, res) => {
  try {
    const { org, company } = await ensureKagriOrganizationAndTree();
    const byCode = new Map(
      (
        await prisma.department.findMany({
          where: { organizationId: org.id, type: 'DIVISION', parentId: company.id },
          select: { code: true },
        })
      ).map((d) => [d.code, true])
    );
    const missing = KAGRI_SEED_DIVISIONS.filter((s) => !byCode.has(s.code));
    if (missing.length) {
      return res.status(500).json({
        message: 'Sau khi đồng bộ vẫn thiếu khối seed',
        missingCodes: missing.map((m) => m.code),
      });
    }

    return res.json({
      message: `Đã đảm bảo ${KAGRI_SEED_DIVISIONS.length} khối mặc định dưới gốc KAGRI`,
      organizationId: org.id,
      seeded: true,
    });
  } catch (error) {
    console.error('Seed to-chuc error:', error);
    return res.status(500).json({ message: 'Lỗi khi tạo dữ liệu mẫu' });
  }
});

router.post('/to-chuc/migrate', authenticate, async (_req, res) => {
  try {
    await ensureKagriOrganizationAndTree();
    const orgId = await getDefaultOrganizationId();
    if (!orgId) {
      return res.status(503).json({ message: 'Chưa có tổ chức' });
    }

    const kagriDiv = await prisma.department.findFirst({
      where: {
        organizationId: orgId,
        name: { equals: 'KAGRI', mode: 'insensitive' },
        type: 'DIVISION',
      },
    });
    if (!kagriDiv) return res.json({ message: 'Không tìm thấy KAGRI division', migrated: 0 });

    const children = await prisma.department.findMany({
      where: { parentId: kagriDiv.id, type: 'DEPARTMENT' },
    });

    let migrated = 0;
    let maxSeq = 0;
    const allDivs = await prisma.department.findMany({
      where: { organizationId: orgId, code: { startsWith: 'K' }, type: 'DIVISION' },
      select: { code: true },
    });
    for (const d of allDivs) {
      const m = d.code.match(/^K(\d+)$/);
      if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    }

    const companyRoot = await getCompanyRootForOrg(orgId);
    for (const child of children) {
      const alreadyDiv = await prisma.department.findFirst({
        where: {
          organizationId: orgId,
          name: { equals: child.name, mode: 'insensitive' },
          type: 'DIVISION',
        },
      });
      if (alreadyDiv) {
        await prisma.department.delete({ where: { id: child.id } });
        migrated++;
        continue;
      }

      maxSeq++;
      await prisma.department.update({
        where: { id: child.id },
        data: {
          type: 'DIVISION',
          parentId: companyRoot.id,
          code: `K${maxSeq.toString().padStart(2, '0')}`,
        },
      });
      migrated++;
    }

    const remainingChildren = await prisma.department.count({ where: { parentId: kagriDiv.id } });
    if (remainingChildren === 0) {
      await prisma.department.delete({ where: { id: kagriDiv.id } });
    }

    return res.json({ message: `Đã chuyển ${migrated} đơn vị thành Khối`, migrated });
  } catch (error) {
    console.error('Migrate to-chuc error:', error);
    return res.status(500).json({ message: 'Lỗi khi chuyển đổi dữ liệu' });
  }
});

export default router;
