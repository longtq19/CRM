import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';

const NOTIFY_MINUTES: { value: number; label: string }[] = [
  { value: 0, label: 'Đúng giờ hẹn' },
  { value: 5, label: 'Trước 5 phút' },
  { value: 15, label: 'Trước 15 phút' },
  { value: 30, label: 'Trước 30 phút' },
  { value: 60, label: 'Trước 1 giờ' },
  { value: 120, label: 'Trước 2 giờ' },
  { value: 1440, label: 'Trước 1 ngày' },
];

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Hẹn gọi lại + bật nhắc (API `PUT /data-pool/callback-schedule`). */
export function CallbackScheduleCell({
  dataPoolId,
  callbackAt,
  callbackNotifyEnabled,
  callbackNotifyMinutesBefore,
  callbackReminderSentAt,
  canEdit,
  onSaved,
}: {
  dataPoolId: string;
  callbackAt?: string | null;
  callbackNotifyEnabled?: boolean;
  callbackNotifyMinutesBefore?: number | null;
  callbackReminderSentAt?: string | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [localAt, setLocalAt] = useState(toDatetimeLocalValue(callbackAt ?? undefined));
  const [notify, setNotify] = useState(Boolean(callbackNotifyEnabled && callbackAt));
  const [minutesBefore, setMinutesBefore] = useState<number>(callbackNotifyMinutesBefore ?? 0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalAt(toDatetimeLocalValue(callbackAt ?? undefined));
    setNotify(Boolean(callbackNotifyEnabled && callbackAt));
    setMinutesBefore(callbackNotifyMinutesBefore ?? 0);
  }, [callbackAt, callbackNotifyEnabled, callbackNotifyMinutesBefore]);

  const save = async () => {
    setSaving(true);
    try {
      let iso: string | null = null;
      if (localAt.trim()) {
        const d = new Date(localAt);
        if (!Number.isFinite(d.getTime())) {
          alert('Thời điểm không hợp lệ');
          return;
        }
        iso = d.toISOString();
      }
      await apiClient.put('/data-pool/callback-schedule', {
        dataPoolId,
        callbackAt: iso,
        callbackNotifyEnabled: notify && !!iso,
        callbackNotifyMinutesBefore: notify && iso ? minutesBefore : undefined,
      });
      onSaved();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit) {
    const label = callbackAt
      ? new Date(callbackAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
      : '—';
    return (
      <div className="text-xs text-gray-700 max-w-[12rem]">
        <div>{label}</div>
        {callbackNotifyEnabled && callbackAt ? (
          <div className="text-[10px] text-gray-500">Nhắc: trước {callbackNotifyMinutesBefore ?? 0} phút</div>
        ) : null}
        {callbackReminderSentAt ? (
          <div className="text-[10px] text-emerald-700">Đã gửi nhắc</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="min-w-[10rem] max-w-[14rem] space-y-1">
      <input
        type="datetime-local"
        className="text-xs border rounded px-1 py-0.5 w-full"
        value={localAt}
        onChange={(e) => setLocalAt(e.target.value)}
      />
      <label className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={notify}
          onChange={(e) => setNotify(e.target.checked)}
        />
        Nhắc tôi
      </label>
      {notify ? (
        <select
          className="text-[11px] border rounded px-1 py-0.5 w-full"
          value={minutesBefore}
          onChange={(e) => setMinutesBefore(Number(e.target.value))}
        >
          {NOTIFY_MINUTES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : null}
      {callbackReminderSentAt ? (
        <div className="text-[10px] text-emerald-700">Đã gửi nhắc (đổi hẹn để nhắc lại)</div>
      ) : null}
      <button
        type="button"
        disabled={saving}
        className="text-[11px] text-blue-600 hover:underline"
        onClick={() => void save()}
      >
        {saving ? 'Đang lưu…' : 'Lưu hẹn'}
      </button>
    </div>
  );
}
