import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { formatCurrency } from '../utils/format';
import { Loader, BarChart3, Calendar } from 'lucide-react';
import clsx from 'clsx';

type ScopeMode = 'COMPANY' | 'MANAGER_TREE' | 'LEAF_UNIT';

interface PerfRow {
  rank: number;
  employee: { id: string; code: string; fullName: string; department?: { name: string } | null };
  customersCount: number;
  ordersCreated?: number;
  repeatOrders?: number;
  revenue: number;
  avgOrderValue: number;
}

interface ModuleEffectivenessReportProps {
  variant: 'sales' | 'cskh';
}

export default function ModuleEffectivenessReport({ variant }: ModuleEffectivenessReportProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<PerfRow[]>([]);
  const [scopeDescription, setScopeDescription] = useState('');
  const [scopeMode, setScopeMode] = useState<ScopeMode | null>(null);
  const [summary, setSummary] = useState<{ totalRevenue?: number; totalCustomers?: number } | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const endpoint = variant === 'sales' ? '/performance/sales' : '/performance/resales';
  const title = variant === 'sales' ? 'Sales' : 'CSKH';
  const metricNote =
    variant === 'sales'
      ? 'Doanh số: đơn đầu tiên đã giao (DELIVERED) trong kỳ.'
      : 'Doanh số: đơn mua lại (không phải đơn đầu) đã giao trong kỳ.';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        const q = params.toString();
        const res = await apiClient.get(`${endpoint}${q ? `?${q}` : ''}`);
        if (cancelled) return;
        setRows((res?.performances || []) as PerfRow[]);
        setScopeDescription(res?.scopeDescription || '');
        setScopeMode((res?.scopeMode as ScopeMode) || null);
        setSummary(res?.summary || null);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Không tải được báo cáo');
          setRows([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, startDate, endDate]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 text-slate-700">
          <BarChart3 className="w-5 h-5 text-primary shrink-0" />
          <span className="font-semibold">Báo cáo hiệu quả & xếp hạng — {title}</span>
        </div>
        <label className="flex flex-col gap-0.5 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" /> Từ ngày
          </span>
          <input
            type="date"
            className="border rounded px-2 py-1.5 text-sm bg-white"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-gray-600">
          Đến ngày
          <input
            type="date"
            className="border rounded px-2 py-1.5 text-sm bg-white"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      </div>

      {scopeDescription && (
        <div
          className={clsx(
            'text-sm px-3 py-2 rounded-lg border',
            scopeMode === 'COMPANY' && 'bg-amber-50 border-amber-200 text-amber-900',
            scopeMode === 'MANAGER_TREE' && 'bg-blue-50 border-blue-200 text-blue-900',
            scopeMode === 'LEAF_UNIT' && 'bg-emerald-50 border-emerald-200 text-emerald-900',
            !scopeMode && 'bg-gray-50 border-gray-200 text-gray-800'
          )}
        >
          <span className="font-medium">Phạm vi xem: </span>
          {scopeDescription}
        </div>
      )}

      <p className="text-xs text-gray-500">{metricNote}</p>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-500 gap-2">
          <Loader className="w-5 h-5 animate-spin" /> Đang tải…
        </div>
      ) : error ? (
        <div className="text-red-600 text-sm py-6">{error}</div>
      ) : (
        <>
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg border bg-white">
                <div className="text-gray-500">Tổng doanh số (kỳ)</div>
                <div className="text-lg font-semibold text-gray-900">
                  {formatCurrency(Number(summary.totalRevenue ?? 0))}
                </div>
              </div>
              <div className="p-3 rounded-lg border bg-white">
                <div className="text-gray-500">Tổng KH (đang gán)</div>
                <div className="text-lg font-semibold text-gray-900">{summary.totalCustomers ?? '—'}</div>
              </div>
            </div>
          )}
          <div className="overflow-x-auto border rounded-xl bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-3 py-2 text-left w-14">Hạng</th>
                  <th className="px-3 py-2 text-left">Nhân viên</th>
                  <th className="px-3 py-2 text-left">Đơn vị</th>
                  <th className="px-3 py-2 text-right">KH</th>
                  {variant === 'sales' ? (
                    <th className="px-3 py-2 text-right">Đơn đầu (kỳ)</th>
                  ) : (
                    <th className="px-3 py-2 text-right">Đơn mua lại (kỳ)</th>
                  )}
                  <th className="px-3 py-2 text-right">Doanh số</th>
                  <th className="px-3 py-2 text-right">TB/đơn</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                      Không có dữ liệu trong phạm vi và kỳ đã chọn
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.employee.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-700">#{r.rank}</td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-900">{r.employee.fullName}</div>
                        <div className="text-xs text-gray-400">{r.employee.code}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{r.employee.department?.name || '—'}</td>
                      <td className="px-3 py-2 text-right">{r.customersCount}</td>
                      <td className="px-3 py-2 text-right">
                        {variant === 'sales' ? r.ordersCreated ?? '—' : r.repeatOrders ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(r.revenue)}</td>
                      <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(r.avgOrderValue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
