import { prisma } from '../config/database';

export async function getDefaultOrganizationId(): Promise<string | null> {
  const o = await prisma.organization.findFirst({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return o?.id ?? null;
}

/** Ưu tiên tổ chức mã KAGRI (không phân biệt hoa thường); nếu không có thì org mặc định đầu tiên. */
export async function getKagriOrganizationId(): Promise<string | null> {
  const list = await prisma.organization.findMany({ select: { id: true, code: true } });
  const kagri = list.find((o) => String(o.code || '').toUpperCase().trim() === 'KAGRI');
  if (kagri) return kagri.id;
  return getDefaultOrganizationId();
}

export async function getCompanyRootForOrg(organizationId: string) {
  let company = await prisma.department.findFirst({
    where: { organizationId, type: 'COMPANY' },
    orderBy: { createdAt: 'asc' },
  });
  if (!company) {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    const rootName = org?.name ?? 'ROOT';
    const rootCode = `${(org?.code ?? 'ORG').toUpperCase().replace(/[^A-Z0-9_]/g, '_')}_ROOT`;
    company = await prisma.department.create({
      data: {
        organizationId,
        name: rootName,
        code: rootCode.slice(0, 32),
        type: 'COMPANY',
        displayOrder: 0,
      },
    });
  }
  return company;
}
