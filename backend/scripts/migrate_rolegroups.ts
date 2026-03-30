import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to map Department/Division/Position to RoleGroup Code
const getRoleGroupCode = (div: string, dept: string, pos: string, name: string): string => {
    // Priority 1: Specific Positions/People
    if (name === 'Cao Xuân Hồng' || name === 'Admin System' || name === 'Super Admin') return 'ADM'; // System Admin / BOD
    if (pos.includes('Tổng Giám Đốc') || dept.includes('BOD') || div.includes('BOD')) return 'BOD';
    
    // Determine Level (Manager or Staff)
    const isManager = pos.toLowerCase().includes('trưởng') || 
                      pos.toLowerCase().includes('giám đốc') || 
                      pos.toLowerCase().includes('manager') || 
                      pos.toLowerCase().includes('director') ||
                      pos.toLowerCase().includes('leader') ||
                      pos.toLowerCase().includes('quản lý') ||
                      pos.toLowerCase().includes('phó phòng') || // Deputy is also management level usually
                      pos.toLowerCase().includes('kế toán trưởng');
                      
    const suffix = isManager ? '_MGR' : '_STAFF';

    // Priority 2: Department/Division Keyword Matching
    const combined = (div + ' ' + dept).toLowerCase();
    
    if (combined.includes('it') || combined.includes('công nghệ') || combined.includes('tech')) return 'ITC' + suffix;
    if (combined.includes('hcns') || combined.includes('hành chính') || combined.includes('nhân sự') || combined.includes('back office')) return 'HRA' + suffix;
    if (combined.includes('truyền thông')) return 'COM' + suffix;
    if (combined.includes('tmđt') || combined.includes('thương mại điện tử') || combined.includes('ecommerce')) return 'ECO' + suffix;
    if (combined.includes('marketing')) return 'MKT' + suffix;
    if (combined.includes('sales') || combined.includes('kinh doanh') || combined.includes('pkd')) return 'SAL' + suffix;
    if (combined.includes('cskh') || combined.includes('chăm sóc khách hàng')) return 'CSK' + suffix;
    if (combined.includes('kho') || combined.includes('vận đơn') || combined.includes('logistics')) return 'LOG' + suffix;
    if (combined.includes('kế toán') || combined.includes('tài chính') || combined.includes('accounting')) return 'ACC' + suffix;
    
    // Default fallbacks based on Division if not caught above
    if (div.includes('KHO')) return 'LOG' + suffix;
    if (div.includes('CSKH')) return 'CSK' + suffix;
    
    return 'HRA' + suffix; // Default fallback
};

async function main() {
    console.log('Starting RoleGroup Migration...');

    // 1. Create RoleGroups
    const roleGroups = [
        { name: 'Board of Directors', code: 'BOD' },
        { name: 'System Admin', code: 'ADM' },
        
        { name: 'IT Manager', code: 'ITC_MGR' },
        { name: 'IT Staff', code: 'ITC_STAFF' },
        
        { name: 'HR Manager', code: 'HRA_MGR' },
        { name: 'HR Staff', code: 'HRA_STAFF' },
        
        { name: 'Communications Manager', code: 'COM_MGR' },
        { name: 'Communications Staff', code: 'COM_STAFF' },
        
        { name: 'E-commerce Manager', code: 'ECO_MGR' },
        { name: 'E-commerce Staff', code: 'ECO_STAFF' },
        
        { name: 'Marketing Manager', code: 'MKT_MGR' },
        { name: 'Marketing Staff', code: 'MKT_STAFF' },
        
        { name: 'Sales Manager', code: 'SAL_MGR' },
        { name: 'Sales Staff', code: 'SAL_STAFF' },
        
        { name: 'Customer Service Manager', code: 'CSK_MGR' },
        { name: 'Customer Service Staff', code: 'CSK_STAFF' },
        
        { name: 'Logistics Manager', code: 'LOG_MGR' },
        { name: 'Logistics Staff', code: 'LOG_STAFF' },
        
        { name: 'Accounting Manager', code: 'ACC_MGR' },
        { name: 'Accounting Staff', code: 'ACC_STAFF' }
    ];

    const rgMap = new Map<string, string>();

    for (const rg of roleGroups) {
        const created = await prisma.roleGroup.upsert({
            where: { code: rg.code },
            update: { name: rg.name },
            create: { name: rg.name, code: rg.code }
        });
        rgMap.set(rg.code, created.id);
        console.log(`Upserted RoleGroup: ${rg.name}`);
    }

    // 2. Fetch all employees
    const employees = await prisma.employee.findMany({
        include: {
            department: {
                include: {
                    division: true
                }
            },
            position: true
        }
    });

    console.log(`Found ${employees.length} employees to update.`);

    // 3. Update Employees
    for (const emp of employees) {
        if (!emp.department || !emp.position || !emp.department.division) {
            console.warn(`Skipping employee ${emp.fullName} due to missing dept/pos/div`);
            continue;
        }

        const newRgCode = getRoleGroupCode(
            emp.department.division.name,
            emp.department.name,
            emp.position.name,
            emp.fullName
        );

        const newRgId = rgMap.get(newRgCode);

        if (newRgId && newRgId !== emp.roleGroupId) {
            await prisma.employee.update({
                where: { id: emp.id },
                data: { roleGroupId: newRgId }
            });
            // console.log(`Updated ${emp.fullName} -> ${newRgCode}`);
        }
    }

    console.log('RoleGroup Migration Completed.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
