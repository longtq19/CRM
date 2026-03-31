import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  X, 
  Save, 
  Upload,
  FileDown,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Eye,
  Camera,
  Image as ImageIcon,
  Leaf,
  Cpu,
  Gift,
  LayoutGrid,
  FolderOpen,
  ChevronDown,
  AlertTriangle,
  MapPin,
} from 'lucide-react';
import { apiClient, ApiHttpError } from '../api/client';
import PaginationBar from '../components/PaginationBar';
import { normalizePageSize } from '../constants/pagination';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';
import type { Product, ProductCategory, ProductStatus } from '../types';
import { ToolbarButton, ToolbarFileLabel } from '../components/ui/ToolbarButton';
import { resolveUploadUrl } from '../utils/assetsUrl';

/** Hiển thị danh sách: tránh tên quá dài che layout; hover `title` vẫn đủ nội dung. */
const PRODUCT_NAME_DISPLAY_MAX = 80;
function formatProductNameForTable(name: string): string {
  const t = (name || '').trim();
  if (t.length <= PRODUCT_NAME_DISPLAY_MAX) return t;
  return `${t.slice(0, PRODUCT_NAME_DISPLAY_MAX - 1)}…`;
}

/** Tự động viết hoa ký tự đầu tiên của chuỗi */
const capitalizeFirstLetter = (str: string) => {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
};

const getCategoryIcon = (code: string) => {
  switch (code) {
    case 'BIO': return Leaf;
    case 'TECH': return Cpu;
    case 'GIFT': return Gift;
    case 'COMBO': return LayoutGrid;
    default: return Package;
  }
};

