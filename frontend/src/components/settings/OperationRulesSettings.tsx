import { useState, useEffect, useMemo } from 'react';
import { Settings, Save, RefreshCw, AlertCircle, CheckCircle, Info, Pencil, X, Check } from 'lucide-react';
import { apiClient } from '../../api/client';
import { translate } from '../../utils/dictionary';
import { useAuthStore } from '../../context/useAuthStore';
import { POOL_PUSH_STATUS_DEFINITIONS } from '../../constants/operationParams';

interface SystemConfig {
  id: string;
  key: string;
  value: string;
  dataType: 'INTEGER' | 'BOOLEAN' | 'STRING' | 'ENUM';
  enumOptions: string | null;
  category: string;
  name: string;
  description: string | null;
  sortOrder: number;
}

interface EditedConfig {
  value: string;
  name?: string;
  description?: string;
}

interface CategoryInfo {
  key: string;
  name: string;
  description: string;
  icon: string;
}

interface OperationRulesSettingsProps {
  initialCategory?: string;
  readOnly?: boolean;
  /** Chỉ tải & hiển thị `operations_params` (tab Tham số vận hành). */
  operationsParamsOnly?: boolean;
}

const ALL_CATEGORIES: CategoryInfo[] = [
  { key: 'marketing', name: 'Marketing', description: 'Cấu hình quy tắc cho bộ phận Marketing', icon: '📢' },
  { key: 'telesales', name: 'Sales', description: 'Cấu hình quy tắc cho bộ phận Sales/Telesales', icon: '📞' },
  { key: 'resales', name: 'CSKH', description: 'Cấu hình quy tắc cho bộ phận Chăm sóc khách hàng', icon: '🤝' },
  { key: 'lead_distribution', name: 'Phân bổ Lead', description: 'Cấu hình phương thức phân bổ lead (chỉ ADM)', icon: '🎯' },
  { key: 'general', name: 'Chung', description: 'Cấu hình chung cho hệ thống', icon: '⚙️' },
];

const ENUM_LABELS: Record<string, Record<string, string>> = {
  lead_assign_method: {
    'round_robin': 'Chia đều lần lượt',
    'random': 'Phân ngẫu nhiên',
    'manual': 'Phân thủ công'
  }
};

