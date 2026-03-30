import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../api/client';
import { MapPin, Search, X, ChevronDown, Loader } from 'lucide-react';
import {
  administrativeTitleCase,
  administrativeTitleCaseAddressLabel
} from '../utils/addressDisplayFormat';

interface Province {
  id: string;
  code: string;
  name: string;
}

interface District {
  id: string;
  code: string;
  name: string;
  provinceId: string;
  province?: Province;
}

interface Ward {
  id: string;
  code: string;
  name: string;
  districtId: string;
  district?: District & { province?: Province };
}

interface AddressResult {
  type: 'full' | 'district' | 'province';
  label: string;
  wardId?: string;
  wardName?: string;
  districtId?: string;
  districtName?: string;
  provinceId?: string;
  provinceName?: string;
}

interface AddressValue {
  provinceId?: string;
  provinceName?: string;
  districtId?: string;
  districtName?: string;
  wardId?: string;
  wardName?: string;
  address?: string;
}

interface AddressAutocompleteProps {
  value?: AddressValue;
  onChange: (value: AddressValue) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  showDetailedAddress?: boolean;
  mode?: 'smart' | 'dropdown'; // smart: nhập tự do, dropdown: chọn từng cấp
}

const AddressAutocomplete = ({
  value,
  onChange,
  placeholder = 'Nhập địa chỉ...',
  required = false,
  disabled = false,
  showDetailedAddress = true,
  mode = 'smart'
}: AddressAutocompleteProps) => {
  // Smart mode states
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<AddressResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Dropdown mode states
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [loadingProvinces, setLoadingProvinces] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [loadingWards, setLoadingWards] = useState(false);
  
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Load provinces on mount for dropdown mode
  useEffect(() => {
    if (mode === 'dropdown') {
      loadProvinces();
    }
  }, [mode]);
  
  // Load districts when province changes
  useEffect(() => {
    if (mode === 'dropdown' && value?.provinceId) {
      loadDistricts(value.provinceId);
    }
  }, [mode, value?.provinceId]);
  
  // Load wards when district changes
  useEffect(() => {
    if (mode === 'dropdown' && value?.districtId) {
      loadWards(value.districtId);
    }
  }, [mode, value?.districtId]);
  
  // Close suggestions on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Search address (smart mode)
  useEffect(() => {
    if (mode !== 'smart' || searchTerm.length < 2) {
      setSuggestions([]);
      return;
    }
    
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const data = await apiClient.get(`/address/search?q=${encodeURIComponent(searchTerm)}`);
        setSuggestions(data || []);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Search address error:', error);
      } finally {
        setLoading(false);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm, mode]);
  
  const loadProvinces = async () => {
    try {
      setLoadingProvinces(true);
      const data = await apiClient.get('/address/provinces');
      setProvinces(data || []);
    } catch (error) {
      console.error('Load provinces error:', error);
    } finally {
      setLoadingProvinces(false);
    }
  };
  
  const loadDistricts = async (provinceId: string) => {
    try {
      setLoadingDistricts(true);
      setDistricts([]);
      setWards([]);
      const data = await apiClient.get(`/address/districts?provinceId=${provinceId}`);
      setDistricts(data || []);
    } catch (error) {
      console.error('Load districts error:', error);
    } finally {
      setLoadingDistricts(false);
    }
  };
  
  const loadWards = async (districtId: string) => {
    try {
      setLoadingWards(true);
      setWards([]);
      const data = await apiClient.get(`/address/wards?districtId=${districtId}`);
      setWards(data || []);
    } catch (error) {
      console.error('Load wards error:', error);
    } finally {
      setLoadingWards(false);
    }
  };
  
  const handleSelectSuggestion = (item: AddressResult) => {
    onChange({
      ...value,
      provinceId: item.provinceId,
      provinceName: item.provinceName ? administrativeTitleCase(item.provinceName) : item.provinceName,
      districtId: item.districtId,
      districtName: item.districtName ? administrativeTitleCase(item.districtName) : item.districtName,
      wardId: item.wardId,
      wardName: item.wardName ? administrativeTitleCase(item.wardName) : item.wardName
    });
    setSearchTerm('');
    setShowSuggestions(false);
  };
  
  const handleProvinceChange = (provinceId: string) => {
    const province = provinces.find(p => p.id === provinceId);
    onChange({
      ...value,
      provinceId,
      provinceName: province?.name != null ? administrativeTitleCase(province.name) : undefined,
      districtId: undefined,
      districtName: undefined,
      wardId: undefined,
      wardName: undefined
    });
  };
  
  const handleDistrictChange = (districtId: string) => {
    const district = districts.find(d => d.id === districtId);
    onChange({
      ...value,
      districtId,
      districtName: district?.name != null ? administrativeTitleCase(district.name) : undefined,
      wardId: undefined,
      wardName: undefined
    });
  };
  
  const handleWardChange = (wardId: string) => {
    const ward = wards.find(w => w.id === wardId);
    onChange({
      ...value,
      wardId,
      wardName: ward?.name != null ? administrativeTitleCase(ward.name) : undefined
    });
  };
  
  const clearAddress = () => {
    onChange({});
    setSearchTerm('');
  };
  
  const getDisplayValue = () => {
    const parts = [];
    if (value?.wardName) parts.push(administrativeTitleCase(value.wardName));
    if (value?.districtName) parts.push(administrativeTitleCase(value.districtName));
    if (value?.provinceName) parts.push(administrativeTitleCase(value.provinceName));
    return parts.join(', ');
  };
  
  if (mode === 'dropdown') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Province */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tỉnh/Thành phố {required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
              <select
                value={value?.provinceId || ''}
                onChange={(e) => handleProvinceChange(e.target.value)}
                disabled={disabled || loadingProvinces}
                className="w-full border rounded-lg px-3 py-2 pr-8 appearance-none bg-white disabled:bg-gray-100"
              >
                <option value="">-- Chọn tỉnh/thành --</option>
                {provinces.map((p) => (
                  <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              {loadingProvinces && (
                <Loader className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
              )}
            </div>
          </div>
          
          {/* District */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quận/Huyện {required && <span className="text-red-500">*</span>}
            </label>
            <div className="relative">
              <select
                value={value?.districtId || ''}
                onChange={(e) => handleDistrictChange(e.target.value)}
                disabled={disabled || !value?.provinceId || loadingDistricts}
                className="w-full border rounded-lg px-3 py-2 pr-8 appearance-none bg-white disabled:bg-gray-100"
              >
                <option value="">-- Chọn quận/huyện --</option>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>{administrativeTitleCase(d.name)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              {loadingDistricts && (
                <Loader className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
              )}
            </div>
          </div>
          
          {/* Ward */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phường/Xã
            </label>
            <div className="relative">
              <select
                value={value?.wardId || ''}
                onChange={(e) => handleWardChange(e.target.value)}
                disabled={disabled || !value?.districtId || loadingWards}
                className="w-full border rounded-lg px-3 py-2 pr-8 appearance-none bg-white disabled:bg-gray-100"
              >
                <option value="">-- Chọn phường/xã --</option>
                {wards.map((w) => (
                  <option key={w.id} value={w.id}>{administrativeTitleCase(w.name)}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              {loadingWards && (
                <Loader className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
              )}
            </div>
          </div>
        </div>
        
        {/* Detailed address */}
        {showDetailedAddress && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Địa chỉ chi tiết
            </label>
            <input
              type="text"
              value={value?.address || ''}
              onChange={(e) => onChange({ ...value, address: e.target.value })}
              disabled={disabled}
              placeholder="Số nhà, tên đường..."
              className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100"
            />
          </div>
        )}
      </div>
    );
  }
  
  // Smart mode
  return (
    <div ref={wrapperRef} className="space-y-3">
      {/* Selected address display */}
      {getDisplayValue() && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <div className="flex items-center text-blue-700">
            <MapPin className="w-4 h-4 mr-2" />
            <span className="text-sm">{getDisplayValue()}</span>
          </div>
          <button
            type="button"
            onClick={clearAddress}
            className="text-blue-500 hover:text-blue-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full border rounded-lg pl-10 pr-10 py-2 disabled:bg-gray-100"
          />
          {loading && (
            <Loader className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 animate-spin" />
          )}
        </div>
        
        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((item, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleSelectSuggestion(item)}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center"
              >
                <MapPin className="w-4 h-4 mr-2 text-gray-400 flex-shrink-0" />
                <span className="text-sm">{administrativeTitleCaseAddressLabel(item.label)}</span>
                {item.type === 'full' && (
                  <span className="ml-auto text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">Đầy đủ</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      
      {/* Hint */}
      <p className="text-xs text-gray-500">
        Gợi ý: Nhập "Phường X, Quận Y, TP Z" hoặc chỉ tên phường/xã để tìm nhanh
      </p>
      
      {/* Detailed address */}
      {showDetailedAddress && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Địa chỉ chi tiết (số nhà, tên đường)
          </label>
          <input
            type="text"
            value={value?.address || ''}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
            disabled={disabled}
            placeholder="Số nhà, tên đường..."
            className="w-full border rounded-lg px-3 py-2 disabled:bg-gray-100"
          />
        </div>
      )}
    </div>
  );
};

export default AddressAutocomplete;
