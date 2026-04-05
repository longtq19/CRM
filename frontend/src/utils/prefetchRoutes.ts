/**
 * Prefetch route chunks khi user hover vào link (sidebar).
 * Giúp lần chuyển trang đầu tiên nhanh hơn vì chunk đã được tải trước.
 */
type PreloadFn = () => Promise<unknown>;

const routeChunks: Record<string, PreloadFn> = {
  '/': () => import('../pages/Dashboard'),
  '/reports': () => import('../pages/Reports'),
  '/marketing': () => import('../pages/Marketing'),
  '/ai': () => import('../pages/ZenoAI'),
  '/documents': () => import('../pages/Documents'),
  '/data-pool': () => import('../pages/DataPool'),
  '/sales': () => import('../pages/Sales'),
  '/resales': () => import('../pages/Resales'),
  '/orders': () => import('../pages/Orders'),
  '/points': () => import('../pages/PointManager'),
  '/products': () => import('../pages/Products'),
  '/inventory': () => import('../pages/Inventory/Inventory'),
  '/warranty': () => import('../pages/WarrantyManager'),
  '/accounting': () => import('../pages/Accounting'),
  '/accounting/payroll': () => import('../pages/AccountingPayroll'),
  '/accounting/invoices': () => import('../pages/AccountingInvoices'),
  '/notification-manager': () => import('../pages/NotificationManager'),
  '/notifications': () => import('../pages/Notifications'),
  '/hr': () => import('../pages/HRManager'),
  '/hr/create': () => import('../pages/EmployeeCreate'),
  '/hr/leave-requests': () => import('../pages/LeaveRequests'),
  '/logs': () => import('../pages/SystemLogs'),
  '/operations': () => import('../pages/Operations'),
  '/support': () => import('../pages/Support'),
  '/chat': () => import('../pages/Chat'),
};

const prefetched = new Set<string>();

export function prefetchRoute(pathname: string): void {
  const path = pathname.replace(/\/$/, '') || '/';
  if (prefetched.has(path)) return;
  const fn = routeChunks[path] ?? routeChunks[path.split('/').slice(0, 2).join('/')];
  if (fn) {
    prefetched.add(path);
    fn().catch(() => { prefetched.delete(path); });
  }
}
