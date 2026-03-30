import React, { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import { translate } from '../utils/dictionary';
import { Plus, Edit, Trash2, Building, Search } from 'lucide-react';
import type { Subsidiary } from '../types';

interface SubsidiaryManagerProps {
    canEdit: boolean;
}

const SubsidiaryManager: React.FC<SubsidiaryManagerProps> = ({ canEdit }) => {
    const [subsidiaries, setSubsidiaries] = useState<Subsidiary[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<Subsidiary | null>(null);
    const [formData, setFormData] = useState({
        name: '',
        code: ''
    });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res: any = await apiClient.get('/hr/subsidiaries');
            setSubsidiaries(res.data || res || []);
        } catch (error) {
            console.error('Error fetching subsidiaries:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (item?: Subsidiary) => {
        setEditingItem(item || null);
        if (item) {
            setFormData({
                name: item.name,
                code: item.code
            });
        } else {
            setFormData({
                name: '',
                code: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const isEdit = !!editingItem;
            const url = isEdit ? `/hr/subsidiaries/${editingItem?.id}` : '/hr/subsidiaries';
            const method = isEdit ? 'put' : 'post';
            
            const res: any = await (apiClient as any)[method](url, formData);
            
            if (res) {
                const data = res.data || res;
                if (isEdit) {
                     setSubsidiaries(prev => prev.map(item => item.id === data.id ? data : item));
                } else {
                     setSubsidiaries(prev => [...prev, data]);
                }
            }
            
            setIsModalOpen(false);
        } catch (error: any) {
            console.error('Error saving subsidiary:', error);
            alert(error.response?.data?.message || error.message || translate('Error saving data'));
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(translate('Are you sure you want to delete this subsidiary?'))) return;
        try {
            await apiClient.delete(`/hr/subsidiaries/${id}`);
            setSubsidiaries(prev => prev.filter(item => item.id !== id));
        } catch (error: any) {
            console.error('Error deleting subsidiary:', error);
            alert(error.response?.data?.message || error.message || translate('Error deleting data'));
        }
    };

    const filteredSubsidiaries = subsidiaries.filter(sub => 
        translate(sub.name).toLowerCase().includes(searchTerm.toLowerCase()) ||
        sub.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="text-center py-8">Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">{translate('Subsidiaries')}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {translate('Total Subsidiaries')}: <span className="font-semibold text-primary">{subsidiaries.length}</span>
                        </p>
                    </div>
                    {canEdit && (
                        <button
                            onClick={() => handleOpenModal()}
                            className="w-full sm:w-auto px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 flex items-center justify-center gap-2"
                        >
                            <Plus size={16} /> {translate('Add Subsidiary')}
                        </button>
                    )}
                </div>

                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text"
                        placeholder={translate('Search by name or code...')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredSubsidiaries.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        {translate('No subsidiaries found')}
                    </div>
                ) : (
                    filteredSubsidiaries.map((sub) => (
                        <div key={sub.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                            <div className="p-5">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                        <Building size={20} />
                                    </div>
                                    {canEdit && (
                                        <div className="flex items-center gap-1">
                                            <button 
                                                onClick={() => handleOpenModal(sub)}
                                                className="p-1.5 text-gray-400 hover:text-primary hover:bg-gray-50 rounded"
                                                title={translate('Edit')}
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(sub.id)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-gray-50 rounded"
                                                title={translate('Delete')}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                                
                                <h4 className="font-bold text-gray-900 mb-1 text-lg">{translate(sub.name)}</h4>
                                <div className="flex items-center gap-2">
                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded font-medium border border-gray-200">
                                        {sub.code}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">
                                {editingItem ? translate('Edit Subsidiary') : translate('Add Subsidiary')}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                <span className="sr-only">Close</span>
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {translate('Subsidiary Name')} <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    placeholder={translate('Example') + ": Kagri Tech"}
                                />
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {translate('Subsidiary Code')}
                                    {editingItem && <span className="text-red-500"> *</span>}
                                </label>
                                <input
                                    type="text"
                                    required={!!editingItem}
                                    maxLength={10}
                                    value={formData.code}
                                    onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono"
                                    placeholder={editingItem ? translate('Example') + ": KGT" : translate('Auto generate if empty')}
                                    disabled={!!editingItem}
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    {editingItem 
                                        ? translate('Code cannot be changed after creation')
                                        : translate('Leave empty to auto-generate code (C01, C02...)')
                                    }
                                </p>
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium"
                                >
                                    {translate('Cancel')}
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium"
                                >
                                    {editingItem ? translate('Update') : translate('Create New')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubsidiaryManager;
