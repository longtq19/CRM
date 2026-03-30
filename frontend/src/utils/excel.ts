import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { translate } from './dictionary';
import { formatDate } from './format';
import { HR_EMPLOYEE_SHEET_COLUMNS } from '../constants/hrEmployeeSpreadsheet';

/** Xuất Excel — cùng thứ tự cột với mẫu import (`HR_EMPLOYEE_SHEET_COLUMNS`). */
export const exportEmployeesToExcel = async (employees: any[]) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Danh sách nhân viên');

  worksheet.columns = HR_EMPLOYEE_SHEET_COLUMNS.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  employees.forEach((emp) => {
    const bank =
      emp.bankAccounts && emp.bankAccounts.length > 0
        ? emp.bankAccounts.find((b: any) => b.isPrimary) || emp.bankAccounts[0]
        : null;

    const vehicle = emp.vehicles && emp.vehicles.length > 0 ? emp.vehicles[0] : null;

    const subsidiaryNames = emp.subsidiaries
      ? emp.subsidiaries.map((s: any) => s.name).join(', ')
      : '';

    const employmentTypeName =
      typeof emp.employmentType === 'object' && emp.employmentType?.name
        ? emp.employmentType.name
        : String(emp.employmentType || '');

    const employeeTypeLabel =
      typeof emp.employeeType === 'object' && emp.employeeType
        ? emp.employeeType.name || emp.employeeType.code || ''
        : '';

    const roleGroupLabel =
      typeof emp.roleGroup === 'object' && emp.roleGroup
        ? translate(emp.roleGroup.name || '') || emp.roleGroup.code || ''
        : '';

    const statusLabel =
      typeof emp.status === 'object' && emp.status?.name
        ? translate(emp.status.name)
        : translate(String(emp.status || ''));

    const contractEffYmd = emp.contractEffectiveDate
      ? String(emp.contractEffectiveDate).split('T')[0]
      : emp.probationStartDate
        ? String(emp.probationStartDate).split('T')[0]
        : '';
    const contractEndYmd = emp.contractEndDate
      ? String(emp.contractEndDate).split('T')[0]
      : emp.probationEndDate
        ? String(emp.probationEndDate).split('T')[0]
        : '';

    const departmentUnitName =
      typeof emp.hrDepartmentUnit === 'object' && emp.hrDepartmentUnit?.name
        ? emp.hrDepartmentUnit.name
        : '';

    worksheet.addRow({
      code: emp.code,
      fullName: emp.fullName,
      gender: translate(emp.gender || ''),
      dob: emp.dateOfBirth ? formatDate(emp.dateOfBirth) : '',
      phone: emp.phone,
      emailCompany: emp.emailCompany,
      emailPersonal: emp.emailPersonal,
      address: emp.address || '',
      employmentType: employmentTypeName,
      employeeType: employeeTypeLabel,
      roleGroup: roleGroupLabel,
      subsidiary: subsidiaryNames,
      departmentUnit: departmentUnitName,
      hrJobTitle: emp.hrJobTitle || '',
      status: statusLabel,
      contractEffective: contractEffYmd,
      contractEnd: contractEndYmd,
      bankName: bank?.bank?.name || bank?.bankName || '',
      bankAccount: bank?.accountNumber || '',
      bankHolder: bank?.accountHolder || '',
      vehicleType: vehicle?.type || '',
      vehicleName: vehicle?.name || '',
      vehiclePlate: vehicle?.licensePlate || '',
      vehicleColor: vehicle?.color || '',
      filePath: emp.filePath || '',
    });
  });

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0070C0' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 30;

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
      if (rowNumber > 1) {
        cell.alignment = { vertical: 'middle', wrapText: true };
      }
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const fileName = `Danh_sach_nhan_vien_${new Date().toISOString().split('T')[0]}.xlsx`;
  saveAs(blob, fileName);
};
