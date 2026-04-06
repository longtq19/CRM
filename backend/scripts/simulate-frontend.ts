
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1) Simulate getOrganizations API
  const orgs = await prisma.organization.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  const enrichedOrgs = await Promise.all(
    orgs.map(async (o) => {
      const root = await prisma.department.findFirst({
        where: { organizationId: o.id, type: 'COMPANY' },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      return { ...o, rootDepartmentId: root?.id ?? null };
    })
  );
  console.log('=== Organizations (as API returns) ===');
  console.log(JSON.stringify(enrichedOrgs, null, 2));

  // 2) Simulate getDivisions API for first org
  const orgId = enrichedOrgs[0]?.id;
  if (!orgId) { console.log('No org found'); return; }

  const divisions = await prisma.department.findMany({
    where: { organizationId: orgId, type: 'DIVISION' },
    orderBy: { displayOrder: 'asc' },
  });
  console.log(`\n=== Divisions count: ${divisions.length} ===`);
  console.log(divisions.map(d => ({ id: d.id, name: d.name, code: d.code, parentId: d.parentId })));

  // 3) Simulate frontend topLevelDivisions filter
  const selectedOrg = enrichedOrgs[0];
  const rootDepartmentId = selectedOrg?.rootDepartmentId ?? null;
  const orgCodeNorm = (selectedOrg?.code || '').trim().toUpperCase();
  const orgNameNorm = (selectedOrg?.name || '').trim().toLowerCase();

  console.log(`\n=== Frontend filter params ===`);
  console.log(`rootDepartmentId: ${rootDepartmentId}`);
  console.log(`orgCodeNorm: "${orgCodeNorm}"`);
  console.log(`orgNameNorm: "${orgNameNorm}"`);

  // Step 1: Filter by parentId
  const step1 = rootDepartmentId
    ? divisions.filter(d => d.parentId === rootDepartmentId)
    : divisions.filter(d => !d.parentId);
  console.log(`\nStep 1 (parentId filter): ${step1.length} divisions`);
  step1.forEach(d => console.log(`  - ${d.name} (code: ${d.code}, parentId: ${d.parentId})`));

  // Step 2: Filter out org-name matches
  const step2 = step1.filter(d => {
    const codeU = (d.code || '').trim().toUpperCase();
    const nameN = (d.name || '').trim().toLowerCase();
    if (orgCodeNorm && codeU === orgCodeNorm) {
      console.log(`  FILTERED OUT by code match: ${d.name} (code: ${codeU} === ${orgCodeNorm})`);
      return false;
    }
    if (orgNameNorm && nameN === orgNameNorm) {
      console.log(`  FILTERED OUT by name match: ${d.name} (name: ${nameN} === ${orgNameNorm})`);
      return false;
    }
    return true;
  });

  console.log(`\nStep 2 (final topLevelDivisions): ${step2.length} divisions`);
  step2.forEach(d => console.log(`  - ${d.name} (code: ${d.code})`));
}

main().finally(() => prisma.$disconnect());
