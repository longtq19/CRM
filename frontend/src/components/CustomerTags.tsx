import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '../api/client';
import { Tag, Plus, Edit2, Trash2, X, Loader, Settings, ChevronDown } from 'lucide-react';

interface CustomerTag {
  id: string;
  code: string;
  name: string;
  color: string;
  bgColor: string | null;
  description: string | null;
  category: string | null;
  sortOrder: number;
  isActive: boolean;
}

interface Props {
  onClose?: () => void;
}

export const CUSTOMER_TAG_CATEGORIES = [
  { value: 'PRIORITY', label: 'Ưu tiên' },
  { value: 'BEHAVIOR', label: 'Hành vi' },
  { value: 'PRODUCT_INTEREST', label: 'Quan tâm sản phẩm' },
  { value: 'TECH_IOT', label: 'IoT & thiết bị' },
  { value: 'CROP_TYPE', label: 'Loại cây trồng' },
  { value: 'FARM_SIZE', label: 'Quy mô' },
  { value: 'REGION', label: 'Vùng miền' },
];

const CATEGORIES = CUSTOMER_TAG_CATEGORIES;

const CustomerTagsManager = ({ onClose }: Props) => {
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTag, setEditingTag] = useState<CustomerTag | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('all');

  const [form, setForm] = useState({
    code: '',
    name: '',
    color: '#3B82F6',
    bgColor: '#DBEAFE',
    description: '',
    category: '',
    sortOrder: 0,
  });

  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/customer-tags');
      setTags(data);
    } catch (error) {
      console.error('Load tags error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code || !form.name) {
      alert('Mã và tên thẻ là bắt buộc');
      return;
    }

    try {
      setSaving(true);
      if (editingTag) {
        await apiClient.put(`/customer-tags/${editingTag.id}`, form);
      } else {
        await apiClient.post('/customer-tags', form);
      }
      loadTags();
      resetForm();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi lưu thẻ');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (tag: CustomerTag) => {
    setEditingTag(tag);
    setForm({
      code: tag.code,
      name: tag.name,
      color: tag.color,
      bgColor: tag.bgColor || '#DBEAFE',
      description: tag.description || '',
      category: tag.category || '',
      sortOrder: tag.sortOrder,
    });
    setShowForm(true);
  };

  const handleDelete = async (tag: CustomerTag) => {
    if (!confirm(`Xóa thẻ "${tag.name}"?`)) return;
    try {
      await apiClient.delete(`/customer-tags/${tag.id}`);
      loadTags();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi xóa thẻ');
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingTag(null);
    setForm({
      code: '',
      name: '',
      color: '#3B82F6',
      bgColor: '#DBEAFE',
      description: '',
      category: '',
      sortOrder: 0,
    });
  };

  const filteredTags = filterCategory === 'all' 
    ? tags 
    : tags.filter(t => t.category === filterCategory);

  const groupedTags = filteredTags.reduce((acc, tag) => {
    const cat = tag.category || 'OTHER';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tag);
    return acc;
  }, {} as Record<string, CustomerTag[]>);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gradient-to-r from-indigo-500 to-purple-600">
          <div className="flex items-center gap-3 text-white">
            <Tag className="w-6 h-6" />
            <h2 className="text-xl font-semibold">Quản lý thẻ khách hàng</h2>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Actions */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="all">Tất cả danh mục</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
              <span className="text-sm text-gray-500">{filteredTags.length} thẻ</span>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Thêm thẻ
            </button>
          </div>

          {/* Form */}
          {showForm && (
            <div className="bg-gray-50 rounded-lg p-6 mb-6 border">
              <h3 className="font-semibold mb-4">
                {editingTag ? 'Sửa thẻ' : 'Thêm thẻ mới'}
              </h3>
              <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mã thẻ *
                  </label>
                  <input
                    type="text"
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    disabled={!!editingTag}
                    className="w-full px-4 py-2 border rounded-lg disabled:bg-gray-100"
                    placeholder="VD: VIP, HOT_LEAD"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên thẻ *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="VD: Khách VIP"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Danh mục
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                  >
                    <option value="">Chọn danh mục</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Thứ tự
                  </label>
                  <input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Màu chữ
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="flex-1 px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Màu nền
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.bgColor}
                      onChange={(e) => setForm({ ...form, bgColor: e.target.value })}
                      className="w-12 h-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={form.bgColor}
                      onChange={(e) => setForm({ ...form, bgColor: e.target.value })}
                      className="flex-1 px-4 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mô tả
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg"
                    placeholder="Mô tả ngắn về thẻ"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Xem trước
                  </label>
                  <span
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                    style={{ color: form.color, backgroundColor: form.bgColor }}
                  >
                    {form.name || 'Tên thẻ'}
                  </span>
                </div>
                <div className="col-span-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {saving ? 'Đang lưu...' : editingTag ? 'Cập nhật' : 'Thêm thẻ'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tags List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedTags).map(([category, categoryTags]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3">
                    {CATEGORIES.find(c => c.value === category)?.label || 'Khác'}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {categoryTags.map(tag => (
                      <div
                        key={tag.id}
                        className="group flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:shadow-md transition-shadow"
                      >
                        <span
                          className="px-3 py-1 rounded-full text-sm font-medium"
                          style={{ color: tag.color, backgroundColor: tag.bgColor || '#F3F4F6' }}
                        >
                          {tag.name}
                        </span>
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button
                            onClick={() => handleEdit(tag)}
                            className="p-1 text-gray-400 hover:text-indigo-600"
                            title="Sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(tag)}
                            className="p-1 text-gray-400 hover:text-red-600"
                            title="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomerTagsManager;

// Component để chọn tags cho khách hàng
export const CustomerTagSelector = ({ 
  selectedTags, 
  onChange,
  /** Tăng sau khi đóng «Quản lý thẻ» để tải lại danh sách thẻ. */
  refreshSignal = 0,
}: { 
  selectedTags: string[]; 
  onChange: (tags: string[]) => void;
  refreshSignal?: number;
}) => {
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTags();
  }, [refreshSignal]);

  const loadTags = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get('/customer-tags?isActive=true');
      const sorted = (data || []).sort((a: CustomerTag, b: CustomerTag) => a.sortOrder - b.sortOrder);
      setTags(sorted);
    } catch (error) {
      console.error('Load tags error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onChange(selectedTags.filter(id => id !== tagId));
    } else {
      onChange([...selectedTags, tagId]);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500">Đang tải...</div>;
  }

  const categoryOrder = ['PRIORITY', 'BEHAVIOR', 'PRODUCT_INTEREST', 'TECH_IOT', 'CROP_TYPE', 'FARM_SIZE', 'REGION', 'OTHER'];

  const HOT_TO_COLD_GRADIENT = [
    { color: '#991B1B', bg: '#FEE2E2' }, // red-800 / red-100
    { color: '#9A3412', bg: '#FFEDD5' }, // orange-800 / orange-100
    { color: '#92400E', bg: '#FEF3C7' }, // amber-800 / amber-100
    { color: '#3F6212', bg: '#ECFCCB' }, // lime-800 / lime-100
    { color: '#166534', bg: '#DCFCE7' }, // green-800 / green-100
    { color: '#0E7490', bg: '#CFFAFE' }, // cyan-800 / cyan-100
    { color: '#1E40AF', bg: '#DBEAFE' }, // blue-800 / blue-100
    { color: '#5B21B6', bg: '#EDE9FE' }, // violet-800 / violet-100
    { color: '#6B21A8', bg: '#F3E8FF' }, // purple-800 / purple-100
    { color: '#64748B', bg: '#F1F5F9' }, // slate-500 / slate-100
  ];

  const getGradientColor = (index: number, total: number) => {
    if (total <= 1) return HOT_TO_COLD_GRADIENT[0];
    const step = (HOT_TO_COLD_GRADIENT.length - 1) / (total - 1);
    const i = Math.min(Math.round(index * step), HOT_TO_COLD_GRADIENT.length - 1);
    return HOT_TO_COLD_GRADIENT[i];
  };

  const groupedTags = tags.reduce((acc, tag) => {
    const cat = tag.category || 'OTHER';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tag);
    return acc;
  }, {} as Record<string, CustomerTag[]>);

  const sortedGroupEntries = Object.entries(groupedTags).sort(([a], [b]) => {
    const idxA = categoryOrder.indexOf(a);
    const idxB = categoryOrder.indexOf(b);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });

  return (
    <div className="space-y-3">
      {sortedGroupEntries.map(([category, categoryTags]) => (
        <div key={category}>
          <div className="text-xs font-medium text-gray-500 mb-1">
            {CATEGORIES.find(c => c.value === category)?.label || 'Khác'}
          </div>
          <div className="flex flex-wrap gap-1">
            {categoryTags.map((tag, idx) => {
              const gradient = getGradientColor(idx, categoryTags.length);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleTag(tag.id)}
                  className={`px-2 py-1 rounded-full text-xs font-medium transition-all ${
                    selectedTags.includes(tag.id)
                      ? 'ring-2 ring-offset-1 ring-indigo-500'
                      : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{ color: gradient.color, backgroundColor: gradient.bg }}
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export type TagBadgeModel = { id: string; name: string; color: string; bgColor: string | null };

function normalizeTagBadge(tag: TagBadgeModel | null | undefined): TagBadgeModel | null {
  if (!tag?.id) return null;
  return {
    id: tag.id,
    name: tag.name ?? '—',
    color: tag.color ?? '#64748B',
    bgColor: tag.bgColor ?? null,
  };
}

/** Một phần tử có thể là `{ tag: TagBadgeModel }` (API) hoặc phẳng `TagBadgeModel` (legacy). */
function tagFromRow(row: unknown): TagBadgeModel | null {
  if (row == null || typeof row !== 'object') return null;
  const r = row as { tag?: TagBadgeModel | null; id?: string };
  if (r.tag !== undefined && r.tag !== null) {
    return normalizeTagBadge(r.tag);
  }
  if (typeof r.id === 'string') {
    return normalizeTagBadge(row as TagBadgeModel);
  }
  return null;
}

/** Hiển thị thẻ khách hàng; `vibrant` thêm viền/đổ bóng nhẹ theo màu thẻ. */
export const CustomerTagBadges = ({
  tags,
  vibrant = false,
}: {
  tags: Array<{ tag?: TagBadgeModel | null } | TagBadgeModel>;
  vibrant?: boolean;
}) => {
  const list = (tags || [])
    .map((x) => tagFromRow(x))
    .filter((t): t is TagBadgeModel => t != null);
  if (list.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {list.map((tag) => (
        <span
          key={tag.id}
          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-shadow ${
            vibrant ? 'ring-1 ring-white/60 shadow-md' : ''
          }`}
          style={{
            color: tag.color,
            backgroundColor: tag.bgColor || '#F3F4F6',
            boxShadow: vibrant ? `0 2px 10px ${tag.color}35` : undefined,
          }}
        >
          {tag.name}
        </span>
      ))}
    </div>
  );
};

/** Ô thẻ trên danh sách: xem nhanh + gắn/bỏ thẻ (POST/DELETE assign) khi `canEdit`. */
export const CustomerTagsQuickCell = ({
  customerId,
  assignments,
  allTags,
  canEdit,
  onUpdated,
  vibrant = true,
  tagRefreshSignal = 0,
}: {
  customerId: string;
  assignments: Array<{ tag?: TagBadgeModel | null }>;
  allTags: TagBadgeModel[];
  canEdit: boolean;
  onUpdated: () => void;
  vibrant?: boolean;
  tagRefreshSignal?: number;
}) => {
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);

  useEffect(() => {
    setAddOpen(false);
  }, [tagRefreshSignal, customerId]);

  useLayoutEffect(() => {
    if (!addOpen || !addBtnRef.current) {
      setMenuPos(null);
      return;
    }
    const r = addBtnRef.current.getBoundingClientRect();
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    const left = Math.min(r.left, Math.max(8, vw - 220));
    setMenuPos({ top: r.bottom + 4, left, minWidth: Math.max(r.width, 200) });
  }, [addOpen]);

  const safeAssignments = (assignments || [])
    .map((a) => tagFromRow(a))
    .filter((t): t is TagBadgeModel => t != null);

  const assignedIds = new Set(safeAssignments.map((t) => t.id));
  const availableToAdd = (allTags || [])
    .filter((t) => t?.id && !assignedIds.has(t.id))
    .map((t) => normalizeTagBadge(t))
    .filter((t): t is TagBadgeModel => t != null);

  const handleAdd = async (tagId: string) => {
    if (!tagId || busy) return;
    setBusy(true);
    try {
      await apiClient.post('/customer-tags/assign', { customerId, tagId });
      setAddOpen(false);
      onUpdated();
    } catch (e: any) {
      alert(e?.message || 'Không gắn được thẻ');
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (tagId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await apiClient.delete(`/customer-tags/${customerId}/${tagId}`);
      onUpdated();
    } catch (e: any) {
      alert(e?.message || 'Không bỏ được thẻ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="min-w-[140px] max-w-[280px]"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap gap-1 items-start">
        {safeAssignments.length > 0 ? (
          safeAssignments.map((tag) => (
            <span
              key={tag.id}
              className={`group inline-flex items-center gap-0.5 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium max-w-full ${
                vibrant ? 'ring-1 ring-white/50 shadow-md' : ''
              }`}
              style={{
                color: tag.color,
                backgroundColor: tag.bgColor || '#F3F4F6',
                boxShadow: vibrant ? `0 2px 8px ${tag.color}30` : undefined,
              }}
            >
              <span className="truncate">{tag.name}</span>
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  className="shrink-0 p-0.5 rounded-full hover:bg-black/10 text-current opacity-70 hover:opacity-100"
                  title="Bỏ thẻ"
                  onClick={() => handleRemove(tag.id)}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))
        ) : (
          <span className="text-xs text-gray-400">Chưa có thẻ</span>
        )}

        {canEdit && availableToAdd.length > 0 && (
          <div className="relative inline-block">
            <button
              ref={addBtnRef}
              type="button"
              disabled={busy}
              onClick={() => setAddOpen(!addOpen)}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-emerald-500/15 to-cyan-500/15 text-emerald-800 border border-emerald-200/80 hover:from-emerald-500/25 hover:to-cyan-500/25"
              title="Gắn thẻ nhanh"
            >
              <Plus className="w-3 h-3" />
              Thẻ
              <ChevronDown className={`w-3 h-3 transition ${addOpen ? 'rotate-180' : ''}`} />
            </button>
            {addOpen &&
              menuPos &&
              createPortal(
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-[300] cursor-default bg-transparent"
                    aria-label="Đóng"
                    onClick={() => setAddOpen(false)}
                  />
                  <div
                    className="fixed z-[310] max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl py-1"
                    style={{
                      top: menuPos.top,
                      left: menuPos.left,
                      minWidth: menuPos.minWidth,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {availableToAdd.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={busy}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => handleAdd(t.id)}
                      >
                        <span
                          className="px-2 py-0.5 rounded-full font-medium shrink-0"
                          style={{ color: t.color, backgroundColor: t.bgColor || '#F3F4F6' }}
                        >
                          {t.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </>,
                document.body,
              )}
          </div>
        )}
      </div>
      {busy && (
        <div className="mt-0.5">
          <Loader className="w-3 h-3 animate-spin text-indigo-500 inline" />
        </div>
      )}
    </div>
  );
};
