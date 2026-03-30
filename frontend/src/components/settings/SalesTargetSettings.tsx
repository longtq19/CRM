import React, { useEffect, useMemo, useState } from 'react';
import { Loader, Save, Target } from 'lucide-react';
import { apiClient } from '../../api/client';
import { ToolbarButton } from '../ui/ToolbarButton';

type OrgRow = { id: string; name: string; code?: string; rootDepartmentId?: string | null };
type DivisionRow = {
  id: string;
  name: string;
  code?: string;
  parentId?: string | null;
  divisionType?: string;
  status?: string;
};
type TargetRow = {
  divisionId: string;
  departmentId?: string;
  annualTarget: number | string;
  q1Target?: number | string | null;
  q2Target?: number | string | null;
  q3Target?: number | string | null;
  q4Target?: number | string | null;
  note?: string | null;
  revenueCalculationNote?: string | null;
};

interface SalesTargetSettingsProps {
  canEdit: boolean;
}

const YEARS = [2024, 2025, 2026, 2027, 2028];

function formatVndNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.max(0, Math.round(Number(value) || 0)));
}

function parseVndInput(raw: string): number {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return 0;
  return Number.parseInt(digits, 10) || 0;
}

/** Ẩn khối trùng tên hoặc mã với tổ chức (theo README cây Vận hành). */
function shouldShowDivisionForOrg(div: DivisionRow, org: OrgRow | undefined): boolean {
  if (!org) return true;
  const dn = (div.name || '').trim().toLowerCase();
  const dc = String(div.code || '').toUpperCase().trim();
  const on = (org.name || '').trim().toLowerCase();
  const oc = String(org.code || '').toUpperCase().trim();
  if (on && dn === on) return false;
  if (oc && dc === oc) return false;
  return true;
}