const OperationRulesSettings = ({
  initialCategory,
  readOnly = false,
  operationsParamsOnly = false,
}: OperationRulesSettingsProps) => {
  const { hasPermission } = useAuthStore();
  const canEditDataPoolConfig = hasPermission('DATA_POOL_CONFIG');
  const CATEGORIES = useMemo(
    () =>
      canEditDataPoolConfig ? ALL_CATEGORIES : ALL_CATEGORIES.filter((c) => c.key !== 'lead_distribution'),
    [canEditDataPoolConfig]
  );

  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState(operationsParamsOnly ? 'operations_params' : 'marketing');
  const [editedConfigs, setEditedConfigs] = useState<Record<string, EditedConfig>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [editingDescription, setEditingDescription] = useState<string | null>(null);
  const [tempDescription, setTempDescription] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    if (operationsParamsOnly) {
      setActiveCategory('operations_params');
      return;
    }
    if (initialCategory && CATEGORIES.some((c) => c.key === initialCategory)) {
      setActiveCategory(initialCategory);
    }
  }, [initialCategory, CATEGORIES, operationsParamsOnly]);

  const fetchConfigs = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiClient.get(
        operationsParamsOnly ? '/system-configs?category=operations_params' : '/system-configs'
      );
      const data = Array.isArray(response) ? response : [];
      setConfigs(data);
      
      // Initialize edited configs
      const initialConfigs: Record<string, EditedConfig> = {};
      data.forEach((config: SystemConfig) => {
        initialConfigs[config.key] = {
          value: config.value,
          name: config.name,
          description: config.description || ''
        };
      });
      setEditedConfigs(initialConfigs);
      setHasChanges(false);
    } catch (err: any) {
      console.error('Error fetching configs:', err);
      setConfigs([]);
      setError(err?.message || 'Không thể tải cấu hình hệ thống');
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = (key: string, value: string) => {
    setEditedConfigs((prev) => ({
      ...prev,
      [key]: { ...prev[key], value },
    }));
    checkForChanges(key, 'value', value);
  };

  const togglePoolPushStatus = (key: string, code: string, checked: boolean) => {
    const currentVal = editedConfigs[key]?.value ?? configs.find((c) => c.key === key)?.value ?? '[]';
    let arr: string[] = [];
    try {
      const parsed = JSON.parse(currentVal);
      if (Array.isArray(parsed)) arr = parsed.filter((x: unknown) => typeof x === 'string');
    } catch {
      arr = [];
    }
    const next = checked ? [...new Set([...arr, code])] : arr.filter((c) => c !== code);
    const value = JSON.stringify(next);
    handleValueChange(key, value);
  };

  const handleDescriptionEdit = (key: string) => {
    const config = configs.find(c => c.key === key);
    setEditingDescription(key);
    setTempDescription(editedConfigs[key]?.description || config?.description || '');
  };

  const handleDescriptionSave = (key: string) => {
    setEditedConfigs(prev => ({
      ...prev,
      [key]: { ...prev[key], description: tempDescription }
    }));
    checkForChanges(key, 'description', tempDescription);
    setEditingDescription(null);
    setTempDescription('');
  };

  const handleDescriptionCancel = () => {
    setEditingDescription(null);
    setTempDescription('');
  };

  const handleNameEdit = (key: string) => {
    const config = configs.find(c => c.key === key);
    setEditingName(key);
    setTempName(editedConfigs[key]?.name || config?.name || '');
  };

  const handleNameSave = (key: string) => {
    if (!tempName.trim()) {
      return; // Không cho phép tên trống
    }
    setEditedConfigs(prev => ({
      ...prev,
      [key]: { ...prev[key], name: tempName.trim() }
    }));
    checkForChanges(key, 'name', tempName.trim());
    setEditingName(null);
    setTempName('');
  };

  const handleNameCancel = () => {
    setEditingName(null);
    setTempName('');
  };

  const checkForChanges = (changedKey: string, field: 'value' | 'description' | 'name', newValue: string) => {
    const hasAnyChange = configs.some(c => {
      const edited = editedConfigs[c.key];
      if (c.key === changedKey) {
        if (field === 'value') return newValue !== c.value;
        if (field === 'description') return newValue !== (c.description || '');
        if (field === 'name') return newValue !== c.name;
      }
      if (!edited) return false;
      return edited.value !== c.value || 
             edited.description !== (c.description || '') || 
             edited.name !== c.name;
    });
    setHasChanges(hasAnyChange);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Find changed configs
      const changedConfigs = configs
        .filter(c => {
          const edited = editedConfigs[c.key];
          if (!edited) return false;
          return edited.value !== c.value || 
                 edited.description !== (c.description || '') ||
                 edited.name !== c.name;
        })
        .map(c => ({
          key: c.key,
          value: editedConfigs[c.key].value,
          name: editedConfigs[c.key].name,
          description: editedConfigs[c.key].description
        }));

      if (changedConfigs.length === 0) {
        setSuccess('Không có thay đổi nào cần lưu');
        return;
      }

      await apiClient.put('/system-configs', { configs: changedConfigs });
      
      // Refresh configs
      await fetchConfigs();
      setSuccess(`Đã lưu ${changedConfigs.length} cấu hình thành công`);
    } catch (err) {
      console.error('Error saving configs:', err);
      setError('Không thể lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const initialConfigs: Record<string, EditedConfig> = {};
    configs.forEach(config => {
      initialConfigs[config.key] = {
        value: config.value,
        name: config.name,
        description: config.description || ''
      };
    });
    setEditedConfigs(initialConfigs);
    setHasChanges(false);
    setEditingDescription(null);
    setEditingName(null);
  };

  const renderConfigInput = (config: SystemConfig) => {
    const value = editedConfigs[config.key]?.value ?? config.value;

    switch (config.dataType) {
      case 'BOOLEAN':
        return (
          <label className={`relative inline-flex items-center ${readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
            <input
              type="checkbox"
              checked={value === 'true'}
              onChange={(e) => !readOnly && handleValueChange(config.key, e.target.checked ? 'true' : 'false')}
              disabled={readOnly}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            <span className="ml-3 text-sm font-medium text-gray-700">
              {value === 'true' ? 'Bật' : 'Tắt'}
            </span>
          </label>
        );

      case 'ENUM':
        const options = config.enumOptions ? JSON.parse(config.enumOptions) : [];
        const labels = ENUM_LABELS[config.key] || {};
        return (
          <select
            value={value}
            onChange={(e) => handleValueChange(config.key, e.target.value)}
            disabled={readOnly}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary ${readOnly ? 'bg-gray-50 cursor-not-allowed' : ''}`}
          >
            {options.map((opt: string) => (
              <option key={opt} value={opt}>
                {labels[opt] || opt}
              </option>
            ))}
          </select>
        );

      case 'INTEGER':
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={value}
              onChange={(e) => handleValueChange(config.key, e.target.value)}
              disabled={readOnly}
              className={`w-32 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-right ${readOnly ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              min="0"
            />
            <span className="text-sm text-gray-500">
              {config.key.includes('days') ? 'ngày' : 
               config.key.includes('minutes') ? 'phút' : 
               config.key.includes('characters') ? 'ký tự' : ''}
            </span>
          </div>
        );

      case 'STRING':
        if (config.key === 'pool_push_processing_statuses') {
          let selected: string[] = [];
          try {
            const p = JSON.parse(value);
            if (Array.isArray(p)) selected = p.filter((x: unknown) => typeof x === 'string');
          } catch {
            selected = [];
          }
          return (
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50/50">
              {POOL_PUSH_STATUS_DEFINITIONS.map(({ code, label }) => (
                <label key={code} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={selected.includes(code)}
                    disabled={readOnly}
                    onChange={(e) => togglePoolPushStatus(config.key, code, e.target.checked)}
                  />
                  <span>{label}</span>
                  <span className="text-xs text-gray-400 font-mono">{code}</span>
                </label>
              ))}
            </div>
          );
        }
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleValueChange(config.key, e.target.value)}
            disabled={readOnly}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary ${readOnly ? 'bg-gray-50 cursor-not-allowed' : ''}`}
          />
        );

      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleValueChange(config.key, e.target.value)}
            disabled={readOnly}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary ${readOnly ? 'bg-gray-50 cursor-not-allowed' : ''}`}
          />
        );
    }
  };

  const filteredConfigs = operationsParamsOnly
    ? (configs || []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
    : (configs || []).filter((c) => c.category === activeCategory);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-xl font-semibold text-gray-800">
              {operationsParamsOnly ? 'Tham số vận hành' : 'Cài đặt quy tắc vận hành'}
            </h2>
            <p className="text-sm text-gray-500">
              {operationsParamsOnly
                ? 'Các tham số luồng số, sales, CSKH và marketing attribution.'
                : 'Cấu hình các thông số tự động hóa quy trình kinh doanh'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {readOnly ? (
            <span className="px-3 py-1.5 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-lg">
              🔒 Chế độ chỉ xem
            </span>
          ) : (
            <>
              <button
                onClick={handleReset}
                disabled={!hasChanges || saving}
                className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Đặt lại
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Lưu thay đổi
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          <CheckCircle className="w-5 h-5" />
          {success}
        </div>
      )}

      {!operationsParamsOnly && (
        <>
          <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeCategory === cat.key
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <span className="mr-2">{cat.icon}</span>
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700">
            <Info className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{CATEGORIES.find((c) => c.key === activeCategory)?.description}</span>
          </div>
        </>
      )}

      {/* Config List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tham số
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Giá trị
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mô tả
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredConfigs.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  Không có cấu hình nào trong danh mục này
                </td>
              </tr>
            ) : (
              filteredConfigs.map(config => (
                <tr key={config.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    {editingName === config.key ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={tempName}
                          onChange={(e) => setTempName(e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm font-medium"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleNameSave(config.key);
                            if (e.key === 'Escape') handleNameCancel();
                          }}
                        />
                        <button
                          onClick={() => handleNameSave(config.key)}
                          className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                          title="Lưu"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleNameCancel}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Hủy"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="group flex items-center gap-2">
                        <div className="font-medium text-gray-900">
                          {editedConfigs[config.key]?.name || config.name}
                        </div>
                        {!readOnly && (
                          <button
                            onClick={() => handleNameEdit(config.key)}
                            className="p-1 text-gray-400 hover:text-primary hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Đổi tên hiển thị"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                    <div className="text-xs text-gray-400 font-mono mt-1">{config.key}</div>
                  </td>
                  <td className="px-6 py-4">
                    {renderConfigInput(config)}
                  </td>
                  <td className="px-6 py-4">
                    {editingDescription === config.key ? (
                      <div className="flex items-start gap-2">
                        <textarea
                          value={tempDescription}
                          onChange={(e) => setTempDescription(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm resize-none"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex flex-col gap-1">
                          <button
                            onClick={() => handleDescriptionSave(config.key)}
                            className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                            title="Lưu"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleDescriptionCancel}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                            title="Hủy"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="group flex items-start gap-2">
                        <span className="text-sm text-gray-500 flex-1">
                          {editedConfigs[config.key]?.description || config.description || 
                            <span className="italic text-gray-400">Chưa có mô tả</span>
                          }
                        </span>
                        {!readOnly && (
                          <button
                            onClick={() => handleDescriptionEdit(config.key)}
                            className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-100 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Sửa mô tả"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Changed indicator */}
      {hasChanges && !readOnly && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Có thay đổi chưa được lưu
        </div>
      )}
    </div>
  );
};

export default OperationRulesSettings;
