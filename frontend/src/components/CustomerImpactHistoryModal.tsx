import { useEffect, useState, useCallback } from 'react';
import { X, Loader, MessageSquare } from 'lucide-react';
import { apiClient } from '../api/client';
import { formatDateTime } from '../utils/format';
import { DEFAULT_POOL_PUSH_PROCESSING_STATUSES } from '../constants/operationParams';

const INTERACTION_TYPES = [
  { value: 'CALL', label: 'Gọi điện' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email' },
  { value: 'MEETING', label: 'Gặp mặt' },
  { value: 'NOTE', label: 'Ghi chú' },
];

const TYPE_TRANSLATIONS: Record<string, string> = {
  CALL: 'Gọi điện',
  SMS: 'SMS',
  EMAIL: 'Email',
  MEETING: 'Gặp mặt',
  NOTE: 'Ghi chú',
  VISIT: 'Thăm viếng',
  ZALO: 'Zalo',
  FACEBOOK: 'Facebook',
  OTHER: 'Khác',
  lead_created: 'Tạo khách hàng',
  new_lead: 'Khách hàng mới',
  NEW_LEAD: 'Khách hàng mới',
  FIELD_UPDATE: 'Cập nhật thông tin',
  SYSTEM_UPDATE: 'Hệ thống cập nhật',
  TAG_ASSIGN: 'Gắn thẻ',
  TAG_REMOVE: 'Bỏ thẻ',
  REMINDER: 'Nhắc nhở',
  CALLBACK_REMINDER: 'Nhắc gọi lại',
  marketing_duplicate_interaction: 'Trùng số (Marketing)',
};

export interface CustomerImpactHistoryModalProps {
  open: boolean;
  onClose: () => void;
  customerId: string;
  /** `/sales` hoặc `/resales` — khớp route backend */
  apiPrefix: 'sales' | 'resales';
  processingStatusOptions: Array<{ code: string; label: string }>;
  /** Cho phép thêm lịch sử (MANAGE_SALES / MANAGE_RESALES) */
  canAdd: boolean;
  onSaved?: () => void;
}

interface ImpactRow {
  id: string;
  code: string;
  type: string;
  content: string;
  detail: string | null;
  kind: string;
  result: string | null;
  processingStatusAtTime: string | null;
  createdAt: string;
  employee?: { id: string; fullName: string; code?: string };
}

export function CustomerImpactHistoryModal({
  open,
  onClose,
  customerId,
  apiPrefix,
  processingStatusOptions,
  canAdd,
  onSaved,
}: CustomerImpactHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ImpactRow[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [minNoteChars, setMinNoteChars] = useState(10);
  /** Mã trạng thái xử lý đưa số về kho thả nổi — bỏ qua tối thiểu ký tự ghi chú */
  const [poolPushStatuses, setPoolPushStatuses] = useState<string[]>([]);

  const [formType, setFormType] = useState('CALL');
  const [formStatus, setFormStatus] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formDetail, setFormDetail] = useState('');
  const [syncStatus, setSyncStatus] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const data = await apiClient.get('/system-configs?category=operations_params');
      const arr = Array.isArray(data) ? data : [];
      const row = arr.find((c: { key?: string }) => c.key === 'min_note_characters');
      if (row?.value != null) {
        const n = parseInt(String(row.value), 10);
        if (Number.isFinite(n) && n > 0) setMinNoteChars(n);
      }
      const poolRow = arr.find((c: { key?: string }) => c.key === 'pool_push_processing_statuses');
      if (poolRow?.value != null && String(poolRow.value).trim()) {
        try {
          const p = JSON.parse(String(poolRow.value));
          if (Array.isArray(p)) {
            setPoolPushStatuses(p.filter((x: unknown): x is string => typeof x === 'string'));
          } else {
            setPoolPushStatuses([]);
          }
        } catch {
          setPoolPushStatuses([]);
        }
      } else {
        setPoolPushStatuses([]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const effectivePoolPushStatuses =
    poolPushStatuses.length > 0 ? poolPushStatuses : DEFAULT_POOL_PUSH_PROCESSING_STATUSES;

  const loadList = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const path =
        apiPrefix === 'sales'
          ? `/sales/interactions/${customerId}?page=${page}&limit=30`
          : `/resales/interactions/${customerId}?page=${page}&limit=30`;
      const res = await apiClient.get(path);
      setItems(res.data || []);
      setTotalPages(res.pagination?.totalPages || 1);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, [customerId, apiPrefix, page]);

  useEffect(() => {
    if (open) {
      loadConfig();
      setPage(1);
    }
  }, [open, loadConfig]);

  useEffect(() => {
    if (open && customerId) loadList();
  }, [open, customerId, page, loadList]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formStatus) {
      alert('Vui lòng chọn trạng thái xử lý.');
      return;
    }
    const detailTrim = formDetail.trim();
    const contentTrim = formContent.trim() || detailTrim.slice(0, 80);
    const checkLen = detailTrim || contentTrim;
    const skipMinNote = effectivePoolPushStatuses.includes(formStatus);
    const requiredLen = skipMinNote ? 0 : minNoteChars;
    if (requiredLen > 0 && checkLen.length < requiredLen) {
      alert(`Chi tiết tương tác phải tối thiểu ${minNoteChars} ký tự (theo tham số vận hành).`);
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        customerId,
        type: formType,
        content: contentTrim,
        detail: detailTrim || undefined,
        processingStatus: formStatus,
        syncProcessingToDataPool: syncStatus,
      };
      const postPath = apiPrefix === 'sales' ? '/sales/interaction' : '/resales/interaction';
      await apiClient.post(postPath, body);
      setFormContent('');
      setFormDetail('');
      setFormStatus('');
      loadList();
      onSaved?.();
    } catch (err: unknown) {
      const m = err instanceof Error ? err.message : 'Không lưu được';
      alert(m);
    }
    setSubmitting(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-gray-900">Lịch sử tác động</h3>
          </div>
          <button type="button" className="p-1 rounded hover:bg-gray-100" onClick={onClose} aria-label="Đóng">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {canAdd && (
            <form onSubmit={handleSubmit} className="border rounded-lg p-3 bg-slate-50 space-y-2 text-sm">
              <p className="font-medium text-gray-800">Thêm lịch sử tác động</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-gray-600">Trạng thái xử lý *</label>
                  <select
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    required
                  >
                    <option value="">— Chọn —</option>
                    {processingStatusOptions.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600">Loại tương tác</label>
                  <select
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                  >
                    {INTERACTION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-600">Nội dung tương tác (tóm tắt)</label>
                <input
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  placeholder="Tóm tắt ngắn (tuỳ chọn nếu đã nhập chi tiết đủ dài)"
                />
              </div>
              <div>
                <label className="text-xs text-gray-600">
                  Chi tiết tương tác {effectivePoolPushStatuses.includes(formStatus) ? '' : '*'}
                  {effectivePoolPushStatuses.includes(formStatus)
                    ? ' (trạng thái đẩy kho thả nổi — không bắt buộc tối thiểu ký tự)'
                    : ` (tối thiểu ${minNoteChars} ký tự)`}
                </label>
                <textarea
                  className="w-full border rounded px-2 py-1.5 text-sm placeholder:text-gray-400"
                  rows={4}
                  value={formDetail}
                  onChange={(e) => setFormDetail(e.target.value)}
                  placeholder={
                    effectivePoolPushStatuses.includes(formStatus)
                      ? 'Có thể ghi ngắn hoặc để trống…'
                      : `Nhập ít nhất ${minNoteChars} ký tự…`
                  }
                  required={!effectivePoolPushStatuses.includes(formStatus)}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={syncStatus} onChange={(e) => setSyncStatus(e.target.checked)} />
                Đồng bộ trạng thái xử lý lên lead (data pool)
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
              >
                {submitting ? 'Đang lưu…' : 'Lưu lịch sử'}
              </button>
            </form>
          )}

          {loading ? (
            <div className="flex justify-center py-8 text-gray-500">
              <Loader className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <ul className="space-y-2 text-sm">
              {items.map((row) => (
                <li key={`${row.id}-${row.createdAt}`} className="border rounded-lg p-2 bg-white">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>{formatDateTime(row.createdAt)}</span>
                    <span>{row.employee?.fullName || '—'}</span>
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="font-medium text-gray-700">{TYPE_TRANSLATIONS[row.type] || row.type}</span>
                    {row.kind === 'SYSTEM_CHANGE' && (
                      <span className="ml-2 text-amber-700">[Hệ thống]</span>
                    )}
                    {row.processingStatusAtTime && (
                      <span className="ml-2 text-gray-600">TT: {row.processingStatusAtTime}</span>
                    )}
                  </div>
                  <p className="mt-1 text-gray-800 whitespace-pre-wrap">{row.content}</p>
                  {row.detail && (
                    <p className="mt-1 text-gray-600 text-xs whitespace-pre-wrap border-t pt-1">{row.detail}</p>
                  )}
                </li>
              ))}
              {items.length === 0 && <li className="text-center text-gray-400 py-4">Chưa có lịch sử</li>}
            </ul>
          )}

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 text-xs">
              <button
                type="button"
                disabled={page <= 1}
                className="px-2 py-1 border rounded disabled:opacity-40"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Trước
              </button>
              <span>
                Trang {page}/{totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                className="px-2 py-1 border rounded disabled:opacity-40"
                onClick={() => setPage((p) => p + 1)}
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
