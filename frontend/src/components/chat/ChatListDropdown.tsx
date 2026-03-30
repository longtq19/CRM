import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useChat, type ChatSession } from '../../context/ChatContext';
import { useAuthStore } from '../../context/useAuthStore';
import { apiClient } from '../../api/client';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { MessageSquare, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getUiAvatarFallbackUrl } from '../../utils/uiAvatar';
import { resolveUploadUrl } from '../../utils/assetsUrl';
import { getCallPreviewText } from '../../utils/callMessageUtils';

interface ChatListDropdownProps {
  onClose: () => void;
}

const stripHtml = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent?.trim() || '';
};

const getMessagePreview = (lastMessage: any): string => {
  if (!lastMessage) return 'Chưa có tin nhắn';

  // Handle CALL messages
  if (lastMessage.type === 'CALL') return getCallPreviewText(lastMessage.content);

  const textContent = lastMessage.content ? stripHtml(lastMessage.content) : '';
  if (textContent) return textContent;

  const attachments = lastMessage.attachments || [];
  if (attachments.length > 0) {
    const hasImage = attachments.some((att: any) => att.fileType?.startsWith('image/'));
    return hasImage ? '📷 Hình ảnh' : '📎 Tệp đính kèm';
  }

  if (lastMessage.type === 'FILE') return '📎 Tệp đính kèm';

  return 'Tin nhắn';
};

const ChatListDropdown: React.FC<ChatListDropdownProps> = ({ onClose }) => {
  const { openChat, isChatListOpen, socket } = useChat();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    if (isChatListOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isChatListOpen, onClose]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/chat/groups');
      if (Array.isArray(res)) {
        setConversations(res);
      }
    } catch (error) {
      console.error('Failed to fetch conversations', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isChatListOpen) return;
    fetchConversations();
  }, [isChatListOpen, fetchConversations]);

  // Real-time: update preview when new message arrives
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (message: any) => {
      setConversations(prev => {
        const idx = prev.findIndex(c => c.id === message.groupId);
        if (idx === -1) return prev;

        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessage: message,
          unreadCount: message.senderId !== user?.id
            ? (updated[idx].unreadCount || 0) + 1
            : updated[idx].unreadCount
        };

        // Move conversation with new message to top (after pinned)
        const [conv] = updated.splice(idx, 1);
        const firstUnpinned = updated.findIndex(c => !c.isPinned);
        updated.splice(firstUnpinned >= 0 ? firstUnpinned : 0, 0, conv);

        return updated;
      });
    };

    socket.on('new_message', handleNewMessage);
    return () => { socket.off('new_message', handleNewMessage); };
  }, [socket, user?.id]);

  const getConversationInfo = (conv: any) => {
    let name = conv.name;
    let avatar = conv.avatarUrl;
    let isOnline = false;

    if (conv.type === 'PRIVATE') {
      const otherMember = conv.members.find((m: any) => m.employeeId !== user?.id);
      if (otherMember) {
        name = otherMember.employee.fullName;
        avatar = otherMember.employee.avatarUrl;
        isOnline = otherMember.employee.isOnline;
      }
    }

    // Fallback for avatar
    if (!avatar) {
      avatar = getUiAvatarFallbackUrl(name || 'User');
    } else {
      avatar = resolveUploadUrl(avatar);
    }

    return { name, avatar, isOnline };
  };

  const handleSelectConversation = (conversation: any) => {
    const { name, avatar, isOnline } = getConversationInfo(conversation);
    let chatUser;

    if (conversation.type === 'PRIVATE') {
      const otherMember = conversation.members.find((m: any) => m.employeeId !== user?.id);
      if (otherMember) {
        chatUser = {
          id: otherMember.employeeId,
          fullName: otherMember.employee.fullName,
          avatarUrl: otherMember.employee.avatarUrl,
          isOnline: otherMember.employee.isOnline
        };
      }
    }

    const session: ChatSession = {
      id: conversation.id,
      type: conversation.type, // 'PRIVATE' or 'GROUP'
      user: chatUser,
      groupName: name,
      avatarUrl: avatar,
      minimized: false,
      isOpen: true
    };

    openChat(session);
    onClose();
  };

  return (
    <div 
      ref={dropdownRef}
      className="fixed top-16 left-2 right-2 mt-1 md:absolute md:top-full md:right-0 md:left-auto md:mt-2 md:w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-[9999] flex flex-col max-h-[70vh] md:max-h-[500px]"
    >
      <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-lg">
        <h3 className="font-bold text-gray-700">Tin nhắn</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-center text-gray-500">Đang tải...</div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center text-gray-500 flex flex-col items-center gap-2">
            <MessageSquare size={32} className="opacity-20" />
            <p>Chưa có tin nhắn nào</p>
          </div>
        ) : (
          conversations.map((conv) => {
            const { name, avatar, isOnline } = getConversationInfo(conv);
            return (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className="p-3 hover:bg-gray-50 cursor-pointer flex gap-3 border-b border-gray-50 last:border-0"
              >
                <div className="relative">
                  <img 
                      src={avatar} 
                      alt={name}
                      className="w-10 h-10 rounded-full object-cover"
                  />
                  {isOnline && (
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-white rounded-full"></span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <h4 className="font-medium text-sm text-gray-900 truncate pr-2">{name}</h4>
                    {conv.lastMessage && (
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {format(new Date(conv.lastMessage.createdAt), 'HH:mm', { locale: vi })}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center mt-0.5">
                    <p className="text-xs text-gray-500 truncate max-w-[180px]">
                      {getMessagePreview(conv.lastMessage)}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[16px] text-center">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="p-2 border-t border-gray-100 text-center">
        <button 
          onClick={() => {
            navigate('/chat');
            onClose();
          }}
          className="text-xs text-primary font-medium hover:underline"
        >
          Xem tất cả trong Tin nhắn
        </button>
      </div>
    </div>
  );
};

export default ChatListDropdown;
