import React, { useState, useEffect, useRef } from 'react';
import { 
  FileText, Download, ExternalLink, Plus, Search, Filter, 
  Edit, Trash2, Book, HelpCircle, Shield, Wrench, HeartHandshake,
  X, AlertCircle, Upload, Save, Users, Lock, Eye, Pencil, Settings,
  Check, Printer
} from 'lucide-react';
import { useAuthStore } from '../context/useAuthStore';
import { isTechnicalAdminRole } from '../constants/rbac';
import { apiClient } from '../api/client';
import type { SystemDocument } from '../types/index';
import DocumentViewer from '../components/DocumentViewer';
import DocumentEditor from '../components/DocumentEditor';
import clsx from 'clsx';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';
import { formatDate } from '../utils/format';
import { resolveUploadUrl } from '../utils/assetsUrl';

interface DocumentAccess {
  canView: boolean;
  canEdit: boolean;
  canDownload: boolean;
  canPrint: boolean;
  isOwner: boolean;
  canManagePermissions?: boolean;
  isAdmin?: boolean;
}

interface DocumentPermission {
  id?: string;
  employeeId?: string;
  employee?: { id: string; fullName: string; avatarUrl?: string };
  accessLevel: 'VIEWER' | 'VIEW_DOWNLOAD' | 'EDITOR';
}

interface Employee {
  id: string;
  code: string;
  fullName: string;
  avatarUrl?: string;
  department?: { id: string; name: string };
  position?: { id: string; name: string };
}

interface DocumentTypeItem {
  id: string;
  code: string;
  name: string;
  displayOrder: number;
}

