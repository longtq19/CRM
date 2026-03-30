import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../context/useAuthStore';
import { AlertCircle } from 'lucide-react';
import { isTechnicalAdminRole } from '../constants/rbac';
import {
  SYSTEM_MODULE_PATH_ACCESS_PERMISSIONS,
  DATA_POOL_MODULE_PATH_ACCESS_PERMISSIONS,
  SALES_MODULE_PATH_ACCESS_PERMISSIONS,
} from '../constants/routePermissionPolicy';

interface PermissionRouteProps {
  modulePath?: string; // Check if this path exists in user.menus
  requiredPermissions?: string[]; // Check if user has ANY of these permissions
  children?: React.ReactNode;
}

const PermissionRoute = ({ modulePath, requiredPermissions, children }: PermissionRouteProps) => {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Chỉ technical admin (hoặc FULL_ACCESS) bỏ qua kiểm tra menu/permission — CRM admin tuân theo RBAC đã gán.
  const isTechnicalSuperUser =
    isTechnicalAdminRole(user.roleGroup?.code) || user.permissions?.includes('FULL_ACCESS');
  if (isTechnicalSuperUser) {
      return <>{children || <Outlet />}</>;
  }

  // 1. Check Module Access (via Menus)
  if (modulePath) {
    const hasMenuAccess = user.menus?.some(m => {
        // Exact match or sub-path match if menu is a root path
        // e.g. menu path '/hr' allows '/hr/create'
        return m.path === modulePath || location.pathname.startsWith(m.path);
    });
    
    // We also check if we are strictly checking for the prop `modulePath` existence in menus
    // Because location.pathname might be deep.
    const hasModuleAccess = user.menus?.some(m => m.path === modulePath);

    const permCodes = (user.permissions || []).map((p: string | { code?: string }) =>
      typeof p === 'string' ? p : p.code || ''
    );
    const hasSystemAccessByPermission =
      modulePath === '/system' &&
      permCodes.some((p) =>
        SYSTEM_MODULE_PATH_ACCESS_PERMISSIONS.includes(p as (typeof SYSTEM_MODULE_PATH_ACCESS_PERMISSIONS)[number])
      );

    const hasDataPoolAccessByPermission =
      modulePath === '/data-pool' &&
      permCodes.some((p) =>
        DATA_POOL_MODULE_PATH_ACCESS_PERMISSIONS.includes(p as (typeof DATA_POOL_MODULE_PATH_ACCESS_PERMISSIONS)[number])
      );

    const hasSalesAccessByPermission =
      modulePath === '/sales' &&
      SALES_MODULE_PATH_ACCESS_PERMISSIONS.every((code) => permCodes.includes(code));

    if (!hasModuleAccess && !hasSystemAccessByPermission && !hasDataPoolAccessByPermission && !hasSalesAccessByPermission) {
      // Render Unauthorized View
      return (
        <div className="flex flex-col items-center justify-center h-[calc(100vh-4rem)] text-center p-6">
          <div className="bg-red-50 p-4 rounded-full mb-4">
            <AlertCircle size={48} className="text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Truy cập bị từ chối</h2>
          <p className="text-gray-600 mb-6 max-w-md">
            Bạn không có quyền truy cập vào module này. Vui lòng liên hệ quản trị viên nếu bạn cho rằng đây là một sự nhầm lẫn.
          </p>
          <button 
            onClick={() => window.history.back()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg transition-colors"
          >
            Quay lại
          </button>
        </div>
      );
    }
  }

  // 2. Check Specific Permissions
  if (requiredPermissions && requiredPermissions.length > 0) {
      const hasPermission = user.permissions?.some(p => requiredPermissions.includes(p));
      if (!hasPermission) {
          return <Navigate to="/" replace />;
      }
  }

  return <>{children || <Outlet />}</>;
};

export default PermissionRoute;
