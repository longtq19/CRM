import { Router } from 'express';
import { HrController } from './hr.controller';
import * as OldHrController from '../../controllers/hrController';
import { authMiddleware, checkPermission } from '../../middleware/authMiddleware';
import { 
  ORG_STRUCTURE_WRITE_PERMISSIONS,
  DIVISION_DATA_FLOW_WRITE_PERMISSIONS,
  HR_ASSIGN_ROLE_GROUP_PERMISSIONS,
  OPS_LEAF_STAFF_REMOVE_PERMISSIONS,
  EMPLOYEE_TYPE_CATALOG_WRITE_PERMISSIONS
} from '../../config/routePermissionPolicy';
import { imageUploadMiddleware, processAvatar } from '../../middleware/imageUploadMiddleware';
import { excelUploadMiddleware } from '../../middleware/excelUploadMiddleware';

const router = Router();

router.use(authMiddleware);

// Organization Routes
router.get('/organizations', HrController.getOrganizations);
router.post('/organizations', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), HrController.createOrganization);
router.put('/organizations/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), HrController.updateOrganization);
router.delete('/organizations/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), HrController.deleteOrganization);

// Catalog Routes
router.get('/banks', HrController.getBanks);
router.get('/employment-types', HrController.getEmploymentTypes);
router.get('/employee-statuses', HrController.getEmployeeStatuses);
router.get('/employee-types', HrController.getEmployeeTypes);
router.post('/employee-types', checkPermission(['MANAGE_HR', 'CREATE_HR']), HrController.createEmployeeType);
router.put('/employee-types/:id', checkPermission(['MANAGE_HR', 'UPDATE_HR']), HrController.updateEmployeeType);
router.delete('/employee-types/:id', checkPermission(['MANAGE_HR', 'DELETE_HR']), HrController.deleteEmployeeType);
router.get('/role-groups', HrController.getRoleGroups);
router.get('/hr-department-units', HrController.getHrDepartmentUnits);
router.post('/hr-department-units', checkPermission(['MANAGE_HR', 'CREATE_HR']), HrController.createHrDepartmentUnit);
router.put('/hr-department-units/:id', checkPermission(['MANAGE_HR', 'UPDATE_HR']), HrController.updateHrDepartmentUnit);
router.delete('/hr-department-units/:id', checkPermission(['MANAGE_HR', 'DELETE_HR']), HrController.deleteHrDepartmentUnit);

router.get('/subsidiaries', HrController.getSubsidiaries);
router.post('/subsidiaries', checkPermission(['MANAGE_HR', 'CREATE_HR']), HrController.createSubsidiary);
router.put('/subsidiaries/:id', checkPermission(['MANAGE_HR', 'UPDATE_HR']), HrController.updateSubsidiary);
router.delete('/subsidiaries/:id', checkPermission(['MANAGE_HR', 'DELETE_HR']), HrController.deleteSubsidiary);

// Employee Routes
router.get('/employees/birthdays-in-month', HrController.getEmployeesBirthdaysInMonth);
router.get('/employees', HrController.getEmployees);
router.get('/employees/:id', HrController.getEmployeeById);
router.post('/employees', checkPermission(['MANAGE_HR', 'CREATE_HR']), HrController.createEmployee);
router.put('/employees/:id', checkPermission(['MANAGE_HR', 'UPDATE_HR']), OldHrController.updateEmployee);
router.delete('/employees/:id', checkPermission(['MANAGE_HR', 'DELETE_HR']), OldHrController.deleteEmployee);
router.post('/employees/assign-role-group', checkPermission([...HR_ASSIGN_ROLE_GROUP_PERMISSIONS]), OldHrController.assignRoleGroup);
router.post('/employees/upload-avatar', imageUploadMiddleware.single('avatar'), processAvatar, OldHrController.uploadAvatar);
router.patch('/employees/:id/avatar', OldHrController.updateEmployeeAvatar);

// Operational Structure (to be moved)
router.get('/positions', OldHrController.getPositions);
router.get('/departments', OldHrController.getDepartments);
router.get('/divisions', OldHrController.getDivisions);

router.post('/divisions', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.createDivision);
router.put('/divisions/reorder', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.updateDivisionOrder);
router.put('/divisions/:id/data-flow', checkPermission([...DIVISION_DATA_FLOW_WRITE_PERMISSIONS]), OldHrController.updateDivisionDataFlow);
router.put('/divisions/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.updateDivision);
router.delete('/divisions/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.deleteDivision);

router.post('/departments', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.createDepartment);
router.put('/departments/:departmentId/staff-assignment', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.assignEmployeeToDepartmentUnit);
router.delete('/departments/:departmentId/staff-assignment/:employeeId', checkPermission([...OPS_LEAF_STAFF_REMOVE_PERMISSIONS]), OldHrController.removeEmployeeFromDepartmentUnit);
router.put('/departments/:id', checkPermission([...DIVISION_DATA_FLOW_WRITE_PERMISSIONS]), OldHrController.updateDepartment);
router.delete('/departments/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.deleteDepartment);

router.post('/positions', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.createPosition);
router.put('/positions/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.updatePosition);
router.delete('/positions/:id', checkPermission([...ORG_STRUCTURE_WRITE_PERMISSIONS]), OldHrController.deletePosition);

// Import/Export
router.get('/employees/import-template', checkPermission(['MANAGE_HR', 'CREATE_HR']), OldHrController.getEmployeeImportTemplate);
router.post('/employees/import', checkPermission(['MANAGE_HR', 'CREATE_HR']), excelUploadMiddleware.single('file'), OldHrController.importEmployees);

export default router;
