import React, { useEffect, useState, useMemo } from 'react';
import { apiClient } from '../api/client';
import { translate } from '../utils/dictionary';
import { Loader, Save } from 'lucide-react';
import clsx from 'clsx';
import { ToolbarButton } from './ui/ToolbarButton';

type FlatNode = { id: string; parentId: string | null; type: string; name?: string };

type DeptRow = {
  id: string;
  name: string;
  code: string;
  type: string;
  function: string | null;
  parentId: string | null;
  divisionId?: string | null;
  targetSalesUnit?: { id: string; name: string } | null;
  targetCsUnit?: { id: string; name: string } | null;
};

function divisionAncestorId(deptId: string, byId: Map<string, FlatNode>): string | null {
  let cur = byId.get(deptId);
  for (let i = 0; i < 200 && cur; i++) {
    if (cur.type === 'DIVISION') return cur.id;
    if (!cur.parentId) return null;
    cur = byId.get(cur.parentId);
  }
  return null;
}

function divisionLabel(blockId: string | null, byId: Map<string, FlatNode>): string {
  if (!blockId) return '—';
  const n = byId.get(blockId);
  return n?.name ? translate(n.name) : blockId;
}

interface OrgDataFlowTabProps {
  canEdit: boolean;
}

type OrgOpt = { id: string; code: string; name: string };

