import React, { useState } from 'react';
import { X, Check, Loader } from 'lucide-react';
import { apiClient } from '../api/client';
import clsx from 'clsx';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newRole: any) => void;
}

export const RoleGroupCreateModal: React.FC<Props> = ({ isOpen, onClose, onSuccess }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!name) {
            setError('Vui lòng nhập tên nhóm quyền');
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const res: any = await apiClient.post('/role-groups', { name, code });
            
            if (res.success) {
                onSuccess(res.data);
                onClose();
                setName('');
                setCode('');
            } else {
                setError(res.message || 'Có lỗi xảy ra');
            }
        } catch (err: any) {
            setError(err.message || 'Lỗi hệ thống');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-lg text-gray-800">Thêm Nhóm quyền mới</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X size={24} />
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
                            {error}
                        </div>
                    )}
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tên Nhóm quyền <span className="text-red-500">*</span></label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                            placeholder="Ví dụ: Quản lý Marketing"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Mã Nhóm quyền</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary uppercase"
                            placeholder="Ví dụ: MKT_MGR (Tự động tạo nếu để trống)"
                            value={code}
                            onChange={e => setCode(e.target.value.toUpperCase())}
                        />
                        <p className="text-xs text-gray-500 mt-1">Mã viết liền không dấu. Nếu để trống sẽ tự động tạo từ Tên nhóm quyền.</p>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end gap-3">
                    <button 
                        onClick={onClose}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={loading}
                        className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium flex items-center gap-2 disabled:opacity-50"
                    >
                        {loading ? <Loader className="animate-spin" size={18} /> : <Check size={18} />}
                        Tạo mới
                    </button>
                </div>
            </div>
        </div>
    );
};