const SalesTargetSettings: React.FC<SalesTargetSettingsProps> = ({ canEdit }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [divisions, setDivisions] = useState<DivisionRow[]>([]);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [draftByDivisionId, setDraftByDivisionId] = useState<Record<string, number>>({});

  const selectedOrg = organizations.find((o) => o.id === selectedOrganizationId);

  const orgQuery = selectedOrganizationId
    ? `organizationId=${encodeURIComponent(selectedOrganizationId)}`
    : '';

  const formatVndFull = (value: number) => `${formatVndNumber(value)} VNĐ`;

  const isDirty = useMemo(
    () =>
      divisions.some((d) => {
        const t = targets.find((x) => x.divisionId === d.id);
        const saved = t ? Number(t.annualTarget || 0) : 0;
        return (draftByDivisionId[d.id] ?? 0) !== saved;
      }),
    [divisions, draftByDivisionId, targets]
  );

  const loadOrganizations = async () => {
    try {
      const res: unknown = await apiClient.get('/hr/organizations');
      const list: OrgRow[] = Array.isArray(res) ? res : (res as { data?: OrgRow[] })?.data ?? [];
      const kagri = list.find((o) => String(o.code || '').toUpperCase().trim() === 'KAGRI');
      if (kagri) {
        setOrganizations([kagri]);
        setSelectedOrganizationId((prev) => prev || kagri.id);
      } else {
        setOrganizations([]);
        setSelectedOrganizationId('');
        setDivisions([]);
        setTargets([]);
        setLoading(false);
      }
    } catch (e) {
      console.error('Load organizations for sales targets:', e);
      setOrganizations([]);
      setSelectedOrganizationId('');
      setLoading(false);
    }
  };

  const loadData = async () => {
    if (!selectedOrganizationId) return;
    setLoading(true);
    try {
      const [divDataRaw, targetDataRaw] = await Promise.all([
        apiClient.get(`/divisions${orgQuery ? `?${orgQuery}` : ''}`),
        apiClient.get(`/divisions/targets?year=${year}${orgQuery ? `&${orgQuery}` : ''}`),
      ]);

      const allDivisions: DivisionRow[] = Array.isArray(divDataRaw) ? divDataRaw : [];
      const rootDepartmentId = selectedOrg?.rootDepartmentId ?? null;
      let topLevel = rootDepartmentId
        ? allDivisions.filter((d) => d.parentId === rootDepartmentId)
        : allDivisions.filter((d) => !d.parentId);
      topLevel = topLevel.filter((d) => shouldShowDivisionForOrg(d, selectedOrg));
      topLevel = topLevel.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'vi'));
      setDivisions(topLevel);

      const allowedIds = new Set(topLevel.map((d) => d.id));
      const rawTargets = ((targetDataRaw as { targets?: unknown[] })?.targets || []) as (TargetRow & {
        departmentId?: string;
      })[];
      const targetList: TargetRow[] = rawTargets
        .map((t) => ({
          ...t,
          divisionId: t.divisionId || t.departmentId || '',
        }))
        .filter((t) => t.divisionId && allowedIds.has(t.divisionId));
      setTargets(targetList);

      const draft: Record<string, number> = {};
      for (const d of topLevel) {
        const t = targetList.find((x) => x.divisionId === d.id);
        draft[d.id] = t ? Number(t.annualTarget || 0) : 0;
      }
      setDraftByDivisionId(draft);
    } catch (error) {
      console.error('Load sales targets error:', error);
      setDivisions([]);
      setTargets([]);
      setDraftByDivisionId({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrganizations();
  }, []);

  useEffect(() => {
    if (!selectedOrganizationId) return;
    void loadData();
  }, [selectedOrganizationId, year, selectedOrg?.rootDepartmentId]);

  const setDraft = (divisionId: string, value: number) => {
    setDraftByDivisionId((prev) => ({ ...prev, [divisionId]: value }));
  };

  const handleSaveAll = async () => {
    if (!canEdit || divisions.length === 0) return;
    try {
      setSaving(true);
      const rowsToSave = divisions.filter((d) => {
        const t = targets.find((x) => x.divisionId === d.id);
        const saved = t ? Number(t.annualTarget || 0) : 0;
        return (draftByDivisionId[d.id] ?? 0) !== saved;
      });
      if (rowsToSave.length === 0) {
        return;
      }
      await Promise.all(
        rowsToSave.map((d) => {
          const annualTarget = Math.max(0, Math.round(draftByDivisionId[d.id] ?? 0));
          const q = Math.round(annualTarget / 4);
          return apiClient.put('/performance/targets', {
            year,
            divisionId: d.id,
            annualTarget,
            q1Target: q,
            q2Target: q,
            q3Target: q,
            q4Target: q,
          });
        })
      );
      await loadData();
      alert('Đã lưu mục tiêu kinh doanh');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Lỗi khi lưu mục tiêu';
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader className="animate-spin text-green-600" size={32} />
      </div>
    );
  }

  if (!selectedOrganizationId) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Không tìm thấy tổ chức có mã <strong>KAGRI</strong> trong hệ thống. Kiểm tra seed / bảng{' '}
        <code className="rounded bg-white/60 px-1">organizations</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Target size={20} className="text-green-600" />
            Mục tiêu kinh doanh - {selectedOrg?.name || 'KAGRI'}
          </h3>
          <p className="text-sm text-gray-500">
            Danh sách khối con trực tiếp của tổ chức. Đưa chuột vào cột mục tiêu để chỉnh sửa (chỉ người có quyền);
            số liệu lưu theo mục tiêu năm (VNĐ) và đồng bộ cho toàn hệ thống.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
            className="border rounded-lg px-4 py-2"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                Năm {y}
              </option>
            ))}
          </select>
          {canEdit && divisions.length > 0 && (
            <ToolbarButton
              variant="primary"
              onClick={() => void handleSaveAll()}
              disabled={saving || !isDirty}
              className="justify-center"
            >
              {saving ? <Loader size={16} className="animate-spin" /> : <Save size={16} />}
              Lưu tất cả
            </ToolbarButton>
          )}
        </div>
      </div>

      {divisions.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Không có khối cấp 1 trong tổ chức hiện tại.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-[30%]">Tổ chức</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 w-[35%]">
                  Tên khối con trực tiếp
                </th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Mục tiêu năm (VNĐ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {divisions.map((div) => {
                const raw = draftByDivisionId[div.id] ?? 0;
                const target = targets.find((t) => t.divisionId === div.id);
                const titleNote = target?.revenueCalculationNote?.trim() || undefined;
                return (
                  <tr key={div.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 align-middle">
                      <span className="font-medium text-gray-700">{selectedOrg?.name || 'KAGRI'}</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-gray-900" title={titleNote}>
                        {div.name}
                      </div>
                    </td>
                    <td className="px-4 py-2 align-middle text-right">
                      {canEdit ? (
                        <div className="group relative inline-flex w-full max-w-[min(100%,18rem)] ml-auto justify-end">
                          <span
                            className="pointer-events-none block w-full truncate rounded-md border border-transparent bg-transparent px-2 py-2 text-right text-green-800 tabular-nums transition-opacity group-hover:opacity-0 group-focus-within:opacity-0"
                            aria-hidden
                          >
                            {raw > 0 ? formatVndFull(raw) : '—'}
                          </span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={formatVndNumber(raw)}
                            onChange={(e) => setDraft(div.id, parseVndInput(e.target.value))}
                            className="absolute inset-y-0 right-0 z-10 my-auto h-9 w-full max-w-[min(100%,18rem)] rounded-md border border-transparent bg-transparent px-2 text-right text-green-900 tabular-nums opacity-0 shadow-none outline-none transition-[border-color,background-color,box-shadow,opacity] group-hover:border-gray-300 group-hover:bg-white group-hover:opacity-100 group-hover:shadow-sm focus:border-primary focus:bg-white focus:opacity-100 focus:shadow-sm focus:ring-1 focus:ring-primary/25"
                            aria-label={`Mục tiêu năm ${div.name}`}
                          />
                        </div>
                      ) : (
                        <span className="inline-block rounded-md px-2 py-2 text-right text-green-800 tabular-nums">
                          {raw > 0 ? formatVndFull(raw) : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SalesTargetSettings;
