
import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Filter,
  Plus,
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  Settings
} from 'lucide-react';
import { apiClient } from '../../api/client';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';
import { formatDate } from '../../utils/format';

import ImportModal from './ImportModal';
import ExportModal from './ExportModal';
import WarehouseManagerModal from './WarehouseManagerModal';
import PaginationBar from '../../components/PaginationBar';
import { normalizePageSize } from '../../constants/pagination';
import { ToolbarButton } from '../../components/ui/ToolbarButton';
import { resolveUploadUrl } from '../../utils/assetsUrl';

const Inventory = () => {
  const [stocks, setStocks] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isWarehouseManagerOpen, setIsWarehouseManagerOpen] = useState(false);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchStocks();
  }, [selectedWarehouse, searchTerm, page, limit]);

  const fetchWarehouses = async () => {
    try {
      const res: any = await apiClient.get('/inventory/warehouses');
      if (Array.isArray(res)) {
        setWarehouses(res);
      }
    } catch (error) {
      console.error('Failed to fetch warehouses', error);
    }
  };

  const fetchStocks = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(normalizePageSize(limit)));
      if (selectedWarehouse) params.set('warehouseId', selectedWarehouse);
      if (searchTerm) params.set('search', searchTerm);
      
      const res: any = await apiClient.get(`/inventory/stocks?${params.toString()}`);
      if (res && res.data) {
        setStocks(res.data);
        if (res.pagination) {
          setTotal(res.pagination.total);
          setTotalPages(res.pagination.totalPages || 1);
        }
      }
    } catch (error) {
      toast.error('Lỗi tải dữ liệu tồn kho');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleRow = (id: string) => {
    const newSet = new Set(expandedRows);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedRows(newSet);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Tồn kho</h1>
          <p className="text-sm text-gray-500 mt-1">Theo dõi tồn kho, lô hàng và serial</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <ToolbarButton variant="secondary" onClick={() => setIsWarehouseManagerOpen(true)}>
            <Settings size={18} />
            <span>Quản lý kho</span>
          </ToolbarButton>
          <ToolbarButton variant="secondary" onClick={() => setIsImportModalOpen(true)}>
            <ArrowDownToLine size={18} />
            <span>Nhập kho</span>
          </ToolbarButton>
          <ToolbarButton variant="secondary" onClick={() => setIsExportModalOpen(true)}>
            <ArrowUpFromLine size={18} />
            <span>Xuất kho</span>
          </ToolbarButton>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Tìm kiếm sản phẩm..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        
        <div className="w-full md:w-64">
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select
              value={selectedWarehouse}
              onChange={(e) => { setSelectedWarehouse(e.target.value); setPage(1); }}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none bg-white"
            >
              <option value="">Tất cả kho</option>
              {warehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
          </div>
        </div>
      </div>

      {/* Stats Cards (Mock) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tổng giá trị tồn</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">--</p>
            </div>
            <div className="p-3 bg-green-50 text-green-600 rounded-lg">
              <Package size={24} />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Sản phẩm sắp hết</p>
              <p className="text-2xl font-bold text-orange-600 mt-1">--</p>
            </div>
            <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
              <AlertTriangle size={24} />
            </div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Lô sắp hết hạn</p>
              <p className="text-2xl font-bold text-red-600 mt-1">--</p>
            </div>
            <div className="p-3 bg-red-50 text-red-600 rounded-lg">
              <History size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Stock List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 text-sm">
              <tr>
                <th className="px-6 py-4 font-medium w-10"></th>
                <th className="px-6 py-4 font-medium">Sản phẩm</th>
                <th className="px-6 py-4 font-medium">Kho</th>
                <th className="px-6 py-4 font-medium">Loại quản lý</th>
                <th className="px-6 py-4 font-medium text-right">Số lượng tồn</th>
                <th className="px-6 py-4 font-medium">Đơn vị</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Đang tải dữ liệu...</td>
                </tr>
              ) : stocks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">Chưa có dữ liệu tồn kho</td>
                </tr>
              ) : (
                stocks.map((stock) => (
                  <React.Fragment key={stock.id}>
                    <tr 
                      className={clsx("hover:bg-gray-50 transition-colors cursor-pointer", expandedRows.has(stock.id) && "bg-gray-50")}
                      onClick={() => toggleRow(stock.id)}
                    >
                      <td className="px-6 py-4 text-gray-400">
                        {expandedRows.has(stock.id) ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200">
                            {stock.product.thumbnail ? (
                              <img src={resolveUploadUrl(stock.product.thumbnail)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="text-gray-400" size={20} />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{stock.product.name}</p>
                            <p className="text-xs text-gray-500">{stock.product.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{stock.warehouse.name}</td>
                      <td className="px-6 py-4">
                        <span className={clsx(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          stock.product.category?.code === 'BIO' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                        )}>
                          {stock.product.category?.code === 'BIO' ? 'Theo Lô/HSD' : 'Theo Serial'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900">
                        {stock.quantity}
                      </td>
                      <td className="px-6 py-4 text-gray-500">{stock.product.unit}</td>
                    </tr>
                    
                    {/* Expanded Detail Row */}
                    {expandedRows.has(stock.id) && (
                      <tr className="bg-gray-50">
                        <td colSpan={6} className="px-6 py-4 pl-16">
                          <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Chi tiết tồn kho</h4>
                            
                            {stock.product.category?.code === 'BIO' ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-gray-500 border-b border-gray-100">
                                      <th className="pb-2 text-left">Mã Lô</th>
                                      <th className="pb-2 text-left">Ngày SX</th>
                                      <th className="pb-2 text-left">Hạn SD</th>
                                      <th className="pb-2 text-right">Số lượng</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-50">
                                    {stock.batch ? (
                                      <tr>
                                        <td className="py-2 font-medium">{stock.batch.code}</td>
                                        <td className="py-2 text-gray-600">
                                          {stock.batch.mfgDate ? formatDate(stock.batch.mfgDate) : '-'}
                                        </td>
                                        <td className="py-2 text-gray-600">
                                          {stock.batch.expDate ? formatDate(stock.batch.expDate) : '-'}
                                        </td>
                                        <td className="py-2 text-right font-medium">{stock.quantity}</td>
                                      </tr>
                                    ) : (
                                      <tr><td colSpan={4} className="py-2 text-center text-gray-500">Không có thông tin lô</td></tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm text-gray-500 mb-2">Danh sách Serial:</p>
                                <div className="flex flex-wrap gap-2">
                                  {/* TODO: Fetch serials for this stock/warehouse/product */}
                                  <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs border border-gray-200">
                                    Tính năng đang phát triển...
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {(totalPages > 1 || total > 0) && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <PaginationBar
              page={page}
              limit={normalizePageSize(limit)}
              total={total}
              totalPages={totalPages}
              onPageChange={(p) => { setPage(p); }}
              onLimitChange={(l) => { setLimit(normalizePageSize(l)); setPage(1); }}
              itemLabel="tồn kho"
            />
          </div>
        )}
      </div>
      {/* Import Modal */}
      <ImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          fetchStocks();
          setIsImportModalOpen(false);
        }}
        warehouses={warehouses}
      />
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onSuccess={() => {
          fetchStocks();
          setIsExportModalOpen(false);
        }}
        warehouses={warehouses}
      />
      <WarehouseManagerModal
        isOpen={isWarehouseManagerOpen}
        onClose={() => setIsWarehouseManagerOpen(false)}
        onSuccess={fetchWarehouses}
      />
    </div>
  );
};

export default Inventory;
