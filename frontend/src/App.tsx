import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuthStore } from './context/useAuthStore';
import MainLayout from './layouts/MainLayout';
import PermissionRoute from './components/PermissionRoute';
import ToastNotification from './components/ToastNotification';
import { useNotificationStore } from './context/useNotificationStore';

const Login = React.lazy(() => import('./pages/Login'));
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const KagriAI = React.lazy(() => import('./pages/KagriAI'));
const CustomerManager = React.lazy(() => import('./pages/CustomerManager'));
const CustomerDetail = React.lazy(() => import('./pages/CustomerDetail'));
const PointManager = React.lazy(() => import('./pages/PointManager'));
const NotificationManager = React.lazy(() => import('./pages/NotificationManager'));
const HRManager = React.lazy(() => import('./pages/HRManager'));
const EmployeeCreate = React.lazy(() => import('./pages/EmployeeCreate'));
const EmployeeEdit = React.lazy(() => import('./pages/EmployeeEdit'));
const EmployeeDetail = React.lazy(() => import('./pages/EmployeeDetail'));
const SystemLogs = React.lazy(() => import('./pages/SystemLogs'));
const Documents = React.lazy(() => import('./pages/Documents'));
const Reports = React.lazy(() => import('./pages/Reports'));
const Marketing = React.lazy(() => import('./pages/Marketing'));
const Orders = React.lazy(() => import('./pages/Orders'));
const Support = React.lazy(() => import('./pages/Support'));
const AccountingManager = React.lazy(() => import('./pages/AccountingManager'));
// SettingsManager removed — consolidated into Operations and SystemAdmin
const Chat = React.lazy(() => import('./pages/Chat'));
const Products = React.lazy(() => import('./pages/Products'));
const Inventory = React.lazy(() => import('./pages/Inventory/Inventory'));
const WarrantyManager = React.lazy(() => import('./pages/WarrantyManager'));
const DataPool = React.lazy(() => import('./pages/DataPool'));
const Sales = React.lazy(() => import('./pages/Sales'));
const Resales = React.lazy(() => import('./pages/Resales'));
const Notifications = React.lazy(() => import('./pages/Notifications'));
const Accounting = React.lazy(() => import('./pages/Accounting'));
const AccountingPayroll = React.lazy(() => import('./pages/AccountingPayroll'));
const AccountingInvoices = React.lazy(() => import('./pages/AccountingInvoices'));
const LeaveRequests = React.lazy(() => import('./pages/LeaveRequests'));
const HrCatalogSettings = React.lazy(() => import('./pages/HrCatalogSettings'));
const Operations = React.lazy(() => import('./pages/Operations'));
const SystemAdmin = React.lazy(() => import('./pages/SystemAdmin'));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuthStore();
  
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-secondary font-medium animate-pulse">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function AppContent() {
  const navigate = useNavigate();
  const { toasts, removeToast } = useNotificationStore();

  const handleToastNavigate = (link: string) => {
    navigate(link);
  };

  const pageFallback = (
    <div className="animate-pulse p-4 md:p-8 space-y-4">
      <div className="h-8 bg-gray-200 rounded w-1/3 max-w-xs" />
      <div className="h-4 bg-gray-100 rounded w-full max-w-2xl" />
      <div className="h-4 bg-gray-100 rounded w-5/6 max-w-xl" />
      <div className="h-4 bg-gray-100 rounded w-4/5 max-w-lg" />
      <div className="flex items-center justify-center h-32">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin opacity-70" />
      </div>
    </div>
  );

  return (
    <>
      <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }>
            <Route index element={<Dashboard />} />
            <Route path="reports" element={<PermissionRoute modulePath="/reports"><Reports /></PermissionRoute>} />
            <Route path="marketing" element={<PermissionRoute modulePath="/marketing"><Marketing /></PermissionRoute>} />
            <Route path="ai" element={<PermissionRoute modulePath="/ai"><KagriAI /></PermissionRoute>} />
            <Route path="documents" element={<PermissionRoute modulePath="/documents"><Documents /></PermissionRoute>} />
            {/* Legacy routes - redirect to new modules */}
            <Route path="customers" element={<Navigate to="/data-pool" replace />} />
            <Route path="customers/:id" element={<Navigate to="/sales" replace />} />
            <Route path="data-pool" element={<PermissionRoute modulePath="/data-pool"><DataPool /></PermissionRoute>} />
            <Route path="sales" element={<PermissionRoute modulePath="/sales"><Sales /></PermissionRoute>} />
            <Route path="resales" element={<PermissionRoute modulePath="/resales"><Resales /></PermissionRoute>} />
            <Route path="orders" element={<PermissionRoute modulePath="/orders"><Orders /></PermissionRoute>} />
            <Route path="points" element={<PermissionRoute modulePath="/points"><PointManager /></PermissionRoute>} />
            <Route path="products" element={<PermissionRoute modulePath="/products"><Products /></PermissionRoute>} />
            <Route path="inventory" element={<PermissionRoute modulePath="/inventory"><Inventory /></PermissionRoute>} />
            <Route path="warranty" element={<PermissionRoute modulePath="/warranty"><WarrantyManager /></PermissionRoute>} />
            <Route path="accounting" element={<PermissionRoute modulePath="/accounting"><Outlet /></PermissionRoute>}>
              <Route index element={<Accounting />} />
              <Route path="payroll" element={<AccountingPayroll />} />
              <Route path="invoices" element={<AccountingInvoices />} />
              <Route path="reports" element={<Accounting />} />
            </Route>
            <Route path="notification-manager" element={<PermissionRoute modulePath="/notifications"><NotificationManager /></PermissionRoute>} />
            <Route path="notifications" element={<Notifications />} />
            
            <Route path="hr" element={<PermissionRoute modulePath="/hr"><Outlet /></PermissionRoute>}>
              <Route index element={<HRManager />} />
              <Route path="create" element={<EmployeeCreate />} />
              <Route
                path="catalogs"
                element={
                  <PermissionRoute
                    requiredPermissions={[
                      'MANAGE_HR',
                      'FULL_ACCESS',
                      'VIEW_HR',
                      'VIEW_EMPLOYEE_TYPE_CATALOG',
                      'MANAGE_EMPLOYEE_TYPE_CATALOG',
                    ]}
                  >
                    <HrCatalogSettings />
                  </PermissionRoute>
                }
              />
              <Route path="leave-requests" element={<LeaveRequests />} />
              <Route path=":id/edit" element={<EmployeeEdit />} />
              <Route path=":id/view" element={<EmployeeDetail />} />
            </Route>
            
            <Route path="operations" element={<PermissionRoute modulePath="/operations" requiredPermissions={['CONFIG_OPERATIONS']}><Operations /></PermissionRoute>} />
            <Route path="system" element={<PermissionRoute modulePath="/system"><Outlet /></PermissionRoute>}>
              <Route index element={<SystemAdmin />} />
              <Route path="logs" element={<SystemLogs />} />
            </Route>
            <Route path="logs" element={<Navigate to="/system/logs" replace />} />
            <Route path="settings" element={<Navigate to="/operations" replace />} />
            <Route path="support" element={<PermissionRoute modulePath="/support"><Support /></PermissionRoute>} />
            <Route path="chat" element={<Chat />} />
            {/* Tránh vùng nội dung trắng khi URL không khớp route con (ví dụ /foo) */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          {/* URL không khớp /login hoặc layout / (ví dụ /login/x) → về app */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      {/* Global Toast Notifications */}
      <ToastNotification 
        toasts={toasts} 
        onRemove={removeToast}
        onNavigate={handleToastNavigate}
      />
      {/* react-hot-toast (Products, Inventory, Accounting, …) — bắt buộc có Toaster mới hiện toast */}
      <Toaster position="top-center" containerStyle={{ zIndex: 99999 }} />
    </>
  );
}

function App() {
  const { checkAuth } = useAuthStore();

  React.useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
