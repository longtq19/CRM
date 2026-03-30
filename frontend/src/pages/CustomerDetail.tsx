import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDataStore } from '../context/useDataStore';
import { useAuthStore } from '../context/useAuthStore';
import { 
  ArrowLeft, MapPin, Phone, Calendar, 
  Edit, Mail, Star, Plus, User
} from 'lucide-react';
import clsx from 'clsx';
import { formatDate, formatDateTime } from '../utils/format';
import type { Customer } from '../types';
import { apiClient } from '../api/client';
import type { CustomerStatus } from '../components/settings/CustomerStatusSettings';

const CustomerDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { customers, internalNotes, addInternalNote, updateCustomer, users } = useDataStore();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'info' | 'interested' | 'rank' | 'notes'>('info');

  // Modals
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState('');
  
  const [isEditInfoModalOpen, setIsEditInfoModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<Partial<Customer> & { statusId?: string | null }>({});
  const [statuses, setStatuses] = useState<CustomerStatus[]>([]);
  const [isEditFarmModalOpen, setIsEditFarmModalOpen] = useState(false);
  const [editFarmData, setEditFarmData] = useState<any>({});

  const customer = customers.find(c => c.id === id);
  const staff = users.find(u => u.id === customer?.assignedStaffId);

  // Derived Data
  const customerNotes = useMemo(() => internalNotes.filter(n => n.customerId === id), [internalNotes, id]);

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h2 className="text-xl font-bold text-gray-800">Không tìm thấy khách hàng</h2>
        <button onClick={() => navigate('/customers')} className="mt-4 text-primary hover:underline flex items-center gap-2">
          <ArrowLeft size={20} /> Quay lại danh sách
        </button>
      </div>
    );
  }

  // Handlers
  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return;
    try {
      await addInternalNote({
        authorId: user?.id || 'unknown',
        authorName: user?.name || 'Unknown',
        content: newNoteContent,
        date: new Date().toISOString(),
        relatedTo: `Customer: ${customer.name}`,
        customerId: customer.id
      });
      setNewNoteContent('');
      setIsNoteModalOpen(false);
    } catch (error) {
      alert('Không thể thêm ghi chú');
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
          await updateCustomer(customer.id, editFormData);
          setIsEditInfoModalOpen(false);
      } catch (error) {
          alert('Không thể cập nhật thông tin');
      }
  };

  const openEditModal = async () => {
      setEditFormData({
          name: customer.name,
          phone: customer.phone,
          email: customer.email,
          address: customer.address,
          dob: customer.dob,
          statusId: customer.customerStatus?.id || null
      });
      setIsEditInfoModalOpen(true);
      
      try {
        const data = await apiClient.get('/customer-statuses');
        setStatuses(Array.isArray(data) ? data.filter(s => s.isActive) : []);
      } catch (e) {
        console.error('Lỗi khi tải trạng thái tuỳ chỉnh', e);
      }
  };

  const handleUpdateFarm = (e: React.FormEvent) => {
    e.preventDefault();
    setIsEditFarmModalOpen(false);
  };

  // Mock Interested Products
  const interestedProducts = [
      { id: 1, name: 'Combo IoT Sầu riêng Pro', views: 5, lastView: '2023-10-25' },
      { id: 2, name: 'Cảm biến độ ẩm đất', views: 12, lastView: '2023-11-02' },
      { id: 3, name: 'Hệ thống tưới nhỏ giọt', views: 3, lastView: '2023-09-15' },
  ];

  return (
    <div className="space-y-6">
      <button 
        onClick={() => navigate('/customers')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={20} /> Quay lại
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel: Fixed Info */}
        <div className="lg:col-span-1 space-y-6">
            <div className="card text-center relative bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                 {(user?.role === 'admin' || user?.role === 'tech' || 
                   (user?.role === 'manager' && (customer.assignedStaffId === user.id || staff?.managerId === user.id)) ||
                   (user?.role === 'staff' && customer.assignedStaffId === user.id)) && (
                    <button 
                        onClick={openEditModal}
                        className="absolute top-4 right-4 text-gray-400 hover:text-primary"
                    >
                        <Edit size={18} />
                    </button>
                 )}
                
                <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-3xl mx-auto mb-4">
                    {customer.name.charAt(0)}
                </div>
                <h2 className="text-xl font-bold text-gray-900">{customer.name}</h2>
                <div className="mt-2 flex justify-center">
                    <span className={clsx(
                      "px-3 py-1 rounded-full text-xs font-medium",
                      customer.membershipTier === 'Platinum' ? "bg-purple-100 text-purple-700" :
                      customer.membershipTier === 'Gold' ? "bg-yellow-100 text-yellow-700" :
                      customer.membershipTier === 'Silver' ? "bg-gray-200 text-gray-700" :
                      "bg-orange-100 text-orange-700"
                    )}>
                      {customer.membershipTier} Member
                    </span>
                </div>
                
                <div className="mt-6 space-y-3 text-left">
                    <div className="flex items-center gap-3 text-gray-600 text-sm">
                        <Phone size={16} />
                        <span>{customer.phone}</span>
                    </div>
                    {customer.email && (
                        <div className="flex items-center gap-3 text-gray-600 text-sm">
                            <Mail size={16} />
                            <span>{customer.email}</span>
                        </div>
                    )}
                    <div className="flex items-center gap-3 text-gray-600 text-sm">
                        <MapPin size={16} />
                        <span className="truncate">{customer.address}</span>
                    </div>
                     <div className="flex items-center gap-3 text-gray-600 text-sm">
                        <Calendar size={16} />
                        <span>Sinh nhật: {customer.dob ? formatDate(customer.dob) : '---'}</span>
                    </div>
                </div>

                <div className="mt-6 pt-6 border-t border-gray-100 text-left">
                    <p className="text-xs text-gray-500 uppercase font-semibold mb-3">Nhân viên phụ trách</p>
                    <div className="flex items-center gap-3">
                         <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-bold">
                            {staff?.name.charAt(0) || '?'}
                         </div>
                         <div>
                             <p className="font-medium text-sm">{staff?.name || 'Chưa gán'}</p>
                             <p className="text-xs text-gray-500">{staff?.phone}</p>
                         </div>
                    </div>
                </div>
            </div>
        </div>

        {/* Right Panel: Tabs */}
        <div className="lg:col-span-3">
            <div className="bg-white rounded-t-xl border-b border-gray-200 px-4">
                <div className="flex gap-6 overflow-x-auto">
                    {[
                        { id: 'info', label: 'Thông tin' },
                        { id: 'interested', label: 'Quan tâm' },
                        { id: 'rank', label: 'Hạng' },
                        { id: 'notes', label: 'Ghi chú' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={clsx(
                                "py-4 font-medium text-sm whitespace-nowrap border-b-2 transition-colors",
                                activeTab === tab.id ? "border-primary text-primary" : "border-transparent text-gray-500 hover:text-gray-700"
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-b-xl p-6 min-h-[400px]">
                {/* Tab: Info */}
                {activeTab === 'info' && (
                    <div className="space-y-6">
                        <h3 className="font-bold mb-4">Thông tin chi tiết</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Họ và tên</label>
                                <p className="text-gray-900 font-medium">{customer.name}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Số điện thoại</label>
                                <p className="text-gray-900 font-medium">{customer.phone}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Trạng thái tuỳ chỉnh</label>
                                {customer.customerStatus ? (
                                    <span
                                      className="px-2 py-1 rounded-full text-xs font-medium text-white inline-block mt-1"
                                      style={{ backgroundColor: customer.customerStatus.color }}
                                    >
                                      {customer.customerStatus.name}
                                    </span>
                                ) : (
                                    <p className="text-gray-400 font-medium">---</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Email</label>
                                <p className="text-gray-900 font-medium">{customer.email || '---'}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Ngày sinh</label>
                                <p className="text-gray-900 font-medium">{customer.dob ? formatDate(customer.dob) : '---'}</p>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-500 mb-1">Địa chỉ</label>
                                <p className="text-gray-900 font-medium">{customer.address}</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Ngày gia nhập</label>
                                <p className="text-gray-900 font-medium">{customer.joinedDate ? formatDate(customer.joinedDate) : '---'}</p>
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Tổng chi tiêu</label>
                                <p className="text-primary font-bold">{new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(customer.totalOrdersValue)}</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Tab: Interested */}
                {activeTab === 'interested' && (
                    <div className="space-y-6">
                        <h3 className="font-bold mb-4">Sản phẩm & Giải pháp quan tâm</h3>
                        
                        {/* Tags from Customer Profile */}
                        {customer.interests && customer.interests.length > 0 && (
                            <div className="mb-6">
                                <h4 className="text-sm font-medium text-gray-500 mb-3">Sở thích / Nhu cầu (Tags)</h4>
                                <div className="flex flex-wrap gap-2">
                                    {customer.interests.map((interest, idx) => (
                            <span key={`${interest}-${idx}`} className="px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm border border-purple-100">
                                {interest}
                            </span>
                        ))}
                                </div>
                            </div>
                        )}

                        {/* Mock Tracking Data */}
                        <div>
                             <h4 className="text-sm font-medium text-gray-500 mb-3">Lịch sử xem sản phẩm (Mock)</h4>
                             <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-600">
                                        <tr>
                                            <th className="px-4 py-3">Sản phẩm</th>
                                            <th className="px-4 py-3 text-center">Lượt xem</th>
                                            <th className="px-4 py-3 text-right">Xem lần cuối</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {interestedProducts.map(p => (
                                            <tr key={p.id}>
                                                <td className="px-4 py-3 font-medium">{p.name}</td>
                                                <td className="px-4 py-3 text-center">{p.views}</td>
                                                <td className="px-4 py-3 text-right">{p.lastView}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                             </div>
                        </div>
                    </div>
                )}



                {/* Tab: Rank */}
                {activeTab === 'rank' && (
                    <div className="space-y-6">
                        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-xl p-8 text-white relative overflow-hidden">
                             <div className="relative z-10">
                                 <h3 className="text-lg font-medium text-gray-300 mb-2">Hạng thành viên hiện tại</h3>
                                 <div className="flex items-center gap-4">
                                     <div className="w-16 h-16 bg-yellow-500 rounded-full flex items-center justify-center text-black font-bold text-2xl border-4 border-yellow-200">
                                         {customer.membershipTier.charAt(0)}
                                     </div>
                                     <div>
                                         <h2 className="text-3xl font-bold text-yellow-400">{customer.membershipTier} Member</h2>
                                         <p className="text-gray-400 mt-1">Gia nhập: {formatDate(customer.joinedDate)}</p>
                                     </div>
                                 </div>
                             </div>
                             {/* Decorative circles */}
                             <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-5 rounded-full"></div>
                             <div className="absolute bottom-0 right-20 -mb-10 w-24 h-24 bg-white opacity-5 rounded-full"></div>
                        </div>

                        <div className="bg-white border border-gray-200 rounded-xl p-6">
                            <h4 className="font-bold mb-4 text-gray-900">Quyền lợi hạng {customer.membershipTier}</h4>
                            <ul className="space-y-3">
                                <li className="flex items-center gap-3 text-sm text-gray-700">
                                    <Star size={16} className="text-yellow-500" />
                                    <span>Tích điểm 1% cho mọi đơn hàng</span>
                                </li>
                                <li className="flex items-center gap-3 text-sm text-gray-700">
                                    <Star size={16} className="text-yellow-500" />
                                    <span>Miễn phí vận chuyển cho đơn từ 2.000.000đ</span>
                                </li>
                                {customer.membershipTier !== 'Bronze' && (
                                    <li className="flex items-center gap-3 text-sm text-gray-700">
                                        <Star size={16} className="text-yellow-500" />
                                        <span>Ưu tiên hỗ trợ kỹ thuật 24/7</span>
                                    </li>
                                )}
                                {(customer.membershipTier === 'Gold' || customer.membershipTier === 'Platinum') && (
                                    <li className="flex items-center gap-3 text-sm text-gray-700">
                                        <Star size={16} className="text-yellow-500" />
                                        <span>Quà tặng sinh nhật đặc biệt</span>
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                )}

                {/* Tab: Notes */}
                {activeTab === 'notes' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold">Ghi chú nội bộ ({customerNotes.length})</h3>
                            <button 
                                onClick={() => setIsNoteModalOpen(true)}
                                className="px-3 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 flex items-center gap-2"
                            >
                                <Plus size={16} /> Thêm ghi chú
                            </button>
                        </div>

                        <div className="space-y-4">
                            {customerNotes.map(note => (
                                <div key={note.id} className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg relative">
                                    <p className="text-gray-800 whitespace-pre-wrap mb-2">{note.content}</p>
                                    <div className="flex items-center justify-between text-xs text-gray-500 mt-2 pt-2 border-t border-yellow-200/50">
                                        <div className="flex items-center gap-2">
                                            <User size={12} />
                                            <span className="font-medium">{note.authorName}</span>
                                        </div>
                                        <span>{formatDateTime(note.date)}</span>
                                    </div>
                                </div>
                            ))}
                            {customerNotes.length === 0 && (
                                <div className="text-center py-8 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                                    Chưa có ghi chú nào. Hãy thêm ghi chú đầu tiên!
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Edit Info Modal */}
      {isEditInfoModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 w-full max-w-lg">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold">Chỉnh sửa thông tin</h3>
                    <button onClick={() => setIsEditInfoModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <Plus size={24} className="rotate-45" />
                    </button>
                </div>
                <form onSubmit={handleUpdateCustomer} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tên khách hàng</label>
                        <input
                            type="text"
                            value={editFormData.name || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                        <input
                            type="text"
                            value={editFormData.phone || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            value={editFormData.email || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                        <input
                            type="text"
                            value={editFormData.address || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái tuỳ chỉnh</label>
                        <select
                            value={editFormData.statusId || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, statusId: e.target.value || null })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        >
                            <option value="">-- Không có trạng thái --</option>
                            {statuses.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ngày sinh</label>
                        <input
                            type="date"
                            value={editFormData.dob ? new Date(editFormData.dob).toISOString().split('T')[0] : ''}
                            onChange={(e) => setEditFormData({ ...editFormData, dob: new Date(e.target.value).toISOString() })}
                            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                        />
                    </div>
                    <div className="flex justify-end gap-3 mt-6">
                        <button 
                            type="button" 
                            onClick={() => setIsEditInfoModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                        >
                            Hủy
                        </button>
                        <button 
                            type="submit" 
                            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                        >
                            Lưu thay đổi
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Note Modal */}
      {isNoteModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-lg">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold">Thêm ghi chú mới</h3>
                      <button onClick={() => setIsNoteModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <Plus size={24} className="rotate-45" />
                      </button>
                  </div>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Nội dung ghi chú</label>
                          <textarea
                              value={newNoteContent}
                              onChange={(e) => setNewNoteContent(e.target.value)}
                              rows={4}
                              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              placeholder="Nhập nội dung ghi chú..."
                          />
                      </div>
                      <div className="flex justify-end gap-3 mt-6">
                          <button 
                              onClick={() => setIsNoteModalOpen(false)}
                              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                              Hủy
                          </button>
                          <button 
                              onClick={handleAddNote}
                              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                              disabled={!newNoteContent.trim()}
                          >
                              Thêm ghi chú
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Edit Farm Modal */}
      {isEditFarmModalOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl p-6 w-full max-w-lg">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-bold">Chỉnh sửa nông trại</h3>
                      <button onClick={() => setIsEditFarmModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <Plus size={24} className="rotate-45" />
                      </button>
                  </div>
                  <form onSubmit={handleUpdateFarm} className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tên nông trại</label>
                          <input
                              type="text"
                              value={editFarmData.name || ''}
                              onChange={(e) => setEditFarmData({ ...editFarmData, name: e.target.value })}
                              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              required
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                          <input
                              type="text"
                              value={editFarmData.address || ''}
                              onChange={(e) => setEditFarmData({ ...editFarmData, address: e.target.value })}
                              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              required
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Loại cây trồng</label>
                          <select
                              value={editFarmData.cropType || ''}
                              onChange={(e) => setEditFarmData({ ...editFarmData, cropType: e.target.value as any })}
                              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              required
                          >
                              <option value="Cà phê">Cà phê</option>
                              <option value="Sầu riêng">Sầu riêng</option>
                              <option value="Lúa">Lúa</option>
                              <option value="Thanh long">Thanh long</option>
                              <option value="Khác">Khác</option>
                          </select>
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Diện tích (ha)</label>
                          <input
                              type="number"
                              value={editFarmData.area || 0}
                              onChange={(e) => setEditFarmData({ ...editFarmData, area: Number(e.target.value) })}
                              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                              required
                          />
                      </div>
                      <div className="flex justify-end gap-3 mt-6">
                          <button 
                              type="button" 
                              onClick={() => setIsEditFarmModalOpen(false)}
                              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                          >
                              Hủy
                          </button>
                          <button 
                              type="submit" 
                              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                          >
                              Lưu thay đổi
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}
    </div>
  );
};

export default CustomerDetail;
