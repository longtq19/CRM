import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '../api/client';
import {
  DollarSign,
  TrendingUp,
  Users,
  Target,
  BarChart2,
  Plus,
  Edit,
  Trash2,
  Loader,
  Info,
  Award,
  ArrowUp,
  ArrowDown,
  Calendar,
  Filter,
  RefreshCcw,
  Search,
  Check,
  X,
} from 'lucide-react';
import { formatDate } from '../utils/format';

interface CampaignCost {
  id: string;
  campaignId: string;
  costDate: string;
  amount: number;
  costType: string;
  platform: string | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  description: string | null;
  source?: { id: string; name: string } | null;
  createdBy?: { id: string; fullName: string } | null;
}

interface CampaignEffectiveness {
  campaignId: string;
  campaignCode: string;
  campaignName: string;
  status: string;
  source: { id: string; name: string } | null;
  createdBy: { id: string; fullName: string } | null;
  startDate: string;
  endDate: string | null;
  budget: number;
  metrics: {
    totalCost: number;
    totalImpressions: number;
    totalClicks: number;
    totalReach: number;
    totalLeads: number;
    convertedCustomers: number;
    totalRevenue: number;
  };
  kpis: {
    cpl: number;
    cpa: number;
    cvr: number;
    roas: number;
    roi: number;
    ctr: number;
    cpc: number;
    cpm: number;
  };
  revenueRank: number;
  roiRank: number;
  roasRank: number;
}

interface EffectivenessSummary {
  totalCampaigns: number;
  totalCost: number;
  totalLeads: number;
  totalConversions: number;
  totalRevenue: number;
  totalImpressions: number;
  totalClicks: number;
  avgCPL: number;
  avgCPA: number;
  avgCVR: number;
  overallROAS: number;
  overallROI: number;
}

interface Campaign {
  id: string;
  code: string;
  name: string;
}

interface Employee {
  id: string;
  code: string;
  fullName: string;
  avatarUrl?: string;
}

interface MarketingCostEffectivenessProps {
  campaigns: Campaign[];
}

const COST_TYPES = [
  { value: 'AD_SPEND', label: 'Chi phí quảng cáo' },
  { value: 'CONTENT', label: 'Nội dung' },
  { value: 'DESIGN', label: 'Thiết kế' },
  { value: 'TOOL', label: 'Công cụ' },
  { value: 'EVENT', label: 'Sự kiện' },
  { value: 'INFLUENCER', label: 'Influencer/KOL' },
];

const PLATFORMS = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'google', label: 'Google Ads' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'zalo', label: 'Zalo' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'lazada', label: 'Lazada' },
];

const KPI_TOOLTIPS: Record<string, string> = {
  cpl: 'CPL (Cost Per Lead): Chi phí để có được 1 lead. Công thức: Tổng chi phí / Số lead',
  cpa: 'CPA (Cost Per Acquisition): Chi phí để có được 1 khách hàng mua hàng. Công thức: Tổng chi phí / Số khách mua',
  cvr: 'CVR (Conversion Rate): Tỷ lệ chuyển đổi từ lead sang khách hàng. Công thức: (Số khách mua / Số lead) × 100%',
  roas: 'ROAS (Return On Ad Spend): Doanh thu trên mỗi đồng chi phí. Công thức: Doanh thu / Chi phí. ROAS > 1 là có lãi',
  roi: 'ROI (Return On Investment): Lợi nhuận trên vốn đầu tư. Công thức: ((Doanh thu - Chi phí) / Chi phí) × 100%',
  ctr: 'CTR (Click-Through Rate): Tỷ lệ click trên lượt hiển thị. Công thức: (Số click / Số hiển thị) × 100%',
  cpc: 'CPC (Cost Per Click): Chi phí cho mỗi lượt click. Công thức: Tổng chi phí / Số click',
  cpm: 'CPM (Cost Per Mille): Chi phí cho 1000 lượt hiển thị. Công thức: (Tổng chi phí / Số hiển thị) × 1000',
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat('vi-VN').format(value);
};

