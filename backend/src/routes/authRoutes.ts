import { Router } from 'express';
import {
  login,
  logout,
  getMe,
  validatePhone,
  setTempPassword,
  issueStaffCheckToken,
  consumeStaffCheckToken,
  changePassword,
  logoutEmployee,
  lockEmployee,
} from '../controllers/authController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';
import {
  AUTH_ADMIN_SET_TEMP_PASSWORD_PERMISSIONS,
  AUTH_ADMIN_STAFF_CHECK_TOKEN_PERMISSIONS,
  AUTH_ADMIN_LOGOUT_PERMISSIONS,
  AUTH_ADMIN_LOCK_PERMISSIONS,
} from '../config/routePermissionPolicy';

const router = Router();

router.post('/validate-phone', validatePhone);
router.post('/login', login);
router.post('/logout', logout);
router.get('/me', authMiddleware, getMe);
router.get('/health', authMiddleware, (req, res) => {
  res.json({ status: 'ok', message: 'Backend is running correctly' });
});
router.post(
  '/auth/admin/set-temp-password',
  authMiddleware,
  checkPermission([...AUTH_ADMIN_SET_TEMP_PASSWORD_PERMISSIONS]),
  setTempPassword
);
router.post(
  '/auth/admin/issue-staff-check-token',
  authMiddleware,
  checkPermission([...AUTH_ADMIN_STAFF_CHECK_TOKEN_PERMISSIONS]),
  issueStaffCheckToken
);
router.post('/auth/consume-staff-check-token', consumeStaffCheckToken);
router.post(
  '/auth/admin/logout-employee', 
  authMiddleware, 
  checkPermission([...AUTH_ADMIN_LOGOUT_PERMISSIONS]), 
  logoutEmployee
);
router.post(
  '/auth/admin/lock-employee', 
  authMiddleware, 
  checkPermission([...AUTH_ADMIN_LOCK_PERMISSIONS]), 
  lockEmployee
);
router.post('/auth/change-password', authMiddleware, changePassword);

export default router;
