import { Router } from 'express';
import {
  getPositions,
  getDepartments,
  getDivisions,
  getRoleGroups,
  getEmployees,
  getEmployeesBirthdaysInMonth,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  createDepartment,
  assignEmployeeToDepartmentUnit,
  removeEmployeeFromDepartmentUnit,
  updateDepartment,
  deleteDepartment,
  createDivision,
  updateDivision,
  updateDivisionDataFlow,
  updateDivisionOrder,
  deleteDivision,
  createPosition,
  updatePosition,
  deletePosition,
  getSubsidiaries,
  createSubsidiary,
  updateSubsidiary,
  deleteSubsidiary,
  getBanks,
  getEmploymentTypes,
  getEmployeeStatuses,
  getEmployeeTypes,
  createEmployeeType,
  updateEmployeeType,
  deleteEmployeeType,
  uploadAvatar,
  updateEmployeeAvatar,
  assignRoleGroup,
  importEmployees,
  getEmployeeImportTemplate,
  getOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getHrDepartmentUnits,
  createHrDepartmentUnit,
  updateHrDepartmentUnit,
  deleteHrDepartmentUnit,
} from '../controllers/hrController';
import { imageUploadMiddleware, processAvatar } from '../middleware/imageUploadMiddleware';
import { excelUploadMiddleware } from '../middleware/excelUploadMiddleware';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  ORG_STRUCTURE_WRITE_PERMISSIONS,
  DIVISION_DATA_FLOW_WRITE_PERMISSIONS,
  HR_ASSIGN_ROLE_GROUP_PERMISSIONS,
  OPS_LEAF_STAFF_REMOVE_PERMISSIONS,
  EMPLOYEE_TYPE_CATALOG_WRITE_PERMISSIONS,
} from '../config/routePermissionPolicy';
import { toPublicUploadUrl } from '../config/publicUploadUrl';

const router = Router();

router.use(authMiddleware);

// Upload Route
router.post('/employees/upload-avatar', imageUploadMiddleware.single('avatar'), processAvatar, uploadAvatar);
router.patch('/employees/:id/avatar', updateEmployeeAvatar);

// Upload ID Card images
router.post('/upload-id-card', imageUploadMiddleware.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'Chưa chọn file tải lên' });
  }
  const fileUrl = `/uploads/avatars/${req.file.filename}`;
  res.json({ url: toPublicUploadUrl(fileUrl) });
});

// Master Data Routes (Read) — chỉ cần đăng nhập; phạm vi NV / dữ liệu nhạy cảm xử lý trong controller (không chặn quản lý đơn vị / NV chỉ có menu Nhân sự mà thiếu VIEW_HR).
router.get('/organizations', getOrganizations);
router.post('/organizations', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), createOrganization);
router.put('/organizations/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), updateOrganization);
router.delete('/organizations/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), deleteOrganization);
router.get('/positions', getPositions);
router.get('/departments', getDepartments);
router.get('/divisions', getDivisions);
router.get('/role-groups', getRoleGroups);
router.get('/subsidiaries', getSubsidiaries);
router.post('/subsidiaries', checkPermission(['MANAGE_HR', 'CREATE_HR']), createSubsidiary);
router.put('/subsidiaries/:id', checkPermission(['MANAGE_HR', 'UPDATE_HR']), updateSubsidiary);
router.delete('/subsidiaries/:id', checkPermission(['MANAGE_HR', 'DELETE_HR']), deleteSubsidiary);
router.get('/banks', getBanks);
router.get('/employment-types', getEmploymentTypes);
router.get('/employee-statuses', getEmployeeStatuses);
router.get('/employee-types', getEmployeeTypes);
router.post(
  '/employee-types',
  checkPermission([...EMPLOYEE_TYPE_CATALOG_WRITE_PERMISSIONS]),
  createEmployeeType
);
router.put(
  '/employee-types/:id',
  checkPermission([...EMPLOYEE_TYPE_CATALOG_WRITE_PERMISSIONS]),
  updateEmployeeType
);
router.delete(
  '/employee-types/:id',
  checkPermission([...EMPLOYEE_TYPE_CATALOG_WRITE_PERMISSIONS]),
  deleteEmployeeType
);
router.get('/hr-department-units', getHrDepartmentUnits);
router.post('/hr-department-units', checkPermission(['MANAGE_HR', 'CREATE_HR']), createHrDepartmentUnit);
router.put('/hr-department-units/:id', checkPermission(['MANAGE_HR', 'UPDATE_HR']), updateHrDepartmentUnit);
router.delete('/hr-department-units/:id', checkPermission(['MANAGE_HR', 'DELETE_HR']), deleteHrDepartmentUnit);

// Create Master Data Routes
router.post('/divisions', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), createDivision);
router.put('/divisions/reorder', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), updateDivisionOrder);
router.put('/divisions/:id/data-flow', checkPermission([...DIVISION_DATA_FLOW_WRITE_PERMISSIONS]), updateDivisionDataFlow);
router.put('/divisions/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), updateDivision);
router.delete('/divisions/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), deleteDivision);

router.post('/departments', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), createDepartment);
router.put(
  '/departments/:departmentId/staff-assignment',
  checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]),
  assignEmployeeToDepartmentUnit
);
router.delete(
  '/departments/:departmentId/staff-assignment/:employeeId',
  checkPermission([...OPS_LEAF_STAFF_REMOVE_PERMISSIONS]),
  removeEmployeeFromDepartmentUnit
);
router.put('/departments/:id', checkPermission([...DIVISION_DATA_FLOW_WRITE_PERMISSIONS]), updateDepartment);
router.delete('/departments/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), deleteDepartment);

router.post('/positions', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), createPosition);
router.put('/positions/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), updatePosition);
router.delete('/positions/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), deletePosition);

// Employee Routes
router.get('/employees/import-template', checkPermission(['MANAGE_HR', 'CREATE_HR']), getEmployeeImportTemplate);
router.get('/employees/birthdays-in-month', getEmployeesBirthdaysInMonth);
router.get('/employees', getEmployees);
router.get('/employees/:id', getEmployeeById);
router.post('/employees', checkPermission(['MANAGE_HR', 'CREATE_HR']), createEmployee);
router.put('/employees/:id', checkPermission(['MANAGE_HR', 'UPDATE_HR']), updateEmployee);
router.delete('/employees/:id', checkPermission(['MANAGE_HR', 'DELETE_HR']), deleteEmployee);
router.post(
  '/employees/assign-role-group',
  checkPermission([...HR_ASSIGN_ROLE_GROUP_PERMISSIONS]),
  assignRoleGroup
);
router.post('/employees/import', checkPermission(['MANAGE_HR', 'CREATE_HR']), excelUploadMiddleware.single('file'), importEmployees);

export default router;
