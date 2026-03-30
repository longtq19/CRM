import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import type { Employee } from '../types';
import { KeyRound, Loader2, X, User, Dices, Copy, Check } from 'lucide-react';

const RANDOM_PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generateRandomPassword12(): string {
  const buf = new Uint8Array(12);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => RANDOM_PW_CHARS[b % RANDOM_PW_CHARS.length]).join('');
}

export interface SetTempPasswordModalProps {
  employee: Employee | null;
  open: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

const SetTempPasswordModal: React.FC<SetTempPasswordModalProps> = ({
  employee,
  open,
  onClose,
  onSuccess,
}) => {
  const [tempPassword, setTempPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setTempPassword('');
      setError(null);
      setSaving(false);
      setCopied(false);
    }
  }, [open, employee?.id]);

  if (!open || !employee) return null;

  const handleSubmit = async () => {
    if (!tempPassword || tempPassword.length < 6) {
      setError('Mật khẩu tạm phải có ít nhất 6 ký tự.');
      return;
    }
    const ok = window.confirm(
      `Xác nhận đặt mật khẩu tạm cho "${employee.fullName}"? Mật khẩu hiện tại sẽ bị thay thế.`
    );
    if (!ok) return;

    setSaving(true);
    setError(null);
    try {
      const res: any = await apiClient.post('/auth/admin/set-temp-password', {
        employeeId: employee.id,
        tempPassword,
      });
      if (res?.success) {
        const msg = res.message || 'Đã đặt mật khẩu tạm thành công.';
        onSuccess?.(msg);
        onClose();
      } else {
        setError(res?.message || 'Đặt mật khẩu tạm thất bại.');
      }
    } catch (e: any) {
      setError(e?.message || 'Lỗi kết nối máy chủ.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2 text-gray-900 font-semibold text-sm">
            <KeyRound size={18} className="text-primary" />
            Đặt mật khẩu tạm
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <User size={18} />
            </div>
            <div className="text-xs min-w-0">
              <p className="font-semibold text-gray-900 truncate">{employee.fullName}</p>
              <p className="text-gray-500 truncate">
                {employee.code && <span>Mã: {employee.code}</span>}
                {employee.phone && <span className="ml-2">SĐT: {employee.phone}</span>}
              </p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mật khẩu tạm (tối thiểu 6 ký tự)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setTempPassword(generateRandomPassword12());
                  setCopied(false);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Dices size={14} />
                Tạo ngẫu nhiên 12 ký tự
              </button>
              <button
                type="button"
                disabled={saving || !tempPassword}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tempPassword);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  } catch {
                    setError('Không thể sao chép. Hãy chọn và sao chép thủ công.');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                {copied ? 'Đã sao chép' : 'Sao chép'}
              </button>
            </div>
            <input
              type="text"
              value={tempPassword}
              onChange={(e) => {
                setTempPassword(e.target.value);
                setCopied(false);
              }}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Bấm «Tạo ngẫu nhiên 12 ký tự» hoặc nhập tay…"
              autoComplete="off"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Mật khẩu tạm thay thế mật khẩu hiện tại; nhân sự nên đổi lại sau khi đăng nhập.
            </p>
          </div>
          {error && (
            <div className="text-sm px-3 py-2 rounded-lg border bg-red-50 border-red-200 text-red-700">{error}</div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || tempPassword.length < 6}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
            >
              {saving && <Loader2 size={16} className="animate-spin" />}
              Xác nhận
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SetTempPasswordModal;
