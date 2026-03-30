import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiClient } from '../api/client';
import { ALL_CROPS_SET, CROP_DEFS, CROP_GROUPS_ORDER } from '../constants/cropConfigs';
import { Pencil } from 'lucide-react';

type RootCounts = Record<string, number>;

function normalizeRootCounts(v: unknown): RootCounts {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: RootCounts = {};
  for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
  }
  return out;
}

/** Hiển thị «Tên (n gốc)» cho cây tính gốc hoặc giá trị ngoài danh mục có số gốc lưu sẵn */
function formatCropSegment(crop: string, counts: RootCounts): string {
  const def = CROP_DEFS.find((d) => d.value === crop);
  const n = counts[crop];
  if (n != null && n > 0) {
    if (def?.isRootCountable) return `${crop} (${n} gốc)`;
    if (!def) return `${crop} (${n} gốc)`;
  }
  return crop;
}

function formatFarmAreaLine(area: unknown, unit: string | null | undefined): string | null {
  if (area == null || area === '') return null;
  const n = typeof area === 'number' ? area : Number(String(area).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const u = (unit && String(unit).trim()) || 'ha';
  const numStr = n % 1 === 0 ? String(Math.round(n)) : n.toFixed(2).replace(/\.?0+$/, '');
  return `Diện tích ${numStr} ${u}`;
}

/** Cột «Nhóm cây»: hiển thị đủ danh sách; sửa nhiều cây qua modal + API `PATCH .../quick-main-crops`. */
export function MainCropQuickSelect({
  customerId,
  mainCrops,
  mainCropsRootCounts,
  farmArea,
  farmAreaUnit,
  soilType,
  canEdit,
  onSaved,
}: {
  customerId: string;
  mainCrops?: string[] | null;
  mainCropsRootCounts?: unknown;
  /** Diện tích canh tác (cùng ô «Nhóm cây») */
  farmArea?: number | string | null;
  farmAreaUnit?: string | null;
  soilType?: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rootInputs, setRootInputs] = useState<RootCounts>({});
  const [saving, setSaving] = useState(false);

  const unknownCrops = useMemo(
    () => (mainCrops || []).filter((c) => c && !ALL_CROPS_SET.has(c)),
    [mainCrops],
  );

  /** Thứ tự hiển thị bám danh mục hệ thống */
  const orderedCatalog = useMemo(() => {
    const set = new Set(mainCrops || []);
    return CROP_DEFS.filter((c) => set.has(c.value)).map((c) => c.value);
  }, [mainCrops]);

  const openModal = () => {
    // Cây đang chọn thuộc danh mục (cùng thứ tự hiển thị cột — không dùng biến không tồn tại `catalogCrops`)
    setSelected(new Set(orderedCatalog));
    setRootInputs(normalizeRootCounts(mainCropsRootCounts));
    setModalOpen(true);
  };

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const toggleCrop = (value: string, def: { isRootCountable: boolean }) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
        if (def.isRootCountable) {
          setRootInputs((r) => {
            const copy = { ...r };
            delete copy[value];
            return copy;
          });
        }
      } else {
        next.add(value);
        if (def.isRootCountable) {
          setRootInputs((r) => ({ ...r, [value]: r[value] && r[value] > 0 ? r[value] : 1 }));
        }
      }
      return next;
    });
  };

  const save = async () => {
    const mainCropsArr = CROP_DEFS.filter((c) => selected.has(c.value)).map((c) => c.value);
    if (mainCropsArr.length === 0) {
      alert('Chọn ít nhất một cây trong danh mục');
      return;
    }
    const mainCropsRootCountsPayload: RootCounts = {};
    for (const c of mainCropsArr) {
      const def = CROP_DEFS.find((d) => d.value === c);
      if (def?.isRootCountable) {
        const n = rootInputs[c];
        mainCropsRootCountsPayload[c] = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
      }
    }
    setSaving(true);
    try {
      await apiClient.patch(`/customers/${customerId}/quick-main-crops`, {
        mainCrops: mainCropsArr,
        mainCropsRootCounts: mainCropsRootCountsPayload,
      });
      setModalOpen(false);
      onSaved();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Không lưu được nhóm cây');
    } finally {
      setSaving(false);
    }
  };

  const displayParts = useMemo(
    () => [...orderedCatalog, ...unknownCrops],
    [orderedCatalog, unknownCrops],
  );

  const rootCountsDisplay = useMemo(() => normalizeRootCounts(mainCropsRootCounts), [mainCropsRootCounts]);

  const displayText = useMemo(() => {
    if (displayParts.length === 0) return '';
    return displayParts.map((c) => formatCropSegment(c, rootCountsDisplay)).join(' · ');
  }, [displayParts, rootCountsDisplay]);

  const farmLine = useMemo(() => formatFarmAreaLine(farmArea, farmAreaUnit), [farmArea, farmAreaUnit]);
  const soilLine = useMemo(() => {
    const s = soilType?.trim();
    return s ? `Loại đất: ${s}` : null;
  }, [soilType]);

  const fullTitle = useMemo(() => {
    const lines = [displayText || null, farmLine, soilLine].filter(Boolean) as string[];
    return lines.join('\n');
  }, [displayText, farmLine, soilLine]);

  const hasMeta = Boolean(farmLine || soilLine);

  return (
    <div className="min-w-[7rem] max-w-[14rem]" title={fullTitle || undefined}>
      <div className="text-xs text-gray-800 whitespace-normal break-words leading-snug">
        {displayText ? (
          <span>{displayText}</span>
        ) : !hasMeta ? (
          <span className="text-gray-400">—</span>
        ) : null}
      </div>
      {hasMeta && (
        <div
          className={`text-[10px] text-gray-600 space-y-0.5 leading-snug ${displayText ? 'mt-0.5' : ''}`}
        >
          {farmLine ? <div>{farmLine}</div> : null}
          {soilLine ? <div>{soilLine}</div> : null}
        </div>
      )}
      {unknownCrops.length > 0 && (
        <div
          className="text-[10px] text-amber-700 mt-0.5"
          title="Giá trị ngoài danh mục — chỉnh trong form cập nhật khách"
        >
          {orderedCatalog.length > 0 ? 'Ngoài danh mục: ' : ''}
          {unknownCrops.join(', ')}
        </div>
      )}
      {canEdit && (
        <button
          type="button"
          onClick={openModal}
          className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-blue-600 hover:underline"
        >
          <Pencil className="w-3 h-3" />
          Sửa nhóm cây
        </button>
      )}

      {modalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="Đóng"
              onClick={() => setModalOpen(false)}
            />
            <div className="relative z-[201] bg-white rounded-xl shadow-xl border max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b flex justify-between items-center">
                <span className="font-medium text-gray-900">Chọn nhóm cây</span>
                <button type="button" className="text-gray-500 hover:text-gray-800" onClick={() => setModalOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-4 py-3 space-y-3 text-sm">
                {CROP_GROUPS_ORDER.map((group) => {
                  const crops = CROP_DEFS.filter((c) => c.group === group);
                  if (crops.length === 0) return null;
                  return (
                    <div key={group}>
                      <div className="text-xs font-medium text-gray-500 mb-1">{group}</div>
                      <div className="space-y-1.5">
                        {crops.map((c) => (
                          <label key={c.value} className="flex items-start gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selected.has(c.value)}
                              onChange={() => toggleCrop(c.value, c)}
                              className="mt-1 rounded border-gray-300"
                            />
                            <span className="flex-1">
                              <span className="text-gray-800">{c.value}</span>
                              {c.isRootCountable && selected.has(c.value) ? (
                                <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-600">
                                  Số gốc
                                  <input
                                    type="number"
                                    min={1}
                                    className="w-16 border rounded px-1 py-0.5 text-xs"
                                    value={rootInputs[c.value] ?? 1}
                                    onChange={(e) => {
                                      const v = parseInt(e.target.value, 10);
                                      setRootInputs((r) => ({
                                        ...r,
                                        [c.value]: Number.isFinite(v) && v > 0 ? v : 1,
                                      }));
                                    }}
                                  />
                                </span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 border-t flex justify-end gap-2 bg-gray-50">
                <button
                  type="button"
                  className="px-3 py-1.5 text-sm border rounded-lg hover:bg-white"
                  onClick={() => setModalOpen(false)}
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => void save()}
                >
                  {saving ? 'Đang lưu…' : 'Lưu'}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
