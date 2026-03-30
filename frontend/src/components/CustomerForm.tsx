import { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../api/client';
import { 
  X, User, Phone, Mail, MapPin, Sprout, Building2, 
  Save, Loader, ChevronDown, ChevronUp, Tag, Plus
} from 'lucide-react';
import { CustomerTagSelector } from './CustomerTags';
import { ToolbarButton } from './ui/ToolbarButton';
import { buildWardDuplicateNameKeys, wardSelectLabel } from '../utils/wardOptionLabel';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';
import { CROP_DEFS, CROP_GROUPS_ORDER, ROOT_COUNTABLE_CROPS } from '../constants/cropConfigs';

interface Province {
  id: string;
  name: string;
}

interface District {
  id: string;
  name: string;
  provinceId: string;
}

interface Ward {
  id: string;
  name: string;
  code?: string | null;
  districtId?: string | null;
  /** API gộp xã trùng nghĩa (sau sáp nhập): mọi id tương đương, id chọn là `id` */
  mergedFromIds?: string[];
}

type AddressType = 'OLD' | 'NEW';

interface CustomerFormData {
  phone: string;
  name: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  addressType: AddressType;
  wardId: string;
  districtId: string;
  provinceId: string;
  farmName: string;
  farmArea: string;
  farmAreaUnit: string;
  mainCrops: string[];
  mainCropsRootCounts: Record<string, number>;
  farmingYears: string;
  farmingMethod: string;
  irrigationType: string;
  soilType: string;
  businessType: string;
  taxCode: string;
  bankAccount: string;
  bankName: string;
  salesChannel: string;
  salesChannelNote: string;
  note: string;
  tagIds: string[];
}

interface Props {
  customerId?: string;
  onClose: () => void;
  onSaved: () => void;
  /** Đồng bộ danh sách thẻ sau khi CRUD thẻ ở modal quản lý. */
  tagRefreshSignal?: number;
}

const FARMING_METHODS = [
  { value: 'TRADITIONAL', label: 'Truyền thống' },
  { value: 'ORGANIC', label: 'Hữu cơ' },
  { value: 'HYDROPONIC', label: 'Thủy canh' },
  { value: 'GREENHOUSE', label: 'Nhà kính' },
];

const IRRIGATION_TYPES = [
  { value: 'MANUAL', label: 'Tưới tay' },
  { value: 'DRIP', label: 'Tưới nhỏ giọt' },
  { value: 'SPRINKLER', label: 'Tưới phun' },
  { value: 'FLOOD', label: 'Tưới ngập' },
];

const SOIL_TYPES = [
  { value: 'CLAY', label: 'Đất sét' },
  { value: 'SANDY', label: 'Đất cát' },
  { value: 'LOAMY', label: 'Đất thịt' },
  { value: 'ALLUVIAL', label: 'Đất phù sa' },
];

const AREA_UNITS = [
  { value: 'ha', label: 'Hecta (ha)' },
  { value: 'm2', label: 'Mét vuông (m²)' },
  { value: 'cong', label: 'Công' },
  { value: 'sao', label: 'Sào' },
];

const BUSINESS_TYPES = [
  { value: 'INDIVIDUAL', label: 'Cá nhân' },
  { value: 'COOPERATIVE', label: 'Hợp tác xã' },
  { value: 'COMPANY', label: 'Doanh nghiệp' },
];

const SALES_CHANNELS = [
  { value: 'REFERRAL', label: 'Giới thiệu (từ KH cũ, đối tác)' },
  { value: 'WALK_IN', label: 'Khách đến trực tiếp' },
  { value: 'COLD_CALL', label: 'Gọi điện (cold call)' },
  { value: 'SOCIAL_MEDIA', label: 'MXH cá nhân nhân viên' },
  { value: 'EVENT', label: 'Sự kiện / hội thảo' },
  { value: 'FIELD_VISIT', label: 'Khảo sát thực địa' },
  { value: 'RETURNING', label: 'Khách hàng cũ quay lại' },
];

const KNOWN_CROP_SET = new Set(CROP_DEFS.map((c) => c.value));

const CustomerForm = ({ customerId, onClose, onSaved, tagRefreshSignal = 0 }: Props) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [useCustomChannel, setUseCustomChannel] = useState(false);
  
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);
  const wardNameDupKeys = useMemo(() => buildWardDuplicateNameKeys(wards), [wards]);
  const [customCrops, setCustomCrops] = useState<string[]>([]);
  const [newCropInput, setNewCropInput] = useState('');
  const [useCustomUnit, setUseCustomUnit] = useState(false);
  const [useCustomSoilType, setUseCustomSoilType] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    address: true,
    farming: false,
    business: false,
    salesChannel: true,
    tags: true,
  });

  const [form, setForm] = useState<CustomerFormData>({
    phone: '',
    name: '',
    email: '',
    dateOfBirth: '',
    gender: '',
    address: '',
    addressType: 'OLD',
    wardId: '',
    districtId: '',
    provinceId: '',
    farmName: '',
    farmArea: '',
    farmAreaUnit: 'ha',
    mainCrops: [],
    mainCropsRootCounts: {},
    farmingYears: '',
    farmingMethod: '',
    irrigationType: '',
    soilType: '',
    businessType: '',
    taxCode: '',
    bankAccount: '',
    bankName: '',
    salesChannel: '',
    salesChannelNote: '',
    note: '',
    tagIds: [],
  });

  useEffect(() => {
    loadInitialData();
    if (customerId) {
      loadCustomer();
    }
  }, [customerId]);

  useEffect(() => {
    if (form.provinceId && form.addressType === 'OLD') {
      loadDistricts(form.provinceId);
      setWards([]);
    }
    if (form.provinceId && form.addressType === 'NEW') {
      loadWardsByProvince(form.provinceId);
      setDistricts([]);
    }
    if (!form.provinceId) {
      setDistricts([]);
      setWards([]);
    }
  }, [form.provinceId, form.addressType]);

  useEffect(() => {
    if (form.districtId && form.addressType === 'OLD') {
      loadWards(form.districtId);
    } else if (!form.districtId && form.addressType === 'OLD') {
      setWards([]);
    }
  }, [form.districtId, form.addressType]);

  /** Khách lưu ward_id trỏ bản ghi “trùng nghĩa” (khác id chuẩn) — map sang id dòng đang hiển thị */
  useEffect(() => {
    if (form.addressType !== 'NEW' || !form.provinceId || !form.wardId || !wards.length) return;
    if (wards.some(w => w.id === form.wardId)) return;
    const row = wards.find(w => w.mergedFromIds?.includes(form.wardId));
    if (row) setForm(prev => ({ ...prev, wardId: row.id }));
  }, [wards, form.addressType, form.provinceId, form.wardId]);

  const loadInitialData = async () => {
    try {
      const provincesData = await apiClient.get('/address/provinces');
      setProvinces(provincesData || []);
    } catch (error) {
      console.error('Load initial data error:', error);
    }
  };

  const loadDistricts = async (provinceId: string) => {
    try {
      setLoadingDistricts(true);
      const data = await apiClient.get(`/address/districts?provinceId=${provinceId}`);
      setDistricts(data || []);
    } catch (error) {
      console.error('Load districts error:', error);
      setDistricts([]);
    } finally {
      setLoadingDistricts(false);
    }
  };

  const loadWards = async (districtId: string) => {
    try {
      setLoadingWards(true);
      const data = await apiClient.get(`/address/wards?districtId=${districtId}`);
      setWards(data || []);
    } catch (error) {
      console.error('Load wards error:', error);
      setWards([]);
    } finally {
      setLoadingWards(false);
    }
  };

  const loadWardsByProvince = async (provinceId: string) => {
    try {
      setLoadingWards(true);
      const data = await apiClient.get(
        `/address/wards?provinceId=${encodeURIComponent(provinceId)}&directOnly=1`
      );
      setWards(data || []);
    } catch (error) {
      console.error('Load wards by province error:', error);
      setWards([]);
    } finally {
      setLoadingWards(false);
    }
  };

  const loadCustomer = async () => {
    try {
      setLoading(true);
      const customer = await apiClient.get(`/customers/${customerId}`);
      
      const unitInList = AREA_UNITS.some(u => u.value === customer.farmAreaUnit);
      const soilInList = SOIL_TYPES.some(s => s.value === customer.soilType);
      
      if (customer.farmAreaUnit && !unitInList) {
        setUseCustomUnit(true);
      }
      if (customer.soilType && !soilInList) {
        setUseCustomSoilType(true);
      }

      const knownCrops = KNOWN_CROP_SET;
      const customerCrops: string[] = customer.mainCrops || [];
      const extraCrops = customerCrops.filter((c: string) => !knownCrops.has(c));
      if (extraCrops.length > 0) {
        setCustomCrops(extraCrops);
      }

      setForm({
        phone: customer.phone || '',
        name: customer.name || '',
        email: customer.email || '',
        dateOfBirth: customer.dateOfBirth ? customer.dateOfBirth.split('T')[0] : '',
        gender: customer.gender || '',
        address: customer.address || '',
        addressType: customer.districtId ? 'OLD' : 'NEW',
        wardId: customer.wardId || '',
        districtId: customer.districtId || '',
        provinceId: customer.provinceId || '',
        farmName: customer.farmName || '',
        farmArea: customer.farmArea?.toString() || '',
        farmAreaUnit: customer.farmAreaUnit || 'ha',
        mainCrops: customer.mainCrops || [],
        mainCropsRootCounts: customer.mainCropsRootCounts || {},
        farmingYears: customer.farmingYears?.toString() || '',
        farmingMethod: customer.farmingMethod || '',
        irrigationType: customer.irrigationType || '',
        soilType: customer.soilType || '',
        businessType: customer.businessType || '',
        taxCode: customer.taxCode || '',
        bankAccount: customer.bankAccount || '',
        bankName: customer.bankName || '',
        salesChannel: customer.salesChannel || '',
        salesChannelNote: customer.salesChannelNote || '',
        note: customer.note || '',
        tagIds: customer.tags?.map((t: any) => t.tagId) || [],
      });

      const channelInList = SALES_CHANNELS.some(c => c.value === customer.salesChannel);
      if (customer.salesChannel && !channelInList) {
        setUseCustomChannel(true);
      }
      
      setExpandedSections(prev => ({
        ...prev,
        farming: !!(customer.farmName || customer.farmArea || customer.mainCrops?.length),
        business: !!(customer.taxCode || customer.bankAccount),
        salesChannel: !!customer.salesChannel,
      }));
    } catch (error) {
      console.error('Load customer error:', error);
      alert('Không thể tải thông tin khách hàng');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!form.phone) {
      alert('Số điện thoại là bắt buộc');
      return;
    }

    if (!form.salesChannel) {
      alert('Vui lòng chọn hoặc nhập kênh tiếp cận khách hàng');
      setExpandedSections(prev => ({ ...prev, salesChannel: true }));
      return;
    }

    if (!form.businessType) {
      alert('Vui lòng chọn loại hình kinh doanh');
      setExpandedSections(prev => ({ ...prev, business: true }));
      return;
    }

    if (form.tagIds.length === 0) {
      alert('Vui lòng chọn ít nhất một thẻ khách hàng');
      return;
    }

    if (form.mainCrops.length === 0) {
      alert('Vui lòng chọn cây trồng chính (bắt buộc)');
      setExpandedSections((prev) => ({ ...prev, farming: true }));
      return;
    }

    const hasFarmData = form.farmName || form.farmArea || form.mainCrops.length > 0 || form.farmingYears || form.soilType;
    if (hasFarmData) {
      const missing: string[] = [];
      if (!form.farmArea) missing.push('Diện tích');
      if (!form.farmAreaUnit) missing.push('Đơn vị diện tích');
      if (!form.farmingYears) missing.push('Số năm kinh nghiệm');
      if (!form.soilType) missing.push('Loại đất');

      const selectedRootCrops = form.mainCrops.filter((c) => ROOT_COUNTABLE_CROPS.has(c));
      for (const crop of selectedRootCrops) {
        const rootCount = form.mainCropsRootCounts?.[crop];
        if (!Number.isFinite(rootCount) || (rootCount as number) <= 0) {
          missing.push(`Số gốc (${crop})`);
        }
      }

      if (missing.length > 0) {
        alert(`Vui lòng điền đầy đủ thông tin nông nghiệp bắt buộc:\n- ${missing.join('\n- ')}`);
        setExpandedSections(prev => ({ ...prev, farming: true }));
        return;
      }
    }

    try {
      setSaving(true);
      const payload = {
        ...form,
        farmArea: form.farmArea ? parseFloat(form.farmArea) : null,
        farmingYears: form.farmingYears ? parseInt(form.farmingYears) : null,
      };

      if (customerId) {
        await apiClient.put(`/customers/${customerId}`, payload);
      } else {
        await apiClient.post('/customers', payload);
      }
      
      onSaved();
      onClose();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi lưu khách hàng');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const toggleCrop = (crop: string) => {
    setForm((prev) => {
      const isSelected = prev.mainCrops.includes(crop);
      const nextMainCrops = isSelected
        ? prev.mainCrops.filter((c) => c !== crop)
        : [...prev.mainCrops, crop];

      // Chỉ các cây "tính theo gốc" mới có yêu cầu số gốc
      const nextRootCounts = { ...prev.mainCropsRootCounts };
      if (isSelected) {
        delete nextRootCounts[crop];
      } else if (ROOT_COUNTABLE_CROPS.has(crop)) {
        // Default 0 để UI hiển thị lỗi bắt buộc nhập
        nextRootCounts[crop] = nextRootCounts[crop] ?? 0;
      }

      return {
        ...prev,
        mainCrops: nextMainCrops,
        mainCropsRootCounts: nextRootCounts,
      };
    });
  };

  const addCustomCrop = () => {
    const trimmed = newCropInput.trim();
    if (!trimmed) return;
    if (KNOWN_CROP_SET.has(trimmed)) {
      if (!form.mainCrops.includes(trimmed)) {
        setForm((prev) => ({ ...prev, mainCrops: [...prev.mainCrops, trimmed] }));
      }
      setNewCropInput('');
      return;
    }

    setCustomCrops((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
    if (!form.mainCrops.includes(trimmed)) {
      setForm((prev) => ({ ...prev, mainCrops: [...prev.mainCrops, trimmed] }));
    }
    setNewCropInput('');
  };

  const handleAddressTypeChange = (type: AddressType) => {
    setForm(prev => ({ ...prev, addressType: type, districtId: '', wardId: '' }));
    setDistricts([]);
    setWards([]);
  };

  const cropGroups = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const g of CROP_GROUPS_ORDER) map[g] = [];
    for (const def of CROP_DEFS) map[def.group].push(def.value);
    map['Khác'] = customCrops;
    return map;
  }, [customCrops]);

  const selectedRootCrops = form.mainCrops.filter((c) => ROOT_COUNTABLE_CROPS.has(c));

  const SectionHeader = ({ 
    title, 
    icon: Icon, 
    section,
    required
  }: { 
    title: string; 
    icon: any; 
    section: keyof typeof expandedSections;
    required?: boolean;
  }) => (
    <button
      type="button"
      onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between py-3 text-left"
    >
      <div className="flex items-center gap-2 font-medium text-gray-700">
        <Icon className="w-5 h-5 text-indigo-600" />
        {title}
        {required && <span className="text-red-500">*</span>}
      </div>
      {expandedSections[section] ? (
        <ChevronUp className="w-5 h-5 text-gray-400" />
      ) : (
        <ChevronDown className="w-5 h-5 text-gray-400" />
      )}
    </button>
  );

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl p-8">
          <Loader className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-green-500 to-emerald-600">
          <h2 className="text-xl font-semibold text-white">
            {customerId ? 'Cập nhật khách hàng' : 'Thêm khách hàng mới'}
          </h2>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-1">
            {/* Basic Info - Thứ tự: Họ tên -> SĐT -> Ghi chú -> Giới tính -> Email -> Ngày sinh */}
            <div className="border-b">
              <SectionHeader title="Thông tin cơ bản" icon={User} section="basic" />
              {expandedSections.basic && (
                <div className="pb-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Họ và tên
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder="Nguyễn Văn A"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Số điện thoại <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="0912345678"
                        required
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ghi chú
                    </label>
                    <textarea
                      value={form.note}
                      onChange={(e) => setForm({ ...form, note: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder="Ghi chú về khách hàng (sẽ lưu vào lịch sử tác động)..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Giới tính
                    </label>
                    <select
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Chọn giới tính</option>
                      <option value="MALE">Nam</option>
                      <option value="FEMALE">Nữ</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="email@example.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ngày sinh
                    </label>
                    <input
                      type="date"
                      value={form.dateOfBirth}
                      onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Address */}
            <div className="border-b">
              <SectionHeader title="Địa chỉ" icon={MapPin} section="address" />
              {expandedSections.address && (
                <div className="pb-4 space-y-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Loại địa chỉ hành chính <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-4">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="addressType"
                          value="OLD"
                          checked={form.addressType === 'OLD'}
                          onChange={() => handleAddressTypeChange('OLD')}
                          className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                        />
                        <span className="ml-2 text-sm">
                          <span className="font-medium">Trước sáp nhập</span>
                          <span className="text-gray-500 ml-1">(Xã → Huyện → Tỉnh)</span>
                        </span>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="radio"
                          name="addressType"
                          value="NEW"
                          checked={form.addressType === 'NEW'}
                          onChange={() => handleAddressTypeChange('NEW')}
                          className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                        />
                        <span className="ml-2 text-sm">
                          <span className="font-medium">Sau sáp nhập</span>
                          <span className="text-gray-500 ml-1">(Xã → Tỉnh)</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Địa chỉ chi tiết
                    </label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder="Số nhà, đường, thôn/xóm..."
                    />
                  </div>

                  {form.addressType === 'OLD' && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tỉnh/Thành phố
                        </label>
                        <select
                          value={form.provinceId}
                          onChange={(e) => setForm({ ...form, provinceId: e.target.value, districtId: '', wardId: '' })}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">Chọn tỉnh/thành</option>
                          {provinces.map(p => (
                            <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Quận/Huyện
                        </label>
                        <select
                          value={form.districtId}
                          onChange={(e) => setForm({ ...form, districtId: e.target.value, wardId: '' })}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                          disabled={!form.provinceId || loadingDistricts}
                        >
                          <option value="">
                            {!form.provinceId ? 'Chọn tỉnh trước' : loadingDistricts ? 'Đang tải...' : 'Chọn quận/huyện'}
                          </option>
                          {districts.map(d => (
                            <option key={d.id} value={d.id}>{administrativeTitleCase(d.name)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Phường/Xã
                        </label>
                        <select
                          value={form.wardId}
                          onChange={(e) => setForm({ ...form, wardId: e.target.value })}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                          disabled={!form.districtId || loadingWards}
                        >
                          <option value="">
                            {!form.districtId ? 'Chọn huyện trước' : loadingWards ? 'Đang tải...' : 'Chọn phường/xã'}
                          </option>
                          {wards.map(w => (
                            <option key={w.id} value={w.id}>
                              {wardSelectLabel(w, wardNameDupKeys)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {form.addressType === 'NEW' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Tỉnh/Thành phố
                        </label>
                        <select
                          value={form.provinceId}
                          onChange={(e) => setForm({ ...form, provinceId: e.target.value, wardId: '' })}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">Chọn tỉnh/thành</option>
                          {provinces.map(p => (
                            <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Phường/Xã
                        </label>
                        <select
                          value={form.wardId}
                          onChange={(e) => setForm({ ...form, wardId: e.target.value })}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                          disabled={!form.provinceId || loadingWards}
                        >
                          <option value="">
                            {!form.provinceId ? 'Chọn tỉnh trước' : loadingWards ? 'Đang tải...' : 'Chọn phường/xã'}
                          </option>
                          {wards.map(w => (
                            <option key={w.id} value={w.id}>
                              {wardSelectLabel(w, wardNameDupKeys)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Farming Info */}
            <div className="border-b">
              <SectionHeader title="Thông tin nông nghiệp" icon={Sprout} section="farming" required />
              {expandedSections.farming && (
                <div className="pb-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tên vườn/trang trại
                      </label>
                      <input
                        type="text"
                        value={form.farmName}
                        onChange={(e) => setForm({ ...form, farmName: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="VD: Vườn cam Cao Phong"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Diện tích <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          value={form.farmArea}
                          onChange={(e) => setForm({ ...form, farmArea: e.target.value })}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                          placeholder="5"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Đơn vị <span className="text-red-500">*</span>
                        </label>
                        {useCustomUnit ? (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              value={form.farmAreaUnit}
                              onChange={(e) => setForm({ ...form, farmAreaUnit: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                              placeholder="Nhập đơn vị..."
                            />
                            <button
                              type="button"
                              onClick={() => { setUseCustomUnit(false); setForm({ ...form, farmAreaUnit: 'ha' }); }}
                              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                              title="Chọn từ danh sách"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <select
                            value={form.farmAreaUnit}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                setUseCustomUnit(true);
                                setForm({ ...form, farmAreaUnit: '' });
                              } else {
                                setForm({ ...form, farmAreaUnit: e.target.value });
                              }
                            }}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                          >
                            {AREA_UNITS.map(u => (
                              <option key={u.value} value={u.value}>{u.label}</option>
                            ))}
                            <option value="__custom__">Khác...</option>
                          </select>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Số năm kinh nghiệm <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number"
                        value={form.farmingYears}
                        onChange={(e) => setForm({ ...form, farmingYears: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="10"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phương pháp canh tác
                      </label>
                      <select
                        value={form.farmingMethod}
                        onChange={(e) => setForm({ ...form, farmingMethod: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Chọn phương pháp</option>
                        {FARMING_METHODS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Loại tưới
                      </label>
                      <select
                        value={form.irrigationType}
                        onChange={(e) => setForm({ ...form, irrigationType: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      >
                        <option value="">Chọn loại tưới</option>
                        {IRRIGATION_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Loại đất <span className="text-red-500">*</span>
                      </label>
                      {useCustomSoilType ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={form.soilType}
                            onChange={(e) => setForm({ ...form, soilType: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                            placeholder="Nhập loại đất..."
                          />
                          <button
                            type="button"
                            onClick={() => { setUseCustomSoilType(false); setForm({ ...form, soilType: '' }); }}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 whitespace-nowrap"
                            title="Chọn từ danh sách"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <select
                          value={form.soilType}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setUseCustomSoilType(true);
                              setForm({ ...form, soilType: '' });
                            } else {
                              setForm({ ...form, soilType: e.target.value });
                            }
                          }}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">Chọn loại đất</option>
                          {SOIL_TYPES.map(s => (
                            <option key={s.value} value={s.value}>{s.label}</option>
                          ))}
                          <option value="__custom__">Khác...</option>
                        </select>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cây trồng chính <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-4">
                      {CROP_GROUPS_ORDER.map((group) => {
                        const crops = cropGroups[group] || [];
                        if (crops.length === 0) return null;
                        return (
                          <div key={group}>
                            <div className="text-xs font-medium text-gray-600 mb-2">{group}</div>
                            <div className="flex flex-wrap gap-2">
                              {crops.map((crop) => (
                                <button
                                  key={crop}
                                  type="button"
                                  onClick={() => toggleCrop(crop)}
                                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                                    form.mainCrops.includes(crop)
                                      ? 'bg-green-100 border-green-500 text-green-700'
                                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                  }`}
                                >
                                  {crop}
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="text"
                        value={newCropInput}
                        onChange={(e) => setNewCropInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomCrop(); } }}
                        className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-green-500"
                        placeholder="Thêm cây trồng khác..."
                      />
                      <button
                        type="button"
                        onClick={addCustomCrop}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-50 text-green-700 border border-green-300 rounded-lg text-sm hover:bg-green-100"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm
                      </button>
                    </div>
                    {form.mainCrops.length > 0 && (
                      <div className="mt-2 text-sm text-gray-500">
                        Đã chọn: {form.mainCrops.join(', ')}
                      </div>
                    )}
                    {selectedRootCrops.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <div className="text-sm font-medium text-gray-700">
                          Số gốc (bắt buộc cho các cây tính theo gốc)
                        </div>
                        {selectedRootCrops.map((crop) => (
                          <div key={crop} className="grid grid-cols-2 gap-3 items-center">
                            <label className="text-sm text-gray-700">{crop}</label>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              value={form.mainCropsRootCounts?.[crop] ?? 0}
                              onChange={(e) => {
                                const n = e.target.value === '' ? 0 : Math.floor(Number(e.target.value));
                                setForm((prev) => ({
                                  ...prev,
                                  mainCropsRootCounts: {
                                    ...(prev.mainCropsRootCounts || {}),
                                    [crop]: Number.isFinite(n) ? Math.max(0, n) : 0,
                                  },
                                }));
                              }}
                              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                              placeholder="Nhập số gốc"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Business Info */}
            <div className="border-b">
              <SectionHeader title="Thông tin kinh doanh" icon={Building2} section="business" required />
              {expandedSections.business && (
                <div className="pb-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Loại hình <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.businessType}
                      onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                    >
                      <option value="">Chọn loại hình</option>
                      {BUSINESS_TYPES.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Mã số thuế
                    </label>
                    <input
                      type="text"
                      value={form.taxCode}
                      onChange={(e) => setForm({ ...form, taxCode: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder="0123456789"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Số tài khoản
                    </label>
                    <input
                      type="text"
                      value={form.bankAccount}
                      onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ngân hàng
                    </label>
                    <input
                      type="text"
                      value={form.bankName}
                      onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                      placeholder="Vietcombank"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Kênh tiếp cận (Sales) */}
            <div className="border-b">
              <SectionHeader title="Kênh tiếp cận" icon={Tag} section="salesChannel" required />
              {expandedSections.salesChannel && (
                <div className="pb-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Kênh tiếp cận khách hàng <span className="text-red-500">*</span>
                      </label>
                      {useCustomChannel ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={form.salesChannel}
                            onChange={(e) => setForm({ ...form, salesChannel: e.target.value })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                            placeholder="Nhập rõ kênh tiếp cận (bắt buộc)..."
                          />
                          <button type="button" onClick={() => { setUseCustomChannel(false); setForm({ ...form, salesChannel: '' }); }}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                      ) : (
                        <select
                          value={form.salesChannel}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setUseCustomChannel(true);
                              setForm({ ...form, salesChannel: '' });
                            } else {
                              setForm({ ...form, salesChannel: e.target.value });
                            }
                          }}
                          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">Chọn kênh tiếp cận</option>
                          {SALES_CHANNELS.map(c => (
                            <option key={c.value} value={c.value}>{c.label}</option>
                          ))}
                          <option value="__custom__">Không có trong danh sách (nhập tùy chỉnh)...</option>
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Ghi chú kênh tiếp cận
                      </label>
                      <input
                        type="text"
                        value={form.salesChannelNote}
                        onChange={(e) => setForm({ ...form, salesChannelNote: e.target.value })}
                        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-green-500"
                        placeholder="VD: Anh Nguyễn Văn B giới thiệu..."
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="border-b">
              <SectionHeader title="Thẻ khách hàng" icon={Tag} section="tags" required />
              {expandedSections.tags && (
                <div className="pb-4">
                  <CustomerTagSelector
                    selectedTags={form.tagIds}
                    onChange={(tags) => setForm({ ...form, tagIds: tags })}
                    refreshSignal={tagRefreshSignal}
                  />
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <ToolbarButton variant="secondary" onClick={onClose}>
            Hủy
          </ToolbarButton>
          <ToolbarButton
            variant="primary"
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 disabled:opacity-50"
          >
            {saving ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saving ? 'Đang lưu...' : customerId ? 'Cập nhật' : 'Thêm khách hàng'}
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
};

export default CustomerForm;
