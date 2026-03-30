
import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Search, 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  Filter,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  FileText,
  Wrench,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { apiClient } from '../api/client';
import PaginationBar from '../components/PaginationBar';
import { normalizePageSize } from '../constants/pagination';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';
import { formatDate } from '../utils/format';

const WarrantyManager = () => {
  const [activeTab, setActiveTab] = useState<'CLAIMS' | 'SERIALS'>('CLAIMS');
  const [data, setData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1
  });

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));
      if (searchTerm.trim()) params.set('search', searchTerm.trim());

      const endpoint = activeTab === 'CLAIMS' ? '/warranty/claims' : '/warranty/serials';
      const res: any = await apiClient.get(`${endpoint}?${params.toString()}`);

      if (res && res.data) {
        setData(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      } else {
        setData([]);
      }
    } catch (error) {
      console.error('Fetch error:', error);
      toast.error('Không thể tải dữ liệu');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [pagination.page, pagination.limit, activeTab, searchTerm]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium flex items-center gap-1"><Clock size={12} /> Chờ xử lý</span>;
      case 'PROCESSING':
        return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex items-center gap-1"><Wrench size={12} /> Đang xử lý</span>;
      case 'COMPLETED':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center gap-1"><CheckCircle size={12} /> Hoàn thành</span>;
      case 'REJECTED':
        return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center gap-1"><XCircle size={12} /> Từ chối</span>;
      default:
        return <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="text-primary" /> Quản lý Bảo hành
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Quản lý yêu cầu bảo hành và danh sách thiết bị
          </p>
        </div>
        <div className="flex gap-2">
           <button 
            onClick={() => {}} // TODO: Open create modal
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus size={20} /> <span className="hidden sm:inline">Tạo yêu cầu</span>
          </button>
        </div>
      </div>

      {/* Tabs & Filter */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => { setActiveTab('CLAIMS'); setPagination(prev => ({ ...prev, page: 1 })); }}
            className={clsx(
              "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
              activeTab === 'CLAIMS' ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <FileText size={16} /> Yêu cầu bảo hành
          </button>
          <button
            onClick={() => { setActiveTab('SERIALS'); setPagination(prev => ({ ...prev, page: 1 })); }}
            className={clsx(
              "px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2",
              activeTab === 'SERIALS' ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-900"
            )}
          >
            <ShieldCheck size={16} /> Danh sách thiết bị
          </button>
        </div>

        <div className="relative w-full md:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder={activeTab === 'CLAIMS' ? "Tìm theo mã phiếu, serial..." : "Tìm theo serial..."}
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 text-sm">
              {activeTab === 'CLAIMS' ? (
                <tr>
                  <th className="px-6 py-4 font-medium">Mã phiếu</th>
                  <th className="px-6 py-4 font-medium">Thiết bị</th>
                  <th className="px-6 py-4 font-medium">Khách hàng</th>
                  <th className="px-6 py-4 font-medium">Kỹ thuật viên</th>
                  <th className="px-6 py-4 font-medium">Trạng thái</th>
                  <th className="px-6 py-4 font-medium">Ngày tạo</th>
                  <th className="px-6 py-4 font-medium text-right">Thao tác</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4 font-medium">Serial Number</th>
                  <th className="px-6 py-4 font-medium">Sản phẩm</th>
                  <th className="px-6 py-4 font-medium">Trạng thái</th>
                  <th className="px-6 py-4 font-medium">Bảo hành đến</th>
                  <th className="px-6 py-4 font-medium text-right">Thao tác</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                    Chưa có dữ liệu
                  </td>
                </tr>
              ) : (
                data.map((item: any) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    {activeTab === 'CLAIMS' ? (
                      <>
                        <td className="px-6 py-4 font-medium text-primary">{item.code}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="font-medium text-gray-900">{item.productSerial?.product?.name}</p>
                            <p className="text-xs text-gray-500">{item.productSerial?.serialNumber}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-gray-900">{item.customer?.name || '---'}</td>
                        <td className="px-6 py-4 text-gray-900">{item.technician?.fullName || 'Chưa phân công'}</td>
                        <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                        <td className="px-6 py-4 text-gray-500 text-sm">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                            <Eye size={18} />
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 font-medium text-gray-900">{item.serialNumber}</td>
                        <td className="px-6 py-4">
                          <div className="text-sm">
                            <p className="font-medium text-gray-900">{item.product?.name}</p>
                            <p className="text-xs text-gray-500">{item.product?.code}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={clsx(
                            "px-2 py-1 rounded-full text-xs font-medium",
                            item.status === 'ACTIVE' ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"
                          )}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 text-sm">
                          {item.warrantyEnd ? formatDate(item.warrantyEnd) : '---'}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors">
                            <Eye size={18} />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {(pagination.totalPages > 1 || pagination.total > 0) && (
        <div className="mt-6 border-t border-gray-200">
          <PaginationBar
            page={pagination.page}
            limit={normalizePageSize(pagination.limit)}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPageChange={(p) => setPagination(prev => ({ ...prev, page: p }))}
            onLimitChange={(limit) => setPagination(prev => ({ ...prev, limit: normalizePageSize(limit), page: 1 }))}
            itemLabel="kết quả"
          />
        </div>
      )}
    </div>
  );
};

export default WarrantyManager;
