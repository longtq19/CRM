import { PrismaClient, Status } from '@prisma/client';
import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const EMPLOYEE_FILE = path.resolve(__dirname, '../../Danh_sach_nhan_vien_2026-03-06.xlsx');
const PRODUCT_FILE = path.resolve(__dirname, '../../products_2026-03-06.xlsx');

function parseDate(dateStr: any): Date | null {
  if (!dateStr) return null;
  if (typeof dateStr === 'number') return new Date(Math.round((dateStr - 25569) * 86400 * 1000));
  if (typeof dateStr === 'string') {
    const parts = dateStr.split('/');
    if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  }
  return null;
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeGender(value: unknown): string {
  const v = normalize(value);
  if (v === 'nam' || v === 'male') return 'Nam';
  if (v === 'nu' || v === 'nữ' || v === 'female') return 'Nữ';
  return 'Khác';
}

async function readSheetRows(filePath: string): Promise<any[]> {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const headers: string[] = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = String(cell.value ?? '').trim();
  });

  const rows: any[] = [];
  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const obj: any = {};
    let hasValue = false;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      obj[key] = cell.value;
      if (cell.value !== null && cell.value !== '') hasValue = true;
    });
    if (hasValue) rows.push(obj);
  }
  return rows;
}

async function importEmployees() {
  const rows = await readSheetRows(EMPLOYEE_FILE);
  console.log(`[employees] rows: ${rows.length}`);

  const employmentTypes = await prisma.employmentType.findMany();
  const employeeStatuses = await prisma.employeeStatus.findMany();
  const banks = await prisma.bank.findMany();
  const subsidiaries = await prisma.subsidiary.findMany();

  const divisionMap = new Map<string, string>();
  const departmentMap = new Map<string, string>();
  const positionMap = new Map<string, string>();
  const employeeMap = new Map<string, string>();
  const employeeCodeMap = new Map<string, string>();
  const defaultPasswordHash = await bcrypt.hash('123456', 10);

  let success = 0;
  let skipped = 0;

  for (const row of rows) {
    const code = String(row['Mã NV'] ?? '').trim();
    if (!code) continue;
    try {
      const fullName = String(row['Họ và tên'] ?? '').trim() || 'Unknown';
      const phone = row['Số điện thoại'] ? String(row['Số điện thoại']).trim() : null;
      const emailCompany = row['Email công ty'] ? String(row['Email công ty']).trim() : null;
      const emailPersonal = row['Email cá nhân'] ? String(row['Email cá nhân']).trim() : null;
      const gender = normalizeGender(row['Giới tính']);
      const dateOfBirth = parseDate(row['Ngày sinh']);
      const address = row['Địa chỉ'] ? String(row['Địa chỉ']).trim() : null;

      const divName = row['Khối'] ? String(row['Khối']).trim() : '';
      const deptName = row['Phòng ban'] ? String(row['Phòng ban']).trim() : '';
      const posName = row['Chức danh'] ? String(row['Chức danh']).trim() : '';
      const subName = row['Công ty con'] ? String(row['Công ty con']).trim() : '';

      let divisionId = '';
      if (divName) {
        if (divisionMap.has(divName)) {
          divisionId = divisionMap.get(divName)!;
        } else {
          let div = await prisma.division.findFirst({ where: { name: divName } });
          if (!div) {
            const base = divName.substring(0, 3).toUpperCase() || 'DIV';
            let finalCode = base;
            let idx = 1;
            while (await prisma.division.findUnique({ where: { code: finalCode } })) {
              finalCode = `${base}${idx++}`;
            }
            div = await prisma.division.create({ data: { code: finalCode, name: divName } });
          }
          divisionId = div.id;
          divisionMap.set(divName, div.id);
        }
      }

      let departmentId = '';
      if (deptName && divisionId) {
        if (departmentMap.has(`${deptName}:${divisionId}`)) {
          departmentId = departmentMap.get(`${deptName}:${divisionId}`)!;
        } else {
          let dept = await prisma.department.findFirst({ where: { name: deptName, divisionId } });
          if (!dept) {
            const base = deptName.substring(0, 3).toUpperCase() || 'DPT';
            let finalCode = base;
            let idx = 1;
            while (await prisma.department.findUnique({ where: { code: finalCode } })) {
              finalCode = `${base}${idx++}`;
            }
            dept = await prisma.department.create({ data: { code: finalCode, name: deptName, divisionId } });
          }
          departmentId = dept.id;
          departmentMap.set(`${deptName}:${divisionId}`, dept.id);
        }
      }

      let positionId = '';
      if (posName && departmentId) {
        if (positionMap.has(`${posName}:${departmentId}`)) {
          positionId = positionMap.get(`${posName}:${departmentId}`)!;
        } else {
          let pos = await prisma.position.findFirst({ where: { name: posName, departmentId } });
          if (!pos) {
            const base = posName.substring(0, 3).toUpperCase() || 'POS';
            let finalCode = base;
            let idx = 1;
            while (await prisma.position.findUnique({ where: { code: finalCode } })) {
              finalCode = `${base}${idx++}`;
            }
            pos = await prisma.position.create({ data: { code: finalCode, name: posName, departmentId } });
          }
          positionId = pos.id;
          positionMap.set(`${posName}:${departmentId}`, pos.id);
        }
      }

      if (!departmentId || !positionId) {
        skipped++;
        continue;
      }

      const typeRaw = row['Loại hợp đồng'];
      const statusRaw = row['Trạng thái'];

      let employmentTypeId = employmentTypes.find((t) => normalize(t.code) === 'official')?.id;
      if (typeRaw) {
        const found = employmentTypes.find((t) => normalize(t.name) === normalize(typeRaw) || normalize(t.code) === normalize(typeRaw));
        if (found) employmentTypeId = found.id;
      }
      let statusId = employeeStatuses.find((s) => normalize(s.code) === 'working')?.id;
      if (statusRaw) {
        const found = employeeStatuses.find((s) => normalize(s.name) === normalize(statusRaw) || normalize(s.code) === normalize(statusRaw));
        if (found) statusId = found.id;
      }
      if (!employmentTypeId || !statusId) {
        skipped++;
        continue;
      }

      const emp = await prisma.employee.upsert({
        where: { code },
        update: {
          fullName,
          phone,
          emailCompany,
          emailPersonal,
          gender,
          dateOfBirth,
          address,
          employmentTypeId,
          statusId,
          departmentId,
          positionId,
          passwordHash: defaultPasswordHash,
          filePath: row['Đường dẫn tệp'] ? String(row['Đường dẫn tệp']).trim() : null,
        },
        create: {
          code,
          fullName,
          phone,
          emailCompany,
          emailPersonal,
          gender,
          dateOfBirth,
          address,
          employmentTypeId,
          statusId,
          departmentId,
          positionId,
          passwordHash: defaultPasswordHash,
          filePath: row['Đường dẫn tệp'] ? String(row['Đường dẫn tệp']).trim() : null,
        },
      });

      const bankName = row['Tên ngân hàng'] ? String(row['Tên ngân hàng']).trim() : '';
      const accountNumber = row['Số tài khoản'] ? String(row['Số tài khoản']).trim() : '';
      const accountHolder = row['Chủ tài khoản'] ? String(row['Chủ tài khoản']).trim() : fullName;
      if (bankName && accountNumber) {
        const bank = banks.find((b) => normalize(b.name).includes(normalize(bankName)) || normalize(b.shortName).includes(normalize(bankName)));
        if (bank) {
          await prisma.employeeBankAccount.deleteMany({ where: { employeeId: emp.id } });
          await prisma.employeeBankAccount.create({
            data: { employeeId: emp.id, bankId: bank.id, accountNumber, accountHolder, isPrimary: true },
          });
        }
      }

      const vehicleType = row['Loại xe'] ? String(row['Loại xe']).trim() : '';
      const licensePlate = row['Biển số'] ? String(row['Biển số']).trim() : '';
      if (vehicleType && licensePlate) {
        await prisma.employeeVehicle.deleteMany({ where: { employeeId: emp.id } });
        await prisma.employeeVehicle.create({
          data: {
            employeeId: emp.id,
            type: vehicleType,
            name: row['Tên xe'] ? String(row['Tên xe']).trim() : null,
            color: row['Màu xe'] ? String(row['Màu xe']).trim() : null,
            licensePlate,
          },
        }).catch(() => {});
      }

      if (subName) {
        const subNames = subName.split(',').map((s: string) => s.trim()).filter(Boolean);
        const subIds = subsidiaries
          .filter((s) => subNames.some((sn) => normalize(sn) === normalize(s.name) || normalize(sn) === normalize(s.code)))
          .map((s) => ({ id: s.id }));
        if (subIds.length > 0) {
          await prisma.employee.update({ where: { id: emp.id }, data: { subsidiaries: { set: subIds } } });
        }
      }

      employeeMap.set(fullName, emp.id);
      employeeCodeMap.set(code, emp.id);
      success++;
    } catch {
      skipped++;
    }
  }

  // managerId has been removed from Employee model.
  // Manager relationship is now derived from department/division hierarchy.

  console.log(`[employees] imported: ${success}, skipped: ${skipped}`);
}

