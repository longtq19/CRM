
import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const filePath = '/root/CRM/Danh_sach_nhan_vien_2026-02-28.xlsx';

// Helper to parse date dd/mm/yyyy
function parseDate(dateStr: any): Date | null {
    if (!dateStr) return null;
    if (typeof dateStr === 'number') {
        // Excel serial date
        return new Date(Math.round((dateStr - 25569) * 86400 * 1000));
    }
    if (typeof dateStr === 'string') {
        const parts = dateStr.split('/');
        if (parts.length === 3) {
            return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
    }
    return null;
}

// Helper to normalize strings for comparison
function normalize(str: string): string {
    if (!str) return '';
    return str.trim().toLowerCase();
}

async function main() {
    console.log(`Starting import from ${filePath}...`);
    
    if (!fs.existsSync(filePath)) {
        console.error('File not found!');
        process.exit(1);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) { console.error('No worksheet found'); process.exit(1); }

    const headerRow = worksheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = cell.value != null ? String(cell.value).trim() : '';
    });

    const data: any[] = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const obj: any = {};
      let hasValue = false;
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const key = headers[col];
        if (key) { obj[key] = cell.value; if (cell.value != null && cell.value !== '') hasValue = true; }
      });
      if (hasValue) data.push(obj);
    }

    console.log(`Found ${data.length} rows.`);

    // 1. Pre-load Master Data
    const employmentTypes = await prisma.employmentType.findMany();
    const employeeStatuses = await prisma.employeeStatus.findMany();
    const banks = await prisma.bank.findMany();
    const subsidiaries = await prisma.subsidiary.findMany();
    
    // Maps for caching created/found entities
    const divisionMap = new Map<string, string>(); // Name -> ID
    const departmentMap = new Map<string, string>(); // Name -> ID
    const positionMap = new Map<string, string>(); // Name -> ID
    const employeeMap = new Map<string, string>(); // Name -> ID (for manager lookup)
    const employeeCodeMap = new Map<string, string>(); // Code -> ID

    // Default password hash
    const defaultPasswordHash = await bcrypt.hash('123456', 10);

    // 2. Process Rows
    for (const row of data) {
        try {
            const code = row['Mã NV'] ? String(row['Mã NV']).trim() : '';
            if (!code) continue; // Skip if no code

            const fullName = row['Họ và tên'] ? String(row['Họ và tên']).trim() : 'Unknown';
            const emailCompany = row['Email công ty'];
            const emailPersonal = row['Email cá nhân'];
            const phone = row['Số điện thoại'] ? String(row['Số điện thoại']) : null;
            const gender = row['Giới tính'] || 'Other';
            const dob = parseDate(row['Ngày sinh']);
            const address = row['Địa chỉ'];
            
            // Organization Structure
            const divName = row['Khối'] ? String(row['Khối']).trim() : null;
            const deptName = row['Phòng ban'] ? String(row['Phòng ban']).trim() : null;
            const posName = row['Chức danh'] ? String(row['Chức danh']).trim() : null;
            const subName = row['Công ty con'] ? String(row['Công ty con']).trim() : null;

            // Resolve Division
            let divisionId = '';
            if (divName) {
                if (divisionMap.has(divName)) {
                    divisionId = divisionMap.get(divName)!;
                } else {
                    // Find or Create
                    let div = await prisma.division.findFirst({ where: { name: divName } });
                    if (!div) {
                        // Create new division
                        const divCode = divName.substring(0, 3).toUpperCase(); // Simple code gen
                        // Ensure unique code
                        let finalDivCode = divCode;
                        let counter = 1;
                        while (await prisma.division.findUnique({ where: { code: finalDivCode } })) {
                            finalDivCode = `${divCode}${counter++}`;
                        }
                        
                        div = await prisma.division.create({
                            data: { name: divName, code: finalDivCode }
                        });
                        console.log(`Created Division: ${divName}`);
                    }
                    divisionId = div.id;
                    divisionMap.set(divName, div.id);
                }
            }

            // Resolve Department
            let departmentId = '';
            if (deptName && divisionId) {
                if (departmentMap.has(deptName)) {
                    departmentId = departmentMap.get(deptName)!;
                } else {
                    let dept = await prisma.department.findFirst({ where: { name: deptName, divisionId } });
                    if (!dept) {
                        const deptCode = deptName.substring(0, 3).toUpperCase();
                        let finalDeptCode = deptCode;
                        let counter = 1;
                        while (await prisma.department.findUnique({ where: { code: finalDeptCode } })) {
                            finalDeptCode = `${deptCode}${counter++}`;
                        }

                        dept = await prisma.department.create({
                            data: { name: deptName, code: finalDeptCode, divisionId }
                        });
                        console.log(`Created Department: ${deptName}`);
                    }
                    departmentId = dept.id;
                    departmentMap.set(deptName, dept.id);
                }
            }

            // Resolve Position
            let positionId = '';
            if (posName && departmentId) {
                if (positionMap.has(posName)) {
                    positionId = positionMap.get(posName)!;
                } else {
                    let pos = await prisma.position.findFirst({ where: { name: posName, departmentId } });
                    if (!pos) {
                        const posCode = posName.substring(0, 3).toUpperCase();
                        let finalPosCode = posCode;
                        let counter = 1;
                        while (await prisma.position.findUnique({ where: { code: finalPosCode } })) {
                            finalPosCode = `${posCode}${counter++}`;
                        }

                        pos = await prisma.position.create({
                            data: { name: posName, code: finalPosCode, departmentId }
                        });
                        console.log(`Created Position: ${posName}`);
                    }
                    positionId = pos.id;
                    positionMap.set(posName, pos.id);
                }
            }

            // Resolve Employment Type
            const typeStr = row['Loại hợp đồng'];
            let employmentTypeId = employmentTypes.find(t => t.code === 'official')?.id; // Default
            if (typeStr) {
                const found = employmentTypes.find(t => normalize(t.name) === normalize(typeStr) || normalize(t.code) === normalize(typeStr));
                if (found) employmentTypeId = found.id;
            }

            // Resolve Status
            const statusStr = row['Trạng thái'];
            let statusId = employeeStatuses.find(s => s.code === 'WORKING')?.id; // Default
            if (statusStr) {
                if (normalize(statusStr) === 'đang làm việc') {
                    statusId = employeeStatuses.find(s => s.code === 'WORKING')?.id;
                } else if (normalize(statusStr) === 'đã nghỉ việc') {
                    statusId = employeeStatuses.find(s => s.code === 'RESIGNED')?.id;
                }
                // Add more mappings if needed
            }

            // Prepare Employee Data
            // We need departmentId and positionId as mandatory in schema?
            // Schema: positionId String, departmentId String.
            // If we don't have them, we might need a fallback "Unknown" department/position or skip.
            // For now, if missing, we'll try to use a default or fail gracefully.
            
            if (!departmentId || !positionId) {
                console.warn(`Skipping ${fullName} (${code}) due to missing Department or Position.`);
                continue;
            }

            if (!employmentTypeId || !statusId) {
                 console.warn(`Skipping ${fullName} (${code}) due to missing Type or Status.`);
                 continue;
            }

            const empData = {
                code,
                fullName,
                gender,
                dateOfBirth: dob,
                phone,
                emailCompany,
                emailPersonal,
                address,
                passwordHash: defaultPasswordHash,
                employmentTypeId: employmentTypeId!,
                statusId: statusId!,
                departmentId,
                positionId,
                filePath: row['Đường dẫn tệp']
            };

            const emp = await prisma.employee.upsert({
                where: { code },
                update: empData,
                create: empData
            });
            
            employeeMap.set(fullName, emp.id);
            employeeCodeMap.set(code, emp.id);
            console.log(`Upserted Employee: ${fullName} (${code})`);

            // Handle Bank Account
            const bankName = row['Tên ngân hàng'];
            const accNum = row['Số tài khoản'];
            const accHolder = row['Chủ tài khoản'];
            
            if (bankName && accNum) {
                // Find bank
                // Try fuzzy match
                const bank = banks.find(b => normalize(b.name).includes(normalize(bankName)) || normalize(b.shortName || '').includes(normalize(bankName)));
                if (bank) {
                    await prisma.employeeBankAccount.deleteMany({ where: { employeeId: emp.id } }); // Clear old
                    await prisma.employeeBankAccount.create({
                        data: {
                            employeeId: emp.id,
                            bankId: bank.id,
                            accountNumber: String(accNum),
                            accountHolder: accHolder || fullName,
                            isPrimary: true
                        }
                    });
                }
            }

            // Handle Vehicle
            const vehicleType = row['Loại xe'];
            const licensePlate = row['Biển số'];
            if (vehicleType && licensePlate) {
                await prisma.employeeVehicle.deleteMany({ where: { employeeId: emp.id } }); // Clear old
                await prisma.employeeVehicle.create({
                    data: {
                        employeeId: emp.id,
                        type: vehicleType,
                        name: row['Tên xe'],
                        color: row['Màu xe'],
                        licensePlate: String(licensePlate)
                    }
                }).catch(e => console.error(`Error creating vehicle for ${code}: ${e.message}`));
            }

            // Handle Subsidiaries
            if (subName) {
                // Assuming single subsidiary for now or comma separated
                const subNames = subName.split(',').map(s => s.trim());
                const subIds: string[] = [];
                for (const s of subNames) {
                    const sub = subsidiaries.find(sub => normalize(sub.name) === normalize(s) || normalize(sub.code) === normalize(s));
                    if (sub) subIds.push(sub.id);
                }
                
                if (subIds.length > 0) {
                    await prisma.employee.update({
                        where: { id: emp.id },
                        data: {
                            subsidiaries: {
                                set: subIds.map(id => ({ id }))
                            }
                        }
                    });
                }
            }

        } catch (error) {
            console.error(`Error processing row ${JSON.stringify(row)}:`, error);
        }
    }

    // managerId has been removed from Employee model.
    // Manager relation is now resolved from Department/Division hierarchy.
    console.log('Skip linking managers: managerId field removed from Employee.');

    console.log('Import completed.');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
