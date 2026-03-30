import React, { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Save } from 'lucide-react';
import { apiClient } from '../../api/client';
import { ToolbarButton } from '../../components/ui/ToolbarButton';
import { useNotificationStore } from '../../context/useNotificationStore';
import { administrativeTitleCase } from '../../utils/addressDisplayFormat';

interface WarehouseManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Warehouse {
  id: string;
  code: string;
  name: string;
  address: string;
  manager: string;
  type: string;
  contactName?: string;
  contactPhone?: string;
  detailAddress?: string;
  provinceId?: string;
  districtId?: string;
  wardId?: string;
  province?: { id: string; name: string } | null;
  district?: { id: string; name: string } | null;
  ward?: { id: string; name: string } | null;
}

const WarehouseManagerModal: React.FC<WarehouseManagerModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [currentWarehouse, setCurrentWarehouse] = useState<Partial<Warehouse>>({});
  const { addToast } = useNotificationStore();

  const [provinces, setProvinces] = useState<Array<{ id: string; name: string }>>([]);
  const [districts, setDistricts] = useState<Array<{ id: string; name: string }>>([]);
  const [wards, setWards] = useState<Array<{ id: string; name: string }>>([]);
  const [whAddressType, setWhAddressType] = useState<'OLD' | 'NEW'>('OLD');
  
  const fetchWarehouses = async () => {
    try {
      const res: any = await apiClient.get('/inventory/warehouses');
      setWarehouses(res || []);
    } catch (error) {
      console.error('Failed to fetch warehouses', error);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWarehouses();
      setIsEditing(false);
      setCurrentWarehouse({});
      apiClient.get('/address/provinces').then((res: any) => setProvinces(Array.isArray(res) ? res : [])).catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (currentWarehouse.provinceId) {
      if (whAddressType === 'OLD') {
        apiClient.get(`/address/districts?provinceId=${currentWarehouse.provinceId}`).then((res: any) => setDistricts(Array.isArray(res) ? res : [])).catch(() => {});
        setWards([]);
      } else {
        setDistricts([]);
        apiClient.get(`/address/wards?provinceId=${currentWarehouse.provinceId}&directOnly=1`).then((res: any) => setWards(Array.isArray(res) ? res : [])).catch(() => {});
      }
    } else {
      setDistricts([]);
      setWards([]);
    }
  }, [currentWarehouse.provinceId, whAddressType]);

  useEffect(() => {
    if (whAddressType === 'OLD' && currentWarehouse.districtId) {
      apiClient.get(`/address/wards?districtId=${currentWarehouse.districtId}`).then((res: any) => setWards(Array.isArray(res) ? res : [])).catch(() => {});
    } else if (whAddressType === 'OLD') {
      setWards([]);
    }
  }, [currentWarehouse.districtId, whAddressType]);

  const handleEdit = (warehouse: Warehouse) => {
    setCurrentWarehouse(warehouse);
    setIsEditing(true);
  };

  const handleAddNew = () => {
    setCurrentWarehouse({
      code: '',
      name: '',
      address: '',
      manager: '',
      type: 'MAIN',
      contactName: '',
      contactPhone: '',
      detailAddress: '',
      provinceId: '',
      districtId: '',
      wardId: '',
    });
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setCurrentWarehouse({});
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa kho này?')) return;
    try {
      await apiClient.delete(`/inventory/warehouses/${id}`);
      addToast({ type: 'success', title: 'Thành công', message: 'Xóa kho thành công' });
      fetchWarehouses();
      onSuccess(); // Refresh parent if needed
    } catch (error: any) {
      const rawMessage =
        error?.message ??
        error?.payload?.message ??
        error?.response?.data?.message ??
        'Lỗi khi xóa kho';

      addToast({
        type: 'error',
        title: 'Lỗi',
        message: typeof rawMessage === 'string' ? rawMessage : 'Lỗi khi xóa kho',
      });
    }
  };

  const handleSave = async () => {
    if (!currentWarehouse.code || !currentWarehouse.name) {
      addToast({ type: 'error', title: 'Thiếu thông tin', message: 'Vui lòng nhập mã và tên kho' });
      return;
    }

    const payload = {
      code: String(currentWarehouse.code || '').trim(),
      name: String(currentWarehouse.name || '').trim(),
      manager: currentWarehouse.manager ? String(currentWarehouse.manager).trim() : null,
      type: (currentWarehouse.type || 'MAIN') as string,
      contactName: currentWarehouse.contactName ? String(currentWarehouse.contactName).trim() : null,
      contactPhone: currentWarehouse.contactPhone ? String(currentWarehouse.contactPhone).trim() : null,
      detailAddress: currentWarehouse.detailAddress ? String(currentWarehouse.detailAddress).trim() : null,
      provinceId: currentWarehouse.provinceId || null,
      districtId: currentWarehouse.districtId || null,
      wardId: currentWarehouse.wardId || null,
    };

    try {
      if (currentWarehouse.id) {
        await apiClient.put(`/inventory/warehouses/${currentWarehouse.id}`, payload);
        addToast({ type: 'success', title: 'Thành công', message: 'Cập nhật kho thành công' });
      } else {
        await apiClient.post('/inventory/warehouses', payload);
        addToast({ type: 'success', title: 'Thành công', message: 'Thêm kho mới thành công' });
      }
      setIsEditing(false);
      fetchWarehouses();
      onSuccess();
    } catch (error: any) {
      console.error('Save warehouse error:', error);
      // apiClient dùng fetch và ném ApiHttpError (không có error.response.data như axios)
      const rawMessage =
        error?.message ??
        error?.payload?.message ??
        error?.response?.data?.message ??
        'Lỗi khi lưu thông tin kho';

      const message =
        typeof rawMessage === 'string'
          ? rawMessage
          : 'Lỗi khi lưu thông tin kho';

      addToast({
        type: 'error',
        title: 'Lỗi',
        message,
      });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900">Quản lý Danh sách Kho</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {isEditing ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mã kho *</label>
                  <input
                    type="text"
                    value={currentWarehouse.code || ''}
                    onChange={e => setCurrentWarehouse({...currentWarehouse, code: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="VD: KHO-HCM-01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tên kho *</label>
                  <input
                    type="text"
                    value={currentWarehouse.name || ''}
                    onChange={e => setCurrentWarehouse({...currentWarehouse, name: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="VD: Kho Hồ Chí Minh"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Người quản lý</label>
                  <input
                    type="text"
                    value={currentWarehouse.manager || ''}
                    onChange={e => setCurrentWarehouse({...currentWarehouse, manager: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Loại kho</label>
                  <select
                    value={currentWarehouse.type || 'MAIN'}
                    onChange={e => setCurrentWarehouse({...currentWarehouse, type: e.target.value})}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 bg-white"
                  >
                    <option value="MAIN">Kho tổng</option>
                    <option value="BRANCH">Kho chi nhánh</option>
                    <option value="CONSIGNMENT">Kho ký gửi</option>
                  </select>
                </div>
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Địa chỉ hành chính (dùng làm thông tin người gửi)</h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tên liên hệ</label>
                      <input type="text" value={currentWarehouse.contactName || ''}
                        onChange={e => setCurrentWarehouse({...currentWarehouse, contactName: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Tên người gửi" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SĐT liên hệ</label>
                      <input type="text" value={currentWarehouse.contactPhone || ''}
                        onChange={e => setCurrentWarehouse({...currentWarehouse, contactPhone: e.target.value})}
                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="0901234567" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ chi tiết</label>
                    <input type="text" value={currentWarehouse.detailAddress || ''}
                      onChange={e => setCurrentWarehouse({...currentWarehouse, detailAddress: e.target.value})}
                      className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Số nhà, đường..." />
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <label className="block text-xs font-medium text-gray-500 mb-2">Loại địa chỉ hành chính</label>
                    <div className="flex gap-4">
                      <label className="flex items-center cursor-pointer">
                        <input type="radio" name="wh_addressType" value="OLD" checked={whAddressType === 'OLD'}
                          onChange={() => { setWhAddressType('OLD'); setCurrentWarehouse({...currentWarehouse, districtId: '', wardId: ''}); }}
                          className="w-4 h-4 text-primary" />
                        <span className="ml-2 text-sm"><span className="font-medium">Trước sáp nhập</span> <span className="text-gray-400">(Tỉnh → Huyện → Xã)</span></span>
                      </label>
                      <label className="flex items-center cursor-pointer">
                        <input type="radio" name="wh_addressType" value="NEW" checked={whAddressType === 'NEW'}
                          onChange={() => { setWhAddressType('NEW'); setCurrentWarehouse({...currentWarehouse, districtId: '', wardId: ''}); }}
                          className="w-4 h-4 text-primary" />
                        <span className="ml-2 text-sm"><span className="font-medium">Sau sáp nhập</span> <span className="text-gray-400">(Tỉnh → Xã)</span></span>
                      </label>
                    </div>
                  </div>
                  {whAddressType === 'OLD' && (
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tỉnh/Thành phố</label>
                        <select value={currentWarehouse.provinceId || ''}
                          onChange={e => setCurrentWarehouse({...currentWarehouse, provinceId: e.target.value, districtId: '', wardId: ''})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white">
                          <option value="">-- Chọn tỉnh --</option>
                          {provinces.map(p => <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Quận/Huyện</label>
                        <select value={currentWarehouse.districtId || ''}
                          onChange={e => setCurrentWarehouse({...currentWarehouse, districtId: e.target.value, wardId: ''})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                          disabled={!currentWarehouse.provinceId}>
                          <option value="">{!currentWarehouse.provinceId ? 'Chọn tỉnh trước' : '-- Chọn quận/huyện --'}</option>
                          {districts.map(d => <option key={d.id} value={d.id}>{administrativeTitleCase(d.name)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phường/Xã</label>
                        <select value={currentWarehouse.wardId || ''}
                          onChange={e => setCurrentWarehouse({...currentWarehouse, wardId: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                          disabled={!currentWarehouse.districtId}>
                          <option value="">{!currentWarehouse.districtId ? 'Chọn huyện trước' : '-- Chọn phường/xã --'}</option>
                          {wards.map(w => <option key={w.id} value={w.id}>{administrativeTitleCase(w.name)}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                  {whAddressType === 'NEW' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tỉnh/Thành phố</label>
                        <select value={currentWarehouse.provinceId || ''}
                          onChange={e => setCurrentWarehouse({...currentWarehouse, provinceId: e.target.value, wardId: ''})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white">
                          <option value="">-- Chọn tỉnh --</option>
                          {provinces.map(p => <option key={p.id} value={p.id}>{administrativeTitleCase(p.name)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phường/Xã</label>
                        <select value={currentWarehouse.wardId || ''}
                          onChange={e => setCurrentWarehouse({...currentWarehouse, wardId: e.target.value})}
                          className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-white"
                          disabled={!currentWarehouse.provinceId}>
                          <option value="">{!currentWarehouse.provinceId ? 'Chọn tỉnh trước' : '-- Chọn phường/xã --'}</option>
                          {wards.map(w => <option key={w.id} value={w.id}>{administrativeTitleCase(w.name)}</option>)}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <ToolbarButton variant="secondary" onClick={handleCancelEdit}>
                  Hủy
                </ToolbarButton>
                <ToolbarButton variant="primary" onClick={handleSave}>
                  <Save size={18} />
                  <span>Lưu</span>
                </ToolbarButton>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-end mb-4">
                <ToolbarButton variant="primary" onClick={handleAddNew}>
                  <Plus size={18} />
                  <span>Thêm kho mới</span>
                </ToolbarButton>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 text-gray-600 text-sm">
                    <tr>
                      <th className="px-4 py-3 font-medium">Mã kho</th>
                      <th className="px-4 py-3 font-medium">Tên kho</th>
                      <th className="px-4 py-3 font-medium">Địa chỉ</th>
                      <th className="px-4 py-3 font-medium">Quản lý</th>
                      <th className="px-4 py-3 font-medium">Loại</th>
                      <th className="px-4 py-3 font-medium text-right">Hành động</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {warehouses.map((w) => (
                      <tr key={w.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{w.code}</td>
                        <td className="px-4 py-3 font-medium">{w.name}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {[w.detailAddress, w.ward?.name ? administrativeTitleCase(w.ward.name) : null, w.district?.name ? administrativeTitleCase(w.district.name) : null, w.province?.name ? administrativeTitleCase(w.province.name) : null].filter(Boolean).join(', ') || w.address || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{w.manager}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                            {w.type === 'MAIN' ? 'Kho tổng' : w.type === 'BRANCH' ? 'Chi nhánh' : 'Ký gửi'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEdit(w)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Sửa"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(w.id)}
                              className="p-1 text-red-600 hover:bg-red-50 rounded"
                              title="Xóa"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {warehouses.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          Chưa có kho nào. Vui lòng thêm kho mới.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default WarehouseManagerModal;
