import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, RefreshCw, Award, Users } from 'lucide-react';
import { apiClient } from '../../api/client';
import { formatCurrency } from '../../utils/format';

interface SpendingRank {
  id: string;
  code: string;
  name: string;
  minAmount: number;
  maxAmount: number;
  _count?: { customers: number };
}

interface RankStatistics {
  ranks: Array<{
    id: string;
    code: string;
    name: string;
    minAmount: number;
    maxAmount: number;
    customerCount: number;
    totalRevenue: number;
  }>;
  noRankCustomers: number;
}

const CustomerRankSettings: React.FC = () => {
  const [ranks, setRanks] = useState<SpendingRank[]>([]);
  const [statistics, setStatistics] = useState<RankStatistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRank, setEditingRank] = useState<SpendingRank | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    minAmount: 0,
    maxAmount: 0
  });

  useEffect(() => {
    fetchRanks();
    fetchStatistics();
  }, []);

  const fetchRanks = async () => {
    try {
      const data = await apiClient.get('/customer-ranks/spending-ranks');
      setRanks(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Fetch ranks error:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStatistics = async () => {
    try {
      const data = await apiClient.get('/customer-ranks/spending-ranks/statistics');
      setStatistics(data);
    } catch (error) {
      console.error('Fetch statistics error:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingRank) {
        await apiClient.put(`/customer-ranks/spending-ranks/${editingRank.id}`, formData);
      } else {
        await apiClient.post('/customer-ranks/spending-ranks', formData);
      }
      setShowModal(false);
      setEditingRank(null);
      setFormData({ code: '', name: '', minAmount: 0, maxAmount: 0 });
      fetchRanks();
      fetchStatistics();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleEdit = (rank: SpendingRank) => {
    setEditingRank(rank);
    setFormData({
      code: rank.code,
      name: rank.name,
      minAmount: Number(rank.minAmount),
      maxAmount: Number(rank.maxAmount)
    });
    setShowModal(true);
  };

  const handleDelete = async (rank: SpendingRank) => {
    if (!confirm(`Xóa hạng "${rank.name}"? Khách hàng thuộc hạng này sẽ được reset.`)) return;
    try {
      await apiClient.delete(`/customer-ranks/spending-ranks/${rank.id}`);
      fetchRanks();
      fetchStatistics();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Có lỗi xảy ra');
    }
  };

  const handleRecalculate = async () => {
    if (!confirm('Cập nhật lại hạng cho tất cả khách hàng dựa trên tổng chi tiêu?')) return;
    setRecalculating(true);
    try {
      const res = await apiClient.post('/customer-ranks/spending-ranks/recalculate');
      alert(res.message);
      fetchStatistics();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setRecalculating(false);
    }
  };

  const getRankColor = (code: string) => {
    const colors: Record<string, string> = {
      BRONZE: 'bg-amber-600',
      SILVER: 'bg-gray-400',
      GOLD: 'bg-yellow-500',
      PLATINUM: 'bg-purple-600',
      DIAMOND: 'bg-cyan-500'
    };
    return colors[code] || 'bg-blue-500';
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Phân hạng khách hàng theo chi tiêu</h3>
          <p className="text-sm text-gray-500">Cấu hình các mức hạng dựa trên tổng chi tiêu của khách hàng</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRecalculate}
            disabled={recalculating || ranks.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50"
          >
            <RefreshCw size={16} className={recalculating ? 'animate-spin' : ''} />
            Cập nhật hạng
          </button>
          <button
            onClick={() => {
              setEditingRank(null);
              setFormData({ code: '', name: '', minAmount: 0, maxAmount: 0 });
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            <Plus size={16} />
            Thêm hạng
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      {statistics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statistics.ranks.map(rank => (
            <div key={rank.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-3 h-3 rounded-full ${getRankColor(rank.code)}`}></div>
                <span className="font-medium text-gray-900">{rank.name}</span>
              </div>
              <div className="flex items-center gap-1 text-2xl font-bold text-gray-900">
                <Users size={20} className="text-gray-400" />
                {rank.customerCount}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Doanh thu: {formatCurrency(rank.totalRevenue)}
              </p>
            </div>
          ))}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-gray-300"></div>
              <span className="font-medium text-gray-600">Chưa xếp hạng</span>
            </div>
            <div className="flex items-center gap-1 text-2xl font-bold text-gray-600">
              <Users size={20} className="text-gray-400" />
              {statistics.noRankCustomers}
            </div>
          </div>
        </div>
      )}

      {/* Ranks Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hạng</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mã</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Từ (VNĐ)</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Đến (VNĐ)</th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Số KH</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Thao tác</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {ranks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  <Award size={48} className="mx-auto mb-4 text-gray-300" />
                  <p>Chưa có cấu hình hạng chi tiêu</p>
                  <p className="text-sm">Nhấn "Thêm hạng" để bắt đầu</p>
                </td>
              </tr>
            ) : (
              ranks.map(rank => (
                <tr key={rank.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full ${getRankColor(rank.code)}`}></div>
                      <span className="font-medium text-gray-900">{rank.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-500 font-mono text-sm">{rank.code}</td>
                  <td className="px-6 py-4 text-right text-gray-900">{formatCurrency(rank.minAmount)}</td>
                  <td className="px-6 py-4 text-right text-gray-900">{formatCurrency(rank.maxAmount)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {rank._count?.customers || 0}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(rank)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(rank)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {editingRank ? 'Chỉnh sửa hạng' : 'Thêm hạng mới'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã hạng</label>
                <input
                  type="text"
                  value={formData.code}
                  onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  disabled={!!editingRank}
                  placeholder="VD: BRONZE, SILVER, GOLD..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-gray-100"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên hạng</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="VD: Đồng, Bạc, Vàng..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Từ (VNĐ)</label>
                  <input
                    type="number"
                    value={formData.minAmount}
                    onChange={e => setFormData({ ...formData, minAmount: Number(e.target.value) })}
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Đến (VNĐ)</label>
                  <input
                    type="number"
                    value={formData.maxAmount}
                    onChange={e => setFormData({ ...formData, maxAmount: Number(e.target.value) })}
                    min={0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                >
                  {editingRank ? 'Cập nhật' : 'Thêm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerRankSettings;