const getCategoryColor = (code: string) => {
  switch (code) {
    case 'BIO': return { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200', activeBg: 'bg-green-100' };
    case 'TECH': return { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', activeBg: 'bg-blue-100' };
    case 'GIFT': return { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', activeBg: 'bg-purple-100' };
    case 'COMBO': return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', activeBg: 'bg-amber-100' };
    default: return { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', activeBg: 'bg-gray-100' };
  }
};

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1
  });

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState<{ id?: string; code: string; name: string; description: string }>({
    code: '',
    name: '',
    description: '',
  });
  
  // Image Upload State
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Warehouse State
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [selectedWhId, setSelectedWhId] = useState<string>(() => localStorage.getItem('lastProductWhId') || '');

  // Form State
  const [units, setUnits] = useState<string[]>([]);
  const [comboProductOptions, setComboProductOptions] = useState<Product[]>([]);
  const [comboSearch, setComboSearch] = useState('');
  const [comboLoading, setComboLoading] = useState(false);
  const [formData, setFormData] = useState<Partial<Omit<Product, 'weight'>> & {
    vatName?: string;
    vatRate?: number;
    listPriceNet?: number;
    minSellPriceNet?: number;
    lowStockThreshold?: number;
    weight?: string;
    bioVolume?: string;
    bioWeight?: string;
    packagingSpec?: string;
    bioIngredients?: string;
    bioUsage?: string;
    bioExpiryPeriod?: string;
    
    techWarranty?: string;
    techMaintenance?: string;
    techManufacturer?: string;
    techModelYear?: string;
    comboProductIds?: string[];
    warehouseId?: string;
  }>({});

  const fetchCategories = async () => {
    try {
      const res: any = await apiClient.get('/products/categories');
      if (Array.isArray(res)) {
        setCategories(res);
      }
    } catch (error) {
      console.error('Failed to fetch categories', error);
      setCategories([]);
    }
  };

  const fetchUnits = async () => {
    try {
      const res: any = await apiClient.get('/products/units');
      if (Array.isArray(res)) {
        setUnits(res);
      }
    } catch (error) {
      console.error('Failed to fetch units', error);
      setUnits([]);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res: any = await apiClient.get('/inventory/warehouses');
      if (Array.isArray(res)) {
        setWarehouses(res);
        // If nothing selected and we have warehouses, or last ID is invalid
        if (!selectedWhId && res.length > 0) {
          // Keep it empty to force choice or auto-pick? User said "Chọn kho TRƯỚC"
          // I will auto-pick if there's only 1, otherwise let them pick.
          if (res.length === 1) {
            handleWhChange(res[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch warehouses', err);
    }
  };

  const handleWhChange = (id: string) => {
    setSelectedWhId(id);
    localStorage.setItem('lastProductWhId', id);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const fetchComboProductOptions = async (searchText = '') => {
    try {
      if (!selectedWhId) return;
      setComboLoading(true);
      const params = new URLSearchParams();
      if (searchText.trim()) params.set('search', searchText.trim());
      if (editingProduct?.id) params.set('excludeProductId', editingProduct.id);
      params.set('warehouseId', selectedWhId);
      const res: any = await apiClient.get(`/products/options?${params.toString()}`);
      setComboProductOptions(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error('Failed to fetch combo product options', error);
      setComboProductOptions([]);
    } finally {
      setComboLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      setIsLoading(true);
      // Prefetch units & categories (non-blocking)
      fetchUnits();
      fetchCategories();

      const params = new URLSearchParams();
      params.set('page', String(pagination.page));
      params.set('limit', String(pagination.limit));
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (activeTab !== 'ALL') params.set('type', activeTab);
      if (selectedWhId) params.set('warehouseId', selectedWhId);

      const url = `/products?${params.toString()}`;
      const res: any = await apiClient.get(url);

      if (res && Array.isArray(res.data)) {
        setProducts(res.data);
        if (res.pagination) {
          setPagination(res.pagination);
        } else {
          setPagination(prev => ({
            ...prev,
            total: res.data.length,
            totalPages: 1
          }));
        }
        return;
      }

      if (Array.isArray(res)) {
        setProducts(res);
        setPagination(prev => ({
          ...prev,
          page: 1,
          total: res.length,
          totalPages: 1
        }));
        return;
      }

      setProducts([]);
      setPagination(prev => ({ ...prev, total: 0, totalPages: 1 }));
    } catch (error) {
      console.error('Failed to fetch products:', error);
      toast.error('Không thể tải danh sách sản phẩm');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePageChange = (page: number) => {
    setPagination(prev => ({ ...prev, page }));
  };
  const handleLimitChange = (limit: number) => {
    setPagination(prev => ({ ...prev, limit: normalizePageSize(limit), page: 1 }));
  };

  useEffect(() => {
    fetchWarehouses();
    fetchCategories();
    fetchUnits();
    // fetchComboProductOptions depends on selectedWhId, handled in useEffect below
  }, []);

  useEffect(() => {
    if (selectedWhId) {
      fetchProducts();
      fetchComboProductOptions();
    } else {
        setProducts([]);
        setPagination(prev => ({ ...prev, total: 0 }));
    }
  }, [selectedWhId, pagination.page, pagination.limit, activeTab, searchTerm]);

  useEffect(() => {
    if (formData.type !== 'COMBO' || !isModalOpen) return;
    const t = setTimeout(() => {
      fetchComboProductOptions(comboSearch);
    }, 250);
    return () => clearTimeout(t);
  }, [comboSearch, formData.type, isModalOpen, editingProduct?.id]);

  const openCategoryModal = (cat?: ProductCategory) => {
    if (cat) {
      setCategoryForm({ id: cat.id, code: cat.code, name: cat.name, description: cat.description || '' });
    } else {
      setCategoryForm({ id: undefined, code: '', name: '', description: '' });
    }
    setIsCategoryModalOpen(true);
  };

  const saveCategory = async () => {
    try {
      if (!categoryForm.name || !categoryForm.code) {
        toast.error('Vui lòng nhập mã và tên loại');
        return;
      }
      const payload = { code: categoryForm.code, name: categoryForm.name, description: categoryForm.description };
      if (categoryForm.id) {
        await apiClient.put(`/products/categories/${categoryForm.id}`, payload);
        toast.success('Cập nhật loại thành công');
      } else {
        await apiClient.post(`/products/categories`, payload);
        toast.success('Tạo loại thành công');
      }
      setIsCategoryModalOpen(false);
      fetchCategories();
    } catch (error: any) {
      toast.error(error?.message || 'Lỗi khi lưu loại sản phẩm');
    }
  };

  const deleteCategory = async (cat: ProductCategory) => {
    if (!window.confirm(`Xóa loại "${cat.name}"?`)) return;
    try {
      await apiClient.delete(`/products/categories/${cat.id}`);
      toast.success('Xóa loại thành công');
      fetchCategories();
    } catch (error: any) {
      toast.error(error?.message || 'Không thể xóa loại sản phẩm');
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (activeTab !== 'ALL') params.set('type', activeTab);

      const url = params.toString() ? `/products/export?${params.toString()}` : '/products/export';
      const blob = await apiClient.getBlob(url);
      if (!blob) throw new Error('Không nhận được file export');
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', `products_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Xuất file thành công');
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Lỗi khi xuất file');
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await apiClient.getBlob('/products/template');
      if (!blob) throw new Error('Không nhận được file mẫu');
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'product_import_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Tải mẫu thành công');
    } catch (error) {
      console.error('Download template error:', error);
      toast.error('Lỗi khi tải mẫu import');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const loadingToast = toast.loading('Đang import dữ liệu...');

    try {
      const res: any = await apiClient.postMultipart('/products/import', formData);
      
      toast.dismiss(loadingToast);
      toast.success(`Import thành công: ${res.stats?.success || 0} sản phẩm`);
      if ((res.stats?.failed || 0) > 0) {
        toast.error(`${res.stats.failed} dòng import lỗi`);
      }
      if (Array.isArray(res?.errors) && res.errors.length > 0) {
        const preview = res.errors
          .slice(0, 8)
          .map((e: any) => `- Dòng ${e.row}: ${e.message}`)
          .join('\n');
        window.alert(
          `Chi tiết lỗi import:\n${preview}${res.errors.length > 8 ? '\n... (còn lỗi khác)' : ''}`
        );
      }
      fetchProducts();
    } catch (error: any) {
      toast.dismiss(loadingToast);
      console.error('Import error:', error);
      toast.error(error.message || 'Lỗi khi import file');
    }
    
    // Reset input
    e.target.value = '';
  };

  const handleOpenModal = (product?: Product) => {
    setSelectedImage(null);
    if (product) {
      setEditingProduct(product);
      setIsEditing(false); // View mode by default
      setComboSearch('');
      setPreviewUrl(product.thumbnail ? resolveUploadUrl(product.thumbnail) : null);
      setFormData({
        code: product.code,
        name: product.name,
        vatName: product.vatName || '',
        vatRate: product.vatRate || 0,
        type: product.type || product.category?.code || 'BIO',
        listPriceNet: product.listPriceNet,
        minSellPriceNet: product.minSellPriceNet,
        unit: product.unit,
        description: product.description || '',
        status: product.status,
        thumbnail: product.thumbnail || '',
        gallery: product.gallery || [],
        lowStockThreshold: product.lowStockThreshold ?? 50,
        packagingSpec: product.packagingSpec || product.bioDetail?.packType || '',
        
        weight: product.weight?.toString() || product.bioDetail?.weight?.toString() || '',

        // Bio
        bioVolume: product.bioDetail?.volume?.toString() || '',
        bioIngredients: product.bioDetail?.ingredients || '',
        bioUsage: product.bioDetail?.usage || '',
        bioExpiryPeriod: product.bioDetail?.expiryPeriod?.toString() || '',
        
        // Tech
        techWarranty: product.techDetail?.warrantyDuration?.toString() || '12',
        techMaintenance: product.techDetail?.maintenancePeriod?.toString() || '',
        techManufacturer: product.techDetail?.manufacturer || '',
        techModelYear: product.techDetail?.modelYear?.toString() || '',
        comboProductIds: (product.comboItems || []).map((i) => i.componentProductId),
      });
    } else {
      setEditingProduct(null);
      setIsEditing(true); // Create mode
      setComboSearch('');
      setPreviewUrl(null);
      setFormData({
        code: '',
        name: '',
        vatName: '',
        vatRate: 0,
        type: 'BIO', // Default
        listPriceNet: 0,
        minSellPriceNet: 0,
        unit: 'cái',
        description: '',
        status: 'ACTIVE',
        thumbnail: '',
        gallery: [],
        lowStockThreshold: 50,
        packagingSpec: '',
        
        weight: '1',

        bioVolume: '',
        bioIngredients: '',
        bioUsage: '',
        bioExpiryPeriod: '',
        
        techWarranty: '12',
        techMaintenance: '',
        techManufacturer: '',
        techModelYear: new Date().getFullYear().toString(),
        comboProductIds: [],
        warehouseId: selectedWhId,
      });
    }
    setIsModalOpen(true);
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      toast.error('Chỉ chấp nhận ảnh JPG, PNG, WEBP');
      return;
    }

    setSelectedImage(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const wNum =
      formData.weight !== undefined && formData.weight !== ''
        ? Number(formData.weight)
        : NaN;
    if (!formData.code?.trim()) {
      toast.error('Vui lòng nhập mã sản phẩm');
      return;
    }
    if (!formData.name?.trim()) {
      toast.error('Vui lòng nhập tên sản phẩm');
      return;
    }
    if (!Number.isFinite(wNum) || wNum <= 0) {
      toast.error('Vui lòng nhập khối lượng lớn hơn 0');
      return;
    }
    if (!formData.unit?.trim()) {
      toast.error('Vui lòng nhập hoặc chọn đơn vị tính');
      return;
    }
    if (formData.type === 'COMBO' && (formData.comboProductIds || []).length < 2) {
      toast.error('Combo cần chọn ít nhất 2 sản phẩm thành phần');
      return;
    }
    try {
      const payload: any = {
        code: formData.code,
        name: formData.name,
        vatName: formData.vatName,
        vatRate: Number(formData.vatRate || 0),
        type: formData.type,
        listPriceNet: Number(formData.listPriceNet),
        minSellPriceNet: Number(formData.minSellPriceNet),
        unit: formData.unit,
        description: formData.description,
        status: formData.status,
        thumbnail: formData.thumbnail,
        gallery: formData.gallery,
        weight: wNum,
        lowStockThreshold: Number(formData.lowStockThreshold ?? 50),
        packagingSpec: formData.packagingSpec?.trim() || null,
      };

      if (formData.type === 'BIO') {
        payload.volume = formData.bioVolume ? Number(formData.bioVolume) : null;
        payload.packType = formData.packagingSpec?.trim() || null;
        payload.ingredients = formData.bioIngredients;
        payload.usage = formData.bioUsage;
        payload.expiryPeriod = formData.bioExpiryPeriod ? Number(formData.bioExpiryPeriod) : null;
      } else if (formData.type === 'TECH') {
        payload.warrantyDuration = Number(formData.techWarranty);
        payload.maintenancePeriod = formData.techMaintenance ? Number(formData.techMaintenance) : null;
        payload.manufacturer = formData.techManufacturer;
        payload.modelYear = formData.techModelYear ? Number(formData.techModelYear) : null;
      } else if (formData.type === 'COMBO') {
        payload.comboProductIds = formData.comboProductIds || [];
      }
      
      payload.warehouseId = formData.warehouseId || null;

      let productId = '';
      if (editingProduct) {
        productId = editingProduct.id;
        await apiClient.put(`/products/${editingProduct.id}`, payload);
        toast.success('Cập nhật thông tin thành công');
      } else {
        const res: any = await apiClient.post('/products', payload);
        productId = res.id;
        toast.success('Thêm sản phẩm thành công');
      }

      // Handle Image Upload
      if (selectedImage && productId) {
        const imageFormData = new FormData();
        imageFormData.append('image', selectedImage);
        try {
          await apiClient.postMultipart(`/products/${productId}/image`, imageFormData);
          toast.success('Upload ảnh thành công');
        } catch (err) {
          console.error('Upload image failed', err);
          toast.error('Lỗi khi upload ảnh');
        }
      }
      
      setIsModalOpen(false);
      fetchProducts();
    } catch (error: unknown) {
      console.error('Submit error:', error);
      let msg = 'Có lỗi xảy ra';
      if (error instanceof ApiHttpError) {
        if (error.status === 403) {
          msg =
            'Bạn không có quyền tạo hoặc sửa sản phẩm. Cần quyền «Quản lý sản phẩm» (MANAGE_PRODUCTS) trên nhóm quyền.';
        } else {
          msg = error.message || msg;
        }
      } else if (error instanceof Error) {
        msg = error.message;
      }
      toast.error(msg);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) return;
    try {
      await apiClient.delete(`/products/${id}`);
      toast.success('Xóa sản phẩm thành công');
      fetchProducts();
    } catch (error: any) {
      toast.error(error?.message || 'Không thể xóa sản phẩm');
    }
  };

  const inputClassName = "w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50 disabled:text-gray-900 disabled:border-gray-200 disabled:opacity-100";

  const totalAllProducts = categories.reduce((sum, cat) => sum + (cat._count?.products || 0), 0);

  return (
    <div className="flex h-[calc(100vh-64px)]">
      {/* Sidebar - Category List */}
      <div className={clsx(
        "bg-white border-r border-gray-200 flex flex-col transition-all duration-300",
        isCollapsed ? "w-16" : "w-64"
      )}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          {!isCollapsed && (
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <FolderOpen size={18} className="text-primary" />
              Loại sản phẩm
            </h2>
          )}
          <button
            onClick={toggleCollapse}
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            title={isCollapsed ? "Mở rộng" : "Thu gọn"}
          >
            {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Category List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {/* All Products */}
          <button
            onClick={() => { setActiveTab('ALL'); setPagination(prev => ({ ...prev, page: 1 })); }}
            className={clsx(
              "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
              activeTab === 'ALL' 
                ? "bg-primary/10 text-primary border border-primary/20" 
                : "hover:bg-gray-50 text-gray-700"
            )}
            title="Tất cả sản phẩm"
          >
            <div className={clsx(
              "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
              activeTab === 'ALL' ? "bg-primary/20" : "bg-gray-100"
            )}>
              <LayoutGrid size={18} className={activeTab === 'ALL' ? "text-primary" : "text-gray-500"} />
            </div>
            {!isCollapsed && (
              <>
                <div className="flex-1 text-left">
                  <div className="font-medium text-sm">Tất cả</div>
                  <div className="text-xs text-gray-500">{totalAllProducts} sản phẩm</div>
                </div>
              </>
            )}
          </button>

          {/* Category Items */}
          {categories.map(cat => {
            const Icon = getCategoryIcon(cat.code);
            const colors = getCategoryColor(cat.code);
            const isActive = activeTab === cat.code;
            const productCount = cat._count?.products || 0;

            return (
              <button
                key={cat.code}
                onClick={() => { setActiveTab(cat.code); setPagination(prev => ({ ...prev, page: 1 })); }}
                className={clsx(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                  isActive 
                    ? `${colors.activeBg} ${colors.text} border ${colors.border}` 
                    : "hover:bg-gray-50 text-gray-700"
                )}
                title={`${cat.name}: ${productCount} sản phẩm`}
              >
                <div className={clsx(
                  "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                  isActive ? colors.bg : "bg-gray-100"
                )}>
                  <Icon size={18} className={isActive ? colors.text : "text-gray-500"} />
                </div>
                {!isCollapsed && (
                  <>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-sm">{cat.name}</div>
                      <div className="text-xs text-gray-500">{productCount} sản phẩm</div>
                    </div>
                    {isActive && (
                      <div className={clsx("w-2 h-2 rounded-full", colors.text.replace('text-', 'bg-'))} />
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer - Manage Categories */}
        {!isCollapsed && (
          <div className="p-3 border-t border-gray-100">
            <button 
              onClick={() => { setIsCategoryModalOpen(true); setCategoryForm({ code: '', name: '', description: '' }); }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 transition-colors text-sm"
            >
              <Plus size={16} />
              Cài đặt phân loại
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {(() => {
                if (activeTab === 'ALL') {
                  return (
                    <>
                      <LayoutGrid size={24} className="text-primary" />
                      <div>
                        <h1 className="text-xl font-bold text-gray-900">Tất cả sản phẩm</h1>
                        <p className="text-sm text-gray-500">{pagination.total} sản phẩm</p>
                      </div>
                    </>
                  );
                }
                const activeCat = categories.find(c => c.code === activeTab);
                if (activeCat) {
                  const Icon = getCategoryIcon(activeCat.code);
                  const colors = getCategoryColor(activeCat.code);
                  return (
                    <>
                      <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", colors.bg)}>
                        <Icon size={22} className={colors.text} />
                      </div>
                      <div>
                        <h1 className="text-xl font-bold text-gray-900">{activeCat.name}</h1>
                        <p className="text-sm text-gray-500">{pagination.total} sản phẩm</p>
                      </div>
                    </>
                  );
                }
                return null;
              })()}
            </div>
            <div className="flex items-center gap-2">
              <ToolbarFileLabel className="w-9 h-9 md:w-auto md:h-auto !p-0 md:!px-3 md:!py-2 justify-center">
                <Upload size={16} />
                <span className="hidden md:inline md:ml-0 text-sm font-medium">Nhập Excel</span>
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleImport}
                />
              </ToolbarFileLabel>
              
              <ToolbarButton
                variant="secondary"
                onClick={handleDownloadTemplate}
                className="w-9 h-9 md:w-auto md:h-auto !p-0 md:!px-3 md:!py-2 justify-center"
                title="Tải mẫu"
              >
                <FileDown size={16} />
                <span className="hidden md:inline md:ml-0 text-sm font-medium">Tải mẫu</span>
              </ToolbarButton>

              <ToolbarButton
                variant="secondary"
                onClick={handleExport}
                className="w-9 h-9 md:w-auto md:h-auto !p-0 md:!px-3 md:!py-2 justify-center"
                title="Xuất Excel"
              >
                <FileSpreadsheet size={16} />
                <span className="hidden md:inline md:ml-0 text-sm font-medium">Xuất Excel</span>
              </ToolbarButton>
              
              <ToolbarButton
                variant="primary"
                onClick={() => handleOpenModal()}
                className="w-9 h-9 md:w-auto md:h-auto !p-0 md:!px-3 md:!py-2 justify-center shadow-sm"
                title="Thêm mới"
              >
                <Plus size={18} /> <span className="hidden md:inline md:ml-0 text-sm font-medium">Thêm mới</span>
              </ToolbarButton>
            </div>
          </div>

          {/* Warehouse & Search Bar */}
          <div className="mt-4 flex flex-col md:flex-row gap-4">
            <div className="w-full md:w-64">
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-primary" size={18} />
                <select
                  value={selectedWhId}
                  onChange={(e) => handleWhChange(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none bg-white font-medium text-gray-700"
                >
                  <option value="">-- Chọn Kho để xem --</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
              </div>
            </div>

            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Tìm theo tên, mã sản phẩm..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPagination(prev => ({ ...prev, page: 1 })); }}
                className={clsx(
                   "w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-gray-50",
                   !selectedWhId && "opacity-50 cursor-not-allowed"
                )}
                disabled={!selectedWhId}
              />
            </div>
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-auto p-4">
          {!selectedWhId ? (
            <div className="h-full flex flex-col items-center justify-center bg-white rounded-xl border border-dashed border-gray-200 text-gray-500 gap-4">
               <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                 <MapPin size={32} className="text-gray-300" />
               </div>
               <div className="text-center">
                 <p className="text-lg font-medium text-gray-900">Vui lòng chọn Kho</p>
                 <p className="text-sm">Bạn cần chọn kho cụ thể để quản lý danh sách sản phẩm.</p>
               </div>
               <div className="w-64">
                 <select
                    value={selectedWhId}
                    onChange={(e) => handleWhChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 outline-none"
                  >
                    <option value="">Chọn kho ngay...</option>
                    {warehouses.map(w => (
                      <option key={w.id} value={w.id}>{w.name}</option>
                    ))}
                  </select>
               </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-600 text-sm">
              <tr>
                <th className="px-4 py-3 font-medium">Sản phẩm</th>
                <th className="px-4 py-3 font-medium">Loại</th>
                <th className="px-4 py-3 font-medium">Giá niêm yết</th>
                <th className="px-4 py-3 font-medium">Đơn vị</th>
                <th className="px-4 py-3 font-medium">Khối lượng</th>
                <th className="px-4 py-3 font-medium max-w-[220px]">Quy cách đóng gói</th>
                <th className="px-4 py-3 font-medium max-w-[200px]">Mô tả</th>
                <th className="px-4 py-3 font-medium">Tồn kho</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Đang tải dữ liệu...
                  </td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                    Chưa có sản phẩm nào
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const totalStock = product.stocks?.reduce((sum, s) => sum + s.quantity, 0) || 0;
                  const threshold = product.lowStockThreshold ?? 50;
                  const isLowStock = totalStock < threshold && totalStock > 0;
                  const isOutOfStock = totalStock === 0;
                  
                  return (
                    <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden border border-gray-200 flex-shrink-0">
                            {product.thumbnail ? (
                              <img src={resolveUploadUrl(product.thumbnail)} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Package className="text-gray-400" size={20} />
                            )}
                          </div>
                          <div className="min-w-0 max-w-[min(100%,28rem)]">
                            <p
                              className="font-medium text-gray-900 break-words line-clamp-2"
                              title={product.name}
                            >
                              {formatProductNameForTable(product.name)}
                            </p>
                            <p className="text-xs text-gray-500">{product.code}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          "px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap",
                          (product.category?.code || '') === 'BIO'
                            ? "bg-green-100 text-green-700"
                            : (product.category?.code || '') === 'TECH'
                              ? "bg-blue-100 text-blue-700"
                              : (product.category?.code || '') === 'COMBO'
                                ? "bg-amber-100 text-amber-700"
                                : "bg-purple-100 text-purple-700"
                        )}>
                          {product.category?.name || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-gray-900 font-medium whitespace-nowrap">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(parseFloat(String(product.listPriceNet || 0)) || 0)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {product.unit || '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {product.weight != null ? `${product.weight}g` : (product.bioDetail?.weight != null ? `${product.bioDetail.weight}g` : '—')}
                      </td>
                      <td className="px-4 py-3 max-w-[220px]">
                        <p
                          className="text-sm text-gray-600 break-words line-clamp-2"
                          title={product.packagingSpec || product.bioDetail?.packType || ''}
                        >
                          {product.packagingSpec || product.bioDetail?.packType || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-sm text-gray-500 truncate" title={product.description || ''}>
                          {product.description || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="relative group">
                          <div className={clsx(
                            "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-sm font-medium",
                            isOutOfStock 
                              ? "bg-red-100 text-red-700" 
                              : isLowStock 
                                ? "bg-amber-100 text-amber-700" 
                                : "bg-gray-100 text-gray-700"
                          )}>
                            {(isLowStock || isOutOfStock) && (
                              <AlertTriangle size={14} className={isOutOfStock ? "text-red-500" : "text-amber-500"} />
                            )}
                            <span>{totalStock}</span>
                          </div>
                          {(isLowStock || isOutOfStock) && (
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 pointer-events-none">
                              {isOutOfStock ? 'Hết hàng' : `Sắp hết hàng (ngưỡng: ${threshold})`}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900" />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap",
                          product.status === 'ACTIVE'
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-gray-50 text-gray-600 border-gray-200"
                        )}>
                          <span className={clsx(
                            "w-1.5 h-1.5 rounded-full",
                            product.status === 'ACTIVE' ? "bg-emerald-500" : "bg-gray-400"
                          )} />
                          {product.status === 'ACTIVE' ? 'Đang bán' : 'Ngừng bán'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button 
                            onClick={() => handleOpenModal(product)}
                            className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                            title="Xem chi tiết"
                          >
                            <Eye size={16} />
                          </button>
                          <button 
                            onClick={() => handleDelete(product.id)}
                            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Xóa"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {(pagination.totalPages > 1 || pagination.total > 0) && (
          <PaginationBar
            page={pagination.page}
            limit={pagination.limit}
            total={pagination.total}
            totalPages={pagination.totalPages}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
            itemLabel="sản phẩm"
          />
        )}
          </div>
          )}
        </div>
      </div>
    </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">
                {editingProduct ? (isEditing ? 'Chỉnh sửa sản phẩm' : 'Chi tiết sản phẩm') : 'Thêm sản phẩm mới'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <form noValidate onSubmit={handleSubmit} className="p-6 space-y-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Image Section - Left Side */}
                <div className="w-full md:w-1/3 space-y-4">
                  <div className="aspect-square w-full rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center overflow-hidden relative group">
                    {previewUrl ? (
                      <>
                        <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                        {isEditing && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <span className="text-white font-medium flex items-center gap-2">
                               <Camera size={20} /> Thay đổi
                             </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-gray-400">
                        <ImageIcon size={48} />
                        <span className="text-sm">Chưa có ảnh</span>
                      </div>
                    )}
                    
                    {isEditing && (
                      <input 
                        type="file" 
                        accept=".jpg,.jpeg,.png,.webp"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleImageSelect}
                      />
                    )}
                  </div>
                  
                  {/* Warehouse Info - Show ALWAYS */}
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-2 text-blue-700 font-semibold text-xs uppercase tracking-wider mb-2">
                      <MapPin size={14} /> Kho sở hữu
                    </div>
                    {isEditing && !editingProduct ? (
                      <select
                        value={formData.warehouseId}
                        onChange={e => setFormData({...formData, warehouseId: e.target.value})}
                        className="w-full bg-white border border-blue-200 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">Chọn kho...</option>
                        {warehouses.map(wh => (
                          <option key={wh.id} value={wh.id}>{wh.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-blue-900 font-medium px-1">
                        {warehouses.find(w => w.id === (formData.warehouseId || editingProduct?.warehouseId))?.name || 'Chế độ chung'}
                      </p>
                    )}
                  </div>

                  {isEditing && (
                    <p className="text-xs text-center text-gray-500">
                      Nhấn vào ảnh để thay đổi<br/>
                      (JPG, PNG, WEBP - Max 1MB)
                    </p>
                  )}
                </div>

                {/* Basic Info - Right Side */}
                <div className="w-full md:w-2/3 grid grid-cols-1 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã sản phẩm <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="text"
                      value={formData.code}
                      onChange={e => {
                        const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                        setFormData({...formData, code: val});
                      }}
                      className={inputClassName}
                      placeholder="VD: SP001"
                      disabled={!!editingProduct || !isEditing}
                    />
                    {isEditing && !editingProduct && (
                      <p className="text-xs text-gray-500 mt-1">Chỉ cho phép chữ A-Z và số 0-9, tự động in hoa.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên thường gọi <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({...formData, name: capitalizeFirstLetter(e.target.value)})}
                      className={inputClassName}
                      placeholder="VD: Phân bón ABC"
                      disabled={!isEditing}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">VAT (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.vatRate}
                        onChange={e => setFormData({...formData, vatRate: Number(e.target.value)})}
                        className={clsx(inputClassName, formData.type === 'GIFT' && "bg-gray-100 text-gray-500")}
                        disabled={!isEditing || formData.type === 'GIFT'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tên VAT</label>
                      <input
                        type="text"
                        value={formData.vatName || ''}
                        onChange={e => setFormData({...formData, vatName: capitalizeFirstLetter(e.target.value)})}
                        className={inputClassName}
                        placeholder="Tên xuất hóa đơn"
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Loại sản phẩm</label>
                        <select
                          value={formData.type}
                          onChange={e => {
                            const newType = e.target.value;
                            if (newType === 'GIFT') {
                              setFormData({
                                ...formData, 
                                type: newType,
                                listPriceNet: 0,
                                minSellPriceNet: 0,
                                vatRate: 0
                              });
                            } else if (newType === 'COMBO') {
                              setFormData({
                                ...formData,
                                type: newType,
                                comboProductIds: formData.comboProductIds || [],
                              });
                            } else {
                              setFormData({ ...formData, type: newType, comboProductIds: [] });
                            }
                          }}
                          className={inputClassName}
                          disabled={!!editingProduct || !isEditing}
                        >
                          {categories.map(cat => (
                            <option key={cat.code} value={cat.code}>{cat.name}</option>
                          ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                        <select
                        value={formData.status}
                        onChange={e => setFormData({...formData, status: e.target.value as ProductStatus})}
                        className={inputClassName}
                        disabled={!isEditing}
                        >
                        <option value="ACTIVE">Đang bán</option>
                        <option value="INACTIVE">Ngừng bán</option>
                        </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ngưỡng cảnh báo tồn kho
                      <span className="text-xs text-gray-400 font-normal ml-2">(Cảnh báo khi tồn kho thấp hơn)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={formData.lowStockThreshold}
                        onChange={e => setFormData({...formData, lowStockThreshold: Number(e.target.value)})}
                        className={inputClassName}
                        placeholder="50"
                        disabled={!isEditing}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                        {formData.unit || 'đơn vị'}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Khối lượng <span className="text-red-500">*</span>
                        </label>
                        <input
                          required
                          type="number"
                          min="0"
                          value={formData.weight}
                          onChange={e => setFormData({...formData, weight: e.target.value})}
                          className={inputClassName}
                          disabled={!isEditing}
                        />
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Giá niêm yết (chưa VAT) {formData.type !== 'GIFT' && <span className="text-red-500">*</span>}
                        </label>
                        <input
                        required={formData.type !== 'GIFT'}
                        type="number"
                        min="0"
                        value={formData.listPriceNet}
                        onChange={e => setFormData({...formData, listPriceNet: Number(e.target.value)})}
                        className={clsx(inputClassName, formData.type === 'GIFT' && "bg-gray-100 text-gray-500")}
                        disabled={!isEditing || formData.type === 'GIFT'}
                        />
                        {formData.type === 'GIFT' && (
                          <p className="text-xs text-gray-500 mt-1">Quà tặng mặc định giá = 0</p>
                        )}
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Giá tối thiểu (chưa VAT) {formData.type !== 'GIFT' && <span className="text-red-500">*</span>}
                        </label>
                        <input
                        required={formData.type !== 'GIFT'}
                        type="number"
                        min="0"
                        value={formData.minSellPriceNet}
                        onChange={e => setFormData({...formData, minSellPriceNet: Number(e.target.value)})}
                        className={clsx(inputClassName, formData.type === 'GIFT' && "bg-gray-100 text-gray-500")}
                        disabled={!isEditing || formData.type === 'GIFT'}
                        />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">VAT (%)</label>
                        <input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.vatRate}
                        onChange={e => setFormData({...formData, vatRate: Number(e.target.value)})}
                        className={clsx(inputClassName, formData.type === 'GIFT' && "bg-gray-100 text-gray-500")}
                        disabled={!isEditing || formData.type === 'GIFT'}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị <span className="text-red-500">*</span></label>
                        <div className="relative">
                          <input
                            required
                            type="text"
                            list="unit-options"
                            value={formData.unit}
                            onChange={e => setFormData({...formData, unit: capitalizeFirstLetter(e.target.value)})}
                            className={inputClassName}
                            placeholder="Chọn hoặc nhập..."
                            disabled={!isEditing}
                          />
                          <datalist id="unit-options">
                             {units.map((u, i) => (
                               <option key={i} value={u} />
                             ))}
                           </datalist>
                        </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Quy cách đóng gói</label>
                    <input
                      type="text"
                      maxLength={500}
                      value={formData.packagingSpec || ''}
                      onChange={(e) => setFormData({ ...formData, packagingSpec: capitalizeFirstLetter(e.target.value) })}
                      className={inputClassName}
                      placeholder="VD: 20 chai/thùng, gói 100ml…"
                      disabled={!isEditing}
                    />
                    <p className="text-xs text-gray-500 mt-0.5">Tối đa 500 ký tự. Áp dụng mọi loại sản phẩm.</p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea
                  value={formData.description || ''}
                  onChange={e => setFormData({...formData, description: capitalizeFirstLetter(e.target.value)})}
                  rows={3}
                  className={inputClassName}
                  disabled={!isEditing}
                />
              </div>

              {/* Type Specific Fields */}
              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  {formData.type === 'BIO'
                    ? 'Thông tin Phân bón'
                    : formData.type === 'TECH'
                      ? 'Thông tin Kỹ thuật'
                      : formData.type === 'COMBO'
                        ? 'Cấu hình Combo'
                        : 'Thông tin bổ sung'}
                </h3>

                {formData.type === 'BIO' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Thể tích (ml)</label>
                      <input
                        type="number"
                        value={formData.bioVolume}
                        onChange={e => setFormData({...formData, bioVolume: e.target.value})}
                        className={inputClassName}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Hạn sử dụng (tháng)</label>
                      <input
                        type="number"
                        value={formData.bioExpiryPeriod}
                        onChange={e => setFormData({...formData, bioExpiryPeriod: e.target.value})}
                        className={inputClassName}
                        disabled={!isEditing}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Thành phần</label>
                      <textarea
                        value={formData.bioIngredients}
                        onChange={e => setFormData({...formData, bioIngredients: capitalizeFirstLetter(e.target.value)})}
                        rows={2}
                        className={inputClassName}
                        disabled={!isEditing}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Công dụng</label>
                      <textarea
                        value={formData.bioUsage}
                        onChange={e => setFormData({...formData, bioUsage: capitalizeFirstLetter(e.target.value)})}
                        rows={2}
                        className={inputClassName}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                ) : formData.type === 'TECH' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bảo hành (tháng)</label>
                      <input
                        type="number"
                        value={formData.techWarranty}
                        onChange={e => setFormData({...formData, techWarranty: e.target.value})}
                        className={inputClassName}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bảo trì định kỳ (tháng)</label>
                      <input
                        type="number"
                        value={formData.techMaintenance}
                        onChange={e => setFormData({...formData, techMaintenance: e.target.value})}
                        className={inputClassName}
                        placeholder="Để trống nếu không có"
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nhà sản xuất</label>
                      <input
                        type="text"
                        value={formData.techManufacturer}
                        onChange={e => setFormData({...formData, techManufacturer: capitalizeFirstLetter(e.target.value)})}
                        className={inputClassName}
                        disabled={!isEditing}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Năm sản xuất</label>
                      <input
                        type="number"
                        value={formData.techModelYear}
                        onChange={e => setFormData({...formData, techModelYear: e.target.value})}
                        className={inputClassName}
                        disabled={!isEditing}
                      />
                    </div>
                  </div>
                ) : formData.type === 'COMBO' ? (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Chọn sản phẩm thành phần <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={comboSearch}
                      onChange={(e) => setComboSearch(e.target.value)}
                      className={inputClassName}
                      placeholder="Tìm nhanh theo mã hoặc tên sản phẩm..."
                      disabled={!isEditing}
                    />
                    <div className="max-h-56 overflow-auto border border-gray-200 rounded-lg p-2 space-y-1 bg-white">
                      {comboLoading ? (
                        <p className="text-sm text-gray-500 px-2 py-1">Đang tải danh sách...</p>
                      ) : comboProductOptions.length === 0 ? (
                        <p className="text-sm text-gray-500 px-2 py-1">Không có sản phẩm phù hợp</p>
                      ) : (
                        comboProductOptions.map((p) => {
                          const checked = (formData.comboProductIds || []).includes(p.id);
                          return (
                            <label key={p.id} className="flex items-start gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer">
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={checked}
                                disabled={!isEditing}
                                onChange={(e) => {
                                  const current = formData.comboProductIds || [];
                                  const next = e.target.checked
                                    ? Array.from(new Set([...current, p.id]))
                                    : current.filter((id) => id !== p.id);
                                  setFormData({ ...formData, comboProductIds: next });
                                }}
                              />
                              <span className="text-sm text-gray-700">
                                <span className="font-medium">{p.code}</span> - {p.name}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <p className="text-xs text-gray-600">
                      Đã chọn: {(formData.comboProductIds || []).length} sản phẩm
                    </p>
                    <p className="text-xs text-gray-500">
                      Có thể chọn 1 hoặc nhiều sản phẩm. Combo hợp lệ khi chọn từ 2 sản phẩm trở lên.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Loại sản phẩm này không có thông tin bổ sung riêng.</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-6 border-t">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Đóng
                </button>
                
                {editingProduct && !isEditing ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setIsEditing(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Edit size={18} /> Chỉnh sửa
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                  >
                    <Save size={18} /> {editingProduct ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
      
      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-bold text-gray-900">Quản lý Loại sản phẩm</h2>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã loại</label>
                <input
                  type="text"
                  value={categoryForm.code}
                  onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value.toUpperCase() })}
                  className={inputClassName}
                  placeholder="VD: BIO, TECH, GIFT"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên loại</label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className={inputClassName}
                  placeholder="VD: Phân bón sinh học"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  rows={3}
                  className={inputClassName}
                />
              </div>
              
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Đóng
                </button>
                <button
                  type="button"
                  onClick={saveCategory}
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors"
                >
                  Lưu
                </button>
              </div>
              
              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-900 mb-3">Danh sách loại</h3>
                <div className="space-y-2">
                  {categories.map(cat => {
                    const Icon = getCategoryIcon(cat.code);
                    const colors = getCategoryColor(cat.code);
                    return (
                      <div key={cat.id} className={clsx("flex items-center justify-between p-3 border rounded-lg", colors.border, colors.bg)}>
                        <div className="flex items-center gap-3">
                          <div className={clsx("w-10 h-10 rounded-lg flex items-center justify-center", colors.activeBg)}>
                            <Icon size={20} className={colors.text} />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{cat.name} <span className="text-xs text-gray-500">({cat.code})</span></div>
                            {cat.description && <div className="text-sm text-gray-500">{cat.description}</div>}
                            {typeof cat._count?.products === 'number' && (
                              <div className="text-xs text-gray-500 mt-1">{cat._count.products} sản phẩm</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openCategoryModal(cat)}
                            className="px-3 py-1.5 text-gray-700 hover:bg-white rounded-lg transition-colors"
                          >
                            Sửa
                          </button>
                          <button
                            onClick={() => deleteCategory(cat)}
                            className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            disabled={typeof cat._count?.products === 'number' && cat._count.products > 0}
                            title={(typeof cat._count?.products === 'number' && cat._count.products > 0) ? 'Không thể xóa khi có sản phẩm' : 'Xóa'}
                          >
                            Xóa
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;
