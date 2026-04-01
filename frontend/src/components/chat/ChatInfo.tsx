import React, { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../context/useAuthStore';
import { useChat } from '../../context/ChatContext';
import { 
  X, 
  ArrowLeft, 
  Search, 
  Check, 
  Plus, 
  Trash2, 
  FileText, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  Loader2,
  Edit2,
  MoreVertical,
  UserCog,
  Shield,
  UserMinus,
  Crown,
  Star
} from 'lucide-react';
import { format } from 'date-fns';
import { getUiAvatarFallbackUrl } from '../../utils/uiAvatar';
import { resolveUploadUrl } from '../../utils/assetsUrl';
import { vi } from 'date-fns/locale';

interface ChatInfoProps {
  sessionId: string;
  onClose: () => void;
  onOpenEmployeeDetail: (employeeId: string) => void;
}

const COMPANY_GROUP_NAME = 'K-VENTURES I OFFICE';

const ChatInfo: React.FC<ChatInfoProps> = ({ sessionId, onClose, onOpenEmployeeDetail }) => {
  const { user, hasPermission } = useAuthStore();
  const { socket, closeChat } = useChat();
  const [group, setGroup] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [attachmentFilter, setAttachmentFilter] = useState<'ALL' | 'IMAGE' | 'FILE' | 'LINK'>('ALL');
  const [nicknameInputs, setNicknameInputs] = useState<Record<string, string>>({});
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  const [editingNicknameId, setEditingNicknameId] = useState<string | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [myBackgroundColor, setMyBackgroundColor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Preset colors for chat background
  const PRESET_COLORS = [
    { name: 'Mặc định', value: null },
    { name: 'Xanh nhạt', value: '#e3f2fd' },
    { name: 'Xanh lá nhạt', value: '#e8f5e9' },
    { name: 'Hồng nhạt', value: '#fce4ec' },
    { name: 'Tím nhạt', value: '#f3e5f5' },
    { name: 'Cam nhạt', value: '#fff3e0' },
    { name: 'Vàng nhạt', value: '#fffde7' },
    { name: 'Xám nhạt', value: '#f5f5f5' },
    { name: 'Xanh dương', value: '#e1f5fe' },
    { name: 'Xanh ngọc', value: '#e0f2f1' },
    { name: 'Nâu nhạt', value: '#efebe9' },
    { name: 'Gradient 1', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
    { name: 'Gradient 2', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
  ];

  const isCompanyGroup = group?.name === COMPANY_GROUP_NAME || group?.name === 'Công ty Kagri Tech';

  const fetchGroupDetails = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/chat/groups/${sessionId}`);
      setGroup(res);
      setMyBackgroundColor(res?.backgroundColor || null);
      await fetchAttachments(sessionId, attachmentFilter);
    } catch (error) {
      console.error('Failed to fetch group details', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateBackground = async (color: string | null) => {
    try {
      await apiClient.put(`/chat/groups/${sessionId}/background`, { backgroundColor: color });
      setMyBackgroundColor(color);
      setShowColorPicker(false);
    } catch (error) {
      console.error('Failed to update background', error);
      alert('Không thể cập nhật màu nền');
    }
  };

  const fetchAttachments = async (groupId: string, filter: 'ALL' | 'IMAGE' | 'FILE' | 'LINK') => {
    try {
      const params = filter === 'ALL' ? '' : `?type=${filter}`;
      const res = await apiClient.get(`/chat/groups/${groupId}/attachments${params}`);
      setAttachments(Array.isArray(res) ? res : []);
    } catch (error) {
      console.error('Failed to fetch attachments', error);
    }
  };

  useEffect(() => {
    fetchGroupDetails();
  }, [sessionId]);

  // Realtime sync
  useEffect(() => {
    if (!socket) return;

    const handleGroupUpdate = (data: any) => {
        if (data.groupId === sessionId || data.id === sessionId) {
            fetchGroupDetails();
        }
    };

    const handleMemberUpdate = (data: any) => {
        if (data.groupId === sessionId) {
            fetchGroupDetails();
        }
    };

    const handleConversationDeleted = (data: any) => {
        if (data.groupId === sessionId || data.id === sessionId) {
            onClose(); // Close info panel
            closeChat(sessionId); // Close chat popup
        }
    };

    socket.on('group_updated', handleGroupUpdate);
    socket.on('member_added', handleMemberUpdate);
    socket.on('member_removed', handleMemberUpdate);
    socket.on('nickname_updated', handleMemberUpdate); // Assuming this event exists or covered by group_updated
    socket.on('conversation_deleted', handleConversationDeleted);
    socket.on('group_deleted', handleConversationDeleted); // Alias check

    return () => {
        socket.off('group_updated', handleGroupUpdate);
        socket.off('member_added', handleMemberUpdate);
        socket.off('member_removed', handleMemberUpdate);
        socket.off('nickname_updated', handleMemberUpdate);
        socket.off('conversation_deleted', handleConversationDeleted);
        socket.off('group_deleted', handleConversationDeleted);
    };
  }, [socket, sessionId]);

  useEffect(() => {
    if (group) {
        fetchAttachments(sessionId, attachmentFilter);
    }
  }, [attachmentFilter]);

  // Sync nickname inputs with group members
  useEffect(() => {
    if (group?.members) {
      setNicknameInputs(prev => {
        const next = { ...prev };
        let hasChanges = false;
        group.members.forEach((m: any) => {
           if (next[m.employeeId] === undefined || next[m.employeeId] !== (m.nickname || '')) {
             next[m.employeeId] = m.nickname || '';
             hasChanges = true;
           }
        });
        return hasChanges ? next : prev;
      });
    }
  }, [group]);

  const handleUpdateNickname = async (employeeId: string) => {
    try {
      await apiClient.put(`/chat/groups/${sessionId}/members/${employeeId}`, {
        nickname: nicknameInputs[employeeId] || ''
      });
      // Refresh group details to show new nickname
      const res = await apiClient.get(`/chat/groups/${sessionId}`);
      setGroup(res);
    } catch (error) {
      console.error('Failed to update nickname', error);
      alert('Không thể cập nhật biệt danh');
    }
  };

  const handleDeleteConversation = async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa cuộc trò chuyện này?')) return;
    try {
      await apiClient.delete(`/chat/groups/${sessionId}`);
      onClose(); // Close the info panel, parent should probably close the chat too
      // Note: Parent ChatPopup needs to handle conversation deletion event to close itself
    } catch (error) {
      console.error('Failed to delete conversation', error);
      alert('Không thể xóa cuộc trò chuyện');
    }
  };

  const getAvatarUrl = (url: string | undefined, name: string) => {
    if (url) {
      return resolveUploadUrl(url);
    }
    return getUiAvatarFallbackUrl(name);
  };

  const getGroupAvatar = (group: any) => {
    let avatarUrl = '';
    let name = group.name;

    if (group.type === 'PRIVATE') {
      const otherMember = group.members.find((m: any) => m.employeeId !== user?.id);
      if (otherMember) {
          avatarUrl = otherMember.employee.avatarUrl || '';
          name = otherMember.employee.fullName;
      }
    } else {
      avatarUrl = group.avatarUrl || '';
    }

    return getAvatarUrl(avatarUrl, name || 'Group');
  };

  const getGroupName = (group: any) => {
    if (group.type === 'PRIVATE') {
      const otherMember = group.members.find((m: any) => m.employeeId !== user?.id);
      return otherMember ? otherMember.employee.fullName : 'Cuộc trò chuyện riêng';
    }
    return group.name;
  };

  const canDeleteConversation = () => {
    return hasPermission('DELETE_CONVERSATION') || hasPermission('FULL_ACCESS');
  };

  const getOnlineStatus = (employee: any) => {
    if (employee.isOnline) return 'Online';
    return 'Offline';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );
  }

  if (!group) return <div className="p-4 text-center">Không tìm thấy thông tin</div>;

  return (
    <div className="flex flex-col h-full bg-white animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 className="font-bold text-gray-700">Thông tin trò chuyện</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Info Section */}
        <div className="flex flex-col items-center">
          <img 
            src={getGroupAvatar(group)} 
            alt="Avatar" 
            className="w-20 h-20 rounded-full object-cover mb-2 shadow-sm border border-gray-200"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = getUiAvatarFallbackUrl(getGroupName(group));
            }}
          />
          <h2 className="font-bold text-gray-800 text-center text-lg">{getGroupName(group)}</h2>
          <p className="text-xs text-gray-500">
            {group.type === 'PRIVATE' ? 'Cuộc trò chuyện riêng' : `Nhóm • ${group.members?.length || 0} thành viên`}
          </p>
        </div>

        {canDeleteConversation() && (
            <button
                onClick={handleDeleteConversation}
                className="w-full py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
            >
                <Trash2 size={16} />
                Xóa cuộc trò chuyện
            </button>
        )}

        {/* Attachments */}
        <div>
            <h4 className="font-semibold text-gray-700 mb-3 text-xs uppercase tracking-wide">Tệp đính kèm</h4>
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                {[
                { key: 'ALL', label: 'Tất cả' },
                { key: 'LINK', label: 'Link' },
                { key: 'IMAGE', label: 'Ảnh' },
                { key: 'FILE', label: 'File' }
                ].map(item => (
                <button
                    key={item.key}
                    onClick={() => setAttachmentFilter(item.key as any)}
                    className={`px-3 py-1 rounded-full text-[10px] font-medium border whitespace-nowrap ${
                    attachmentFilter === item.key
                        ? 'bg-primary text-white border-primary'
                        : 'bg-gray-50 text-gray-600 border-gray-200'
                    }`}
                >
                    {item.label}
                </button>
                ))}
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto">
                {attachments.length === 0 ? (
                    <p className="text-center text-gray-400 text-xs py-2">Chưa có tệp đính kèm</p>
                ) : (
                    attachments.map(att => (
                        <div key={att.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded border border-gray-100">
                            {att.fileType?.startsWith('image/') ? (
                                <ImageIcon size={14} className="text-purple-500" />
                            ) : att.fileType === 'LINK' ? (
                                <LinkIcon size={14} className="text-blue-500" />
                            ) : (
                                <FileText size={14} className="text-gray-500" />
                            )}
                            <a 
                                href={att.fileUrl} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-xs text-gray-700 hover:text-primary hover:underline truncate flex-1"
                            >
                                {att.fileName || att.fileUrl}
                            </a>
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* Members */}
        <div>
            <h4 className="font-semibold text-gray-700 mb-3 text-xs uppercase tracking-wide">Thành viên ({group.members?.length})</h4>
            <div className="space-y-2">
                {group.members?.map((member: any) => {
                    const isSelf = member.employeeId === user?.id;
                    const employeeName = member.employee?.fullName || 'Không xác định';
                    const employeeAvatar = member.employee?.avatarUrl;
                    const isOnline = member.employee?.isOnline;
                    const isMenuOpen = expandedMemberId === member.employeeId;
                    const displayNickname = member.nickname;
                    const isOwner = member.role === 'OWNER';
                    const isAdmin = member.role === 'ADMIN';
                    const canManage = hasPermission('FULL_ACCESS') || hasPermission('MANAGE_SYSTEM');

                    const getRoleBadge = () => {
                        if (isOwner) return (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                                <Crown size={10} /> Trưởng nhóm
                            </span>
                        );
                        if (isAdmin) return (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                <Star size={10} /> Phó nhóm
                            </span>
                        );
                        return null;
                    };

                    return (
                        <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors relative">
                            {/* Avatar */}
                            <div 
                                className="relative cursor-pointer flex-shrink-0"
                                onClick={() => onOpenEmployeeDetail(member.employeeId)}
                            >
                                <img 
                                    src={getAvatarUrl(employeeAvatar, employeeName)} 
                                    className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                                    alt={employeeName}
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      target.src = getUiAvatarFallbackUrl(employeeName);
                                    }}
                                />
                                {isOnline && (
                                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
                                )}
                            </div>
                            
                            {/* Name and Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span 
                                        className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-primary"
                                        onClick={() => onOpenEmployeeDetail(member.employeeId)}
                                    >
                                        {employeeName}
                                    </span>
                                    {isSelf && (
                                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Bạn</span>
                                    )}
                                    {getRoleBadge()}
                                </div>
                                {displayNickname && (
                                    <p className="text-xs text-gray-500">Biệt danh: {displayNickname}</p>
                                )}
                            </div>

                            {/* Three Dots Menu */}
                            <div className="relative flex-shrink-0">
                                <button
                                    onClick={() => setExpandedMemberId(isMenuOpen ? null : member.employeeId)}
                                    className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                    title="Tùy chọn"
                                >
                                    <MoreVertical size={18} />
                                </button>

                                {/* Dropdown Menu */}
                                {isMenuOpen && (
                                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                                        {/* Đặt nickname */}
                                        <button
                                            onClick={() => {
                                                setEditingNicknameId(member.employeeId);
                                                setExpandedMemberId(null);
                                            }}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                            <Edit2 size={14} />
                                            Đặt biệt danh
                                        </button>

                                        {/* Bổ nhiệm phó nhóm - Only for non-self, non-owner members */}
                                        {!isSelf && !isOwner && canManage && group.type === 'GROUP' && (
                                            <button
                                                onClick={async () => {
                                                    try {
                                                        await apiClient.put(`/chat/groups/${sessionId}/members/${member.employeeId}`, {
                                                            role: isAdmin ? 'MEMBER' : 'ADMIN'
                                                        });
                                                        fetchGroupDetails();
                                                        setExpandedMemberId(null);
                                                    } catch (error) {
                                                        console.error('Failed to update role', error);
                                                        alert('Không thể thay đổi quyền');
                                                    }
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                            >
                                                <Star size={14} />
                                                {isAdmin ? 'Hủy phó nhóm' : 'Bổ nhiệm phó nhóm'}
                                            </button>
                                        )}

                                        {/* Trao quyền trưởng nhóm - Only for non-self members */}
                                        {!isSelf && canManage && group.type === 'GROUP' && (
                                            <button
                                                onClick={async () => {
                                                    if (!window.confirm(`Trao quyền trưởng nhóm cho ${employeeName}? Bạn sẽ trở thành thành viên thường.`)) return;
                                                    try {
                                                        await apiClient.put(`/chat/groups/${sessionId}/members/${member.employeeId}`, {
                                                            role: 'OWNER'
                                                        });
                                                        fetchGroupDetails();
                                                        setExpandedMemberId(null);
                                                    } catch (error) {
                                                        console.error('Failed to transfer ownership', error);
                                                        alert('Không thể trao quyền trưởng nhóm');
                                                    }
                                                }}
                                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-yellow-600 hover:bg-yellow-50 transition-colors"
                                            >
                                                <Crown size={14} />
                                                Trao quyền trưởng nhóm
                                            </button>
                                        )}

                                        {/* Xóa khỏi nhóm - Not allowed for company group, self, or owner */}
                                        {!isSelf && !isCompanyGroup && !isOwner && canManage && group.type === 'GROUP' && (
                                            <>
                                                <div className="border-t border-gray-100 my-1"></div>
                                                <button
                                                    onClick={async () => {
                                                        if (!window.confirm(`Xóa ${employeeName} khỏi nhóm?`)) return;
                                                        try {
                                                            await apiClient.delete(`/chat/groups/${sessionId}/members/${member.employeeId}`);
                                                            fetchGroupDetails();
                                                            setExpandedMemberId(null);
                                                        } catch (error) {
                                                            console.error('Failed to remove member', error);
                                                            alert('Không thể xóa thành viên');
                                                        }
                                                    }}
                                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                >
                                                    <UserMinus size={14} />
                                                    Xóa khỏi nhóm
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Nickname Edit Modal */}
            {editingNicknameId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditingNicknameId(null)}>
                    <div className="bg-white rounded-xl p-4 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold text-gray-800 mb-3">Đặt biệt danh</h3>
                        <input 
                            type="text" 
                            value={nicknameInputs[editingNicknameId] || ''}
                            onChange={(e) => setNicknameInputs(prev => ({ ...prev, [editingNicknameId]: e.target.value }))}
                            placeholder="Nhập biệt danh..."
                            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none mb-3"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleUpdateNickname(editingNicknameId);
                                    setEditingNicknameId(null);
                                }
                            }}
                        />
                        <div className="flex gap-2">
                            <button 
                                onClick={() => setEditingNicknameId(null)}
                                className="flex-1 px-3 py-2 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                            >
                                Hủy
                            </button>
                            <button 
                                onClick={() => {
                                    handleUpdateNickname(editingNicknameId);
                                    setEditingNicknameId(null);
                                }}
                                className="flex-1 px-3 py-2 text-sm text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                Lưu
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ChatInfo;
