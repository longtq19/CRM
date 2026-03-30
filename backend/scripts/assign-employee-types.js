require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const employeeTypes = await prisma.employeeType.findMany();
  const typeMap = {};
  employeeTypes.forEach(t => { typeMap[t.code] = t.id; });

  console.log('Employee Types:', Object.keys(typeMap).join(', '));

  const employees = await prisma.employee.findMany({
    select: {
      id: true, code: true, fullName: true,
      department: { select: { code: true, name: true, division: { select: { code: true, name: true } } } },
      position: { select: { code: true, name: true } },
      roleGroup: { select: { code: true, name: true } },
      employeeType: { select: { code: true, name: true } }
    }
  });

  let updated = 0;
  let skipped = 0;
  const changes = [];

  for (const emp of employees) {
    const divCode = emp.department?.division?.code || '';
    const deptCode = emp.department?.code || '';
    const posName = (emp.position?.name || '').toLowerCase();
    const rgCode = emp.roleGroup?.code || '';
    const currentTypeCode = emp.employeeType?.code || '';

    let newTypeCode = null;

    // 1) Division-level rules
    if (divCode === 'BOD') {
      newTypeCode = 'BOD';
    } else if (divCode.startsWith('CSKH')) {
      newTypeCode = 'RES';
    } else if (divCode === 'KAG') {
      newTypeCode = 'IT';
    } else if (divCode === 'KHO') {
      newTypeCode = 'WH';
    } else if (divCode === 'TMDT') {
      newTypeCode = 'ECOM';
    }

    // 2) BAC (BACK OFFICE) - by department
    else if (divCode === 'BAC') {
      if (deptCode === 'HCN') newTypeCode = 'HR';
      else if (deptCode === 'KE') newTypeCode = 'ACC';
      else if (deptCode === 'TRU') newTypeCode = 'COM';
      else if (deptCode === 'PHA') newTypeCode = 'HR';
      else if (deptCode === 'VAN') newTypeCode = 'SHP';
      else newTypeCode = 'OTHER';
    }

    // 3) KD_KAGRI - MKT teams + Sales teams
    else if (divCode === 'KD_KAGRI') {
      if (deptCode === 'TEA2') newTypeCode = 'SAL';
      else if (deptCode === 'PHO') newTypeCode = 'SAL';
      else if (['TEA', 'TEA1', 'GIA'].includes(deptCode)) newTypeCode = 'MKT';
      else newTypeCode = rgCode.startsWith('TELESALES') ? 'SAL' : 'MKT';
    }

    // 4) KD_NAM_DUONG - mixed MKT/SAL by roleGroup
    else if (divCode === 'KD_NAM_DUONG') {
      if (rgCode.startsWith('MARKETING')) newTypeCode = 'MKT';
      else newTypeCode = 'SAL';
    }

    // 5) KVC - complex: MKT, SAL, RES, ECOM, BOD by department
    else if (divCode === 'KVC') {
      if (deptCode === 'P001') newTypeCode = 'BOD';
      else if (deptCode === 'P002') newTypeCode = 'HR';
      else if (deptCode === 'P003') newTypeCode = 'ECOM';
      else if (['PHO1', 'PHO2', 'PHO_FDD7'].includes(deptCode)) newTypeCode = 'MKT';
      else if (['PHO4', 'PHO5'].includes(deptCode)) newTypeCode = 'SAL';
      else if (deptCode === 'PHO3') newTypeCode = 'RES';
      else if (['TEA3', 'TEA4', 'TEA5'].includes(deptCode)) newTypeCode = 'RES';
      else {
        if (rgCode.startsWith('REALSALES')) newTypeCode = 'RES';
        else if (rgCode.startsWith('MARKETING')) newTypeCode = 'MKT';
        else if (rgCode.startsWith('TELESALES')) newTypeCode = 'SAL';
        else newTypeCode = 'SAL';
      }
    }

    // 6) TAY_NGUYEN - mostly SAL, but warehouse staff → WH
    else if (divCode === 'TAY_NGUYEN') {
      if (posName.includes('kho')) newTypeCode = 'WH';
      else newTypeCode = 'SAL';
    }

    // Fallback
    else {
      newTypeCode = 'OTHER';
    }

    if (!typeMap[newTypeCode]) {
      console.error(`  ✗ Type code "${newTypeCode}" not found for ${emp.code}`);
      continue;
    }

    if (currentTypeCode === newTypeCode) {
      skipped++;
      continue;
    }

    changes.push({
      code: emp.code,
      name: emp.fullName,
      div: divCode,
      dept: deptCode,
      from: currentTypeCode,
      to: newTypeCode
    });

    await prisma.employee.update({
      where: { id: emp.id },
      data: { employeeTypeId: typeMap[newTypeCode] }
    });
    updated++;
  }

  console.log(`\n=== KẾT QUẢ ===`);
  console.log(`Tổng nhân viên: ${employees.length}`);
  console.log(`Đã cập nhật: ${updated}`);
  console.log(`Giữ nguyên: ${skipped}`);

  if (changes.length > 0) {
    console.log(`\n=== CHI TIẾT THAY ĐỔI ===`);
    changes.forEach(c => {
      console.log(`  ${c.code} | ${c.name.padEnd(25)} | ${c.div}/${c.dept} | ${c.from} → ${c.to}`);
    });
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