const OrgDataFlowTab: React.FC<OrgDataFlowTabProps> = ({ canEdit }) => {
  const [organizations, setOrganizations] = useState<OrgOpt[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [flatOrg, setFlatOrg] = useState<FlatNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { sales: string; cs: string }>>({});

  useEffect(() => {
    (async () => {
      try {
        const res: any = await apiClient.get('/hr/organizations');
        const list: OrgOpt[] = Array.isArray(res) ? res : res?.data ?? [];
        setOrganizations(list);
        setOrganizationId((prev) => prev || list[0]?.id || '');
      } catch {
        setOrganizations([]);
      }
    })();
  }, []);

  const load = async () => {
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = `organizationId=${encodeURIComponent(organizationId)}`;
      const [divRes, deptRes] = await Promise.all([
        apiClient.get(`/hr/divisions?${q}`).catch(() => []),
        apiClient.get(`/hr/departments?${q}`).catch(() => []),
      ]);
      const divs = Array.isArray(divRes) ? divRes : (divRes as any)?.data ?? [];
      const deptList = Array.isArray(deptRes) ? deptRes : (deptRes as any)?.data ?? [];
      const flat: FlatNode[] = [
        ...divs.map((d: any) => ({
          id: d.id,
          parentId: d.parentId ?? null,
          type: 'DIVISION',
          name: d.name,
        })),
        ...deptList.map((d: any) => ({
          id: d.id,
          parentId: d.parentId ?? null,
          type: d.type || 'DEPARTMENT',
          name: d.name,
        })),
      ];
      setFlatOrg(flat);
      setDepartments(deptList);
      const dr: Record<string, { sales: string; cs: string }> = {};
      for (const d of deptList) {
        dr[d.id] = {
          sales: d.targetSalesUnit?.id ?? '',
          cs: d.targetCsUnit?.id ?? '',
        };
      }
      setDrafts(dr);
    } catch (e) {
      console.error(e);
      setDepartments([]);
      setFlatOrg([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [organizationId]);

  const byId = useMemo(() => new Map(flatOrg.map((r) => [r.id, r])), [flatOrg]);

  const marketingLeaves = useMemo(() => {
    return departments.filter((d) => d.function === 'MARKETING' && !departments.some((c) => c.parentId === d.id));
  }, [departments]);

  const salesLeaves = useMemo(() => {
    return departments.filter((d) => d.function === 'SALES' && !departments.some((c) => c.parentId === d.id));
  }, [departments]);

  const salesOptions = useMemo(() => {
    return departments.filter(
      (d) => d.function === 'SALES' && !departments.some((c) => c.parentId === d.id)
    );
  }, [departments]);

  const csOptions = useMemo(() => {
    return departments.filter(
      (d) => d.function === 'CSKH' && !departments.some((c) => c.parentId === d.id)
    );
  }, [departments]);

  const partitionMs = (rows: DeptRow[]) => {
    const same: DeptRow[] = [];
    const cross: DeptRow[] = [];
    for (const m of rows) {
      const mb = divisionAncestorId(m.id, byId);
      const tid = drafts[m.id]?.sales || m.targetSalesUnit?.id;
      if (!tid) {
        cross.push(m);
        continue;
      }
      const tb = divisionAncestorId(tid, byId);
      if (mb && tb && mb === tb) same.push(m);
      else cross.push(m);
    }
    return { same, cross };
  };

  const partitionSc = (rows: DeptRow[]) => {
    const same: DeptRow[] = [];
    const cross: DeptRow[] = [];
    for (const s of rows) {
      const sb = divisionAncestorId(s.id, byId);
      const tid = drafts[s.id]?.cs || s.targetCsUnit?.id;
      if (!tid) {
        cross.push(s);
        continue;
      }
      const tb = divisionAncestorId(tid, byId);
      if (sb && tb && sb === tb) same.push(s);
      else cross.push(s);
    }
    return { same, cross };
  };

  const { same: msSame, cross: msCross } = partitionMs(marketingLeaves);
  const { same: scSame, cross: scCross } = partitionSc(salesLeaves);

  const saveTargets = async (deptId: string, field: 'targetSalesUnitId' | 'targetCsUnitId', value: string) => {
    if (!canEdit) return;
    setSavingId(deptId + field);
    try {
      const body: Record<string, string | null> = { [field]: value || null };
      await apiClient.put(`/hr/departments/${deptId}`, body);
      await load();
    } catch (e: any) {
      alert(e?.message || 'Không lưu được');
    } finally {
      setSavingId(null);
    }
  };

  if (!organizations.length) {
    return <p className="text-sm text-amber-800">Chưa có tổ chức — khởi động backend / chạy migration để tạo KAGRI.</p>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader className="animate-spin" size={24} />
      </div>
    );
  }

  const renderMsRow = (m: DeptRow) => {
    const mb = divisionAncestorId(m.id, byId);
    return (
      <tr key={m.id} className="border-t border-gray-100">
        <td className="p-3">
          <div className="font-medium text-gray-800">{translate(m.name)}</div>
          <div className="text-xs text-gray-400">{m.code}</div>
        </td>
        <td className="p-3 text-sm text-gray-600">{divisionLabel(mb, byId)}</td>
        <td className="p-3">
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={drafts[m.id]?.sales ?? ''}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [m.id]: { ...d[m.id], sales: e.target.value, cs: d[m.id]?.cs ?? '' } }))
                }
                className="border rounded-lg px-2 py-1.5 text-sm min-w-[200px]"
              >
                <option value="">— Chọn đơn vị Sales (lá) —</option>
                {salesOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {translate(s.name)} ({s.code})
                  </option>
                ))}
              </select>
              <ToolbarButton
                variant="primary"
                type="button"
                className="text-xs py-1"
                disabled={savingId === m.id + 'targetSalesUnitId'}
                onClick={() => saveTargets(m.id, 'targetSalesUnitId', drafts[m.id]?.sales ?? '')}
              >
                {savingId === m.id + 'targetSalesUnitId' ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                Lưu
              </ToolbarButton>
            </div>
          ) : (
            <span className="text-sm text-gray-600">
              {m.targetSalesUnit ? translate(m.targetSalesUnit.name) : '—'}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const renderScRow = (s: DeptRow) => {
    const sb = divisionAncestorId(s.id, byId);
    return (
      <tr key={s.id} className="border-t border-gray-100">
        <td className="p-3">
          <div className="font-medium text-gray-800">{translate(s.name)}</div>
          <div className="text-xs text-gray-400">{s.code}</div>
        </td>
        <td className="p-3 text-sm text-gray-600">{divisionLabel(sb, byId)}</td>
        <td className="p-3">
          {canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={drafts[s.id]?.cs ?? ''}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [s.id]: { sales: d[s.id]?.sales ?? '', cs: e.target.value } }))
                }
                className="border rounded-lg px-2 py-1.5 text-sm min-w-[200px]"
              >
                <option value="">— Chọn đơn vị CSKH (lá) —</option>
                {csOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {translate(c.name)} ({c.code})
                  </option>
                ))}
              </select>
              <ToolbarButton
                variant="primary"
                type="button"
                className="text-xs py-1"
                disabled={savingId === s.id + 'targetCsUnitId'}
                onClick={() => saveTargets(s.id, 'targetCsUnitId', drafts[s.id]?.cs ?? '')}
              >
                {savingId === s.id + 'targetCsUnitId' ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                Lưu
              </ToolbarButton>
            </div>
          ) : (
            <span className="text-sm text-gray-600">{s.targetCsUnit ? translate(s.targetCsUnit.name) : '—'}</span>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm text-gray-600">Tổ chức</label>
        <select
          value={organizationId}
          onChange={(e) => setOrganizationId(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[220px]"
        >
          {organizations.map((o) => (
            <option key={o.id} value={o.id}>
              {translate(o.name)} ({o.code})
            </option>
          ))}
        </select>
      </div>
      <p className="text-gray-600 text-sm">
        Nối luồng phân bổ lead/data: <strong>Marketing → Sales</strong> và <strong>Sales → Chăm sóc khách hàng</strong>.
        Có thể chọn đích thuộc <em>cùng khối</em> hoặc <em>khối khác</em> (cùng tổ chức). Sau đơn giao thành công đầu tiên, luồng nghiệp
        vụ chuyển CSKH theo tham số vận hành (xem README).
      </p>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Marketing → Sales</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="border rounded-xl overflow-hidden">
            <div className={clsx('px-4 py-2 font-medium text-sm', 'bg-emerald-50 text-emerald-900')}>
              Luồng cùng khối
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Marketing (lá)</th>
                  <th className="text-left p-3">Khối</th>
                  <th className="text-left p-3">Đích Sales</th>
                </tr>
              </thead>
              <tbody>{msSame.map(renderMsRow)}</tbody>
            </table>
            {msSame.length === 0 && <p className="p-4 text-sm text-gray-500">Chưa có dòng cùng khối.</p>}
          </div>
          <div className="border rounded-xl overflow-hidden">
            <div className={clsx('px-4 py-2 font-medium text-sm', 'bg-amber-50 text-amber-900')}>
              Luồng khác khối / chưa gán
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Marketing (lá)</th>
                  <th className="text-left p-3">Khối</th>
                  <th className="text-left p-3">Đích Sales</th>
                </tr>
              </thead>
              <tbody>{msCross.map(renderMsRow)}</tbody>
            </table>
            {msCross.length === 0 && <p className="p-4 text-sm text-gray-500">Không có dòng.</p>}
          </div>
        </div>
      </section>

      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Sales → Chăm sóc khách hàng</h3>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="border rounded-xl overflow-hidden">
            <div className={clsx('px-4 py-2 font-medium text-sm', 'bg-emerald-50 text-emerald-900')}>
              Luồng cùng khối
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Sales (lá)</th>
                  <th className="text-left p-3">Khối</th>
                  <th className="text-left p-3">Đích CSKH</th>
                </tr>
              </thead>
              <tbody>{scSame.map(renderScRow)}</tbody>
            </table>
            {scSame.length === 0 && <p className="p-4 text-sm text-gray-500">Chưa có dòng cùng khối.</p>}
          </div>
          <div className="border rounded-xl overflow-hidden">
            <div className={clsx('px-4 py-2 font-medium text-sm', 'bg-amber-50 text-amber-900')}>
              Luồng khác khối / chưa gán
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3">Sales (lá)</th>
                  <th className="text-left p-3">Khối</th>
                  <th className="text-left p-3">Đích CSKH</th>
                </tr>
              </thead>
              <tbody>{scCross.map(renderScRow)}</tbody>
            </table>
            {scCross.length === 0 && <p className="p-4 text-sm text-gray-500">Không có dòng.</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default OrgDataFlowTab;