function mapProductType(typeRaw: unknown): string {
  const raw = normalize(typeRaw);
  if (raw.includes('công nghệ') || raw === 'tech') return 'TECH';
  if (raw.includes('quà') || raw === 'gift') return 'GIFT';
  return 'BIO';
}

async function importProducts() {
  const rows = await readSheetRows(PRODUCT_FILE);
  console.log(`[products] rows: ${rows.length}`);

  let success = 0;
  let failed = 0;

  for (const row of rows) {
    const code = String(row['Mã sản phẩm'] ?? '').trim();
    if (!code) continue;

    try {
      const type = mapProductType(row['Loại']);
      const category = await prisma.productCategory.upsert({
        where: { code: type },
        update: {},
        create: { code: type, name: type === 'BIO' ? 'Phân bón sinh học' : type === 'TECH' ? 'Sản phẩm công nghệ' : 'Quà tặng' },
      });

      const name = String(row['Tên thường gọi'] ?? row['Tên VAT'] ?? 'Sản phẩm').trim();
      const vatName = String(row['Tên VAT'] ?? '').trim();
      const description = String(row['Mô tả'] ?? '').trim();
      const listPriceNet = Number(row['Giá niêm yết (chưa VAT)']) || 0;
      const minSellPriceNet = Number(row['Giá tối thiểu (chưa VAT)']) || 0;
      const vatRate = Number(row['VAT (%)']) || 0;
      const unit = String(row['Đơn vị'] ?? 'Cái').trim();
      const statusRaw = normalize(row['Trạng thái']);
      const status: Status = statusRaw === 'inactive' || statusRaw === 'khong hoat dong' || statusRaw === 'không hoạt động' ? 'INACTIVE' : 'ACTIVE';

      const product = await prisma.product.upsert({
        where: { code },
        update: {
          name,
          vatName,
          description,
          listPriceNet,
          minSellPriceNet,
          vatRate,
          unit,
          status,
          categoryId: category.id,
        },
        create: {
          code,
          name,
          vatName,
          description,
          listPriceNet,
          minSellPriceNet,
          vatRate,
          unit,
          status,
          categoryId: category.id,
        },
      });

      if (type === 'BIO' || type === 'GIFT') {
        await prisma.productBio.upsert({
          where: { productId: product.id },
          update: {
            packType: String(row['Quy cách/Thùng'] ?? '').trim() || null,
            ingredients: String(row['Thành phần'] ?? '').trim() || null,
            usage: String(row['Công dụng'] ?? '').trim() || null,
            expiryPeriod: Number(row['Hạn sử dụng (tháng)']) || null,
          },
          create: {
            productId: product.id,
            packType: String(row['Quy cách/Thùng'] ?? '').trim() || null,
            ingredients: String(row['Thành phần'] ?? '').trim() || null,
            usage: String(row['Công dụng'] ?? '').trim() || null,
            expiryPeriod: Number(row['Hạn sử dụng (tháng)']) || null,
          },
        });
        await prisma.productTech.deleteMany({ where: { productId: product.id } });
      } else {
        await prisma.productTech.upsert({
          where: { productId: product.id },
          update: {},
          create: { productId: product.id, warrantyDuration: 12, specifications: {} },
        });
        await prisma.productBio.deleteMany({ where: { productId: product.id } });
      }

      success++;
    } catch {
      failed++;
    }
  }

  console.log(`[products] imported: ${success}, failed: ${failed}`);
}

async function main() {
  console.log('Importing local sheets to database...');
  await importEmployees();
  await importProducts();
  console.log('Done importing local sheets.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
