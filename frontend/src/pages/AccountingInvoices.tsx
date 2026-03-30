import React, { useState, useEffect } from 'react';
import { 
  Receipt, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  X, 
  Save, 
  ChevronLeft,
  ChevronRight,
  FileText,
  Calendar,
  Filter,
  Download,
  Upload,
  ArrowLeft,
  Eye,
  Send,
  Building2,
  User,
  Package,
  AlertCircle
} from 'lucide-react';
import { apiClient } from '../api/client';
import PaginationBar from '../components/PaginationBar';
import { normalizePageSize } from '../constants/pagination';
import { toast } from 'react-hot-toast';
import { formatCurrency, formatDate } from '../utils/format';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../context/useAuthStore';

interface DraftInvoiceItem {
  id?: string;
  productId?: string;
  product?: { code: string; name: string; unit: string };
  productCode?: string;
  productName: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  amount: number;
  note?: string;
}

interface DraftInvoice {
  id: string;
  invoiceNumber?: string;
  customerId?: string;
  customer?: { id: string; name: string; phone: string };
  customerName: string;
  customerAddress?: string;
  customerTaxCode?: string;
  customerEmail?: string;
  customerPhone?: string;
  invoiceDate: string;
  dueDate?: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  status: string;
  orderCode?: string;
  externalInvoiceId?: string;
  exportedAt?: string;
  note?: string;
  creator?: { fullName: string };
  items: DraftInvoiceItem[];
  createdAt: string;
}

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string;
  listPriceNet: number;
}

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
}

