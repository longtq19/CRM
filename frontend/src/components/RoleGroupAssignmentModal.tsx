import React, { useState, useEffect } from 'react';
import { X, Check, Search, Loader } from 'lucide-react';
import { apiClient } from '../api/client';
import type { RoleGroup, Employee } from '../types';
import { translate } from '../utils/dictionary';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    roleGroups: RoleGroup[];
    onSuccess: () => void;
}

export const RoleGroupAssignmentModal: React.FC<Props> = ({ isOpen, onClose, roleGroups, onSuccess }) => {
    const [selectedRoleGroup, setSelectedRoleGroup] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());
    const [employeeSearch, setEmployeeSearch] = useState('');

    useEffect(() => {
        if (isOpen) {
            fetchData();
            setMessage(null);
            setSelectedRoleGroup('');
            setSelectedEmployees(new Set());
            setEmployeeSearch('');
        }
    }, [isOpen]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const empRes = await apiClient.get('/hr/employees?limit=1000');
            setEmployees((empRes as any).data || []);
        } catch (error) {
            console.error('Error fetching data:', error);
            setMessage({ type: 'error', text: 'Lỗi khi tải dữ liệu' });
        } finally {
            setLoading(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedRoleGroup) {
            setMessage({ type: 'error', text: 'Vui lòng chọn nhóm quyền' });
            return;
        }

        if (selectedEmployees.size === 0) {
            setMessage({ type: 'error', text: 'Vui lòng chọn ít nhất một nhân viên' });
            return;
        }

        try {
            setSubmitting(true);
            const payload = {
                roleGroupId: selectedRoleGroup,
                employeeIds: Array.from(selectedEmployees),
            };

            const res: any = await apiClient.post('/hr/employees/assign-role-group', payload);

            if (res.success) {
                setMessage({ type: 'success', text: res.message });
                setTimeout(() => {
                    onSuccess();
                    onClose();
                }, 1500);
            } else {
                setMessage({ type: 'error', text: res.message || 'Có lỗi xảy ra' });
            }
        } catch (error: any) {
            console.error('Assign error:', error);
            setMessage({ type: 'error', text: error.message || 'Lỗi hệ thống' });
        } finally {
            setSubmitting(false);
        }
    };

    const toggleEmployee = (id: string) => {
        const newSet = new Set(selectedEmployees);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedEmployees(newSet);
    };

    const filteredEmployees = employees.filter(e =>
        e.fullName.toLowerCase().includes(employeeSearch.toLowerCase()) ||
        e.code.toLowerCase().includes(employeeSearch.toLowerCase())
    );

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800">Phân quyền nhanh</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto">
                    {message && (
                        <div className={clsx("p-3 rounded-lg text-sm mb-4",
                            message.type === 'success' ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
                            {message.text}
                        </div>
                    )}

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Chọn Nhóm quyền áp dụng</label>
                        <select
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                            value={selectedRoleGroup}
                            onChange={(e) => setSelectedRoleGroup(e.target.value)}
                        >
                            <option value="">-- Chọn Nhóm quyền --</option>
                            {roleGroups.map(rg => (
                                <option key={rg.id} value={rg.id}>{translate(rg.name)}</option>
                            ))}
                        </select>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-8"><Loader className="animate-spin text-gray-400" /></div>
                    ) : (
                        <div className="space-y-4">
                            <div className="relative">
                                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Tìm kiếm nhân viên..."
                                    className="w-full pl-10 p-2 border border-gray-300 rounded-lg"
                                    value={employeeSearch}
                                    onChange={(e) => setEmployeeSearch(e.target.value)}
                                />
                            </div>
                            <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                                {filteredEmployees.length > 0 ? filteredEmployees.map(emp => (
                                    <label key={emp.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
                                            checked={selectedEmployees.has(emp.id)}
                                            onChange={() => toggleEmployee(emp.id)}
                                        />
                                        <div>
                                            <div className="font-medium text-gray-900">{emp.fullName}</div>
                                            <div className="text-xs text-gray-500">{emp.code} - {translate(emp.department?.name || '')}</div>
                                        </div>
                                    </label>
                                )) : (
                                    <div className="p-4 text-center text-gray-500 text-sm">Không tìm thấy nhân viên</div>
                                )}
                            </div>
                            <div className="text-sm text-gray-600 text-right">
                                Đã chọn: <span className="font-bold text-primary">{selectedEmployees.size}</span> nhân viên
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                    >
                        Đóng
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={submitting || loading || !selectedRoleGroup}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? <Loader className="animate-spin" size={18} /> : <Check size={18} />}
                        Lưu thay đổi
                    </button>
                </div>
            </div>
        </div>
    );
};
