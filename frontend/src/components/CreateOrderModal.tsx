import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  X, Search, Package, User, MapPin, Truck, Calculator,
  Plus, Minus, Check, RefreshCw, AlertCircle, ChevronRight,
  Phone, Home, Building2, Clock, DollarSign, Weight
} from 'lucide-react';
import { apiClient, ApiHttpError } from '../api/client';
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

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  detailAddress?: string | null;
  address?: string | null;
  province?: { id: string; name: string; code?: string } | null;
  ward?: { id: string; name: string; vtpDistrictId?: number | null } | null;
}

interface DbWardRow {
  id: string;
  name: string;
  vtpDistrictId?: number | null;
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
  /** Mở sẵn với khách (bỏ qua bước 1) — Sales / CSKH */
  initialCustomerId?: string | null;
  /** CSKH: `GET /resales/customer/:id` (VIEW_RESALES). Mặc định: `GET /customers/:id` (VIEW_CUSTOMERS). */
  bootstrapCustomerEndpoint?: 'customers' | 'resales';
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

/** Tổng tồn kho (cộng các kho); không có bản ghi tồn → 0 */
const getProductStockTotal = (product: Product): number => {
  if (!Array.isArray(product.stocks) || product.stocks.length === 0) return 0;
  return product.stocks.reduce((sum, s) => sum + (Number(s.quantity) > 0 ? Number(s.quantity) : 0), 0);
};

const CreateOrderModal = ({
  onClose,
  onSuccess,
  initialCustomerId,
  bootstrapCustomerEndpoint = 'customers',
}: CreateOrderModalProps) => {
  const [step, setStep] = useState(initialCustomerId ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(!!initialCustomerId);

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
  /** Đã cọc — trừ khỏi tiền thu hộ (COD) VTP, không giảm tổng hàng */
  const [depositAmount, setDepositAmount] = useState(0);
  const [note, setNote] = useState('');
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
  const [dbWards, setDbWards] = useState<DbWardRow[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const addressPrefillDoneRef = useRef<string | null>(null);

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

  /** Tổng khối lượng gửi VTP tính cước: Σ(weight×SL); SP không có weight → 500g/đơn vị */
  const totalWeightGrams = useMemo(() => {
    const t = orderItems.reduce((sum, { product, quantity }) => {
      const w = product.weight != null && Number(product.weight) > 0 ? Number(product.weight) : 500;
      return sum + w * quantity;
    }, 0);
    return Math.max(100, Math.round(t));
  }, [orderItems]);

  // Calculate totals
  const totalAmount = orderItems.reduce((sum, item) => sum + ((item.product.listPriceNet || 0) * item.quantity), 0);
  const shippingFee = selectedService?.GIA_CUOC || 0;
  const displayTotalAmount = totalAmount;
  const displayDiscount = discount;
  /** Giá trị hàng sau giảm (không gồm phí VC; khớp `finalAmount` backend) */
  const orderGoodsAfterDiscount = Math.max(0, displayTotalAmount - displayDiscount);
  /** Tiền VTP thu hộ: hàng sau giảm − cọc; phí VC thu tại shop không tính vào COD */
  const codAmountForVtp = Math.max(0, orderGoodsAfterDiscount - (Number(depositAmount) || 0));
  /** Hiển thị tổng khách thanh toán (hàng + phí VC nếu có) — khác COD */
  const displayPayableTotal = orderGoodsAfterDiscount + shippingFee;

  // Debounce ô tìm khách
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchCustomer), 300);
    return () => clearTimeout(t);
  }, [searchCustomer]);

  // Tải danh sách khách (có sẵn khi chưa gõ tìm; từ 2 ký tự gửi search lên API)
  useEffect(() => {
    if (step !== 1) return;
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
  }, [step, customerPage, customerLimit, debouncedSearch]);

  // Debounce ô tìm sản phẩm
  useEffect(() => {
    const t = setTimeout(() => setDebouncedProductSearch(searchProduct), 300);
    return () => clearTimeout(t);
  }, [searchProduct]);

  useEffect(() => {
    if (step !== 2 || !warehouseId) {
      if (step === 2 && !warehouseId) setProducts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setProductsLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(productPage),
          limit: String(productLimit),
          warehouseId: warehouseId || '', // Filter by selected warehouse
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
  }, [step, productPage, productLimit, debouncedProductSearch, warehouseId]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.get('/inventory/warehouses');
        if (!cancelled && Array.isArray(res)) setWarehouses(res as WarehouseOption[]);
      } catch {
        if (!cancelled) setWarehouses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialCustomerId?.trim()) {
      setBootstrapLoading(false);
      return;
    }
    let cancelled = false;
    setBootstrapLoading(true);
    setError(null);
    void (async () => {
      try {
        const path =
          bootstrapCustomerEndpoint === 'resales'
            ? `/resales/customer/${initialCustomerId.trim()}`
            : `/customers/${initialCustomerId.trim()}`;
        const data = (await apiClient.get(path)) as Customer;
        if (cancelled) return;
        setSelectedCustomer(data);
        setStep(2);
      } catch {
        if (!cancelled) {
          setError('Không tải được khách hàng. Bạn vẫn có thể chọn khách ở bước 1.');
          setStep(1);
        }
      } finally {
        if (!cancelled) setBootstrapLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCustomerId, bootstrapCustomerEndpoint]);

  useEffect(() => {
    addressPrefillDoneRef.current = null;
  }, [selectedCustomer?.id]);

  /** Tự điền địa chỉ khi vào bước 3 (một lần mỗi khách); vẫn chỉnh sửa được. */
  useEffect(() => {
    if (step !== 3 || !selectedCustomer) return;
    if (addressPrefillDoneRef.current === selectedCustomer.id) return;

    const c = selectedCustomer;
    const addrLine = c.addressRecord?.detail || c.address || '';
    setReceiverInfo((prev) => ({
      ...prev,
      receiverName: c.name ?? '',
      receiverPhone: c.phone ?? '',
      receiverAddress: addrLine || prev.receiverAddress,
    }));

    const applyOldVtpChain = async (
      vtpProvinceId: string,
      vtpDistrictId: string,
      vtpWardId: string,
      names: { prov?: string; dist?: string; ward?: string }
    ) => {
      setOrderAddressType('OLD');
      setReceiverInfo((prev) => ({
        ...prev,
        receiverProvinceId: vtpProvinceId,
        receiverProvinceName: names.prov ? administrativeTitleCase(names.prov) : prev.receiverProvinceName,
      }));
      try {
        setLoadingAddress(true);
        const dres: any = await apiClient.get(
          `/vtp/districts?provinceId=${encodeURIComponent(vtpProvinceId)}`
        );
        const rows = dres?.success && dres?.data ? dres.data : [];
        setDistricts(rows);
        const dRow = rows.find((d: { DISTRICT_ID: number }) => String(d.DISTRICT_ID) === vtpDistrictId);
        setReceiverInfo((prev) => ({
          ...prev,
          receiverDistrictId: vtpDistrictId,
          receiverDistrictName: dRow?.DISTRICT_NAME
            ? administrativeTitleCase(String(dRow.DISTRICT_NAME))
            : names.dist
              ? administrativeTitleCase(names.dist)
              : '',
        }));
        const wres: any = await apiClient.get(
          `/vtp/wards?districtId=${encodeURIComponent(vtpDistrictId)}`
        );
        const wRows = wres?.success && wres?.data ? wres.data : [];
        setWards(wRows);
        const wRow = wRows.find((w: { WARDS_ID: number }) => String(w.WARDS_ID) === vtpWardId);
        setReceiverInfo((prev) => ({
          ...prev,
          receiverWardId: vtpWardId,
          receiverWardName: wRow?.WARDS_NAME
            ? administrativeTitleCase(String(wRow.WARDS_NAME))
            : names.ward
              ? administrativeTitleCase(names.ward)
              : '',
        }));
      } catch (e) {
        console.error('Prefill OLD address', e);
      } finally {
        setLoadingAddress(false);
      }
    };

    void (async () => {
      try {
        let provincesNew: Array<{ id: string; name: string }> = dbProvincesNew;
        if (!provincesNew.length) {
          try {
            const res = await apiClient.get('/address/provinces?directOnly=1');
            provincesNew = Array.isArray(res) ? res : [];
            setDbProvincesNew(provincesNew);
          } catch {
            provincesNew = [];
          }
        }

        const ar = c.addressRecord;
        if (ar?.type === 'NEW' && ar.provinceId && ar.wardId) {
          setOrderAddressType('NEW');
          const prov = provincesNew.find((p) => p.id === ar.provinceId);
          setReceiverInfo((prev) => ({
            ...prev,
            receiverProvinceId: ar.provinceId,
            receiverProvinceName: prov?.name ? administrativeTitleCase(prov.name) : prev.receiverProvinceName,
            receiverDistrictId: ar.ward?.vtpDistrictId != null ? String(ar.ward.vtpDistrictId) : '',
            receiverDistrictName: '',
            receiverWardId: ar.wardId,
            receiverWardName: ar.ward?.name ? administrativeTitleCase(ar.ward.name) : '',
          }));
          return;
        }
        if (!ar && c.province?.id && c.ward?.id) {
          const isNew = c.ward?.districtId == null || c.ward?.districtId === '';
          if (isNew) {
            setOrderAddressType('NEW');
            const prov = provincesNew.find((p) => p.id === c.province!.id);
            setReceiverInfo((prev) => ({
              ...prev,
              receiverProvinceId: c.province!.id,
              receiverProvinceName: prov?.name ? administrativeTitleCase(prov.name) : '',
              receiverDistrictId: c.ward?.vtpDistrictId != null ? String(c.ward.vtpDistrictId) : '',
              receiverDistrictName: '',
              receiverWardId: c.ward!.id,
              receiverWardName: c.ward?.name ? administrativeTitleCase(c.ward.name) : '',
            }));
            return;
          }
        }
        if (ar?.type === 'OLD' && ar.provinceId && ar.districtId && ar.wardId) {
          await applyOldVtpChain(String(ar.provinceId), String(ar.districtId), String(ar.wardId), {
            prov: ar.province?.name,
            dist: ar.district?.name ?? undefined,
            ward: ar.ward?.name,
          });
          return;
        }
        if (
          !ar &&
          c.province?.id &&
          c.district?.id &&
          c.ward?.id &&
          c.ward.districtId != null &&
          c.ward.districtId !== ''
        ) {
          await applyOldVtpChain(String(c.province.id), String(c.district.id), String(c.ward.id), {
            prov: c.province.name,
            dist: c.district.name ?? undefined,
            ward: c.ward.name,
          });
        }
      } finally {
        addressPrefillDoneRef.current = selectedCustomer.id;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lại khi đổi bước/khách; đọc dbProvincesNew một lần trong async
  }, [step, selectedCustomer?.id]);

  // Calculate shipping fee — điểm gửi lấy từ kho đã chọn (API), không dùng mặc định env
  const calculateShipping = useCallback(async () => {
    if (!warehouseId) {
      setError('Vui lòng chọn kho gửi hàng trước khi tính cước.');
      return;
    }
    if (!receiverInfo.receiverProvinceId || !receiverInfo.receiverWardId) {
      return;
    }
    if (orderAddressType === 'OLD' && !receiverInfo.receiverDistrictId) {
      return;
    }

    try {
      setLoadingServices(true);
      setError(null);

      const response: any = await apiClient.post('/vtp/calculate-fee', {
        warehouseId,
        receiverProvince: receiverInfo.receiverProvinceId,
        receiverDistrict:
          orderAddressType === 'OLD'
            ? receiverInfo.receiverDistrictId
            : receiverInfo.receiverDistrictId || undefined,
        receiverWard: receiverInfo.receiverWardId,
        productWeight: totalWeightGrams,
        productPrice: codAmountForVtp,
        moneyCollection: codAmountForVtp,
      });

      if (Array.isArray(response)) {
        setShippingServices(response);
        if (response.length > 0) {
          const cheapest = response.reduce((min, s) => s.GIA_CUOC < min.GIA_CUOC ? s : min, response[0]);
          setSelectedService(cheapest);
        }
      }
    } catch (error: unknown) {
      console.error('Error calculating shipping:', error);
      const msg =
        error instanceof ApiHttpError
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error && typeof (error as Error).message === 'string'
            ? (error as Error).message
            : 'Không thể tính phí vận chuyển. Kiểm tra kho gửi và địa chỉ nhận (V3 cần xã có mã huyện VTP sau đồng bộ).';
      setError(msg);
    } finally {
      setLoadingServices(false);
    }
  }, [
    warehouseId,
    receiverInfo.receiverProvinceId,
    receiverInfo.receiverDistrictId,
    receiverInfo.receiverWardId,
    orderAddressType,
    totalWeightGrams,
    codAmountForVtp,
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

  /** Chỉ điền họ tên, SĐT, địa chỉ dòng — không ghi đè tỉnh/huyện/xã đã chọn. */
  const useCustomerTextOnly = () => {
    if (selectedCustomer) {
      const line = selectedCustomer.addressRecord?.detail || selectedCustomer.address || '';
      setReceiverInfo((prev) => ({
        ...prev,
        receiverName: selectedCustomer.name,
        receiverPhone: selectedCustomer.phone,
        receiverAddress: line || prev.receiverAddress,
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
    if (!selectedCustomer) {
      setError('Vui lòng chọn khách hàng');
      return;
    }
    if (orderItems.length === 0) {
      setError('Vui lòng thêm sản phẩm');
      return;
    }
    if (!receiverInfo.receiverName || !receiverInfo.receiverPhone || !receiverInfo.receiverAddress) {
      setError('Vui lòng nhập đầy đủ thông tin người nhận');
      return;
    }
    if (!warehouseId) {
      setError('Vui lòng chọn kho gửi hàng (bắt buộc).');
      return;
    }
    if (!receiverInfo.receiverProvinceId || !receiverInfo.receiverWardId) {
      setError('Vui lòng chọn đủ địa chỉ (tỉnh, phường/xã).');
      return;
    }
    if (orderAddressType === 'OLD' && !receiverInfo.receiverDistrictId) {
      setError('Vui lòng chọn đầy đủ địa chỉ (Tỉnh/Quận/Phường).');
      return;
    }

    const receiverProvinceIdNum = (() => {
      const raw = receiverInfo.receiverProvinceId;
      const n = parseInt(String(raw), 10);
      if (Number.isFinite(n) && n > 0) return n;
      const p = dbProvincesNew.find((x) => x.id === raw);
      return p ? parseInt(String(p.id), 10) : NaN;
    })();
    const receiverWardIdNum = parseInt(String(receiverInfo.receiverWardId), 10);
    const receiverDistrictIdNum = receiverInfo.receiverDistrictId
      ? parseInt(String(receiverInfo.receiverDistrictId), 10)
      : NaN;

    try {
      setLoading(true);
      setError(null);

      const data: CreateOrderData = {
        customerId: selectedCustomer!.id,
        items: orderItems.map(item => ({ productId: item.product.id, quantity: item.quantity })),
        discount,
        depositAmount: Math.max(0, Number(depositAmount) || 0),
        shippingFee: shippingFee > 0 ? shippingFee : undefined,
        note,
        receiverName: receiverInfo.receiverName,
        receiverPhone: receiverInfo.receiverPhone,
        receiverAddress: receiverInfo.receiverAddress,
        receiverProvince: receiverInfo.receiverProvinceName,
        receiverDistrict:
          orderAddressType === 'NEW'
            ? receiverInfo.receiverDistrictName || '—'
            : receiverInfo.receiverDistrictName,
        receiverWard: receiverInfo.receiverWardName,
        receiverProvinceId: Number.isFinite(receiverProvinceIdNum) ? receiverProvinceIdNum : undefined,
        receiverDistrictId:
          Number.isFinite(receiverDistrictIdNum) ? receiverDistrictIdNum : undefined,
        receiverWardId: Number.isFinite(receiverWardIdNum) ? receiverWardIdNum : undefined,
        warehouseId,
      };
      await orderApi.createOrder(data);
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
      case 1: return !!selectedCustomer;
      case 2: return !!warehouseId && orderItems.length > 0;
      case 3: {
        if (!warehouseId) return false;
        const base =
          !!receiverInfo.receiverName &&
          !!receiverInfo.receiverPhone &&
          !!receiverInfo.receiverAddress &&
          !!receiverInfo.receiverProvinceId &&
          !!receiverInfo.receiverWardId;
        if (!base) return false;
        if (orderAddressType === 'OLD') return !!receiverInfo.receiverDistrictId;
        return true;
      }
      default: return true;
    }
  };

  const progressSteps = [
    { num: 1, label: 'Khách hàng', icon: User },
    { num: 2, label: 'Sản phẩm', icon: Package },
    { num: 3, label: 'Địa chỉ', icon: MapPin },
    { num: 4, label: 'Vận chuyển', icon: Truck },
  ];

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

        {selectedCustomer && step >= 2 && (
          <div className="px-6 py-2 bg-white/10 border-t border-white/10 flex flex-wrap items-center gap-2 text-white text-sm">
            <span className="opacity-90">Khách:</span>
            <span className="font-medium">{selectedCustomer.name || '—'}</span>
            <span className="opacity-80">·</span>
            <span>{selectedCustomer.phone}</span>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="ml-auto text-xs underline hover:no-underline opacity-90 hover:opacity-100"
            >
              Đổi khách hàng
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          {bootstrapLoading && (
            <div className="absolute inset-0 bg-white/70 z-10 flex items-center justify-center gap-2 text-gray-600">
              <RefreshCw className="animate-spin" size={22} />
              <span>Đang tải khách hàng…</span>
            </div>
          )}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center gap-3">
              <AlertCircle size={20} />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-100 rounded">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Step 1: Customer */}
          {step === 1 && (
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
              <>
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-1 flex items-center gap-2">
                  <Building2 className="text-primary" size={20} />
                  Chọn kho & sẩn phẩm
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  Bắt buộc chọn kho trước khi thêm sản phẩm. Sản phẩm hiển thị sẽ được lọc theo kho đã chọn.
                </p>

                {/* Warehouse Selector */}
                <div className="mb-6 bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                    <Building2 size={16} />
                    Kho gửi hàng <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={warehouseId}
                      onChange={(e) => {
                        if (orderItems.length > 0 && e.target.value !== warehouseId) {
                          if (!window.confirm('Thay đổi kho sẽ làm mới giỏ hàng (vì sản phẩm gắn liền với kho). Tiếp tục?')) return;
                          setOrderItems([]);
                        }
                        setWarehouseId(e.target.value);
                      }}
                      className="flex-1 rounded-xl border-2 border-gray-200 px-4 py-2.5 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="" disabled>-- Chọn kho gửi (bắt buộc) --</option>
                      {warehouses.map((w) => (
                        <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                      ))}
                    </select>
                  </div>
                  {warehouseId && (
                    <div className="mt-2 text-xs text-primary flex items-center gap-1">
                      <Check size={14} />
                      Đã chọn kho. Bạn có thể tìm sản phẩm bên dưới.
                    </div>
                  )}
                </div>

                {!warehouseId ? (
                  <div className="py-12 text-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50">
                    <Building2 className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <h4 className="text-gray-500 font-medium">Vui lòng chọn kho để bắt đầu</h4>
                    <p className="text-xs text-gray-400 mt-1">Sản phẩm thuộc kho nào mới có thể xuất từ kho đó</p>
                  </div>
                ) : (
                  <>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <Package size={16} />
                      Thêm sản phẩm từ kho đã chọn
                    </h4>
                    {stockWarning && (
                      <div className="mb-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <AlertCircle className="shrink-0 mt-0.5" size={18} />
                        <span>{stockWarning}</span>
                      </div>
                    )}

                    <div className="relative mb-4">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                      <input
                        type="text"
                        placeholder="Tìm sản phẩm trong kho này..."
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
                  </>
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

              {/* Discount, deposit & Note */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Đã cọc trước (VNĐ)
                  </label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/20"
                    min="0"
                    title="Trừ khỏi tiền thu hộ (COD) khi đẩy Viettel Post; không giảm tổng giá trị hàng trên đơn"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">Trừ khỏi COD; không làm giảm tổng hàng.</p>
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
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <div>
                    <span className="text-gray-600">Giá trị hàng sau giảm:</span>
                    {discount > 0 && (
                      <span className="ml-2 text-sm text-red-500">(-{formatCurrency(discount)})</span>
                    )}
                  </div>
                  <span className="text-2xl font-bold text-primary">{formatCurrency(orderGoodsAfterDiscount)}</span>
                </div>
                {(Number(depositAmount) || 0) > 0 && (
                  <p className="text-xs text-gray-600 mt-2">
                    Tiền thu hộ (COD) dự kiến:{' '}
                    <span className="font-semibold text-primary">{formatCurrency(codAmountForVtp)}</span>
                    {' '}(sau khi trừ cọc; phí VC tính riêng)
                  </p>
                )}
              </div>
              </>
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
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={useCustomerTextOnly}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <User size={14} />
                    Điền lại họ tên, SĐT, địa chỉ từ khách
                  </button>
                )}
              </div>

              <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                  <Building2 size={18} className="text-primary" />
                  Kho gửi hàng đã chọn
                </h4>
                <div className="text-sm text-gray-700">
                  {warehouseId 
                    ? warehouses.find(w => w.id === warehouseId)?.name || 'N/A'
                    : 'Chưa chọn kho (vui lòng quay lại bước 2)'
                  }
                </div>
                <p className="mt-1 text-[11px] text-gray-500">
                  Địa chỉ kho được dùng làm điểm gửi khi tạo vận đơn Viettel Post.
                </p>
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
                        <option key={p.PROVINCE_ID} value={String(p.PROVINCE_ID)}>
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
                        <option key={d.DISTRICT_ID} value={String(d.DISTRICT_ID)}>
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
                        <option key={w.WARDS_ID} value={String(w.WARDS_ID)}>
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
                        const w = dbWards.find((x) => x.id === e.target.value);
                        const wn = w?.name ? administrativeTitleCase(w.name) : '';
                        const vtpD = (w as any)?.vtpDistrictId;
                        setReceiverInfo((prev) => ({
                          ...prev,
                          receiverWardId: e.target.value,
                          receiverWardName: wn,
                          receiverDistrictId:
                            vtpD != null && vtpD !== undefined ? String(vtpD) : '',
                          receiverDistrictName: '',
                        }));
                        setShippingServices([]);
                        setSelectedService(null);
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
                  Tự tính từ khối lượng từng sản phẩm × số lượng trong giỏ (SP không có trọng lượng → 500g/đơn vị).
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

              {!loadingServices &&
                shippingServices.length === 0 &&
                (orderAddressType === 'OLD' ? receiverInfo.receiverDistrictId : receiverInfo.receiverWardId) && (
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
                    <span className="text-gray-600">Tiền hàng:</span>
                    <span className="font-medium">{formatCurrency(displayTotalAmount)}</span>
                  </div>
                  {displayDiscount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Giảm giá:</span>
                      <span>-{formatCurrency(displayDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-800">
                    <span className="font-medium">Sau giảm:</span>
                    <span className="font-medium">{formatCurrency(orderGoodsAfterDiscount)}</span>
                  </div>
                  {(Number(depositAmount) || 0) > 0 && (
                    <div className="flex justify-between text-amber-800">
                      <span>Đã cọc (trừ COD):</span>
                      <span className="font-medium">-{formatCurrency(Number(depositAmount) || 0)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-dashed border-gray-200 pt-2">
                    <span className="text-gray-800 font-medium">Tiền thu hộ (COD) — Viettel Post:</span>
                    <span className="font-bold text-primary">{formatCurrency(codAmountForVtp)}</span>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Phí vận chuyển thu tại shop không tính vào COD (khách thanh toán shop riêng).
                  </p>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Phí vận chuyển (tham khảo):</span>
                    <span className="font-medium">{formatCurrency(shippingFee)}</span>
                  </div>
                  <div className="pt-2 border-t border-gray-200 flex justify-between">
                    <span className="font-semibold text-gray-800">Tổng khách thanh toán (hàng + phí VC):</span>
                    <span className="text-xl font-bold text-primary">{formatCurrency(displayPayableTotal)}</span>
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
              step > 1 ? setStep(step - 1) : onClose();
            }}
            className="px-5 py-2.5 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {step > 1 ? '← Quay lại' : 'Hủy'}
          </button>

          {step < 4 ? (
            <ToolbarButton
              variant="primary"
              className="px-6 py-2.5"
              onClick={() => {
                if (!canProceed()) {
                  if (step === 1) setError('Vui lòng chọn khách hàng');
                  else if (step === 2) setError('Vui lòng thêm sản phẩm');
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
              disabled={loading || !selectedService}
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