const AccountingInvoices = () => {
  const [invoices, setInvoices] = useState<DraftInvoice[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<DraftInvoice | null>(null);
  const [viewingInvoice, setViewingInvoice] = useState<DraftInvoice | null>(null);
  const [exportData, setExportData] = useState<any>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Form state
  const [formData, setFormData] = useState({
    customerId: '',
    customerName: '',
    customerAddress: '',
    customerTaxCode: '',
    customerEmail: '',
    customerPhone: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    taxRate: 10,
    discount: 0,
    orderCode: '',
    note: '',
    items: [] as DraftInvoiceItem[]
  });

  const canManageAccounting = useAuthStore((s) => s.hasPermission('MANAGE_ACCOUNTING'));

  useEffect(() => {
    fetchInvoices();
    fetchProducts();
    fetchCustomers();
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [statusFilter, fromDate, toDate, page, limit]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: String(limit) });
      if (statusFilter) params.append('status', statusFilter);
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);

      const res = await apiClient.get(`/accounting/invoices?${params}`);
      setInvoices(res.data?.data || []);
      setTotalPages(res.data?.pagination?.totalPages || 1);
      setTotal(res.data?.pagination?.total || 0);
    } catch (error) {
      console.error('Error fetching invoices:', error);
      toast.error('Không thể tải danh sách hóa đơn');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await apiClient.get('/products?limit=1000');
      setProducts(res.data?.data || res.data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      setProducts([]);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await apiClient.get('/sales/customers?limit=1000');
      setCustomers(res.data?.data || res.data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      setCustomers([]);
    }
  };

  const handleCreateInvoice = () => {
    setEditingInvoice(null);
    setFormData({
      customerId: '',
      customerName: '',
      customerAddress: '',
      customerTaxCode: '',
      customerEmail: '',
      customerPhone: '',
      invoiceDate: new Date().toISOString().split('T')[0],
      dueDate: '',
      taxRate: 10,
      discount: 0,
      orderCode: '',
      note: '',
      items: []
    });
    setShowModal(true);
  };

  const handleEditInvoice = async (invoice: DraftInvoice) => {
    try {
      const res = await apiClient.get(`/accounting/invoices/${invoice.id}`);
      const fullInvoice = res.data;
      
      setEditingInvoice(fullInvoice);
      setFormData({
        customerId: fullInvoice.customerId || '',
        customerName: fullInvoice.customerName,
        customerAddress: fullInvoice.customerAddress || '',
        customerTaxCode: fullInvoice.customerTaxCode || '',
        customerEmail: fullInvoice.customerEmail || '',
        customerPhone: fullInvoice.customerPhone || '',
        invoiceDate: fullInvoice.invoiceDate.split('T')[0],
        dueDate: fullInvoice.dueDate ? fullInvoice.dueDate.split('T')[0] : '',
        taxRate: Number(fullInvoice.taxRate),
        discount: Number(fullInvoice.discount),
        orderCode: fullInvoice.orderCode || '',
        note: fullInvoice.note || '',
        items: fullInvoice.items.map((item: DraftInvoiceItem) => ({
          productId: item.productId,
          productCode: item.productCode || item.product?.code,
          productName: item.productName || item.product?.name,
          unit: item.unit || item.product?.unit,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          discount: Number(item.discount),
          amount: Number(item.amount),
          note: item.note
        }))
      });
      setShowModal(true);
    } catch (error) {
      toast.error('Không thể tải chi tiết hóa đơn');
    }
  };

  const handleSaveInvoice = async () => {
    if (!formData.customerName) {
      toast.error('Vui lòng nhập tên khách hàng');
      return;
    }
    if (formData.items.length === 0) {
      toast.error('Vui lòng thêm ít nhất 1 sản phẩm');
      return;
    }

    try {
      if (editingInvoice) {
        await apiClient.put(`/accounting/invoices/${editingInvoice.id}`, formData);
        toast.success('Đã cập nhật hóa đơn');
      } else {
        await apiClient.post('/accounting/invoices', formData);
        toast.success('Đã tạo hóa đơn nháp');
      }

      setShowModal(false);
      fetchInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleDeleteInvoice = async (id: string) => {
    if (!confirm('Xác nhận xóa hóa đơn này?')) return;
    
    try {
      await apiClient.delete(`/accounting/invoices/${id}`);
      toast.success('Đã xóa hóa đơn');
      fetchInvoices();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Không thể xóa');
    }
  };

  const handlePrepareExport = async (id: string) => {
    try {
      const res = await apiClient.post(`/accounting/invoices/${id}/prepare-export`);
      setExportData(res.data);
      toast.success('Đã chuẩn bị dữ liệu xuất hóa đơn');
    } catch (error) {
      toast.error('Không thể chuẩn bị dữ liệu');
    }
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setFormData({
        ...formData,
        customerId,
        customerName: customer.name,
        customerPhone: customer.phone || '',
        customerEmail: customer.email || '',
        customerAddress: customer.address || ''
      });
    }
  };

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, {
        productId: '',
        productCode: '',
        productName: '',
        unit: 'Cái',
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        amount: 0
      }]
    });
  };

  const handleRemoveItem = (index: number) => {
    const newItems = [...formData.items];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    (newItems[index] as any)[field] = value;

    // Auto-calculate amount
    if (['quantity', 'unitPrice', 'discount'].includes(field)) {
      const item = newItems[index];
      item.amount = item.quantity * item.unitPrice - item.discount;
    }

    // Auto-fill product info
    if (field === 'productId' && value) {
      const product = products.find(p => p.id === value);
      if (product) {
        newItems[index].productCode = product.code;
        newItems[index].productName = product.name;
        newItems[index].unit = product.unit;
        newItems[index].unitPrice = Number(product.listPriceNet);
        newItems[index].amount = newItems[index].quantity * newItems[index].unitPrice - newItems[index].discount;
      }
    }

    setFormData({ ...formData, items: newItems });
  };

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + item.amount, 0);
    const taxAmount = subtotal * formData.taxRate / 100;
    const total = subtotal + taxAmount - formData.discount;
    return { subtotal, taxAmount, total };
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      DRAFT: 'Nháp',
      PENDING: 'Chờ xuất',
      EXPORTED: 'Đã xuất',
      CANCELLED: 'Đã hủy',
      ERROR: 'Lỗi'
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-700',
      PENDING: 'bg-yellow-100 text-yellow-700',
      EXPORTED: 'bg-green-100 text-green-700',
      CANCELLED: 'bg-red-100 text-red-700',
      ERROR: 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const filteredInvoices = invoices.filter(inv => 
    !searchTerm || 
    inv.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.invoiceNumber?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/accounting" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="p-2 bg-green-50 rounded-lg">
            <Receipt className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Hóa đơn nháp</h1>
            <p className="text-sm text-gray-500">Chuẩn bị dữ liệu xuất hóa đơn</p>
          </div>
        </div>

        {canManageAccounting && (
          <button
            onClick={handleCreateInvoice}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Tạo hóa đơn
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="">Tất cả trạng thái</option>
              <option value="DRAFT">Nháp</option>
              <option value="PENDING">Chờ xuất</option>
              <option value="EXPORTED">Đã xuất</option>
              <option value="ERROR">Lỗi</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              placeholder="Từ ngày"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(1); }}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
              placeholder="Đến ngày"
            />
          </div>

          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Tìm theo tên KH, số hóa đơn..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          <div className="text-sm text-gray-500">
            Tổng: <span className="font-medium text-gray-900">{total}</span> hóa đơn
          </div>
        </div>
      </div>

      {/* Invoice Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Khách hàng</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">MST</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày HĐ</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Trước thuế</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">VAT</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tổng</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Trạng thái</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                  </td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                filteredInvoices.map(invoice => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-gray-900">{invoice.customerName}</p>
                        {invoice.customerPhone && (
                          <p className="text-xs text-gray-500">{invoice.customerPhone}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {invoice.customerTaxCode || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(invoice.invoiceDate)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm">
                      {formatCurrency(invoice.subtotal)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-600">
                      {formatCurrency(invoice.taxAmount)} ({invoice.taxRate}%)
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                      {formatCurrency(invoice.total)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>
                        {getStatusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setViewingInvoice(invoice)}
                          className="p-1.5 text-gray-500 hover:text-primary hover:bg-gray-100 rounded"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canManageAccounting && invoice.status === 'DRAFT' && (
                          <>
                            <button
                              onClick={() => handleEditInvoice(invoice)}
                              className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                              title="Sửa"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handlePrepareExport(invoice.id)}
                              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                              title="Chuẩn bị xuất"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteInvoice(invoice.id)}
                              className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                              title="Xóa"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {canManageAccounting && invoice.status === 'PENDING' && (
                          <button
                            onClick={() => handlePrepareExport(invoice.id)}
                            className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                            title="Xem dữ liệu xuất"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(totalPages > 1 || total > 0) && (
          <div className="px-4 py-3 border-t border-gray-100">
            <PaginationBar
              page={page}
              limit={normalizePageSize(limit)}
              total={total}
              totalPages={totalPages}
              onPageChange={setPage}
              onLimitChange={(l) => { setLimit(normalizePageSize(l)); setPage(1); }}
              itemLabel="hóa đơn"
            />
          </div>
        )}
      </div>

      {/* Create/Edit Invoice Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">
                {editingInvoice ? 'Sửa hóa đơn' : 'Tạo hóa đơn nháp'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="space-y-6">
                {/* Customer Info */}
                <div className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-gray-500" />
                    <h3 className="font-medium text-gray-900">Thông tin khách hàng</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Chọn từ danh sách</label>
                      <select
                        value={formData.customerId}
                        onChange={(e) => handleCustomerSelect(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="">-- Chọn khách hàng hoặc nhập mới --</option>
                        {customers.map(c => (
                          <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tên khách hàng *</label>
                      <input
                        type="text"
                        value={formData.customerName}
                        onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mã số thuế</label>
                      <input
                        type="text"
                        value={formData.customerTaxCode}
                        onChange={(e) => setFormData({ ...formData, customerTaxCode: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                        placeholder="VD: 0123456789"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Điện thoại</label>
                      <input
                        type="text"
                        value={formData.customerPhone}
                        onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={formData.customerEmail}
                        onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                      <input
                        type="text"
                        value={formData.customerAddress}
                        onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Invoice Info */}
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày hóa đơn</label>
                    <input
                      type="date"
                      value={formData.invoiceDate}
                      onChange={(e) => setFormData({ ...formData, invoiceDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Hạn thanh toán</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Thuế VAT (%)</label>
                    <input
                      type="number"
                      value={formData.taxRate}
                      onChange={(e) => setFormData({ ...formData, taxRate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      min="0"
                      max="100"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã đơn hàng</label>
                    <input
                      type="text"
                      value={formData.orderCode}
                      onChange={(e) => setFormData({ ...formData, orderCode: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      placeholder="Liên kết đơn hàng"
                    />
                  </div>
                </div>

                {/* Items */}
                <div className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-gray-500" />
                      <h3 className="font-medium text-gray-900">Chi tiết hàng hóa</h3>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddItem}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary/10 text-primary rounded-lg hover:bg-primary/20"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm dòng
                    </button>
                  </div>

                  {formData.items.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p>Chưa có sản phẩm. Nhấn "Thêm dòng" để bắt đầu.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-2">
                        <div className="col-span-3">Sản phẩm</div>
                        <div className="col-span-2">Tên</div>
                        <div className="col-span-1">ĐVT</div>
                        <div className="col-span-1 text-center">SL</div>
                        <div className="col-span-2 text-right">Đơn giá</div>
                        <div className="col-span-2 text-right">Thành tiền</div>
                        <div className="col-span-1"></div>
                      </div>

                      {formData.items.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-3">
                            <select
                              value={item.productId || ''}
                              onChange={(e) => handleItemChange(index, 'productId', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                            >
                              <option value="">-- Chọn SP --</option>
                              {products.map(p => (
                                <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2">
                            <input
                              type="text"
                              value={item.productName}
                              onChange={(e) => handleItemChange(index, 'productName', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="Tên SP"
                            />
                          </div>
                          <div className="col-span-1">
                            <input
                              type="text"
                              value={item.unit || ''}
                              onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                              placeholder="ĐVT"
                            />
                          </div>
                          <div className="col-span-1">
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-center"
                              min="1"
                            />
                          </div>
                          <div className="col-span-2">
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right"
                              min="0"
                            />
                          </div>
                          <div className="col-span-2 text-right font-medium text-sm">
                            {formatCurrency(item.amount)}
                          </div>
                          <div className="col-span-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(index)}
                              className="p-1 text-gray-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tổng tiền hàng:</span>
                        <span className="font-medium">{formatCurrency(calculateTotals().subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Thuế VAT ({formData.taxRate}%):</span>
                        <span className="font-medium">{formatCurrency(calculateTotals().taxAmount)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 text-sm">Giảm giá:</span>
                        <input
                          type="number"
                          value={formData.discount}
                          onChange={(e) => setFormData({ ...formData, discount: parseFloat(e.target.value) || 0 })}
                          className="w-32 px-2 py-1 border border-gray-200 rounded text-sm text-right"
                          min="0"
                        />
                      </div>
                      <div className="flex justify-between pt-2 border-t border-gray-200">
                        <span className="font-medium text-gray-900">Tổng thanh toán:</span>
                        <span className="font-bold text-lg text-primary">{formatCurrency(calculateTotals().total)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Note */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                  <textarea
                    value={formData.note}
                    onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveInvoice}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                <Save className="w-4 h-4" />
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Invoice Detail Modal */}
      {viewingInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold">Chi tiết hóa đơn</h2>
              <button onClick={() => setViewingInvoice(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-100px)]">
              <div className="space-y-4">
                {/* Customer Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-500">Khách hàng</p>
                      <p className="font-medium">{viewingInvoice.customerName}</p>
                      {viewingInvoice.customerTaxCode && (
                        <p className="text-sm text-gray-500">MST: {viewingInvoice.customerTaxCode}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Liên hệ</p>
                      <p className="text-sm">{viewingInvoice.customerPhone || '-'}</p>
                      <p className="text-sm">{viewingInvoice.customerEmail || '-'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-sm text-gray-500">Địa chỉ</p>
                      <p className="text-sm">{viewingInvoice.customerAddress || '-'}</p>
                    </div>
                  </div>
                </div>

                {/* Invoice Info */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Ngày hóa đơn</p>
                    <p className="font-medium">{formatDate(viewingInvoice.invoiceDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Trạng thái</p>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(viewingInvoice.status)}`}>
                      {getStatusLabel(viewingInvoice.status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Người tạo</p>
                    <p className="text-sm">{viewingInvoice.creator?.fullName || '-'}</p>
                  </div>
                </div>

                {/* Items */}
                <div className="border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Sản phẩm</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">ĐVT</th>
                        <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">SL</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Đơn giá</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {viewingInvoice.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <p className="font-medium">{item.productName}</p>
                            {item.productCode && <p className="text-xs text-gray-500">{item.productCode}</p>}
                          </td>
                          <td className="px-3 py-2 text-center">{item.unit || '-'}</td>
                          <td className="px-3 py-2 text-center">{item.quantity}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Summary */}
                <div className="bg-primary/5 rounded-lg p-4">
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Tổng tiền hàng:</span>
                        <span className="font-medium">{formatCurrency(viewingInvoice.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Thuế VAT ({viewingInvoice.taxRate}%):</span>
                        <span className="font-medium">{formatCurrency(viewingInvoice.taxAmount)}</span>
                      </div>
                      {Number(viewingInvoice.discount) > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Giảm giá:</span>
                          <span className="font-medium text-red-600">-{formatCurrency(viewingInvoice.discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between pt-2 border-t border-gray-200">
                        <span className="font-medium text-gray-900">Tổng thanh toán:</span>
                        <span className="font-bold text-xl text-primary">{formatCurrency(viewingInvoice.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {viewingInvoice.note && (
                  <div>
                    <p className="text-sm text-gray-500">Ghi chú</p>
                    <p className="text-gray-700">{viewingInvoice.note}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Data Modal */}
      {exportData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-green-600" />
                <h2 className="text-lg font-semibold">Dữ liệu xuất hóa đơn</h2>
              </div>
              <button onClick={() => setExportData(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto max-h-[calc(90vh-140px)]">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800">
                    <p className="font-medium">Dữ liệu đã sẵn sàng để xuất hóa đơn</p>
                    <p>Copy JSON bên dưới và gửi lên API của nhà cung cấp hóa đơn điện tử.</p>
                  </div>
                </div>
              </div>

              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs">
                {JSON.stringify(exportData.exportData, null, 2)}
              </pre>
            </div>

            <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-100">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(exportData.exportData, null, 2));
                  toast.success('Đã copy vào clipboard');
                }}
                className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
              >
                <Download className="w-4 h-4" />
                Copy JSON
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingInvoices;
