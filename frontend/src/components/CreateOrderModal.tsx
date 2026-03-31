import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Search, Package, User, MapPin, Truck, Calculator,
  Plus, Minus, Check, RefreshCw, AlertCircle, ChevronRight,
  Phone, Home, Building2, Clock, DollarSign, Weight
} from 'lucide-react';
import { apiClient } from '../api/client';
import { orderApi } from '../api/orderApi';
import type { CreateOrderData } from '../api/orderApi';
import type { Customer, Product } from '../types';
import { ToolbarButton } from './ui/ToolbarButton';
import PaginationBar from './PaginationBar';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';
import { resolveUploadUrl } from '../utils/assetsUrl';

interface Province {
  PROVINCE_ID: number;
  PROVINCE_CODE: string;
  PROVINCE_NAME: string;
}

interface District {
  DISTRICT_ID: number;
  DISTRICT_VALUE: string;
  DISTRICT_NAME: string;
}

interface Ward {
  WARDS_ID: number;
  WARDS_NAME: string;
}

interface ShippingService {
  MA_DV_CHINH: string;
  TEN_DICHVU: string;
  GIA_CUOC: number;
  THOI_GIAN: string;
}

interface CreateOrderModalProps {
  onClose: () => void;
  onSuccess: () => void;
  /** Chế độ tạo đơn ngoài hệ thống (khách chưa có) - chỉ ADM, phục vụ test VTP */
  isOutsideSystem?: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

/** Tổng tồn kho (cộng các kho); không có bản ghi tồn → 0 */
const getProductStockTotal = (product: Product): number => {
  if (!Array.isArray(product.stocks) || product.stocks.length === 0) return 0;
  return product.stocks.reduce((sum, s) => sum + (Number(s.quantity) > 0 ? Number(s.quantity) : 0), 0);
};

const CreateOrderModal = ({ onClose, onSuccess, isOutsideSystem = false }: CreateOrderModalProps) => {
  const [step, setStep] = useState(isOutsideSystem ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Customer — danh sách theo phạm vi GET /customers (giống module Khách hàng)
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchCustomer, setSearchCustomer] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [viewScopeDescription, setViewScopeDescription] = useState('');
  const [customerPage, setCustomerPage] = useState(1);
  const [customerLimit] = useState(20);
  const [customerTotal, setCustomerTotal] = useState(0);
  const [customerTotalPages, setCustomerTotalPages] = useState(1);

  // Step 2: Products
  const [products, setProducts] = useState<Product[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [debouncedProductSearch, setDebouncedProductSearch] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [productPage, setProductPage] = useState(1);
  const [productLimit] = useState(20);
  const [productTotal, setProductTotal] = useState(0);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [orderItems, setOrderItems] = useState<{ product: Product; quantity: number }[]>([]);
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState('');
  // Đơn ngoài hệ thống - nhập tay, không lấy từ DB
  const [externalProduct, setExternalProduct] = useState({
    productName: '',
    productQuantity: 1,
    productWeight: 500,
    productPrice: 0
  });
  const [pushToVTP, setPushToVTP] = useState(true);
  /** Cảnh báo khi thêm/tăng SL vượt tồn kho (bước sản phẩm) */
  const [stockWarning, setStockWarning] = useState<string | null>(null);

  // Step 3: Shipping
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loadingAddress, setLoadingAddress] = useState(false);
  const [orderAddressType, setOrderAddressType] = useState<'OLD' | 'NEW'>('OLD');
  const [dbProvinces, setDbProvinces] = useState<Array<{id: string; name: string}>>([]);
  const [dbProvincesNew, setDbProvincesNew] = useState<Array<{id: string; name: string}>>([]);
  const [dbWards, setDbWards] = useState<Array<{id: string; name: string}>>([]);

  const [receiverInfo, setReceiverInfo] = useState({
    receiverName: '',
    receiverPhone: '',
    receiverAddress: '',
    receiverProvinceId: '',
    receiverProvinceName: '',
    receiverDistrictId: '',
    receiverDistrictName: '',
    receiverWardId: '',
    receiverWardName: ''
  });

  // Step 4: Shipping Service
  const [shippingServices, setShippingServices] = useState<ShippingService[]>([]);
  const [selectedService, setSelectedService] = useState<ShippingService | null>(null);
  const [loadingServices, setLoadingServices] = useState(false);

  /** Tổng khối lượng gửi VTP tính cước: Σ(weight×SL); SP không có weight → 500g/đơn vị; đơn ngoài: trọng × SL */
  const totalWeightGrams = useMemo(() => {
    if (isOutsideSystem) {
      const w = externalProduct.productWeight || 500;
      const q = Math.max(1, externalProduct.productQuantity || 1);
      return Math.max(100, Math.round(w * q));
    }
    const t = orderItems.reduce((sum, { product, quantity }) => {
      const w = product.weight != null && Number(product.weight) > 0 ? Number(product.weight) : 500;
      return sum + w * quantity;
    }, 0);
    return Math.max(100, Math.round(t));
  }, [isOutsideSystem, orderItems, externalProduct.productWeight, externalProduct.productQuantity]);

  // Sender info (from company)
  const senderInfo = {
    name: 'KAGRI BIO',
    phone: '0352737467',
    address: 'So nha 103 ngo 95 Dao Xuyen xa Bat Trang',
    provinceId: 1,
    districtId: 8,
    wardId: 175
  };

  // Calculate totals
  const totalAmount = orderItems.reduce((sum, item) => sum + ((item.product.listPriceNet || 0) * item.quantity), 0);
  const shippingFee = selectedService?.GIA_CUOC || 0;
  const displayTotalAmount = isOutsideSystem ? (externalProduct.productPrice || 0) : totalAmount;
  const displayDiscount = isOutsideSystem ? 0 : discount;
  const finalAmount = displayTotalAmount - displayDiscount + shippingFee;

  // Debounce ô tìm khách
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchCustomer), 300);
    return () => clearTimeout(t);
  }, [searchCustomer]);

  // Tải danh sách khách (có sẵn khi chưa gõ tìm; từ 2 ký tự gửi search lên API)
  useEffect(() => {
    if (step !== 1 || isOutsideSystem) return;
    let cancelled = false;
    (async () => {
      setCustomersLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(customerPage),
          limit: String(customerLimit),
        });
        if (debouncedSearch.trim().length >= 2) {
          params.set('search', debouncedSearch.trim());
        }
        const response: any = await apiClient.get(`/customers?${params.toString()}`);
        if (cancelled) return;
        const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
        setCustomers(rows);
        setViewScopeDescription(
          typeof response?.viewScopeDescription === 'string' ? response.viewScopeDescription : ''
        );
        if (response?.pagination) {
          setCustomerTotal(response.pagination.total ?? 0);
          setCustomerTotalPages(response.pagination.totalPages ?? 1);
        } else {
          setCustomerTotal(rows.length);
          setCustomerTotalPages(1);
        }
      } catch (error) {
        console.error('Error fetching customers:', error);
        if (!cancelled) {
          setCustomers([]);
          setViewScopeDescription('');
        }
      } finally {
        if (!cancelled) setCustomersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, isOutsideSystem, customerPage, customerLimit, debouncedSearch]);

  // Debounce ô tìm sản phẩm
  useEffect(() => {
    const t = setTimeout(() => setDebouncedProductSearch(searchProduct), 300);
    return () => clearTimeout(t);
  }, [searchProduct]);

  /** Danh sách sản phẩm: tải ngay khi vào bước 2; từ 2 ký tự gửi search (GET /products phân trang) */
  useEffect(() => {
    if (step !== 2 || isOutsideSystem) return;
    let cancelled = false;
    (async () => {
      setProductsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(productPage),
          limit: String(productLimit),
        });
        if (debouncedProductSearch.trim().length >= 2) {
          params.set('search', debouncedProductSearch.trim());
        }
        const response: any = await apiClient.get(`/products?${params.toString()}`);
        if (cancelled) return;
        const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
        setProducts(rows);
        if (response?.pagination) {
          setProductTotal(response.pagination.total ?? 0);
          setProductTotalPages(response.pagination.totalPages ?? 1);
        } else {
          setProductTotal(rows.length);
          setProductTotalPages(1);
        }
      } catch (error) {
        console.error('Error fetching products:', error);
        if (!cancelled) {
          setProducts([]);
          setProductTotal(0);
          setProductTotalPages(1);
        }
      } finally {
        if (!cancelled) setProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, isOutsideSystem, productPage, productLimit, debouncedProductSearch]);

  useEffect(() => {
    if (!stockWarning) return;
    const t = window.setTimeout(() => setStockWarning(null), 5000);
    return () => window.clearTimeout(t);
  }, [stockWarning]);

  // Fetch provinces (VTP for OLD, DB for NEW)
  useEffect(() => {
    const fetchProvinces = async () => {
      try {
        if (orderAddressType === 'OLD') {
          const response: any = await apiClient.get('/vtp/provinces');
          if (response.success && response.data) setProvinces(response.data);
        }
        const [dbAll, dbNew] = await Promise.all([
          apiClient.get('/address/provinces'),
          apiClient.get('/address/provinces?directOnly=1')
        ]);
        if (Array.isArray(dbAll)) setDbProvinces(dbAll);
        if (Array.isArray(dbNew)) setDbProvincesNew(dbNew);
      } catch (error) {
        console.error('Error fetching provinces:', error);
      }
    };
    fetchProvinces();
  }, [orderAddressType]);

  // Fetch districts when province changes (OLD mode only)
  useEffect(() => {
    if (orderAddressType !== 'OLD') { setDistricts([]); return; }
    const fetchDistricts = async () => {
      if (!receiverInfo.receiverProvinceId) { setDistricts([]); return; }
      try {
        setLoadingAddress(true);
        const response: any = await apiClient.get(`/vtp/districts?provinceId=${receiverInfo.receiverProvinceId}`);
        if (response.success && response.data) setDistricts(response.data);
      } catch (error) {
        console.error('Error fetching districts:', error);
      } finally { setLoadingAddress(false); }
    };
    fetchDistricts();
  }, [receiverInfo.receiverProvinceId, orderAddressType]);

  // Fetch wards (OLD: by district via VTP, NEW: by province via DB directOnly)
  useEffect(() => {
    if (orderAddressType === 'OLD') {
      if (!receiverInfo.receiverDistrictId) { setWards([]); setDbWards([]); return; }
      const fetchWards = async () => {
        try {
          setLoadingAddress(true);
          const response: any = await apiClient.get(`/vtp/wards?districtId=${receiverInfo.receiverDistrictId}`);
          if (response.success && response.data) setWards(response.data);
        } catch (error) { console.error('Error fetching wards:', error); }
        finally { setLoadingAddress(false); }
      };
      fetchWards();
    } else {
      setWards([]);
      if (!receiverInfo.receiverProvinceId) { setDbWards([]); return; }
      const fetchNewWards = async () => {
        try {
          setLoadingAddress(true);
          const res: any = await apiClient.get(`/address/wards?provinceId=${receiverInfo.receiverProvinceId}&directOnly=1`);
          if (Array.isArray(res)) setDbWards(res);
        } catch (error) { console.error('Error fetching wards:', error); }
        finally { setLoadingAddress(false); }
      };
      fetchNewWards();
    }
  }, [receiverInfo.receiverDistrictId, receiverInfo.receiverProvinceId, orderAddressType]);

  // Calculate shipping fee when address is complete
  const calculateShipping = useCallback(async () => {
    if (!receiverInfo.receiverProvinceId || !receiverInfo.receiverDistrictId) {
      return;
    }

    try {
      setLoadingServices(true);
      setError(null);

      const codAmount = isOutsideSystem ? externalProduct.productPrice : totalAmount;

      const response: any = await apiClient.post('/vtp/calculate-fee', {
        senderProvince: senderInfo.provinceId,
        senderDistrict: senderInfo.districtId,
        senderWard: senderInfo.wardId,
        receiverProvince: parseInt(receiverInfo.receiverProvinceId, 10),
        receiverDistrict: parseInt(receiverInfo.receiverDistrictId, 10),
        receiverWard: parseInt(receiverInfo.receiverWardId, 10),
        productWeight: totalWeightGrams,
        productPrice: codAmount,
        moneyCollection: codAmount // COD
      });

      if (Array.isArray(response)) {
        setShippingServices(response);
        // Auto-select cheapest service
        if (response.length > 0) {
          const cheapest = response.reduce((min, s) => s.GIA_CUOC < min.GIA_CUOC ? s : min, response[0]);
          setSelectedService(cheapest);
        }
      }
    } catch (error: any) {
      console.error('Error calculating shipping:', error);
      setError('Không thể tính phí vận chuyển. Vui lòng kiểm tra lại địa chỉ.');
    } finally {
      setLoadingServices(false);
    }
  }, [
    receiverInfo.receiverProvinceId,
    receiverInfo.receiverDistrictId,
    receiverInfo.receiverWardId,
    totalWeightGrams,
    totalAmount,
    isOutsideSystem,
    externalProduct.productPrice
  ]);

  // Add product (không vượt tổng tồn kho)
  const addProduct = (product: Product) => {
    const maxQty = getProductStockTotal(product);
    const existing = orderItems.find(item => item.product.id === product.id);
    const currentInCart = existing?.quantity ?? 0;
    if (currentInCart + 1 > maxQty) {
      setStockWarning(
        maxQty <= 0
          ? 'Sản phẩm không còn tồn trong kho hoặc chưa có số liệu tồn — không thể thêm.'
          : `Trong kho chỉ còn ${maxQty} — không thể thêm vượt số lượng này.`
      );
      return;
    }
    if (existing) {
      setOrderItems(prev => prev.map(item =>
        item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setOrderItems(prev => [...prev, { product, quantity: 1 }]);
    }
    setSearchProduct('');
    setProductPage(1);
  };

  // Update quantity (không vượt tồn khi tăng)
  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setOrderItems(prev => prev.filter(item => item.product.id !== productId));
      return;
    }
    const item = orderItems.find(i => i.product.id === productId);
    if (!item) return;
    const maxQty = getProductStockTotal(item.product);
    if (quantity > maxQty) {
      setStockWarning(
        maxQty <= 0
          ? 'Sản phẩm không còn tồn trong kho — không thể tăng số lượng.'
          : `Trong kho chỉ còn ${maxQty} — không thể đặt nhiều hơn.`
      );
      return;
    }
    setOrderItems(prev => prev.map(i =>
      i.product.id === productId ? { ...i, quantity } : i
    ));
  };

  // Use customer info
  const useCustomerInfo = () => {
    if (selectedCustomer) {
      setReceiverInfo(prev => ({
        ...prev,
        receiverName: selectedCustomer.name,
        receiverPhone: selectedCustomer.phone,
        receiverAddress: selectedCustomer.address || ''
      }));
    }
  };

  // Handle province change
  const handleProvinceChange = (provinceId: string) => {
    const province = provinces.find(p => String(p.PROVINCE_ID) === provinceId);
    setReceiverInfo(prev => ({
      ...prev,
      receiverProvinceId: provinceId,
      receiverProvinceName: province?.PROVINCE_NAME
        ? administrativeTitleCase(province.PROVINCE_NAME)
        : '',
      receiverDistrictId: '',
      receiverDistrictName: '',
      receiverWardId: '',
      receiverWardName: ''
    }));
    setDistricts([]);
    setWards([]);
    setShippingServices([]);
    setSelectedService(null);
  };

  // Handle district change
  const handleDistrictChange = (districtId: string) => {
    const district = districts.find(d => String(d.DISTRICT_ID) === districtId);
    setReceiverInfo(prev => ({
      ...prev,
      receiverDistrictId: districtId,
      receiverDistrictName: district?.DISTRICT_NAME
        ? administrativeTitleCase(district.DISTRICT_NAME)
        : '',
      receiverWardId: '',
      receiverWardName: ''
    }));
    setWards([]);
    setShippingServices([]);
    setSelectedService(null);
  };

  // Handle ward change
  const handleWardChange = (wardId: string) => {
    const ward = wards.find(w => String(w.WARDS_ID) === wardId);
    setReceiverInfo(prev => ({
      ...prev,
      receiverWardId: wardId,
      receiverWardName: ward?.WARDS_NAME ? administrativeTitleCase(ward.WARDS_NAME) : ''
    }));
  };

  // Submit order
  const handleSubmit = async () => {
    if (!isOutsideSystem && !selectedCustomer) {
      setError('Vui lòng chọn khách hàng');
      return;
    }
    if (isOutsideSystem) {
      if (!externalProduct.productName?.trim()) {
        setError('Vui lòng nhập tên sản phẩm');
        return;
      }
    } else if (orderItems.length === 0) {
      setError('Vui lòng thêm sản phẩm');
      return;
    }
    if (!receiverInfo.receiverName || !receiverInfo.receiverPhone || !receiverInfo.receiverAddress) {
      setError('Vui lòng nhập đầy đủ thông tin người nhận');
      return;
    }
    if (!receiverInfo.receiverProvinceId || !receiverInfo.receiverDistrictId || !receiverInfo.receiverWardId) {
      setError('Vui lòng chọn đầy đủ địa chỉ (Tỉnh/Quận/Phường)');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (isOutsideSystem) {
        await orderApi.createOrderOutsideSystem({
          productName: externalProduct.productName.trim(),
          productQuantity: externalProduct.productQuantity,
          productWeight: externalProduct.productWeight,
          productPrice: externalProduct.productPrice,
          note,
          receiverName: receiverInfo.receiverName,
          receiverPhone: receiverInfo.receiverPhone,
          receiverAddress: receiverInfo.receiverAddress,
          receiverProvince: receiverInfo.receiverProvinceName,
          receiverDistrict: receiverInfo.receiverDistrictName,
          receiverWard: receiverInfo.receiverWardName,
          receiverProvinceId: Number(receiverInfo.receiverProvinceId) || undefined,
          receiverDistrictId: Number(receiverInfo.receiverDistrictId) || undefined,
          receiverWardId: Number(receiverInfo.receiverWardId) || undefined,
          pushToVTP
        });
      } else {
        const data: CreateOrderData = {
          customerId: selectedCustomer!.id,
          items: orderItems.map(item => ({ productId: item.product.id, quantity: item.quantity })),
          discount,
          note,
          receiverName: receiverInfo.receiverName,
          receiverPhone: receiverInfo.receiverPhone,
          receiverAddress: receiverInfo.receiverAddress,
          receiverProvince: receiverInfo.receiverProvinceName,
          receiverDistrict: receiverInfo.receiverDistrictName,
          receiverWard: receiverInfo.receiverWardName,
          receiverProvinceId: Number(receiverInfo.receiverProvinceId) || undefined,
          receiverDistrictId: Number(receiverInfo.receiverDistrictId) || undefined,
          receiverWardId: Number(receiverInfo.receiverWardId) || undefined,
        };
        await orderApi.createOrder(data);
      }
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tạo đơn hàng');
    } finally {
      setLoading(false);
    }
  };

  // Step validation
  const canProceed = () => {
    switch (step) {
      case 1: return isOutsideSystem ? (!!externalProduct.productName?.trim()) : !!selectedCustomer;
      case 2: return isOutsideSystem ? (!!externalProduct.productName?.trim()) : orderItems.length > 0;
      case 3: return receiverInfo.receiverName && receiverInfo.receiverPhone && 
               receiverInfo.receiverAddress && receiverInfo.receiverProvinceId && 
               receiverInfo.receiverDistrictId && receiverInfo.receiverWardId;
      default: return true;
    }
  };

  const progressSteps = isOutsideSystem
    ? [{ num: 2, label: 'Sản phẩm', icon: Package }, { num: 3, label: 'Địa chỉ', icon: MapPin }, { num: 4, label: 'Vận chuyển', icon: Truck }]
    : [{ num: 1, label: 'Khách hàng', icon: User }, { num: 2, label: 'Sản phẩm', icon: Package }, { num: 3, label: 'Địa chỉ', icon: MapPin }, { num: 4, label: 'Vận chuyển', icon: Truck }];

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-primary to-primary/80">
          <div className="flex items-center justify-between">
            <div className="text-white">
              <h2 className="text-xl font-bold">Tạo đơn hàng mới</h2>
              <p className="text-white/80 text-sm">Tích hợp Viettel Post</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg text-white">
              <X size={20} />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-4">
            {progressSteps.map((s, idx) => (
              <div key={s.num} className="flex items-center">
                <button
                  onClick={() => step > s.num && setStep(s.num)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all ${
                    step === s.num
                      ? 'bg-white text-primary font-semibold'
                      : step > s.num
                        ? 'bg-white/30 text-white cursor-pointer hover:bg-white/40'
                        : 'bg-white/10 text-white/60'
                  }`}
                >
                  <s.icon size={16} />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
                {idx < progressSteps.length - 1 && <ChevronRight size={16} className="text-white/40 mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
              <AlertCircle size={20} />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 rounded">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Step 1: Customer (bỏ qua khi tạo đơn ngoài hệ thống) */}
          {step === 1 && !isOutsideSystem && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
                  <User className="text-primary" size={20} />
                  Chọn khách hàng
                </h3>
                {viewScopeDescription ? (
                  <p className="text-xs text-gray-500 mb-3">{viewScopeDescription}</p>
                ) : (
                  <p className="text-xs text-gray-500 mb-3">
                    Danh sách hiển thị theo phạm vi bạn được xem (cùng logic module Khách hàng).
                  </p>
                )}

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Tìm theo tên hoặc số điện thoại (từ 2 ký tự)…"
                    value={searchCustomer}
                    onChange={(e) => {
                      setSearchCustomer(e.target.value);
                      setCustomerPage(1);
                    }}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>
              </div>

              {selectedCustomer && (
                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-lg">
                        {selectedCustomer.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{selectedCustomer.name}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-2">
                          <Phone size={14} />
                          {selectedCustomer.phone}
                        </div>
                        {selectedCustomer.address && (
                          <div className="text-sm text-gray-500 flex items-center gap-2">
                            <Home size={14} />
                            {selectedCustomer.address}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <X size={20} />
                    </button>
                  </div>
                </div>
              )}

              {!selectedCustomer && customersLoading && (
                <div className="flex items-center justify-center py-12 text-gray-500 gap-2">
                  <RefreshCw className="animate-spin w-5 h-5" />
                  <span>Đang tải danh sách khách hàng…</span>
                </div>
              )}

              {!selectedCustomer && !customersLoading && customers.length > 0 && (
                <>
                  <div className="border-2 border-gray-200 rounded-xl divide-y divide-gray-100 max-h-80 overflow-y-auto">
                    {customers.map((customer) => (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(customer);
                          setSearchCustomer('');
                          setCustomerPage(1);
                        }}
                        className="w-full p-4 text-left hover:bg-gray-50 flex items-center gap-4 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium shrink-0">
                          {customer.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 truncate">{customer.name}</div>
                          <div className="text-sm text-gray-500">{customer.phone}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {(customerTotalPages > 1 || customerTotal > customerLimit) && (
                    <PaginationBar
                      page={customerPage}
                      limit={customerLimit}
                      total={customerTotal}
                      totalPages={customerTotalPages}
                      onPageChange={setCustomerPage}
                      itemLabel="khách hàng"
                      showLimitSelector={false}
                    />
                  )}
                </>
              )}

              {!selectedCustomer && !customersLoading && customers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <User size={48} className="mx-auto mb-2 text-gray-300" />
                  <p>
                    {debouncedSearch.trim().length >= 2
                      ? 'Không tìm thấy khách hàng phù hợp.'
                      : 'Không có khách hàng trong phạm vi hoặc chưa có dữ liệu.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Products */}
          {step === 2 && (
            <div className="space-y-6">
              {isOutsideSystem ? (
                <>
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Package className="text-primary" size={20} />
                    Thông tin sản phẩm (nhập trực tiếp)
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm *</label>
                      <input
                        type="text"
                        value={externalProduct.productName}
                        onChange={(e) => setExternalProduct(p => ({ ...p, productName: e.target.value }))}
                        placeholder="VD: Phân bón sinh học 500g"
                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Số lượng</label>
                      <input
                        type="number"
                        min={1}
                        value={externalProduct.productQuantity}
                        onChange={(e) => setExternalProduct(p => ({ ...p, productQuantity: parseInt(e.target.value) || 1 }))}
                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Trọng lượng (gram)</label>
                      <input
                        type="number"
                        min={100}
                        value={externalProduct.productWeight}
                        onChange={(e) => setExternalProduct(p => ({ ...p, productWeight: parseInt(e.target.value) || 500 }))}
                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">COD (VNĐ)</label>
                      <input
                        type="number"
                        min={0}
                        value={externalProduct.productPrice || ''}
                        onChange={(e) => setExternalProduct(p => ({ ...p, productPrice: parseFloat(e.target.value) || 0 }))}
                        placeholder="Tiền thu hộ"
                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="pushToVTP"
                        checked={pushToVTP}
                        onChange={(e) => setPushToVTP(e.target.checked)}
                        className="rounded"
                      />
                      <label htmlFor="pushToVTP" className="text-sm">Tạo xong tự động gửi lên Viettel Post</label>
                    </div>
                  </div>
                  <div className="pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Ghi chú</label>
                    <input
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl"
                      placeholder="Nhập ghi chú (tùy chọn)"
                    />
                  </div>
                </>
              ) : (
              <>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
                  <Package className="text-primary" size={20} />
                  Thêm sản phẩm
                </h3>
                <p className="text-xs text-gray-500 mb-3">
                  Danh sách tải theo trang từ máy chủ. Gõ từ 2 ký tự để lọc theo tên hoặc mã. Số lượng đặt không vượt tổng tồn kho.
                </p>

                {stockWarning && (
                  <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <AlertCircle className="shrink-0 mt-0.5" size={18} />
                    <span>{stockWarning}</span>
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                  <input
                    type="text"
                    placeholder="Tìm sản phẩm theo tên hoặc mã (từ 2 ký tự)…"
                    value={searchProduct}
                    onChange={(e) => {
                      setSearchProduct(e.target.value);
                      setProductPage(1);
                    }}
                    className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                  />
                </div>

                {productsLoading && (
                  <div className="mt-3 flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
                    <RefreshCw className="animate-spin w-5 h-5" />
                    Đang tải danh sách sản phẩm…
                  </div>
                )}

                {!productsLoading && products.length > 0 && (
                  <>
                    <div className="mt-3 border-2 border-gray-200 rounded-xl divide-y divide-gray-100 max-h-72 overflow-y-auto">
                      {products.map((product) => {
                        const stockTotal = getProductStockTotal(product);
                        const inCartQty = orderItems.find(i => i.product.id === product.id)?.quantity ?? 0;
                        const canAddMore = inCartQty < stockTotal;
                        return (
                        <button
                          key={product.id}
                          type="button"
                          disabled={!canAddMore}
                          onClick={() => canAddMore && addProduct(product)}
                          title={!canAddMore ? (stockTotal <= 0 ? 'Không còn tồn kho' : 'Đã đủ số lượng tồn kho') : undefined}
                          className={`w-full p-3 text-left flex items-center justify-between transition-colors ${
                            canAddMore ? 'hover:bg-gray-50' : 'opacity-60 cursor-not-allowed bg-gray-50/80'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {product.thumbnail ? (
                              <img src={resolveUploadUrl(product.thumbnail)} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                <Package size={20} className="text-gray-400" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900 truncate">{product.name}</div>
                              <div className="text-xs text-gray-500">
                                {product.code}
                                <span className="mx-1">·</span>
                                Tồn kho: <span className={stockTotal <= 0 ? 'text-red-600 font-medium' : 'text-gray-700'}>{stockTotal}</span>
                                {inCartQty > 0 && (
                                  <span className="text-primary"> (trong giỏ: {inCartQty})</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-primary font-semibold shrink-0 ml-2">{formatCurrency(product.listPriceNet || 0)}</div>
                        </button>
                        );
                      })}
                    </div>
                    {(productTotalPages > 1 || productTotal > productLimit) && (
                      <PaginationBar
                        page={productPage}
                        limit={productLimit}
                        total={productTotal}
                        totalPages={productTotalPages}
                        onPageChange={setProductPage}
                        itemLabel="sản phẩm"
                        showLimitSelector={false}
                      />
                    )}
                  </>
                )}

                {!productsLoading && products.length === 0 && (
                  <div className="mt-3 text-center py-8 text-gray-500 text-sm">
                    <Package size={40} className="mx-auto mb-2 text-gray-300" />
                    {debouncedProductSearch.trim().length >= 2
                      ? 'Không tìm thấy sản phẩm phù hợp.'
                      : 'Chưa có sản phẩm nào trên trang này.'}
                  </div>
                )}
              </div>

              {/* Order Items */}
              {orderItems.length > 0 && (
                <div className="border-2 border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Sản phẩm</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">Số lượng / Tồn</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Đơn giá</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Thành tiền</th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {orderItems.map((item) => {
                        const maxStock = getProductStockTotal(item.product);
                        const atMax = item.quantity >= maxStock;
                        return (
                        <tr key={item.product.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              {item.product.thumbnail ? (
                                <img src={resolveUploadUrl(item.product.thumbnail)} alt="" className="w-10 h-10 rounded-lg object-cover" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                  <Package size={16} className="text-gray-400" />
                                </div>
                              )}
                              <div>
                                <div className="font-medium text-gray-900 text-sm">{item.product.name}</div>
                                <div className="text-xs text-gray-500">{item.product.code}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                                  className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                                >
                                  <Minus size={14} />
                                </button>
                                <span className="w-10 text-center font-medium">{item.quantity}</span>
                                <button
                                  type="button"
                                  disabled={atMax}
                                  title={atMax ? 'Đã đạt tối đa tồn kho' : undefined}
                                  onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                                    atMax ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-gray-100 hover:bg-gray-200'
                                  }`}
                                >
                                  <Plus size={14} />
                                </button>
                              </div>
                              <span className="text-[11px] text-gray-500">Tồn: {maxStock}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right text-sm">{formatCurrency(item.product.listPriceNet || 0)}</td>
                          <td className="px-4 py-3 text-right font-semibold text-primary">
                            {formatCurrency((item.product.listPriceNet || 0) * item.quantity)}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => updateQuantity(item.product.id, 0)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Discount & Note */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Giảm giá (VNĐ)</label>
                  <input
                    type="number"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20"
                    min="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Ghi chú đơn hàng</label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Nhập ghi chú..."
                  />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gradient-to-r from-primary/5 to-primary/10 rounded-xl p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-gray-600">Tổng tiền hàng:</span>
                    {discount > 0 && (
                      <span className="ml-4 text-sm text-red-500">(-{formatCurrency(discount)})</span>
                    )}
                  </div>
                  <span className="text-2xl font-bold text-primary">{formatCurrency(totalAmount - discount)}</span>
                </div>
              </div>
              </>
              )}
            </div>
          )}

          {/* Step 3: Shipping Address */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <MapPin className="text-primary" size={20} />
                  Thông tin người nhận
                </h3>
                {!isOutsideSystem && selectedCustomer && (
                  <button
                    onClick={useCustomerInfo}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <User size={14} />
                    Dùng thông tin khách hàng
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tên người nhận <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={receiverInfo.receiverName}
                    onChange={(e) => setReceiverInfo(prev => ({ ...prev, receiverName: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Nhập tên người nhận"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Số điện thoại <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={receiverInfo.receiverPhone}
                    onChange={(e) => setReceiverInfo(prev => ({ ...prev, receiverPhone: e.target.value }))}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20"
                    placeholder="Nhập số điện thoại"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Địa chỉ chi tiết <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={receiverInfo.receiverAddress}
                  onChange={(e) => setReceiverInfo(prev => ({ ...prev, receiverAddress: e.target.value }))}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Số nhà, tên đường..."
                />
              </div>

              <div className="bg-gray-50 p-3 rounded-lg">
                <label className="block text-xs font-medium text-gray-500 mb-2">Loại địa chỉ hành chính</label>
                <div className="flex gap-4">
                  <label className="flex items-center cursor-pointer">
                    <input type="radio" name="orderAddressType" value="OLD" checked={orderAddressType === 'OLD'}
                      onChange={() => { setOrderAddressType('OLD'); setReceiverInfo(prev => ({...prev, receiverProvinceId: '', receiverProvinceName: '', receiverDistrictId: '', receiverDistrictName: '', receiverWardId: '', receiverWardName: ''})); }}
                      className="w-4 h-4 text-primary" />
                    <span className="ml-2 text-sm"><span className="font-medium">Trước sáp nhập</span> <span className="text-gray-400">(Tỉnh → Huyện → Xã)</span></span>
                  </label>
                  <label className="flex items-center cursor-pointer">
                    <input type="radio" name="orderAddressType" value="NEW" checked={orderAddressType === 'NEW'}
                      onChange={() => { setOrderAddressType('NEW'); setReceiverInfo(prev => ({...prev, receiverProvinceId: '', receiverProvinceName: '', receiverDistrictId: '', receiverDistrictName: '', receiverWardId: '', receiverWardName: ''})); }}
                      className="w-4 h-4 text-primary" />
                    <span className="ml-2 text-sm"><span className="font-medium">Sau sáp nhập</span> <span className="text-gray-400">(Tỉnh → Xã)</span></span>
                  </label>
                </div>
              </div>

              {orderAddressType === 'OLD' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tỉnh/Thành phố <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={receiverInfo.receiverProvinceId}
                      onChange={(e) => handleProvinceChange(e.target.value)}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">-- Chọn Tỉnh/TP --</option>
                      {provinces.map((p) => (
                        <option key={p.PROVINCE_ID} value={p.PROVINCE_ID}>
                          {administrativeTitleCase(p.PROVINCE_NAME)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Quận/Huyện <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={receiverInfo.receiverDistrictId}
                      onChange={(e) => handleDistrictChange(e.target.value)}
                      disabled={!receiverInfo.receiverProvinceId || loadingAddress}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-gray-100"
                    >
                      <option value="">-- Chọn Quận/Huyện --</option>
                      {districts.map((d) => (
                        <option key={d.DISTRICT_ID} value={d.DISTRICT_ID}>
                          {administrativeTitleCase(d.DISTRICT_NAME)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phường/Xã <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={receiverInfo.receiverWardId}
                      onChange={(e) => handleWardChange(e.target.value)}
                      disabled={!receiverInfo.receiverDistrictId || loadingAddress}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-gray-100"
                    >
                      <option value="">-- Chọn Phường/Xã --</option>
                      {wards.map((w) => (
                        <option key={w.WARDS_ID} value={w.WARDS_ID}>
                          {administrativeTitleCase(w.WARDS_NAME)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {orderAddressType === 'NEW' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tỉnh/Thành phố <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={receiverInfo.receiverProvinceId}
                      onChange={(e) => {
                        const prov = dbProvincesNew.find(p => p.id === e.target.value);
                        const pn = prov?.name ? administrativeTitleCase(prov.name) : '';
                        setReceiverInfo(prev => ({...prev, receiverProvinceId: e.target.value, receiverProvinceName: pn, receiverDistrictId: '', receiverDistrictName: '', receiverWardId: '', receiverWardName: ''}));
                      }}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">-- Chọn Tỉnh/TP --</option>
                      {dbProvincesNew.map((p) => (
                        <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Phường/Xã <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={receiverInfo.receiverWardId}
                      onChange={(e) => {
                        const w = dbWards.find(w => w.id === e.target.value);
                        const wn = w?.name ? administrativeTitleCase(w.name) : '';
                        setReceiverInfo(prev => ({...prev, receiverWardId: e.target.value, receiverWardName: wn}));
                      }}
                      disabled={!receiverInfo.receiverProvinceId || loadingAddress}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-gray-100"
                    >
                      <option value="">{!receiverInfo.receiverProvinceId ? 'Chọn tỉnh trước' : loadingAddress ? 'Đang tải...' : '-- Chọn Phường/Xã --'}</option>
                      {dbWards.map((w) => (
                        <option key={w.id} value={w.id}>{administrativeTitleCase(w.name)}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {loadingAddress && (
                <div className="flex items-center gap-2 text-gray-500">
                  <RefreshCw className="animate-spin" size={16} />
                  <span>Đang tải địa chỉ...</span>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Shipping Service */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <Truck className="text-primary" size={20} />
                  Chọn dịch vụ vận chuyển
                </h3>
                <button
                  onClick={calculateShipping}
                  disabled={loadingServices}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                >
                  {loadingServices ? <RefreshCw className="animate-spin" size={16} /> : <Calculator size={16} />}
                  Tính phí
                </button>
              </div>

              {/* Weight input */}
              <div className="bg-gray-50 rounded-xl p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Weight size={16} />
                  Tổng khối lượng gửi Viettel Post (gram)
                </label>
                <input
                  type="number"
                  value={totalWeightGrams}
                  readOnly
                  className="w-full md:w-48 px-4 py-2 border-2 border-gray-200 rounded-lg bg-gray-100 cursor-not-allowed"
                  min="100"
                  step="100"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {isOutsideSystem
                    ? 'Tính từ trọng lượng × số lượng (bước Sản phẩm).'
                    : 'Tự tính từ khối lượng từng sản phẩm × số lượng trong giỏ (SP không có trọng lượng → 500g/đơn vị).'}
                </p>
              </div>

              {/* Shipping Services */}
              {shippingServices.length > 0 && (
                <div className="space-y-3">
                  {shippingServices.map((service) => (
                    <button
                      key={service.MA_DV_CHINH}
                      onClick={() => setSelectedService(service)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        selectedService?.MA_DV_CHINH === service.MA_DV_CHINH
                          ? 'border-primary bg-primary/5'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedService?.MA_DV_CHINH === service.MA_DV_CHINH
                              ? 'border-primary bg-primary'
                              : 'border-gray-300'
                          }`}>
                            {selectedService?.MA_DV_CHINH === service.MA_DV_CHINH && (
                              <Check size={12} className="text-white" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-900">{service.TEN_DICHVU}</div>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              <Clock size={14} />
                              {service.THOI_GIAN}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-primary">{formatCurrency(service.GIA_CUOC)}</div>
                          <div className="text-xs text-gray-500">{service.MA_DV_CHINH}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {loadingServices && (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <RefreshCw className="animate-spin mr-2" size={20} />
                  <span>Đang tính phí vận chuyển...</span>
                </div>
              )}

              {!loadingServices && shippingServices.length === 0 && receiverInfo.receiverDistrictId && (
                <div className="text-center py-8 text-gray-500">
                  <Truck size={48} className="mx-auto mb-2 text-gray-300" />
                  <p>Nhấn "Tính phí" để xem các dịch vụ vận chuyển</p>
                </div>
              )}

              {/* Order Summary */}
              <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-5 space-y-3">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <DollarSign size={18} />
                  Tổng kết đơn hàng
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{isOutsideSystem ? 'Tiền COD:' : 'Tiền hàng:'}</span>
                    <span className="font-medium">{formatCurrency(displayTotalAmount)}</span>
                  </div>
                  {displayDiscount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Giảm giá:</span>
                      <span>-{formatCurrency(displayDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Phí vận chuyển:</span>
                    <span className="font-medium">{formatCurrency(shippingFee)}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 flex justify-between">
                    <span className="font-semibold text-gray-800">Tổng thanh toán:</span>
                    <span className="text-xl font-bold text-primary">{formatCurrency(finalAmount)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={() => {
              const minStep = isOutsideSystem ? 2 : 1;
              step > minStep ? setStep(step - 1) : onClose();
            }}
            className="px-5 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {(isOutsideSystem ? step > 2 : step > 1) ? '← Quay lại' : 'Hủy'}
          </button>

          {step < 4 ? (
            <ToolbarButton
              variant="primary"
              className="px-6 py-2.5"
              onClick={() => {
                if (!canProceed()) {
                  if (step === 1 && !isOutsideSystem) setError('Vui lòng chọn khách hàng');
                  else if (step === 2) setError(isOutsideSystem ? 'Vui lòng nhập tên sản phẩm' : 'Vui lòng thêm sản phẩm');
                  else if (step === 3) setError('Vui lòng nhập đầy đủ thông tin địa chỉ');
                  return;
                }
                setError(null);
                setStep(step + 1);
                if (step === 3) {
                  setTimeout(calculateShipping, 100);
                }
              }}
            >
              Tiếp tục
              <ChevronRight size={18} />
            </ToolbarButton>
          ) : (
            <ToolbarButton
              variant="primary"
              onClick={handleSubmit}
              disabled={loading || (!isOutsideSystem && !selectedService)}
              className="px-6 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <RefreshCw className="animate-spin" size={18} />
                  Đang tạo...
                </>
              ) : (
                <>
                  <Check size={18} />
                  Tạo đơn hàng
                </>
              )}
            </ToolbarButton>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateOrderModal;