const MarketingCostEffectiveness = ({ campaigns }: MarketingCostEffectivenessProps) => {
  const [activeSubTab, setActiveSubTab] = useState<'costs' | 'effectiveness'>('effectiveness');
  
  // Cost states
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [costs, setCosts] = useState<CampaignCost[]>([]);
  const [costSummary, setCostSummary] = useState<any>(null);
  const [costsLoading, setCostsLoading] = useState(false);
  
  // Cost form
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costSubmitting, setCostSubmitting] = useState(false);
  const [editingCost, setEditingCost] = useState<CampaignCost | null>(null);
  const [costForm, setCostForm] = useState({
    costDate: new Date().toISOString().split('T')[0],
    amount: '',
    costType: 'AD_SPEND',
    platform: '',
    impressions: '',
    clicks: '',
    reach: '',
    description: '',
    employeeIds: [] as string[],
  });
  
  const [useCustomCostType, setUseCustomCostType] = useState(false);
  const [useCustomPlatform, setUseCustomPlatform] = useState(false);
  const [costFiles, setCostFiles] = useState<File[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Employee selection for cost
  const [marketingEmployees, setMarketingEmployees] = useState<Employee[]>([]);
  
  // Effectiveness states
  const [effectivenessData, setEffectivenessData] = useState<CampaignEffectiveness[]>([]);
  const [effectivenessSummary, setEffectivenessSummary] = useState<EffectivenessSummary | null>(null);
  const [effectivenessLoading, setEffectivenessLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'revenue' | 'roi' | 'roas'>('revenue');

  useEffect(() => {
    if (activeSubTab === 'effectiveness') {
      loadEffectiveness();
    }
  }, [activeSubTab]);

  useEffect(() => {
    if (selectedCampaignId && activeSubTab === 'costs') {
      loadCosts();
    }
  }, [selectedCampaignId, activeSubTab]);

  useEffect(() => {
    loadMarketingEmployees();
  }, []);

  const loadMarketingEmployees = async () => {
    try {
      // Lấy tất cả nhân viên, sau đó filter phía client
      const res = await apiClient.get('/hr/employees?limit=500');
      let employees: Employee[] = [];
      
      if (Array.isArray(res)) {
        employees = res;
      } else if (res.data) {
        employees = res.data;
      }
      
      // Filter nhân viên Marketing theo nhiều tiêu chí
      const filtered = employees.filter((emp: any) => {
        if (emp.salesType === 'MARKETING') return true;
        if (emp.roleGroup?.code?.includes('MKT')) return true;
        const deptName = emp.department?.name?.toLowerCase() || '';
        const divisionName = emp.department?.division?.name?.toLowerCase() || '';
        if (deptName.includes('marketing') || divisionName.includes('marketing')) return true;
        return false;
      });
      
      setMarketingEmployees(filtered);
    } catch (error) {
      console.error('Load employees error:', error);
    }
  };

  const loadCosts = async () => {
    if (!selectedCampaignId) return;
    try {
      setCostsLoading(true);
      const data = await apiClient.get(`/marketing/campaigns/${selectedCampaignId}/costs`);
      setCosts(data.data || []);
      setCostSummary(data.summary || null);
    } catch (error) {
      console.error('Load costs error:', error);
    } finally {
      setCostsLoading(false);
    }
  };

  const loadEffectiveness = async () => {
    try {
      setEffectivenessLoading(true);
      const data = await apiClient.get('/marketing/effectiveness');
      setEffectivenessData(data.campaigns || []);
      setEffectivenessSummary(data.summary || null);
    } catch (error) {
      console.error('Load effectiveness error:', error);
    } finally {
      setEffectivenessLoading(false);
    }
  };

  const formatAmountInput = (value: string | undefined): string => {
    if (value == null || typeof value !== 'string') return '';
    const num = value.replace(/\D/g, '');
    if (!num) return '';
    return Number(num).toLocaleString('vi-VN');
  };

  const parseAmountInput = (formatted: string | undefined): string => {
    if (formatted == null || typeof formatted !== 'string') return '';
    return formatted.replace(/\D/g, '');
  };

  const handleSubmitCost = async () => {
    if (!selectedCampaignId || !costForm.costDate || !costForm.amount) {
      alert('Vui lòng điền ngày chi phí và số tiền'); return;
    }
    if (!costForm.costType) { alert('Vui lòng chọn hoặc nhập loại chi phí'); return; }
    if (!costForm.platform) { alert('Vui lòng chọn hoặc nhập nền tảng'); return; }
    if (!costForm.impressions) { alert('Vui lòng nhập lượt hiển thị'); return; }
    if (!costForm.clicks) { alert('Vui lòng nhập lượt click'); return; }
    if (!costForm.reach) { alert('Vui lòng nhập lượt tiếp cận'); return; }
    if (!costForm.description) { alert('Vui lòng nhập ghi chú'); return; }
    if (!editingCost && costFiles.length === 0) {
      alert('Vui lòng tải lên ảnh chụp màn hình hoặc chứng từ chi phí'); return;
    }
    
    try {
      setCostSubmitting(true);

      let attachmentUrls: string[] = [];
      if (costFiles.length > 0) {
        setUploadingFiles(true);
        const formData = new FormData();
        costFiles.forEach(f => formData.append('files', f));
        try {
          const uploadRes = await apiClient.postMultipart('/upload/marketing-costs', formData);
          attachmentUrls = uploadRes.urls || uploadRes.files?.map((f: any) => f.url) || [];
        } catch {
          alert('Lỗi khi tải file lên. Vui lòng thử lại.');
          setCostSubmitting(false); setUploadingFiles(false); return;
        }
        setUploadingFiles(false);
      }
      
      const rawAmount = parseAmountInput(costForm.amount);
      const payload: any = {
        costDate: costForm.costDate,
        amount: parseFloat(rawAmount),
        costType: costForm.costType,
        platform: costForm.platform,
        impressions: parseInt(costForm.impressions),
        clicks: parseInt(costForm.clicks),
        reach: parseInt(costForm.reach),
        description: costForm.description,
        attachmentUrl: attachmentUrls.length > 0 ? attachmentUrls.join(',') : null,
      };
      
      if (editingCost) {
        await apiClient.put(`/marketing/costs/${editingCost.id}`, payload);
      } else {
        await apiClient.post(`/marketing/campaigns/${selectedCampaignId}/costs`, payload);
      }
      
      setCostModalOpen(false);
      setEditingCost(null);
      resetCostForm();
      loadCosts();
      loadEffectiveness();
    } catch (error: any) {
      console.error('Submit cost error:', error);
      alert(error.message || 'Có lỗi xảy ra');
    } finally {
      setCostSubmitting(false);
    }
  };

  const handleDeleteCost = async (costId: string) => {
    if (!confirm('Bạn có chắc muốn xóa chi phí này?')) return;
    
    try {
      await apiClient.delete(`/marketing/costs/${costId}`);
      loadCosts();
      loadEffectiveness();
    } catch (error) {
      console.error('Delete cost error:', error);
    }
  };

  const resetCostForm = () => {
    setCostForm({
      costDate: new Date().toISOString().split('T')[0],
      amount: '',
      costType: 'AD_SPEND',
      platform: '',
      impressions: '',
      clicks: '',
      reach: '',
      description: '',
      employeeIds: [],
    });
    setUseCustomCostType(false);
    setUseCustomPlatform(false);
    setCostFiles([]);
  };


  const openEditCost = (cost: CampaignCost) => {
    setEditingCost(cost);
    setCostForm({
      costDate: cost.costDate.split('T')[0],
      amount: cost.amount.toString(),
      costType: cost.costType,
      platform: cost.platform || '',
      impressions: cost.impressions?.toString() || '',
      clicks: cost.clicks?.toString() || '',
      reach: cost.reach?.toString() || '',
      description: cost.description || '',
    });
    setCostModalOpen(true);
  };

  const sortedEffectivenessData = [...effectivenessData].sort((a, b) => {
    if (sortBy === 'revenue') return b.metrics.totalRevenue - a.metrics.totalRevenue;
    if (sortBy === 'roi') return b.kpis.roi - a.kpis.roi;
    return b.kpis.roas - a.kpis.roas;
  });

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">🥇 #{rank}</span>;
    if (rank === 2) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">🥈 #{rank}</span>;
    if (rank === 3) return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">🥉 #{rank}</span>;
    return <span className="text-gray-500 text-sm">#{rank}</span>;
  };

  const [tooltipVisible, setTooltipVisible] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const handleTooltipEnter = (e: React.MouseEvent<HTMLSpanElement>, kpiKey: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      top: rect.bottom + 8,
      left: rect.left + rect.width / 2
    });
    setTooltipVisible(kpiKey);
  };

  const handleTooltipLeave = () => {
    setTooltipVisible(null);
  };

  const renderKPILabel = (kpiKey: string, label: string) => (
    <span 
      className="inline-flex items-center cursor-help"
      onMouseEnter={(e) => handleTooltipEnter(e, kpiKey)}
      onMouseLeave={handleTooltipLeave}
    >
      <span className="text-sm text-gray-500">{label}</span>
      <Info className="w-3 h-3 ml-1 text-gray-400 hover:text-gray-600" />
    </span>
  );

  const renderKPIHeader = (kpiKey: string, label: string) => (
    <span 
      className="inline-flex items-center cursor-help"
      onMouseEnter={(e) => handleTooltipEnter(e, kpiKey)}
      onMouseLeave={handleTooltipLeave}
    >
      {label}
      <Info className="w-3 h-3 ml-1 text-gray-400 hover:text-gray-600" />
    </span>
  );

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex space-x-4 border-b">
        <button
          onClick={() => setActiveSubTab('effectiveness')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeSubTab === 'effectiveness'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart2 className="w-4 h-4 inline mr-2" />
          Hiệu quả chuyển đổi
        </button>
        <button
          onClick={() => setActiveSubTab('costs')}
          className={`pb-3 px-1 font-medium text-sm border-b-2 transition-colors ${
            activeSubTab === 'costs'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <DollarSign className="w-4 h-4 inline mr-2" />
          Nhập chi phí
        </button>
      </div>

      {/* Effectiveness Tab */}
      {activeSubTab === 'effectiveness' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          {effectivenessSummary && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="text-sm text-gray-500">Tổng chi phí</div>
                <div className="text-xl font-bold text-red-600">{formatCurrency(effectivenessSummary.totalCost)}</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="text-sm text-gray-500">Tổng doanh số</div>
                <div className="text-xl font-bold text-green-600">{formatCurrency(effectivenessSummary.totalRevenue)}</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                {renderKPILabel('roas', 'ROAS')}
                <div className={`text-xl font-bold ${effectivenessSummary.overallROAS >= 1 ? 'text-green-600' : 'text-red-600'}`}>
                  {effectivenessSummary.overallROAS}x
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                {renderKPILabel('roi', 'ROI')}
                <div className={`text-xl font-bold ${effectivenessSummary.overallROI >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {effectivenessSummary.overallROI}%
                </div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                <div className="text-sm text-gray-500">Tổng lead</div>
                <div className="text-xl font-bold text-blue-600">{formatNumber(effectivenessSummary.totalLeads)}</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm border">
                {renderKPILabel('cvr', 'CVR')}
                <div className="text-xl font-bold text-purple-600">{effectivenessSummary.avgCVR}%</div>
              </div>
            </div>
          )}

          {/* Sort Options */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold flex items-center">
              <Award className="w-5 h-5 mr-2 text-yellow-500" />
              Xếp hạng chiến dịch
            </h3>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-500">Sắp xếp theo:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                <option value="revenue">Doanh số</option>
                <option value="roi">ROI</option>
                <option value="roas">ROAS</option>
              </select>
              <button
                onClick={loadEffectiveness}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCcw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Effectiveness Table */}
          {effectivenessLoading ? (
            <div className="flex justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hạng</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Chiến dịch</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Chi phí</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Doanh số</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        {renderKPIHeader('cpl', 'CPL')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        {renderKPIHeader('cpa', 'CPA')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        {renderKPIHeader('cvr', 'CVR')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        {renderKPIHeader('roas', 'ROAS')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        {renderKPIHeader('roi', 'ROI')}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Lead</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Chuyển đổi</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {sortedEffectivenessData.map((item, index) => (
                      <tr key={item.campaignId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          {getRankBadge(sortBy === 'revenue' ? item.revenueRank : sortBy === 'roi' ? item.roiRank : item.roasRank)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{item.campaignName}</div>
                          <div className="text-xs text-gray-500">{item.campaignCode}</div>
                        </td>
                        <td className="px-4 py-3 text-right text-red-600 font-medium">
                          {formatCurrency(item.metrics.totalCost)}
                        </td>
                        <td className="px-4 py-3 text-right text-green-600 font-medium">
                          {formatCurrency(item.metrics.totalRevenue)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {formatCurrency(item.kpis.cpl)}
                        </td>
                        <td className="px-4 py-3 text-center text-sm">
                          {formatCurrency(item.kpis.cpa)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-medium ${item.kpis.cvr >= 10 ? 'text-green-600' : item.kpis.cvr >= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {item.kpis.cvr}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-medium ${item.kpis.roas >= 1 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.kpis.roas}x
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-medium ${item.kpis.roi >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.kpis.roi}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-blue-600 font-medium">
                          {formatNumber(item.metrics.totalLeads)}
                        </td>
                        <td className="px-4 py-3 text-center text-purple-600 font-medium">
                          {formatNumber(item.metrics.convertedCustomers)}
                        </td>
                      </tr>
                    ))}
                    {sortedEffectivenessData.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                          Chưa có dữ liệu chiến dịch
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Costs Tab */}
      {activeSubTab === 'costs' && (
        <div className="space-y-6">
          {/* Campaign Selector */}
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Chọn chiến dịch:</label>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="flex-1 max-w-md border rounded-lg px-3 py-2"
            >
              <option value="">-- Chọn chiến dịch --</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            {selectedCampaignId && (
              <button
                onClick={() => {
                  try {
                    setEditingCost(null);
                    resetCostForm();
                    setCostModalOpen(true);
                  } catch (e) {
                    console.error('Mở form thêm chi phí:', e);
                    alert('Không thể mở form. Vui lòng thử lại.');
                  }
                }}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Thêm chi phí
              </button>
            )}
          </div>

          {selectedCampaignId && (
            <>
              {/* Cost Summary */}
              {costSummary && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm border">
                    <div className="text-sm text-gray-500">Tổng chi phí</div>
                    <div className="text-xl font-bold text-red-600">{formatCurrency(costSummary.totalAmount)}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border">
                    <div className="text-sm text-gray-500">Lượt hiển thị</div>
                    <div className="text-xl font-bold text-blue-600">{formatNumber(costSummary.totalImpressions)}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border">
                    <div className="text-sm text-gray-500">Lượt click</div>
                    <div className="text-xl font-bold text-green-600">{formatNumber(costSummary.totalClicks)}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border">
                    <div className="text-sm text-gray-500">Tiếp cận</div>
                    <div className="text-xl font-bold text-purple-600">{formatNumber(costSummary.totalReach)}</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border">
                    {renderKPILabel('ctr', 'CTR')}
                    <div className="text-xl font-bold text-orange-600">{costSummary.avgCTR}%</div>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border">
                    {renderKPILabel('cpc', 'CPC')}
                    <div className="text-xl font-bold text-teal-600">{formatCurrency(costSummary.avgCPC)}</div>
                  </div>
                </div>
              )}

              {/* Costs Table */}
              {costsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              ) : (
                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ngày</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Loại</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nền tảng</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Chi phí</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Hiển thị</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Click</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tiếp cận</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ghi chú</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {costs.map((cost) => (
                          <tr key={cost.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">
                              {formatDate(cost.costDate)}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {COST_TYPES.find((t) => t.value === cost.costType)?.label || cost.costType}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {cost.platform ? PLATFORMS.find((p) => p.value === cost.platform)?.label || cost.platform : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-red-600 font-medium">
                              {formatCurrency(cost.amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              {cost.impressions ? formatNumber(cost.impressions) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              {cost.clicks ? formatNumber(cost.clicks) : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm">
                              {cost.reach ? formatNumber(cost.reach) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                              {cost.description || '-'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => openEditCost(cost)}
                                  className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                >
                                  <Edit className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteCost(cost.id)}
                                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {costs.length === 0 && (
                          <tr>
                            <td colSpan={9} className="px-4 py-12 text-center text-gray-500">
                              Chưa có chi phí nào được ghi nhận
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          {!selectedCampaignId && (
            <div className="text-center py-12 text-gray-500">
              Vui lòng chọn chiến dịch để xem và nhập chi phí
            </div>
          )}
        </div>
      )}

      {/* Cost Modal */}
      {costModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4">
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">
                {editingCost ? 'Sửa chi phí' : 'Thêm chi phí mới'}
              </h3>
              <p className="text-xs text-gray-500 mt-1">Tất cả các trường đánh dấu * là bắt buộc</p>
            </div>
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ngày chi phí <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={costForm.costDate}
                    onChange={(e) => setCostForm({ ...costForm, costDate: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Số tiền (VNĐ) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formatAmountInput(costForm.amount)}
                    onChange={(e) => setCostForm({ ...costForm, amount: parseAmountInput(e.target.value) })}
                    placeholder="0"
                    className="w-full border rounded-lg px-3 py-2 text-right font-medium"
                  />
                  {costForm.amount && (
                    <div className="text-xs text-gray-500 mt-0.5 text-right">{formatCurrency(Number(costForm.amount))}</div>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Loại chi phí <span className="text-red-500">*</span>
                  </label>
                  {useCustomCostType ? (
                    <div className="flex gap-1">
                      <input type="text" value={costForm.costType}
                        onChange={(e) => setCostForm({ ...costForm, costType: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2" placeholder="Nhập loại chi phí cụ thể..." />
                      <button type="button" onClick={() => { setUseCustomCostType(false); setCostForm({ ...costForm, costType: 'AD_SPEND' }); }}
                        className="px-2 text-gray-500 hover:text-gray-700">✕</button>
                    </div>
                  ) : (
                    <select value={costForm.costType}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') { setUseCustomCostType(true); setCostForm({ ...costForm, costType: '' }); }
                        else setCostForm({ ...costForm, costType: e.target.value });
                      }}
                      className="w-full border rounded-lg px-3 py-2">
                      {COST_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      <option value="__custom__">Không có trong danh sách (nhập tùy chỉnh)...</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nền tảng <span className="text-red-500">*</span>
                  </label>
                  {useCustomPlatform ? (
                    <div className="flex gap-1">
                      <input type="text" value={costForm.platform}
                        onChange={(e) => setCostForm({ ...costForm, platform: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2" placeholder="Nhập tên nền tảng cụ thể..." />
                      <button type="button" onClick={() => { setUseCustomPlatform(false); setCostForm({ ...costForm, platform: '' }); }}
                        className="px-2 text-gray-500 hover:text-gray-700">✕</button>
                    </div>
                  ) : (
                    <select value={costForm.platform}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') { setUseCustomPlatform(true); setCostForm({ ...costForm, platform: '' }); }
                        else setCostForm({ ...costForm, platform: e.target.value });
                      }}
                      className="w-full border rounded-lg px-3 py-2">
                      <option value="">-- Chọn nền tảng --</option>
                      {PLATFORMS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      <option value="__custom__">Không có trong danh sách (nhập tùy chỉnh)...</option>
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lượt hiển thị <span className="text-red-500">*</span>
                    <span className="ml-1 text-gray-400 text-xs" title="Impressions - Số lần quảng cáo được hiển thị">ⓘ</span>
                  </label>
                  <input type="number" value={costForm.impressions}
                    onChange={(e) => setCostForm({ ...costForm, impressions: e.target.value })}
                    placeholder="0" className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lượt click <span className="text-red-500">*</span>
                    <span className="ml-1 text-gray-400 text-xs" title="Clicks - Số lần click vào quảng cáo">ⓘ</span>
                  </label>
                  <input type="number" value={costForm.clicks}
                    onChange={(e) => setCostForm({ ...costForm, clicks: e.target.value })}
                    placeholder="0" className="w-full border rounded-lg px-3 py-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tiếp cận <span className="text-red-500">*</span>
                    <span className="ml-1 text-gray-400 text-xs" title="Reach - Số người duy nhất đã xem">ⓘ</span>
                  </label>
                  <input type="number" value={costForm.reach}
                    onChange={(e) => setCostForm({ ...costForm, reach: e.target.value })}
                    placeholder="0" className="w-full border rounded-lg px-3 py-2" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Ghi chú <span className="text-red-500">*</span>
                </label>
                <textarea value={costForm.description}
                  onChange={(e) => setCostForm({ ...costForm, description: e.target.value })}
                  rows={2} placeholder="Mô tả chi tiết chi phí này..."
                  className="w-full border rounded-lg px-3 py-2" />
              </div>

              {/* File Upload */}
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ảnh chụp màn hình / Chứng từ chi phí <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(e) => {
                      if (e.target.files) setCostFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                    }}
                    className="hidden"
                    id="cost-file-upload"
                  />
                  <label htmlFor="cost-file-upload" className="cursor-pointer">
                    <div className="text-gray-500">
                      <Plus className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm font-medium">Bấm để chọn file hoặc kéo thả</p>
                      <p className="text-xs text-gray-400 mt-1">Hỗ trợ: Ảnh, PDF, Word, Excel</p>
                    </div>
                  </label>
                </div>
                {costFiles.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {costFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-blue-50 px-3 py-2 rounded-lg text-sm">
                        <div className="flex items-center gap-2 truncate">
                          <span className="text-blue-600">📎</span>
                          <span className="truncate">{file.name}</span>
                          <span className="text-gray-400 text-xs flex-shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button type="button" onClick={() => setCostFiles(prev => prev.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 flex-shrink-0 ml-2">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 border">
                <Info className="w-4 h-4 inline mr-1 text-blue-500" />
                Chi phí sẽ tự động gán cho người tạo chiến dịch. Chỉ người tạo chiến dịch hoặc Admin mới được nhập chi phí.
              </div>
            </div>
            <div className="p-6 border-t flex justify-end space-x-3">
              <button onClick={() => { setCostModalOpen(false); setEditingCost(null); resetCostForm(); }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50">Hủy</button>
              <button onClick={handleSubmitCost} disabled={costSubmitting}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                {costSubmitting && <Loader className="w-4 h-4 animate-spin" />}
                {uploadingFiles ? 'Đang tải file...' : editingCost ? 'Cập nhật' : 'Thêm chi phí'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Tooltip Portal */}
      {tooltipVisible && KPI_TOOLTIPS[tooltipVisible] && createPortal(
        <div
          className="fixed px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-xl pointer-events-none"
          style={{
            zIndex: 99999,
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translateX(-50%)',
            maxWidth: '300px',
            whiteSpace: 'normal',
            lineHeight: '1.5'
          }}
        >
          {KPI_TOOLTIPS[tooltipVisible]}
          <div 
            className="absolute border-4 border-transparent border-b-gray-900"
            style={{
              bottom: '100%',
              left: '50%',
              transform: 'translateX(-50%)'
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
};

export default MarketingCostEffectiveness;
