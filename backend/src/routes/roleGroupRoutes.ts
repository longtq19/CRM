import express from 'express';
import { getRoleGroups, getMenus, getPermissions, updateRoleGroup, createRoleGroup, deleteRoleGroup, getViewScopes, updateViewScopes } from '../controllers/roleGroupController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import { ROLE_GROUP_API_READ_PERMISSIONS, ROLE_GROUP_API_WRITE_PERMISSIONS } from '../config/routePermissionPolicy';

const router = express.Router();

router.use(authMiddleware); // Apply authentication to all routes

router.get('/', checkPermission([...ROLE_GROUP_API_READ_PERMISSIONS]), getRoleGroups);
router.post('/', checkPermission([...ROLE_GROUP_API_WRITE_PERMISSIONS]), createRoleGroup);
router.get('/menus', checkPermission([...ROLE_GROUP_API_READ_PERMISSIONS]), getMenus);
router.get('/permissions', checkPermission([...ROLE_GROUP_API_READ_PERMISSIONS]), getPermissions);
router.get('/view-scopes', checkPermission([...ROLE_GROUP_API_READ_PERMISSIONS]), getViewScopes);
router.put('/view-scopes', checkPermission([...ROLE_GROUP_API_WRITE_PERMISSIONS]), updateViewScopes);
router.put('/:id', checkPermission([...ROLE_GROUP_API_WRITE_PERMISSIONS]), updateRoleGroup);
router.delete('/:id', checkPermission([...ROLE_GROUP_API_WRITE_PERMISSIONS]), deleteRoleGroup);

export default router;
