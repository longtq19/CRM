import React, { useState, useEffect, useMemo } from 'react';
import { apiClient, ApiHttpError } from '../api/client';
import { Plus, Edit, Trash2, Layers, Search } from 'lucide-react';
import { SearchableSelect } from './SearchableSelect';

export type HrDepartmentUnitRow = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  managerId?: string | null;
  manager?: { id: string; fullName: string; code: string } | null;
};

interface HrDepartmentUnitManagerProps {
  canEdit: boolean;
}

const HrDepartmentUnitManager: React.FC<HrDepartmentUnitManagerProps> = ({ canEdit }) => {
  const [rows, setRows] = useState<HrDepartmentUnitRow[]>([]);
  const [employees, setEmployees] = useState<{ id: string; fullName: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrDepartmentUnitRow | null>(null);
  const [form, setForm] = useState({ name: '', code: '', sortOrder: '', managerId: '' });

  const managerOptions = useMemo(
    () => [
      { value: '', label: '— Không chọn —' },
      ...employees.map((e) => ({
        value: e.id,
        label: e.fullName,
        subLabel: e.code,
      })),
    ],
    [employees]
  );

  const fetchData = async () => {
    try {
      setLoading(true);
      const res: unknown = await apiClient.get('/hr/hr-department-units');
      const list = Array.isArray(res) ? res : [];
      setRows(
        (list as Record<string, unknown>[]).map((row) => ({
          ...row,
          sortOrder:
            typeof row.sortOrder === 'number'
              ? row.sortOrder
              : typeof row.sort_order === 'number'
                ? (row.sort_order as number)
                : 0,
        })) as HrDepartmentUnitRow[]
      );
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = (await apiClient.get('/hr/employees?limit=2000&page=1')) as {
          data?: { id: string; fullName: string; code: string }[];
        };
        const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
        setEmployees(
          list.map((e) => ({
            id: e.id,
            fullName: e.fullName,
            code: e.code,
          }))
        );
      } catch {
        setEmployees([]);
      }
    })();
  }, []);

  const openModal = (item?: HrDepartmentUnitRow) => {
    setEditing(item ?? null);
    if (item) {
      setForm({
        name: item.name,
        code: item.code,
        sortOrder: String(item.sortOrder ?? 0),
        managerId: item.managerId || item.manager?.id || '',
      });
    } else {
      setForm({ name: '', code: '', sortOrder: '', managerId: '' });
    }
    setModalOpen(true);
  };

  const errMessage = (e: unknown) =>
    e instanceof ApiHttpError ? e.message : 'Đã xảy ra lỗi';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        await apiClient.put(`/hr/hr-department-units/${editing.id}`, {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          sortOrder: form.sortOrder,
          managerId: form.managerId.trim() ? form.managerId.trim() : null,
        });
      } else {
        const trimmedSo = String(form.sortOrder).trim();
        const so = trimmedSo === '' ? NaN : parseInt(trimmedSo, 10);
        await apiClient.post('/hr/hr-department-units', {
          name: form.name.trim(),
          code: form.code.trim() || undefined,
          ...(form.managerId.trim() ? { managerId: form.managerId.trim() } : {}),
          ...(!Number.isNaN(so) ? { sortOrder: so } : {}),
        });
      }
      setModalOpen(false);
      await fetchData();
    } catch (err) {
      alert(errMessage(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Xóa bộ phận này? (Chỉ khi không còn nhân viên thuộc bộ phận)')) return;
    try {
      await apiClient.delete(`/hr/hr-department-units/${id}`);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(errMessage(err));
    }
  };

  const filtered = rows.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Đang tải…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Bộ phận</h3>
            <p className="text-sm text-gray-500 mt-1">
              Dùng để lọc và hiển thị trong module Nhân sự; có thể gán quản lý bộ phận để duyệt nghỉ phép cho nhân viên cùng bộ phận. Tổng:{' '}
              <span className="font-semibold text-primary">{rows.length}</span>
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={() => openModal()}
              className="w-full sm:w-auto px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Thêm bộ phận
            </button>
          )}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            Không có bộ phận nào.
          </div>
        ) : (
          filtered.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                    <Layers size={20} />
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openModal(r)}
                        className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-50 rounded"
                        title="Sửa"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-50 rounded"
                        title="Xóa"
                        disabled={String(r.code).toUpperCase() === 'CHUNG'}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )}
                </div>
                <h4 className="font-bold text-gray-900 mb-1 text-lg">{r.name}</h4>
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span className="px-2 py-0.5 bg-gray-100 rounded font-mono border border-gray-200">{r.code}</span>
                  <span>Thứ tự: {r.sortOrder ?? 0}</span>
                </div>
                {r.manager?.fullName && (
                  <p className="text-xs text-gray-600 mt-2">
                    Quản lý: <span className="font-medium text-gray-800">{r.manager.fullName}</span>
                    <span className="text-gray-400 ml-1">({r.manager.code})</span>
                  </p>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-visible animate-fade-in my-auto">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-gray-800">{editing ? 'Sửa bộ phận' : 'Thêm bộ phận'}</h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                aria-label="Đóng"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-visible">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên bộ phận <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Ví dụ: Kinh doanh miền Bắc"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã</label>
                <input
                  type="text"
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                  disabled={!!editing && String(editing.code).toUpperCase() === 'CHUNG'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono disabled:bg-gray-100"
                  placeholder={editing ? undefined : 'Để trống — hệ thống tạo mã từ tên'}
                  maxLength={32}
                />
                {editing && String(editing.code).toUpperCase() === 'CHUNG' ? (
                  <p className="text-xs text-gray-500 mt-1">Bộ phận mặc định — không đổi mã.</p>
                ) : (
                  <p className="text-xs text-gray-500 mt-1">Chữ in hoa, tối đa 32 ký tự.</p>
                )}
              </div>
              <div className="relative z-10 overflow-visible">
                <SearchableSelect
                  className="relative z-10"
                  dropdownPanelClassName="z-[200]"
                  label="Quản lý bộ phận"
                  options={managerOptions}
                  value={form.managerId}
                  onChange={(v) => setForm((p) => ({ ...p, managerId: v }))}
                  placeholder="Tìm và chọn nhân viên…"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Người được chọn có thể duyệt/từ chối đơn nghỉ phép của nhân viên thuộc bộ phận này.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Thứ tự hiển thị</label>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
                  placeholder={editing ? undefined : 'Để trống — gán tự động'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Số nhỏ hơn hiển thị trước trong danh sách/lọc.
                  {!editing && ' Khi thêm mới, để trống để hệ thống gán thứ tự tiếp theo.'}
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                >
                  Hủy
                </button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium">
                  {editing ? 'Cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HrDepartmentUnitManager;