const Documents = () => {
  const { user } = useAuthStore();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'view' | 'edit' | 'create'>('list');
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [docAccess, setDocAccess] = useState<DocumentAccess | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  const isAdmin = isTechnicalAdminRole(user?.roleGroup?.code);
  
  const [uploadedData, setUploadedData] = useState<{content: string, title: string} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionDoc, setPermissionDoc] = useState<any>(null);
  const [permissions, setPermissions] = useState<DocumentPermission[]>([]);
  
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const selectAllEmployeeCheckboxRef = useRef<HTMLInputElement>(null);

  const [documentTypes, setDocumentTypes] = useState<DocumentTypeItem[]>([]);
  const [documentTypesError, setDocumentTypesError] = useState<string | null>(null);
  const [showTypesModal, setShowTypesModal] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editingTypeName, setEditingTypeName] = useState('');

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocumentTypes = async () => {
    try {
      setDocumentTypesError(null);
      const data = await apiClient.get('/documents/types');
      setDocumentTypes(Array.isArray(data) ? data : []);
    } catch (e: any) {
      console.error('Failed to fetch document types', e);
      const msg = e?.message || 'Không tải được danh sách phân loại';
      setDocumentTypesError(msg.includes('Not Found') || msg.includes('404')
        ? 'Backend chưa có API phân loại. Vui lòng cập nhật backend và chạy migration bảng document_types.'
        : msg);
      setDocumentTypes([]);
    }
  };

  useEffect(() => {
    fetchDocumentTypes();
  }, []);

  // Checkbox "Chọn tất cả nhân sự": trạng thái indeterminate (một phần đã chọn)
  useEffect(() => {
    const el = selectAllEmployeeCheckboxRef.current;
    if (!el) return;
    const keyword = employeeSearch.trim().toLowerCase();
    const filtered = employees.filter(e =>
      !keyword || e.fullName.toLowerCase().includes(keyword) || (e.code && e.code.toLowerCase().includes(keyword))
    );
    const permEmployeeIds = new Set(permissions.filter(p => p.employeeId).map(p => p.employeeId as string));
    const allSelected = filtered.length > 0 && filtered.every(e => permEmployeeIds.has(e.id));
    const someSelected = filtered.some(e => permEmployeeIds.has(e.id));
    el.indeterminate = someSelected && !allSelected;
  }, [permissions, employeeSearch, employees]);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const data = await apiClient.get('/documents');
      setDocuments(data);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchDocumentDetail = async (id: string) => {
    try {
      const data = await apiClient.get(`/documents/${id}`);
      setSelectedDoc(data);
      setDocAccess(data.access);
      return data;
    } catch (error: any) {
      alert(error.message || 'Không thể xem tài liệu này');
      return null;
    }
  };

  const fetchPermissionHelpers = async () => {
    try {
      const empData = await apiClient.get('/documents-helper/employees');
      setEmployees(empData);
    } catch (error) {
      console.error('Failed to fetch permission helpers:', error);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['.docx', '.html', '.md', '.xlsx', '.pdf'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(ext)) {
      alert('Định dạng file không hợp lệ. Chỉ chấp nhận .docx, .html, .md, .xlsx, .pdf');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
      setLoading(true);
      const res = await (apiClient as any).postMultipart('/documents/upload', formData);
      if (res) {
        setUploadedData({
          content: res.content,
          title: res.filename.replace(ext, '')
        });
        setViewMode('create');
      }
    } catch (error: any) {
      alert(error.message || 'Lỗi khi tải file');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async (content: string, title: string, type: string, perms?: DocumentPermission[]) => {
    try {
      if (viewMode === 'create') {
        await apiClient.post('/documents', { 
          name: title, 
          content, 
          type,
          permissions: perms || []
        });
      } else if (viewMode === 'edit' && selectedDoc) {
        await apiClient.put(`/documents/${selectedDoc.id}`, { 
          name: title, 
          content, 
          type,
          permissions: docAccess?.canManagePermissions ? perms : undefined
        });
      }
      await fetchDocuments();
      setViewMode('list');
      setSelectedDoc(null);
      setUploadedData(null);
    } catch (error: any) {
      alert(error.message || 'Lỗi khi lưu tài liệu');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa tài liệu này?')) return;
    try {
      await apiClient.delete(`/documents/${id}`);
      await fetchDocuments();
      if (selectedDoc?.id === id) {
        setViewMode('list');
        setSelectedDoc(null);
      }
    } catch (error: any) {
      alert(error.message || 'Không thể xóa tài liệu');
    }
  };

  const handleDownload = async (doc: any) => {
    try {
      const res = await apiClient.get(`/documents/${doc.id}/download`);
      const element = document.createElement("a");
      const file = new Blob([res.content], {type: 'text/html'});
      element.href = URL.createObjectURL(file);
      element.download = `${res.name}.html`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
    } catch (error: any) {
      alert(error.message || 'Bạn không có quyền tải xuống tài liệu này');
    }
  };

  const handlePrint = async (doc: any) => {
    try {
      const res = await apiClient.get(`/documents/${doc.id}/print-check`);
      if (res.canPrint) {
        window.print();
      }
    } catch (error: any) {
      alert(error.message || 'Bạn không có quyền in tài liệu này');
    }
  };

  const openPermissionModal = async (doc: any) => {
    setPermissionDoc(doc);
    await fetchPermissionHelpers();
    const detail = await fetchDocumentDetail(doc.id);
    if (detail) {
      const raw = (detail.permissions || []) as DocumentPermission[];
      setPermissions(raw.filter((p) => p.employeeId));
    }
    setShowPermissionModal(true);
  };

  const savePermissions = async () => {
    if (!permissionDoc) return;
    try {
      await apiClient.put(`/documents/${permissionDoc.id}/permissions`, { permissions });
      alert('Đã cập nhật phân quyền thành công');
      setShowPermissionModal(false);
      await fetchDocuments();
    } catch (error: any) {
      alert(error.message || 'Lỗi khi cập nhật phân quyền');
    }
  };

  const addPermission = (
    employeeId: string,
    accessLevel: 'VIEWER' | 'VIEW_DOWNLOAD' | 'EDITOR' = 'VIEWER'
  ) => {
    if (permissions.some((p) => p.employeeId === employeeId)) return;
    const emp = employees.find((e) => e.id === employeeId);
    const newPerm: DocumentPermission = {
      accessLevel,
      employeeId,
      ...(emp ? { employee: { id: emp.id, fullName: emp.fullName, avatarUrl: emp.avatarUrl } } : {}),
    };
    setPermissions([...permissions, newPerm]);
  };

  const removePermission = (index: number) => {
    setPermissions(permissions.filter((_, i) => i !== index));
  };

  const updatePermissionLevel = (index: number, level: 'VIEWER' | 'VIEW_DOWNLOAD' | 'EDITOR') => {
    const updated = [...permissions];
    updated[index].accessLevel = level;
    setPermissions(updated);
  };

  const filteredDocs = documents.filter(doc => {
    const docName = doc.name || doc.title || '';
    const matchesType = filterType === 'all' || doc.type === filterType;
    const matchesSearch = docName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (doc.code && doc.code.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const docTypes = [
    { id: 'all', label: 'Tất cả', icon: FileText },
    ...documentTypes.map(t => ({ id: t.code, label: t.name, icon: FileText }))
  ];

  const getIconForType = (type: string) => {
    switch (type) {
      case 'guide': return <Book size={20} />;
      case 'process': return <HelpCircle size={20} />;
      case 'technical': return <Wrench size={20} />;
      case 'policy': return <Shield size={20} />;
      case 'customer_care': return <HeartHandshake size={20} />;
      default: return <FileText size={20} />;
    }
  };

  const getTypeName = (type: string) => {
    const found = documentTypes.find(t => t.code === type);
    return found ? found.name : type;
  };

  const handleCreateDocumentType = async () => {
    const name = newTypeName.trim();
    if (!name) {
      alert('Vui lòng nhập tên phân loại');
      return;
    }
    try {
      await apiClient.post('/documents/types', { name });
      setNewTypeName('');
      fetchDocumentTypes();
    } catch (err: any) {
      const msg = err.response?.data?.message ?? err.response?.data?.error ?? err.message ?? 'Không thể thêm phân loại';
      alert(msg);
    }
  };

  const handleUpdateDocumentType = async (id: string) => {
    const name = editingTypeName.trim();
    if (!name) return;
    try {
      await apiClient.put(`/documents/types/${id}`, { name });
      setEditingTypeId(null);
      setEditingTypeName('');
      fetchDocumentTypes();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể cập nhật');
    }
  };

  const handleDeleteDocumentType = async (id: string, name: string) => {
    if (!window.confirm(`Xóa phân loại "${name}"? Tài liệu đang dùng phân loại này cần được đổi loại trước.`)) return;
    try {
      await apiClient.delete(`/documents/types/${id}`);
      fetchDocumentTypes();
      setEditingTypeId(null);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Không thể xóa');
    }
  };

  const getAvatarUrl = (url?: string, name?: string) => {
    if (url) {
      return resolveUploadUrl(url);
    }
    return getUiAvatarFallbackUrl(name || 'U');
  };

  const EditorWrapper = ({ initialDoc }: { initialDoc?: any }) => {
    const [title, setTitle] = useState(initialDoc?.name || initialDoc?.title || uploadedData?.title || '');
    const [type, setType] = useState(initialDoc?.type || documentTypes[0]?.code || 'guide');
    const [content, setContent] = useState(initialDoc?.content || uploadedData?.content || '');
    
    const isPdf = content.startsWith('data:application/pdf');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);

    useEffect(() => {
      if (isPdf) {
        try {
          const base64Data = content.split(',')[1];
          const binaryString = window.atob(base64Data);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          setPdfUrl(url);
          return () => URL.revokeObjectURL(url);
        } catch (e) {
          setPdfUrl(null);
        }
      } else {
        setPdfUrl(null);
      }
    }, [content, isPdf]);
    
    return (
      <div className="flex flex-col h-full gap-4">
        <div className="flex flex-col md:flex-row gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề tài liệu</label>
            <input 
              type="text" 
              value={title} 
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Nhập tiêu đề..."
            />
          </div>
          <div className="w-full md:w-64">
            <label className="block text-sm font-medium text-gray-700 mb-1">Loại tài liệu</label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {documentTypes.length === 0 ? (
                <option value={type}>{type || 'Đang tải...'}</option>
              ) : (
                documentTypes.map(t => (
                  <option key={t.id} value={t.code}>{t.name}</option>
                ))
              )}
            </select>
          </div>
          {isPdf && (
            <div className="flex items-end gap-2">
              <button 
                onClick={() => handleSave(content, title, type)}
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-sm flex items-center gap-2 h-[42px]"
              >
                <Save size={18} />
                Lưu
              </button>
              <button 
                onClick={() => {
                  setViewMode('list');
                  setSelectedDoc(null);
                  setUploadedData(null);
                }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors shadow-sm h-[42px]"
              >
                Hủy
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-hidden h-full relative bg-gray-100 rounded-xl border border-gray-200">
          {isPdf ? (
            pdfUrl ? (
              <iframe src={pdfUrl} className="w-full h-full border-none" title="PDF Preview" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-red-500 gap-2">
                <p>Lỗi khi tải file PDF.</p>
              </div>
            )
          ) : (
            <DocumentEditor 
              initialContent={content}
              title={title}
              onSave={(newContent) => handleSave(newContent, title, type)}
              onCancel={() => {
                setViewMode('list');
                setSelectedDoc(null);
                setUploadedData(null);
              }}
              onUploadComplete={(newContent, filename) => {
                setContent(newContent);
                if (!title && filename) {
                  setTitle(filename.replace(/\.[^/.]+$/, ""));
                }
              }}
            />
          )}
        </div>
      </div>
    );
  };

  if (viewMode === 'view' && selectedDoc) {
    return (
      <DocumentViewer 
        content={selectedDoc.content} 
        title={selectedDoc.name || selectedDoc.title} 
        onBack={() => {
          setViewMode('list');
          setSelectedDoc(null);
          setDocAccess(null);
        }}
        canDownload={docAccess?.canDownload}
        canPrint={docAccess?.canPrint}
        onDownload={() => handleDownload(selectedDoc)}
        onPrint={() => handlePrint(selectedDoc)}
      />
    );
  }

  if (viewMode === 'create') {
    return <EditorWrapper />;
  }

  if (viewMode === 'edit' && selectedDoc) {
    return <EditorWrapper initialDoc={selectedDoc} />;
  }

  return (
    <div className="space-y-4 md:space-y-6 h-full flex flex-col">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kho tài liệu</h1>
          <p className="text-gray-600 mt-1">Quản lý và tra cứu tài liệu hệ thống</p>
        </div>
        <button 
          onClick={() => setViewMode('create')}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-sm w-full md:w-auto"
        >
          <Plus size={20} />
          Thêm tài liệu mới
        </button>
      </div>

      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input 
            type="text" 
            placeholder="Tìm kiếm theo tên hoặc mã..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 items-center flex-wrap">
          {docTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setFilterType(type.id)}
              className={clsx(
                "flex items-center gap-2 px-3 py-2 rounded-lg whitespace-nowrap transition-colors border",
                filterType === type.id 
                  ? "bg-primary/10 border-primary text-primary font-medium" 
                  : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
              )}
            >
              {type.label}
            </button>
          ))}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowTypesModal(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 whitespace-nowrap"
              title="Quản lý phân loại tài liệu"
            >
              <Settings size={18} />
              Quản lý phân loại
            </button>
          )}
        </div>
      </div>

      {/* Modal quản lý phân loại tài liệu */}
      {showTypesModal && isAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-semibold text-gray-900">Quản lý phân loại tài liệu</h3>
              <button onClick={() => setShowTypesModal(false)} className="text-gray-500 hover:text-gray-700 p-1">
                <X size={20} />
              </button>
            </div>
            {documentTypesError && (
              <div className="mx-4 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                {documentTypesError}
              </div>
            )}
            <div className="p-4 border-b border-gray-100 space-y-3">
              <p className="text-sm text-gray-600">Thêm phân loại mới (mã do hệ thống tự sinh từ tên)</p>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Tên phân loại"
                  value={newTypeName}
                  onChange={(e) => setNewTypeName(e.target.value)}
                  className="flex-1 min-w-[180px] px-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={handleCreateDocumentType}
                  className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  Thêm
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Danh sách phân loại</p>
              <ul className="space-y-2">
                {documentTypes.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50">
                    {editingTypeId === t.id ? (
                      <>
                        <span className="text-xs text-gray-500 font-mono shrink-0">{t.code}</span>
                        <input
                          type="text"
                          value={editingTypeName}
                          onChange={(e) => setEditingTypeName(e.target.value)}
                          className="flex-1 px-2 py-1 border rounded text-sm"
                          autoFocus
                        />
                        <button type="button" onClick={() => handleUpdateDocumentType(t.id)} className="text-primary text-sm font-medium">Lưu</button>
                        <button type="button" onClick={() => { setEditingTypeId(null); setEditingTypeName(''); }} className="text-gray-500 text-sm">Hủy</button>
                      </>
                    ) : (
                      <>
                        <div>
                          <span className="font-medium text-gray-900">{t.name}</span>
                          <span className="text-xs text-gray-500 ml-2 font-mono">({t.code})</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button type="button" onClick={() => { setEditingTypeId(t.id); setEditingTypeName(t.name); }} className="p-1.5 text-gray-500 hover:bg-gray-200 rounded" title="Sửa tên"><Pencil size={14} /></button>
                          <button type="button" onClick={() => handleDeleteDocumentType(t.id, t.name)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Xóa"><Trash2 size={14} /></button>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {documentTypes.length === 0 && <p className="text-sm text-gray-500 py-4">Chưa có phân loại. Thêm phân loại ở trên.</p>}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-6">
          {filteredDocs.map((doc) => (
            <div key={doc.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <div className={clsx("p-3 rounded-lg", 
                  doc.type === 'guide' ? "bg-blue-50 text-blue-600" :
                  doc.type === 'process' ? "bg-purple-50 text-purple-600" :
                  doc.type === 'technical' ? "bg-slate-50 text-slate-600" :
                  doc.type === 'policy' ? "bg-red-50 text-red-600" :
                  "bg-secondary/10 text-secondary"
                )}>
                  {getIconForType(doc.type)}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {getTypeName(doc.type)}
                  </span>
                  {doc.code && (
                    <span className="text-xs font-mono text-gray-500 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                      {doc.code}
                    </span>
                  )}
                </div>
              </div>
              
              <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 min-h-[3rem]" title={doc.name || doc.title}>
                {doc.name || doc.title}
              </h3>
              
              <div className="flex items-center text-sm text-gray-500 mb-2 space-x-2">
                <span>
                  {doc.uploadDate 
                    ? formatDate(doc.uploadDate) 
                    : 'N/A'}
                </span>
                <span>•</span>
                <span className="truncate max-w-[100px]" title={doc.uploadedBy}>
                  {doc.uploadedBy || 'Admin'}
                </span>
              </div>

              {doc.owner && (
                <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
                  <img 
                    src={getAvatarUrl(doc.owner.avatarUrl, doc.owner.fullName)} 
                    className="w-5 h-5 rounded-full"
                    alt=""
                  />
                  <span>Chủ sở hữu: {doc.owner.fullName}</span>
                  {doc.isOwner && <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px] font-medium">Bạn</span>}
                </div>
              )}

              <div className="mt-auto pt-4 flex gap-2 border-t border-gray-100">
                <button 
                  onClick={async () => {
                    const detail = await fetchDocumentDetail(doc.id);
                    if (detail) setViewMode('view');
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 font-medium text-sm transition-colors"
                >
                  <Eye size={16} />
                  Xem
                </button>
                
                {/* Nút phân quyền: hiển thị cho owner hoặc ADM */}
                {(doc.isOwner || isAdmin) && (
                  <button 
                    onClick={() => openPermissionModal(doc)}
                    className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                    title="Phân quyền"
                  >
                    <Settings size={18} />
                  </button>
                )}

                {/* Nút chỉnh sửa: hiển thị cho owner, editor hoặc ADM */}
                {(doc.isOwner || isAdmin) && (
                  <button 
                    onClick={async () => {
                      const detail = await fetchDocumentDetail(doc.id);
                      if (detail && (detail.access?.canEdit || isAdmin)) setViewMode('edit');
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Chỉnh sửa"
                  >
                    <Edit size={18} />
                  </button>
                )}

                {/* Nút xóa: hiển thị cho owner hoặc ADM */}
                {(doc.isOwner || isAdmin) && (
                  <button 
                    onClick={() => handleDelete(doc.id)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="Xóa"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
            </div>
          ))}
          
          {filteredDocs.length === 0 && (
            <div className="col-span-full text-center py-12 text-gray-500">
              Không tìm thấy tài liệu nào phù hợp.
            </div>
          )}
        </div>
      )}

      {/* Permission Modal */}
      {showPermissionModal && permissionDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <div>
                <h3 className="font-semibold text-gray-900">Phân quyền tài liệu</h3>
                <p className="text-sm text-gray-500">{permissionDoc.name}</p>
              </div>
              <button onClick={() => setShowPermissionModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                      <Users size={18} />
                      Chọn nhân sự
                    </h4>
                    <input 
                      type="text"
                      placeholder="Tìm kiếm nhân sự..."
                      value={employeeSearch}
                      onChange={e => setEmployeeSearch(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg mb-3 text-sm"
                    />
                    {(() => {
                      const keyword = employeeSearch.trim().toLowerCase();
                      const filtered = employees.filter(e =>
                        !keyword || e.fullName.toLowerCase().includes(keyword) || (e.code && e.code.toLowerCase().includes(keyword))
                      );
                      const permEmployeeIds = new Set(permissions.filter(p => p.employeeId).map(p => p.employeeId as string));
                      const allFilteredSelected = filtered.length > 0 && filtered.every(e => permEmployeeIds.has(e.id));
                      return (
                        <label className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 cursor-pointer border-b border-gray-100 mb-2">
                          <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            ref={selectAllEmployeeCheckboxRef}
                            onChange={() => {
                              if (allFilteredSelected) {
                                const toRemove = new Set(filtered.map(e => e.id));
                                setPermissions(permissions.filter(p => !p.employeeId || !toRemove.has(p.employeeId)));
                              } else {
                                const toAdd = filtered.filter(e => !permEmployeeIds.has(e.id));
                                const newPerms = toAdd.map(emp => ({ accessLevel: 'VIEWER' as const, employeeId: emp.id, employee: emp }));
                                setPermissions([...permissions, ...newPerms]);
                              }
                            }}
                            className="rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm font-medium text-gray-700">Chọn tất cả nhân sự</span>
                          <span className="text-xs text-gray-500">({filtered.length})</span>
                        </label>
                      );
                    })()}
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {employees
                        .filter(e => {
                          const k = employeeSearch.trim().toLowerCase();
                          return !k || e.fullName.toLowerCase().includes(k) || (e.code && e.code.toLowerCase().includes(k));
                        })
                        .map(emp => (
                          <div 
                            key={emp.id}
                            className="flex items-center justify-between py-1.5 px-2 hover:bg-gray-50 rounded cursor-pointer"
                            onClick={() => addPermission(emp.id, 'VIEWER')}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <img src={getAvatarUrl(emp.avatarUrl, emp.fullName)} className="w-5 h-5 rounded-full shrink-0" alt="" />
                              <span className="text-sm truncate">{emp.fullName}</span>
                              <span className="text-xs text-gray-400 shrink-0">{emp.code}</span>
                            </div>
                            <Plus size={14} className="text-gray-400 shrink-0" />
                          </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* Right: Selected Permissions */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                    <Lock size={18} />
                    Danh sách phân quyền ({permissions.length})
                  </h4>
                  
                  {permissions.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <Lock size={32} className="mx-auto mb-2 opacity-50" />
                      <p className="text-sm">Chưa có phân quyền nào</p>
                      <p className="text-xs">Chọn từ danh sách bên trái</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                      {permissions.map((perm, index) => (
                        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            {perm.employee && (
                              <>
                                <img src={getAvatarUrl(perm.employee.avatarUrl, perm.employee.fullName)} className="w-6 h-6 rounded-full" alt="" />
                                <span className="text-sm">{perm.employee.fullName}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={perm.accessLevel}
                              onChange={e => updatePermissionLevel(index, e.target.value as any)}
                              className="text-xs px-2 py-1 border border-gray-200 rounded"
                            >
                              <option value="VIEWER">Xem</option>
                              <option value="VIEW_DOWNLOAD">Xem + tải</option>
                              <option value="EDITOR">Chỉnh sửa</option>
                            </select>
                            <button 
                              onClick={() => removePermission(index)}
                              className="text-red-500 hover:bg-red-50 p-1 rounded"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-800">
                    <p className="font-medium mb-1">Lưu ý:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Người xem: Chỉ được xem tài liệu, không tải/in</li>
                      <li>Người xem + tải: Được xem và tải tài liệu, không chỉnh sửa</li>
                      <li>Người chỉnh sửa: Được xem và sửa nội dung</li>
                      <li>Nhóm ADM luôn có toàn quyền truy cập</li>
                      <li>Quản lý cấp trên được xem tài liệu cấp dưới</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 flex justify-end gap-3">
              <button 
                onClick={() => setShowPermissionModal(false)}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Hủy
              </button>
              <button 
                onClick={savePermissions}
                className="px-4 py-2 text-white bg-primary rounded-lg hover:bg-primary/90 flex items-center gap-2"
              >
                <Check size={18} />
                Lưu phân quyền
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Documents;
