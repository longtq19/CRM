import { useState, useEffect } from 'react';
import { useDataStore } from '../context/useDataStore';
import { useAuthStore } from '../context/useAuthStore';
import { 
  Search, 
  Filter, 
  Clock, 
  Activity, 
  CheckCircle, 
  XCircle,
  Download,
  Eye
} from 'lucide-react';
import clsx from 'clsx';
import PaginationBar from '../components/PaginationBar';
import { formatDateTime, formatDateTimeSeconds } from '../utils/format';
import { normalizePageSize } from '../constants/pagination';

const SystemLogs = () => {
  const { user, hasPermission } = useAuthStore();
  const canView =
    hasPermission('VIEW_LOGS') || hasPermission('MANAGE_SYSTEM') || hasPermission('FULL_ACCESS');

  const { systemLogs, fetchSystemLogs, logPagination, logUniqueUsers, logUniqueObjects, logUniqueActions } = useDataStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('All');
  const [filterObject, setFilterObject] = useState('All');
  const [filterResult, setFilterResult] = useState('All');
  const [filterUser, setFilterUser] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 500);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    if (canView) {
      const params = {
        page: currentPage,
        limit: normalizePageSize(itemsPerPage),
        search: debouncedSearch,
        action: filterAction,
        object: filterObject,
        result: filterResult,
        userName: filterUser,
        startDate,
        endDate
      };
      fetchSystemLogs(params);
      const interval = setInterval(() => fetchSystemLogs(params), 30000); 
      return () => clearInterval(interval);
    }
  }, [fetchSystemLogs, canView, currentPage, itemsPerPage, debouncedSearch, filterAction, filterObject, filterResult, filterUser, startDate, endDate]);

  if (!canView) {
      return (
        <div className="flex items-center justify-center h-[calc(100vh-100px)]">
            <div className="text-center bg-white p-8 rounded-xl shadow-sm border border-gray-100 max-w-md">
                <XCircle size={48} className="text-red-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Truy cập bị từ chối</h2>
                <p className="text-gray-500">Tài khoản của bạn ({user?.role}) không có quyền xem nhật ký hệ thống.</p>
            </div>
        </div>
      );
  }

  // Use server-side data directly
  const filteredLogs = systemLogs; 
  const paginatedLogs = systemLogs;
  const totalPages = logPagination.totalPages;

  const uniqueActions = logUniqueActions || [];
  const uniqueObjects = logUniqueObjects || [];
  const uniqueUsers = logUniqueUsers || [];

  const normalizeResultText = (result: string) => {
    if (result === 'SUCCESS') return 'Thành công';
    if (result === 'FAILURE') return 'Thất bại';
    if (result === 'PARTIAL_SUCCESS') return 'Thành công một phần';
    return result;
  };

  const getVietnameseActionDescription = (log: any) => {
    const actor = log.userName || 'Người dùng';
    const action = String(log.action || '').toLowerCase();
    const objectName = log.object || 'đối tượng';
    if (action.includes('tạo') || action === 'create') {
      return `${actor} đã tạo mới ${objectName.toLowerCase()}.`;
    }
    if (action.includes('cập nhật') || action === 'update' || action.includes('patch')) {
      return `${actor} đã cập nhật ${objectName.toLowerCase()}.`;
    }
    if (action.includes('xóa') || action === 'delete') {
      return `${actor} đã xóa ${objectName.toLowerCase()}.`;
    }
    if (action.includes('đăng nhập') || action === 'login') {
      return `${actor} đã đăng nhập vào hệ thống.`;
    }
    if (action.includes('đăng xuất') || action === 'logout') {
      return `${actor} đã đăng xuất khỏi hệ thống.`;
    }
    return `${actor} đã thực hiện hành động ${log.action} trên ${objectName}.`;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Nhật ký hệ thống quản trị</h2>
          <p className="text-gray-500 text-sm">Tổng số: {logPagination.total} bản ghi</p>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input 
              type="text" 
              placeholder="Tìm theo người dùng, hành động, đối tượng..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <Filter size={20} className="text-gray-400" />
            
            {/* Filter User */}
            <select 
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="All">Tất cả người dùng</option>
              {uniqueUsers.map(user => (
                <option key={user} value={user}>{user}</option>
              ))}
            </select>

            {/* Date Range */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2">
              <input 
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="py-2 focus:outline-none text-sm text-gray-600"
                title="Từ ngày"
              />
              <span className="text-gray-400">-</span>
              <input 
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="py-2 focus:outline-none text-sm text-gray-600"
                title="Đến ngày"
              />
            </div>

            <select 
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="All">Tất cả hành động</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>

            {/* Filter Object */}
            <select 
              value={filterObject}
              onChange={(e) => setFilterObject(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="All">Tất cả đối tượng</option>
              {uniqueObjects.map(obj => (
                <option key={obj} value={obj}>{obj}</option>
              ))}
            </select>

            <select 
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="All">Tất cả kết quả</option>
              <option value="Thành công">Thành công</option>
              <option value="Thất bại">Thất bại</option>
              <option value="Thành công một phần">Thành công một phần</option>
            </select>
          </div>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-600 text-sm uppercase font-semibold">
              <tr>
                <th className="px-4 py-3 rounded-tl-lg">Thời gian</th>
                <th className="px-4 py-3">Người thực hiện</th>
                <th className="px-4 py-3">Hành động</th>
                <th className="px-4 py-3">Đối tượng</th>
                <th className="px-4 py-3">Chi tiết</th>
                <th className="px-4 py-3">Xem</th>
                <th className="px-4 py-3 rounded-tr-lg">Kết quả</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-600 text-sm whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-gray-400" />
                      {formatDateTimeSeconds(log.timestamp)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 font-medium">
                        {log.userName.charAt(0)}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{log.userName}</span>
                        {log.userPhone && <span className="text-xs text-gray-500">{log.userPhone}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      <Activity size={12} />
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {log.object}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-sm max-w-xs truncate" title={log.details || log.action}>
                    {log.details || log.action}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelectedLog(log)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      <Eye size={12} />
                      Xem chi tiết
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      "flex items-center gap-1.5 text-sm",
                      (log.result === 'Thành công' || log.result === 'SUCCESS')
                        ? "text-success"
                        : (log.result === 'Thành công một phần' || log.result === 'PARTIAL_SUCCESS')
                          ? "text-amber-600"
                          : "text-red-600"
                    )}>
                      {(log.result === 'Thành công' || log.result === 'SUCCESS')
                        ? <CheckCircle size={16} />
                        : <XCircle size={16} />}
                      {log.result === 'SUCCESS'
                        ? 'Thành công'
                        : log.result === 'FAILURE'
                          ? 'Thất bại'
                          : log.result === 'PARTIAL_SUCCESS'
                            ? 'Thành công một phần'
                            : log.result}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden flex flex-col divide-y divide-gray-100">
            {paginatedLogs.map((log) => (
                <div key={log.id} className="py-4 space-y-3">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-600 font-medium">
                        {log.userName.charAt(0)}
                        </div>
                        <div>
                        <div className="font-medium text-gray-900 text-sm">{log.userName}</div>
                        <div className="text-xs text-gray-500">{formatDateTime(log.timestamp)}</div>
                        </div>
                    </div>
                    <span className={clsx(
                        "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                        (log.result === 'Thành công' || log.result === 'SUCCESS')
                          ? "bg-green-50 text-success"
                          : (log.result === 'Thành công một phần' || log.result === 'PARTIAL_SUCCESS')
                            ? "bg-amber-50 text-amber-600"
                            : "bg-red-50 text-red-600"
                    )}>
                        {(log.result === 'Thành công' || log.result === 'SUCCESS') ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {log.result === 'SUCCESS'
                          ? 'Thành công'
                          : log.result === 'FAILURE'
                            ? 'Thất bại'
                            : log.result === 'PARTIAL_SUCCESS'
                              ? 'Thành công một phần'
                              : log.result}
                    </span>
                </div>
                
                <div className="pl-11">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                        {log.action}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{log.object}</span>
                    </div>
                    <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded break-words">
                        {log.details || log.action}
                    </div>
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary"
                      >
                        <Eye size={12} />
                        Xem chi tiết
                      </button>
                    </div>
                </div>
                </div>
            ))}
        </div>

        {/* Pagination Controls */}
        <div className="border-t border-gray-100 pt-4">
          <PaginationBar
            page={currentPage}
            limit={normalizePageSize(itemsPerPage)}
            total={logPagination.total}
            totalPages={totalPages || 1}
            onPageChange={setCurrentPage}
            onLimitChange={(l) => { setItemsPerPage(normalizePageSize(l)); setCurrentPage(1); }}
            itemLabel="bản ghi"
          />
        </div>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-gray-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Chi tiết hành động</h3>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <XCircle size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="p-3 rounded-lg bg-blue-50 text-blue-800 text-sm">
                {getVietnameseActionDescription(selectedLog)}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div><span className="font-medium text-gray-700">Người thực hiện:</span> {selectedLog.userName}</div>
                <div><span className="font-medium text-gray-700">Số điện thoại:</span> {selectedLog.userPhone || '—'}</div>
                <div><span className="font-medium text-gray-700">Thời gian:</span> {formatDateTimeSeconds(selectedLog.timestamp)}</div>
                <div><span className="font-medium text-gray-700">Kết quả:</span> {normalizeResultText(selectedLog.result)}</div>
                <div><span className="font-medium text-gray-700">Hành động:</span> {selectedLog.action}</div>
                <div><span className="font-medium text-gray-700">Đối tượng:</span> {selectedLog.object}</div>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-700 mb-1">Nội dung chi tiết</div>
                <div className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-words">
                  {selectedLog.details || 'Không có mô tả chi tiết.'}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemLogs;