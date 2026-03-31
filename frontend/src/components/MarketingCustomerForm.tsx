import { useState, useEffect, useMemo } from 'react';
import { apiClient, ApiHttpError } from '../api/client';
import { formatDuplicateStaffForAlert } from '../utils/formatDuplicateStaffAlert';
import { ToolbarButton } from './ui/ToolbarButton';
import {
  X, User, Phone, Mail, MapPin, Sprout, Building2,
  Save, Loader, ChevronDown, ChevronUp, Tag, Plus, Megaphone
} from 'lucide-react';
import { CustomerTagSelector } from './CustomerTags';
import { buildWardDuplicateNameKeys, wardSelectLabel } from '../utils/wardOptionLabel';
import { administrativeTitleCase } from '../utils/addressDisplayFormat';
import { CROP_DEFS, CROP_GROUPS_ORDER, ROOT_COUNTABLE_CROPS } from '../constants/cropConfigs';

interface Province { id: string; name: string; }
interface District { id: string; name: string; provinceId: string; }
interface Ward { id: string; name: string; code?: string | null; districtId?: string | null; }
interface MarketingSource { id: string; name: string; code: string; }
interface MarketingCampaign { id: string; name: string; code: string; sourceId: string | null; }

type AddressType = 'OLD' | 'NEW';

interface FormData {
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
  leadSourceId: string;
  campaignId: string;
  note: string;
  tagIds: string[];
}

interface Props {
  onClose: () => void;
  onSaved: () => void;
  sources: MarketingSource[];
  campaigns: MarketingCampaign[];
  /** Đồng bộ selector thẻ sau khi CRUD trong «Quản lý thẻ». */
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
const KNOWN_CROP_SET = new Set(CROP_DEFS.map((c) => c.value));

const MarketingCustomerForm = ({ onClose, onSaved, sources, campaigns, tagRefreshSignal = 0 }: Props) => {
  const [saving, setSaving] = useState(false);
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [provincesNew, setProvincesNew] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const wardNameDupKeys = useMemo(() => buildWardDuplicateNameKeys(wards), [wards]);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);

  const [customCrops, setCustomCrops] = useState<string[]>([]);
  const [newCropInput, setNewCropInput] = useState('');
  const [useCustomUnit, setUseCustomUnit] = useState(false);
  const [useCustomSoilType, setUseCustomSoilType] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    basic: true,
    address: false,
    farming: false,
    business: false,
    marketing: true,
    tags: true,
  });

  const [form, setForm] = useState<FormData>({
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
    businessType: 'INDIVIDUAL',
    taxCode: '',
    bankAccount: '',
    bankName: '',
    leadSourceId: '',
    campaignId: '',
    note: '',
    tagIds: [],
  });

  const activeProvinces = form.addressType === 'NEW' ? provincesNew : provinces;

  const filteredCampaigns = form.leadSourceId
    ? campaigns.filter(c => c.sourceId === form.leadSourceId)
    : [];

  useEffect(() => {
    Promise.all([
      apiClient.get('/address/provinces'),
      apiClient.get('/address/provinces?directOnly=1')
    ]).then(([all, onlyNew]) => {
      setProvinces(all || []);
      setProvincesNew(onlyNew || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (form.provinceId && form.addressType === 'OLD') {
      setLoadingDistricts(true);
      setWards([]);
      apiClient.get(`/address/districts?provinceId=${form.provinceId}`)
        .then(d => setDistricts(d || []))
        .catch(() => setDistricts([]))
        .finally(() => setLoadingDistricts(false));
    }
    if (form.provinceId && form.addressType === 'NEW') {
      setLoadingWards(true);
      setDistricts([]);
      apiClient.get(
        `/address/wards?provinceId=${encodeURIComponent(form.provinceId)}&directOnly=1`
      )
        .then(d => setWards(d || []))
        .catch(() => setWards([]))
        .finally(() => setLoadingWards(false));
    }
    if (!form.provinceId) { setDistricts([]); setWards([]); }
  }, [form.provinceId, form.addressType]);

  useEffect(() => {
    if (form.districtId && form.addressType === 'OLD') {
      setLoadingWards(true);
      apiClient
        .get(`/address/wards?districtId=${encodeURIComponent(form.districtId)}`)
        .then(d => setWards(d || []))
        .catch(() => setWards([]))
        .finally(() => setLoadingWards(false));
    } else if (!form.districtId && form.addressType === 'OLD') {
      setWards([]);
    }
  }, [form.districtId, form.addressType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.phone.trim()) { alert('Số điện thoại là bắt buộc'); return; }
    if (!form.leadSourceId?.trim()) { alert('Nền tảng là bắt buộc'); return; }
    if (!form.campaignId?.trim()) { alert('Chiến dịch là bắt buộc'); return; }
    if (!form.note.trim()) { alert('Ghi chú là bắt buộc'); return; }

    if (form.mainCrops.length > 0) {
      const selectedRootCrops = form.mainCrops.filter((c) => ROOT_COUNTABLE_CROPS.has(c));
      const missingRoot = selectedRootCrops.filter((crop) => {
        const v = form.mainCropsRootCounts?.[crop];
        return !Number.isFinite(v as number) || (v as number) <= 0;
      });
      if (missingRoot.length > 0) {
        alert(`Vui lòng nhập số gốc cho:\n- ${missingRoot.join('\n- ')}`);
        setExpandedSections((p) => ({ ...p, farming: true }));
        return;
      }
    }

    try {
      setSaving(true);
      const data = await apiClient.post('/marketing/leads', {
        ...form,
        farmArea: form.farmArea ? parseFloat(form.farmArea) : null,
        farmingYears: form.farmingYears ? parseInt(form.farmingYears) : null,
      });
      if (data?.sameCampaignWarning) {
        let msg = data.message || 'Số điện thoại đã tồn tại trong chiến dịch này.';
        if (data.responsibleStaff) msg += formatDuplicateStaffForAlert(data.responsibleStaff);
        alert(msg);
        return;
      }
      if (data?.duplicate) {
        let msg =
          data.message || 'Số điện thoại đã tồn tại. Hệ thống đã ghi nhận note và gửi thông báo.';
        if (data.responsibleStaff) msg += formatDuplicateStaffForAlert(data.responsibleStaff);
        alert(msg);
        onSaved();
        onClose();
        return;
      }
      onSaved();
      onClose();
    } catch (error: unknown) {
      if (error instanceof ApiHttpError && error.status === 400) {
        const p = error.payload as {
          message?: string;
          responsibleStaff?: {
            salesOrCareResponsible: { fullName: string; phone: string | null } | null;
            marketingResponsible: { fullName: string; phone: string | null } | null;
          };
        };
        if (p?.responsibleStaff) {
          alert(`${p.message || error.message}${formatDuplicateStaffForAlert(p.responsibleStaff)}`);
          return;
        }
      }
      alert(error instanceof Error ? error.message : 'Lỗi khi tạo khách hàng Marketing');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (s: keyof typeof expandedSections) => {
    setExpandedSections(p => ({ ...p, [s]: !p[s] }));
  };

  const toggleCrop = (crop: string) => {
    setForm((p) => {
      const isSelected = p.mainCrops.includes(crop);
      const nextMainCrops = isSelected
        ? p.mainCrops.filter((c) => c !== crop)
        : [...p.mainCrops, crop];

      const nextRootCounts = { ...p.mainCropsRootCounts };
      if (isSelected) {
        delete nextRootCounts[crop];
      } else if (ROOT_COUNTABLE_CROPS.has(crop)) {
        // Default 0 để UI hiển thị lỗi bắt buộc nhập
        nextRootCounts[crop] = nextRootCounts[crop] ?? 0;
      }

      return {
        ...p,
        mainCrops: nextMainCrops,
        mainCropsRootCounts: nextRootCounts,
      };
    });
  };

  const addCustomCrop = () => {
    const t = newCropInput.trim();
    if (!t) return;

    if (KNOWN_CROP_SET.has(t)) {
      if (!form.mainCrops.includes(t)) setForm((p) => ({ ...p, mainCrops: [...p.mainCrops, t] }));
      setNewCropInput('');
      return;
    }

    setCustomCrops((p) => (p.includes(t) ? p : [...p, t]));
    if (!form.mainCrops.includes(t)) setForm((p) => ({ ...p, mainCrops: [...p.mainCrops, t] }));
    setNewCropInput('');
  };

  const handleAddressTypeChange = (type: AddressType) => {
    setForm(p => ({ ...p, addressType: type, districtId: '', wardId: '' }));
    setDistricts([]); setWards([]);
  };

  const cropGroups = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const g of CROP_GROUPS_ORDER) map[g] = [];
    for (const def of CROP_DEFS) map[def.group].push(def.value);
    map['Khác'] = customCrops;
    return map;
  }, [customCrops]);

  const selectedRootCrops = form.mainCrops.filter((c) => ROOT_COUNTABLE_CROPS.has(c));

  const SectionHeader = ({ title, icon: Icon, section, required }: {
    title: string; icon: any; section: keyof typeof expandedSections; required?: boolean;
  }) => (
    <button type="button" onClick={() => toggleSection(section)}
      className="w-full flex items-center justify-between py-3 text-left">
      <div className="flex items-center gap-2 font-medium text-gray-700">
        <Icon className="w-5 h-5 text-purple-600" />
        {title}
        {required && <span className="text-red-500">*</span>}
      </div>
      {expandedSections[section] ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
    </button>
  );

  const inputCls = "w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500";
  const selectCls = inputCls;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-purple-500 to-indigo-600">
          <h2 className="text-xl font-semibold text-white">Thêm khách hàng Marketing</h2>
          <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-6 h-6" /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto max-h-[calc(90vh-140px)]">
          <div className="p-6 space-y-1">
            {/* Basic Info */}
            <div className="border-b">
              <SectionHeader title="Thông tin cơ bản" icon={User} section="basic" />
              {expandedSections.basic && (
                <div className="pb-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Họ và tên</label>
                    <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      className={inputCls} placeholder="Nguyễn Văn A" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Số điện thoại <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="0912345678" required />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ghi chú <span className="text-red-500">*</span>
                    </label>
                    <textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })}
                      rows={2} className={inputCls} placeholder="Ghi chú về khách hàng (bắt buộc, sẽ lưu vào lịch sử tác động)..." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giới tính</label>
                    <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })} className={selectCls}>
                      <option value="">Chọn giới tính</option>
                      <option value="MALE">Nam</option>
                      <option value="FEMALE">Nữ</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="email@example.com" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh</label>
                    <input type="date" value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} className={inputCls} />
                  </div>
                </div>
              )}
            </div>

            {/* Nền tảng & Chiến dịch (tùy chọn) */}
            <div className="border-b">
              <SectionHeader title="Nền tảng & Chiến dịch" icon={Megaphone} section="marketing" />
              {expandedSections.marketing && (
                <div className="pb-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nền tảng
                    </label>
                    <select value={form.leadSourceId}
                      onChange={e => setForm({ ...form, leadSourceId: e.target.value, campaignId: '' })}
                      className={selectCls}>
                      <option value="">Chọn nền tảng</option>
                      {sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Chiến dịch
                    </label>
                    <select value={form.campaignId}
                      onChange={e => setForm({ ...form, campaignId: e.target.value })}
                      className={selectCls}
                      disabled={!form.leadSourceId}>
                      <option value="">
                        {!form.leadSourceId ? 'Chọn nền tảng trước' : filteredCampaigns.length === 0 ? 'Không có chiến dịch' : 'Chọn chiến dịch'}
                      </option>
                      {filteredCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {form.leadSourceId && filteredCampaigns.length === 0 && (
                      <p className="text-xs text-amber-600 mt-1">Nền tảng này chưa có chiến dịch nào</p>
                    )}
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
                    <label className="block text-sm font-medium text-gray-700 mb-2">Loại địa chỉ hành chính</label>
                    <div className="flex gap-4">
                      <label className="flex items-center cursor-pointer">
                        <input type="radio" name="mkt_addressType" value="OLD" checked={form.addressType === 'OLD'}
                          onChange={() => handleAddressTypeChange('OLD')} className="w-4 h-4 text-purple-600" />
                        <span className="ml-2 text-sm"><span className="font-medium">Trước sáp nhập</span> <span className="text-gray-500">(Xã → Huyện → Tỉnh)</span></span>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input type="radio" name="mkt_addressType" value="NEW" checked={form.addressType === 'NEW'}
                          onChange={() => handleAddressTypeChange('NEW')} className="w-4 h-4 text-purple-600" />
                        <span className="ml-2 text-sm"><span className="font-medium">Sau sáp nhập</span> <span className="text-gray-500">(Xã → Tỉnh)</span></span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ chi tiết</label>
                    <input type="text" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}
                      className={inputCls} placeholder="Số nhà, đường, thôn/xóm..." />
                  </div>
                  {form.addressType === 'OLD' && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tỉnh/Thành phố</label>
                        <select value={form.provinceId} onChange={e => setForm({ ...form, provinceId: e.target.value, districtId: '', wardId: '' })} className={selectCls}>
                          <option value="">Chọn tỉnh/thành</option>
                          {activeProvinces.map(p => <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quận/Huyện</label>
                        <select value={form.districtId} onChange={e => setForm({ ...form, districtId: e.target.value, wardId: '' })}
                          className={selectCls} disabled={!form.provinceId || loadingDistricts}>
                          <option value="">{!form.provinceId ? 'Chọn tỉnh trước' : loadingDistricts ? 'Đang tải...' : 'Chọn quận/huyện'}</option>
                          {districts.map(d => <option key={d.id} value={d.id}>{administrativeTitleCase(d.name)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phường/Xã</label>
                        <select value={form.wardId} onChange={e => setForm({ ...form, wardId: e.target.value })}
                          className={selectCls} disabled={!form.districtId || loadingWards}>
                          <option value="">{!form.districtId ? 'Chọn huyện trước' : loadingWards ? 'Đang tải...' : 'Chọn phường/xã'}</option>
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tỉnh/Thành phố</label>
                        <select value={form.provinceId} onChange={e => setForm({ ...form, provinceId: e.target.value, wardId: '' })} className={selectCls}>
                          <option value="">Chọn tỉnh/thành</option>
                          {activeProvinces.map(p => <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phường/Xã</label>
                        <select value={form.wardId} onChange={e => setForm({ ...form, wardId: e.target.value })}
                          className={selectCls} disabled={!form.provinceId || loadingWards}>
                          <option value="">{!form.provinceId ? 'Chọn tỉnh trước' : loadingWards ? 'Đang tải...' : 'Chọn phường/xã'}</option>
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
              <SectionHeader title="Thông tin nông nghiệp" icon={Sprout} section="farming" />
              {expandedSections.farming && (
                <div className="pb-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tên vườn/trang trại</label>
                      <input type="text" value={form.farmName} onChange={e => setForm({ ...form, farmName: e.target.value })}
                        className={inputCls} placeholder="VD: Vườn cam Cao Phong" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Diện tích</label>
                        <input type="number" step="0.1" value={form.farmArea} onChange={e => setForm({ ...form, farmArea: e.target.value })}
                          className={inputCls} placeholder="5" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị</label>
                        {useCustomUnit ? (
                          <div className="flex gap-1">
                            <input type="text" value={form.farmAreaUnit} onChange={e => setForm({ ...form, farmAreaUnit: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 text-sm" placeholder="Nhập đơn vị..." />
                            <button type="button" onClick={() => { setUseCustomUnit(false); setForm({ ...form, farmAreaUnit: 'ha' }); }}
                              className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">✕</button>
                          </div>
                        ) : (
                          <select value={form.farmAreaUnit} onChange={e => {
                            if (e.target.value === '__custom__') { setUseCustomUnit(true); setForm({ ...form, farmAreaUnit: '' }); }
                            else setForm({ ...form, farmAreaUnit: e.target.value });
                          }} className={selectCls}>
                            {AREA_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
                            <option value="__custom__">Khác...</option>
                          </select>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Số năm kinh nghiệm</label>
                      <input type="number" value={form.farmingYears} onChange={e => setForm({ ...form, farmingYears: e.target.value })}
                        className={inputCls} placeholder="10" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phương pháp canh tác</label>
                      <select value={form.farmingMethod} onChange={e => setForm({ ...form, farmingMethod: e.target.value })} className={selectCls}>
                        <option value="">Chọn phương pháp</option>
                        {FARMING_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Loại tưới</label>
                      <select value={form.irrigationType} onChange={e => setForm({ ...form, irrigationType: e.target.value })} className={selectCls}>
                        <option value="">Chọn loại tưới</option>
                        {IRRIGATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Loại đất</label>
                      {useCustomSoilType ? (
                        <div className="flex gap-1">
                          <input type="text" value={form.soilType} onChange={e => setForm({ ...form, soilType: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500" placeholder="Nhập loại đất..." />
                          <button type="button" onClick={() => { setUseCustomSoilType(false); setForm({ ...form, soilType: '' }); }}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700">✕</button>
                        </div>
                      ) : (
                        <select value={form.soilType} onChange={e => {
                          if (e.target.value === '__custom__') { setUseCustomSoilType(true); setForm({ ...form, soilType: '' }); }
                          else setForm({ ...form, soilType: e.target.value });
                        }} className={selectCls}>
                          <option value="">Chọn loại đất</option>
                          {SOIL_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
                                      ? 'bg-purple-100 border-purple-500 text-purple-700'
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
                      <input type="text" value={newCropInput} onChange={e => setNewCropInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomCrop(); } }}
                        className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-purple-500" placeholder="Thêm cây trồng khác..." />
                      <button type="button" onClick={addCustomCrop}
                        className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-300 rounded-lg text-sm hover:bg-purple-100">
                        <Plus className="w-3.5 h-3.5" />Thêm
                      </button>
                    </div>
                    {form.mainCrops.length > 0 && <div className="mt-2 text-sm text-gray-500">Đã chọn: {form.mainCrops.join(', ')}</div>}
                    {selectedRootCrops.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <div className="text-sm font-medium text-gray-700">Số gốc (bắt buộc cho các cây tính theo gốc)</div>
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
                              className={inputCls}
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
              <SectionHeader title="Thông tin kinh doanh" icon={Building2} section="business" />
              {expandedSections.business && (
                <div className="pb-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Loại hình</label>
                    <select value={form.businessType} onChange={e => setForm({ ...form, businessType: e.target.value })} className={selectCls}>
                      {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã số thuế</label>
                    <input type="text" value={form.taxCode} onChange={e => setForm({ ...form, taxCode: e.target.value })} className={inputCls} placeholder="0123456789" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
                    <input type="text" value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })} className={inputCls} placeholder="1234567890" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
                    <input type="text" value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} className={inputCls} placeholder="Vietcombank" />
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="border-b">
              <SectionHeader title="Thẻ khách hàng" icon={Tag} section="tags" />
              {expandedSections.tags && (
                <div className="pb-4">
                  <CustomerTagSelector
                    selectedTags={form.tagIds}
                    onChange={tags => setForm({ ...form, tagIds: tags })}
                    refreshSignal={tagRefreshSignal}
                  />
                </div>
              )}
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <ToolbarButton variant="secondary" onClick={onClose}>Hủy</ToolbarButton>
          <ToolbarButton
            variant="primary"
            onClick={handleSubmit}
            disabled={saving}
            className="px-6 disabled:opacity-50"
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Đang lưu...' : 'Thêm khách hàng'}
          </ToolbarButton>
        </div>
      </div>
    </div>
  );
};

export default MarketingCustomerForm;
