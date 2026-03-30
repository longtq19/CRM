import React, { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../api/client';
import { Plus, Edit, Trash2, Search, Tag } from 'lucide-react';
import type { EmployeeType } from '../types';
import { ToolbarButton } from './ui/ToolbarButton';
import clsx from 'clsx';

interface EmployeeTypeManagerProps {
  /** Quản lý (thêm/sửa/xóa) — cần `MANAGE_EMPLOYEE_TYPE_CATALOG` hoặc `MANAGE_HR` / `FULL_ACCESS` (gán ở trang cha). */
  canEdit: boolean;
}

const EmployeeTypeManager: React.FC<EmployeeTypeManagerProps> = ({ canEdit: canMutate }) => {

  const [items, setItems] = useState<EmployeeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmployeeType | null>(null);
  const [form, setForm] = useState({
    name: '',
    description: '',
    sortOrder: 0,
    isActive: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res: any = await apiClient.get('/hr/employee-types?includeInactive=1');
      const data = res.data ?? res;
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', sortOrder: items.length ? Math.max(...items.map((x) => x.sortOrder ?? 0)) + 1 : 1, isActive: true });
    setModalOpen(true);
  };

  const openEdit = (row: EmployeeType) => {
    setEditing(row);
    setForm({
      name: row.name,
      description: row.description ?? '',
      sortOrder: row.sortOrder ?? 0,
      isActive: row.isActive !== false,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canMutate) return;
    try {
      setSaving(true);
      if (editing) {
        await apiClient.put(`/hr/employee-types/${editing.id}`, {
          name: form.name,
          description: form.description || null,
          sortOrder: form.sortOrder,
          isActive: form.isActive,
        });
      } else {
        await apiClient.post('/hr/employee-types', {
          name: form.name,
          description: form.description || null,
        });
      }
      setModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err?.message || err?.response?.data?.message || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: EmployeeType) => {
    if (!canMutate) return;
    if (!window.confirm(`Xóa loại «${row.name}» (${row.code})?`)) return;
    try {
      await apiClient.delete(`/hr/employee-types/${row.id}`);
      await fetchData();
    } catch (err: any) {
      alert(err?.message || err?.response?.data?.message || 'Không xóa được');
    }
  };

  const filtered = items.filter(
    (x) =>
      x.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      x.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (x.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <p className="text-center py-8 text-gray-500">Đang tải…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-800 inline-flex items-center gap-2">
            <Tag size={20} className="text-primary" />
            Loại nhân viên
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Dùng cho lọc hồ sơ, báo cáo và gán nhân viên. Mã nội bộ tự sinh khi tạo mới; có thể tắt «Đang dùng» thay vì xóa nếu còn nhân viên.
          </p>
        </div>
        {canMutate && (
          <ToolbarButton variant="primary" type="button" onClick={openCreate}>
            <Plus size={16} /> Thêm loại
          </ToolbarButton>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="search"
          placeholder="Tìm theo tên, mã, mô tả…"
          className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto border border-gray-100 rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Mã</th>
              <th className="text-left px-3 py-2 font-medium">Tên</th>
              <th className="text-left px-3 py-2 font-medium hidden md:table-cell">Mô tả</th>
              <th className="text-right px-3 py-2 font-medium w-24">Thứ tự</th>
              <th className="text-center px-3 py-2 font-medium w-28">Đang dùng</th>
              {canMutate && <th className="text-right px-3 py-2 font-medium w-32">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id} className={clsx('border-t border-gray-100', !row.isActive && 'bg-gray-50/80 opacity-90')}>
                <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.code}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                <td className="px-3 py-2 text-gray-600 hidden md:table-cell max-w-xs truncate">{row.description || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.sortOrder ?? 0}</td>
                <td className="px-3 py-2 text-center">{row.isActive === false ? 'Không' : 'Có'}</td>
                {canMutate && (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      className="text-primary hover:underline text-xs inline-flex items-center gap-1 mr-2"
                      onClick={() => openEdit(row)}
                    >
                      <Edit size={14} /> Sửa
                    </button>
                    <button
                      type="button"
                      className="text-red-600 hover:underline text-xs inline-flex items-center gap-1"
                      onClick={() => void handleDelete(row)}
                    >
                      <Trash2 size={14} /> Xóa
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-center py-6 text-gray-500">Không có bản ghi.</p>}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
            <h4 className="font-semibold text-gray-900">{editing ? 'Sửa loại nhân viên' : 'Thêm loại nhân viên'}</h4>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tên *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[72px]"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              {editing && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Thứ tự hiển thị</label>
                    <input
                      type="number"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      value={form.sortOrder}
                      onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                    />
                    Đang dùng (hiện trong danh sách chọn hồ sơ)
                  </label>
                </>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                  onClick={() => setModalOpen(false)}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-3 py-2 text-sm bg-primary text-white rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Đang lưu…' : 'Lưu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeTypeManager;
