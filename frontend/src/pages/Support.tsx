import { useState, useEffect, useRef } from 'react';
import { apiClient, API_URL } from '../api/client';
import { useAuthStore } from '../context/useAuthStore';
import {
  Plus, Ticket, Clock, CheckCircle2, Loader2, ArrowLeft,
  Paperclip, Download, Trash2, X, AlertCircle, FileText, Image
} from 'lucide-react';
import { formatDateTime } from '../utils/format';
import type { SupportTicket, SupportTicketStatus } from '../types';

const STATUS_CONFIG: Record<SupportTicketStatus, { label: string; color: string; bg: string; icon: typeof Ticket }> = {
  NEW: { label: 'Mới', color: 'text-blue-700', bg: 'bg-blue-100', icon: Ticket },
  IN_PROGRESS: { label: 'Đang xử lý', color: 'text-yellow-700', bg: 'bg-yellow-100', icon: Clock },
  RESOLVED: { label: 'Đã xử lý', color: 'text-green-700', bg: 'bg-green-100', icon: CheckCircle2 }
};

const StatusBadge = ({ status }: { status: SupportTicketStatus }) => {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${cfg.color} ${cfg.bg}`}>
      <Icon size={13} />
      {cfg.label}
    </span>
  );
};

const formatTicketDate = (d: string) => {
  try { return formatDateTime(d); } catch { return d; }
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const isImageFile = (type: string) => type.startsWith('image/');

const Support = () => {
  const { user, isAdmin } = useAuthStore();
  const admin = isAdmin();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [counts, setCounts] = useState({ NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, ALL: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('ALL');

  const [showForm, setShowForm] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [adminNote, setAdminNote] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchTickets = async (status?: string) => {
    try {
      setLoading(true);
      const s = status ?? filterStatus;
      const qs = s !== 'ALL' ? `?status=${s}` : '';
      const data = await apiClient.get(`/support-tickets${qs}`);
      setTickets(data.tickets || []);
      setCounts(data.counts || { NEW: 0, IN_PROGRESS: 0, RESOLVED: 0, ALL: 0 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTickets(); }, [filterStatus]);

  const handleSubmit = async () => {
    if (!formTitle.trim() || !formDesc.trim()) {
      alert('Vui lòng nhập tiêu đề và mô tả.');
      return;
    }
    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('title', formTitle.trim());
      fd.append('description', formDesc.trim());
      formFiles.forEach(f => fd.append('files', f));
      await apiClient.postMultipart('/support-tickets', fd);
      setShowForm(false);
      setFormTitle('');
      setFormDesc('');
      setFormFiles([]);
      fetchTickets();
    } catch (err: any) {
      alert(err?.message || 'Lỗi khi tạo ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const total = formFiles.length + files.length;
    if (total > 5) { alert('Tối đa 5 file đính kèm.'); return; }
    const oversized = files.find(f => f.size > 10 * 1024 * 1024);
    if (oversized) { alert('Mỗi file tối đa 10MB.'); return; }
    setFormFiles(prev => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx: number) => setFormFiles(prev => prev.filter((_, i) => i !== idx));

  const handleStatusChange = async (ticketId: string, newStatus: SupportTicketStatus) => {
    try {
      setUpdatingStatus(true);
      const updated = await apiClient.put(`/support-tickets/${ticketId}/status`, {
        status: newStatus,
        adminNote: adminNote.trim() || undefined
      });
      setSelectedTicket(updated);
      setAdminNote('');
      fetchTickets();
    } catch (err: any) {
      alert(err?.message || 'Lỗi cập nhật trạng thái.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = async (ticketId: string) => {
    if (!confirm('Bạn có chắc muốn xóa yêu cầu này?')) return;
    try {
      await apiClient.delete(`/support-tickets/${ticketId}`);
      setSelectedTicket(null);
      fetchTickets();
    } catch (err: any) {
      alert(err?.message || 'Lỗi khi xóa.');
    }
  };

  const openDetail = async (ticket: SupportTicket) => {
    try {
      const full = await apiClient.get(`/support-tickets/${ticket.id}`);
      setSelectedTicket(full);
      setAdminNote(full.adminNote || '');
    } catch (err) {
      console.error(err);
    }
  };

  // --- DETAIL VIEW ---
  if (selectedTicket) {
    const t = selectedTicket;
    return (
      <div className="space-y-6">
        <button onClick={() => setSelectedTicket(null)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft size={18} /> Quay lại danh sách
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-sm text-gray-400 font-mono">{t.code}</span>
              <h2 className="text-xl font-bold text-gray-900 mt-1">{t.title}</h2>
            </div>
            <StatusBadge status={t.status} />
          </div>

          <div className="bg-gray-50 rounded-lg p-4 whitespace-pre-wrap text-gray-700 text-sm leading-relaxed">{t.description}</div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Người tạo:</span>
              <span className="ml-2 font-medium text-gray-800">{t.createdBy?.fullName} ({t.createdBy?.code})</span>
            </div>
            <div>
              <span className="text-gray-400">Ngày tạo:</span>
              <span className="ml-2 text-gray-700">{formatTicketDate(t.createdAt)}</span>
            </div>
            {t.assignedTo && (
              <div>
                <span className="text-gray-400">Người xử lý:</span>
                <span className="ml-2 font-medium text-gray-800">{t.assignedTo.fullName}</span>
              </div>
            )}
            {t.resolvedAt && (
              <div>
                <span className="text-gray-400">Ngày xử lý:</span>
                <span className="ml-2 text-gray-700">{formatTicketDate(t.resolvedAt)}</span>
              </div>
            )}
          </div>

          {/* Attachments */}
          {t.attachments.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5"><Paperclip size={15} /> File đính kèm ({t.attachments.length})</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {t.attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {isImageFile(att.fileType) ? (
                      <Image size={20} className="text-blue-500 flex-shrink-0" />
                    ) : (
                      <FileText size={20} className="text-gray-400 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{att.fileName}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(att.fileSize)}</p>
                    </div>
                    <a
                      href={`${API_URL}${att.filePath}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
                      title="Tải xuống"
                    >
                      <Download size={16} className="text-gray-500" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Admin note */}
          {t.adminNote && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800 mb-1">Ghi chú xử lý</h4>
              <p className="text-sm text-blue-700 whitespace-pre-wrap">{t.adminNote}</p>
            </div>
          )}

          {/* Admin actions */}
          {admin && t.status !== 'RESOLVED' && (
            <div className="border-t pt-5 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">Cập nhật trạng thái</h4>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                placeholder="Ghi chú xử lý (tùy chọn)..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
              <div className="flex gap-2">
                {t.status === 'NEW' && (
                  <button
                    onClick={() => handleStatusChange(t.id, 'IN_PROGRESS')}
                    disabled={updatingStatus}
                    className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {updatingStatus ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />}
                    Tiếp nhận xử lý
                  </button>
                )}
                {(t.status === 'NEW' || t.status === 'IN_PROGRESS') && (
                  <button
                    onClick={() => handleStatusChange(t.id, 'RESOLVED')}
                    disabled={updatingStatus}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {updatingStatus ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Đánh dấu đã xử lý
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Delete for creator when NEW */}
          {!admin && t.createdById === user?.id && t.status === 'NEW' && (
            <div className="border-t pt-4">
              <button
                onClick={() => handleDelete(t.id)}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Xóa yêu cầu
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- CREATE FORM ---
  if (showForm) {
    return (
      <div className="space-y-6">
        <button onClick={() => setShowForm(false)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft size={18} /> Quay lại
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
          <h2 className="text-xl font-bold text-gray-900">Tạo yêu cầu hỗ trợ</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formTitle}
              onChange={e => setFormTitle(e.target.value)}
              placeholder="VD: Không đăng nhập được, lỗi xuất báo cáo..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả chi tiết <span className="text-red-500">*</span></label>
            <textarea
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              placeholder="Mô tả chi tiết vấn đề bạn gặp phải..."
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File đính kèm <span className="text-gray-400 font-normal">(tối đa 5 file, mỗi file 10MB)</span></label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileAdd}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={formFiles.length >= 5}
              className="px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 disabled:opacity-40 flex items-center gap-1.5 transition-colors"
            >
              <Paperclip size={15} /> Chọn file
            </button>
            {formFiles.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {formFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <FileText size={15} className="text-gray-400 flex-shrink-0" />
                    <span className="flex-1 truncate text-gray-700">{f.name}</span>
                    <span className="text-xs text-gray-400">{formatFileSize(f.size)}</span>
                    <button onClick={() => removeFile(i)} className="p-0.5 hover:bg-gray-200 rounded transition-colors">
                      <X size={14} className="text-gray-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              Gửi yêu cầu
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
            >
              Hủy
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- LIST VIEW ---
  const filterTabs: { key: string; label: string }[] = [
    { key: 'ALL', label: `Tất cả (${counts.ALL})` },
    { key: 'NEW', label: `Mới (${counts.NEW})` },
    { key: 'IN_PROGRESS', label: `Đang xử lý (${counts.IN_PROGRESS})` },
    { key: 'RESOLVED', label: `Đã xử lý (${counts.RESOLVED})` }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Hỗ trợ</h2>
          <p className="text-gray-500 text-sm">{admin ? 'Quản lý yêu cầu hỗ trợ' : 'Gửi yêu cầu hỗ trợ kỹ thuật & phần mềm'}</p>
        </div>
        {!admin && (
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm"
          >
            <Plus size={18} /> Tạo yêu cầu
          </button>
        )}
      </div>

      {/* Stats for Admin */}
      {admin && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{counts.NEW}</div>
            <div className="text-xs text-blue-600 font-medium mt-0.5">Mới</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-yellow-700">{counts.IN_PROGRESS}</div>
            <div className="text-xs text-yellow-600 font-medium mt-0.5">Đang xử lý</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{counts.RESOLVED}</div>
            <div className="text-xs text-green-600 font-medium mt-0.5">Đã xử lý</div>
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto">
        {filterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilterStatus(tab.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              filterStatus === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Ticket list */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={28} className="animate-spin text-gray-400" /></div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <AlertCircle size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 text-sm">
            {filterStatus !== 'ALL' ? 'Không có ticket nào ở trạng thái này.' : (admin ? 'Chưa có yêu cầu hỗ trợ nào.' : 'Bạn chưa tạo yêu cầu nào.')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map(t => (
            <div
              key={t.id}
              onClick={() => openDetail(t)}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 hover:shadow-sm cursor-pointer transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-gray-400">{t.code}</span>
                    <StatusBadge status={t.status} />
                    {t.attachments.length > 0 && (
                      <span className="text-xs text-gray-400 flex items-center gap-0.5"><Paperclip size={12} />{t.attachments.length}</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 truncate">{t.title}</h3>
                  <p className="text-sm text-gray-500 truncate mt-0.5">{t.description}</p>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs text-gray-400 flex-shrink-0">
                  {admin && <span className="font-medium text-gray-600">{t.createdBy?.fullName}</span>}
                  <span>{formatTicketDate(t.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Support;
