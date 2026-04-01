import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../context/useAuthStore';
import { apiClient, API_URL } from '../api/client';
import { io, Socket } from 'socket.io-client';
import { useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { 
  Send, 
  Paperclip, 
  Smile, 
  MoreVertical, 
  Search, 
  Phone, 
  Video, 
  Info,
  File,
  X,
  Image as ImageIcon,
  Check,
// removed CheckCheck import
  MessageSquare,
  Plus,
  Users,
  ArrowLeft,
  Link as LinkIcon,
  Trash2,
  Bold,
  Italic,
  Underline,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Strikethrough,
  RemoveFormatting,
  List,
  ListOrdered,
  Outdent,
  Indent,
  Undo2,
  Redo2,
  Maximize2,
  Minimize2,
  SquarePen,
  Zap,
  ALargeSmall,
  Edit2
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
// removed vi import
import EmployeeDetail from './EmployeeDetail';
import { getUiAvatarFallbackUrl } from '../utils/uiAvatar';
import { renderChatMessageHtml } from '../utils/chatMessageHtml';
import { resolveUploadUrl } from '../utils/assetsUrl';
import { formatDateWeekday, formatDateTime } from '../utils/format';
import { ChatTextColorPopover } from '../components/chat/ChatTextColorPopover';
import {
  loadChatQuickMessages,
  saveChatQuickMessages,
} from '../utils/chatQuickMessagesStorage';
import VideoCallModal from '../components/chat/VideoCallModal';
import type { CallEndInfo } from '../components/chat/VideoCallModal';
import { getCallPreviewText } from '../utils/callMessageUtils';

interface User {
  id: string;
  fullName: string;
  avatarUrl?: string;
  department?: { name: string };
  position?: { name: string };
  isOnline?: boolean;
  lastActiveAt?: string;
}

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  fileType: string;
}

interface Message {
  id: string;
  content: string;
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'CALL';
  createdAt: string;
  senderId: string;
  sender: User;
  attachments: Attachment[];
  readBy?: { userId: string, readAt: string, user: User }[];
  status?: 'SENDING' | 'SENT' | 'ERROR';
  groupId?: string;
}

interface ChatMember {
  employeeId: string;
  employee: User;
  role: string;
  nickname?: string;
}

interface MemberRequest {
  id: string;
  requester: User;
  targetEmployee: User;
  status: string;
  createdAt: string;
}

interface GroupAttachmentItem {
  id: string;
  kind: 'IMAGE' | 'FILE' | 'LINK';
  name: string;
  url: string;
  size: number | null;
  mimeType: string;
  createdAt: string;
  sender: User;
}

interface ChatGroup {
  id: string;
  name: string;
  type: 'GROUP' | 'PRIVATE';
  avatarUrl?: string;
  backgroundColor?: string;
  members: ChatMember[];
  lastMessage?: Message;
  unreadCount?: number;
  memberRequests?: MemberRequest[];
  isPinned?: boolean;
  pinnedAt?: string;
}

const EMOJI_LIST: string[] = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','😢','😭','😡',
  '👍','👎','👏','🙏','💪','🎉','❤️','🔥','⭐','✅','❌',
  '💼','📌','📎','📝','📷','📊','🚀','🤝'
];

/** Sticker / emoji dễ thương (tab riêng trong ô chọn cạnh nút Smile) */
const STICKER_CUTE_LIST: string[] = [
  '🐻','🐰','🐱','🐶','🦊','🐼','🐨','🐹','🐷','🐸',
  '🦄','🐙','🦋','🐝','🐞','🌸','💮','🌷','🌺','🌼',
  '🎀','🌟','✨','💫','💕','💖','💗','💝','🫶','🤗',
  '🥰','😇','🧸','🧁','🍰','🍭','🍬','🎈','🎁','💐',
];

const TEXT_COLORS = [
  { name: 'Đen', value: '#000000' },
  { name: 'Đỏ', value: '#EF4444' },
  { name: 'Xanh lá', value: '#22C55E' },
  { name: 'Xanh dương', value: '#3B82F6' },
  { name: 'Cam', value: '#F97316' },
  { name: 'Tím', value: '#A855F7' },
  { name: 'Hồng', value: '#EC4899' },
];

const FONT_SIZE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Nhỏ', value: '2' },
  { label: 'Bình thường', value: '3' },
  { label: 'Lớn', value: '5' },
  { label: 'Rất lớn', value: '7' },
];

const Chat = () => {
  const { user, hasPermission } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetUserId = searchParams.get('userId');
  const location = useLocation();
  const navigate = useNavigate();
  const backState = location.state;
  const [socket, setSocket] = useState<Socket | null>(null);
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ChatGroup | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerTab, setEmojiPickerTab] = useState<'emoji' | 'sticker'>('emoji');
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  // New Chat Modal State
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [newGroupName, setNewGroupName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [chatListSearchTerm, setChatListSearchTerm] = useState('');

  // Employee Detail View State
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  
  // Group Info Modal State
  const [showGroupInfoModal, setShowGroupInfoModal] = useState(false);
  const [showAddMemberView, setShowAddMemberView] = useState(false);
  const [groupSettingsName, setGroupSettingsName] = useState('');
  const [groupBackgroundColor, setGroupBackgroundColor] = useState('');
  const [myBackgroundColor, setMyBackgroundColor] = useState<string | null>(null);
  const [showBackgroundPicker, setShowBackgroundPicker] = useState(false);
  const [isSavingGroupSettings, setIsSavingGroupSettings] = useState(false);

  // Preset colors for chat background
  const BACKGROUND_COLORS = [
    { name: 'Mặc định', value: '#F9FAFB' },
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
  ];
  const [attachments, setAttachments] = useState<GroupAttachmentItem[]>([]);
  const [attachmentFilter, setAttachmentFilter] = useState<'ALL' | 'IMAGE' | 'FILE' | 'LINK'>('ALL');
  const [nicknameEditingId, setNicknameEditingId] = useState<string | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');
  const [memberMenuOpenId, setMemberMenuOpenId] = useState<string | null>(null);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [editingMember, setEditingMember] = useState<any>(null);
  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const [isConversationListCollapsed, setIsConversationListCollapsed] = useState(false);

  // ─── Video Call State ───
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState<'video' | 'audio'>('video');
  const [isCallCaller, setIsCallCaller] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);
  const inputRef = useRef<HTMLDivElement>(null);
  const selectedGroupRef = useRef<ChatGroup | null>(null);
  
  // Rich text state
  const [showColorPicker, setShowColorPicker] = useState(false);
  /** Thanh định dạng dưới ô nhập — bật bằng nút hoặc Ctrl+Shift+X */
  const [showFormattingToolbar, setShowFormattingToolbar] = useState(false);
  const [showFontSizePicker, setShowFontSizePicker] = useState(false);
  const [showQuickMessages, setShowQuickMessages] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);
  const [quickMessagesList, setQuickMessagesList] = useState<string[]>(() => loadChatQuickMessages());
  const [quickMsgEditorOpen, setQuickMsgEditorOpen] = useState(false);
  const [quickMsgEditorDraft, setQuickMsgEditorDraft] = useState('');
  /** `null` = tạo mới; số = sửa tại index */
  const [quickMsgEditorIndex, setQuickMsgEditorIndex] = useState<number | null>(null);

  // Resize handle for input area
  const [inputAreaHeight, setInputAreaHeight] = useState<number | null>(null);
  const isResizingRef = useRef(false);
  const resizeStartYRef = useRef(0);
  const resizeStartHeightRef = useRef(0);
  const chatColumnRef = useRef<HTMLDivElement>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    resizeStartYRef.current = e.clientY;
    const chatCol = chatColumnRef.current;
    if (chatCol) {
      const inputArea = chatCol.querySelector('[data-input-area]') as HTMLElement;
      resizeStartHeightRef.current = inputArea?.offsetHeight || 200;
    }
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const delta = resizeStartYRef.current - e.clientY;
      const newHeight = Math.max(120, Math.min(600, resizeStartHeightRef.current + delta));
      setInputAreaHeight(newHeight);
    };
    const handleMouseUp = () => {
      if (!isResizingRef.current) return;
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    selectedGroupRef.current = selectedGroup;
  }, [selectedGroup]);

  // Handle userId param to start/select private chat
  useEffect(() => {
    if (targetUserId && user) {
      // 1. Try to find in already loaded groups (fastest)
      const existing = groups.find(g => 
        g.type === 'PRIVATE' && g.members.some(m => m.employeeId === targetUserId && m.employeeId !== user.id)
      );

      if (existing) {
        handleSelectGroup(existing);
        setSearchParams({}, { replace: true, state: location.state });
        return;
      }

      // 2. If not found in loaded groups, check with backend
      const checkAndSetupChat = async () => {
        try {
            // Check if chat exists in backend
            const existingGroup = await apiClient.get(`/chat/private/${targetUserId}`);
            
            if (existingGroup && existingGroup.id) {
                // Found! Add to groups list if missing
                setGroups(prev => {
                    if (prev.find(g => g.id === existingGroup.id)) return prev;
                    return [existingGroup, ...prev];
                });
                handleSelectGroup(existingGroup);
            }
        } catch (error) {
            // 404 or error -> Create temporary group
             const setupTempGroup = async () => {
                 try {
                     const targetUser: any = await apiClient.get(`/hr/employees/${targetUserId}`);
                     if (targetUser) {
                         const tempGroup: ChatGroup = {
                             id: 'temp-group-' + targetUserId,
                             name: targetUser.fullName,
                             type: 'PRIVATE',
                             members: [
                                 { employeeId: user.id, employee: user, role: 'OWNER' },
                                 { employeeId: targetUser.id, employee: targetUser, role: 'MEMBER' }
                             ],
                             lastMessage: undefined,
                             unreadCount: 0
                         };
                         setSelectedGroup(tempGroup);
                     }
                 } catch (e) {
                     console.error('Failed to fetch target user info', e);
                 }
             };
             setupTempGroup();
        } finally {
             setSearchParams({}, { replace: true, state: location.state });
        }
      };

      checkAndSetupChat();
    }
  }, [targetUserId, user]); // Removed groups dependency to avoid loop/flicker

  // Initialize Socket
  useEffect(() => {
    const socketUrl = API_URL ? API_URL.replace('/api', '') : 'http://localhost:5000';
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      query: { userId: user?.id }
    });

    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('Connected to chat socket');
    });

    newSocket.on('new_message', (message: Message) => {
      const currentGroupId = selectedGroupRef.current?.id;
      const messageGroupId = message.groupId;

      // Only update messages list if it belongs to current group
      if (currentGroupId && messageGroupId === currentGroupId) {
        setMessages(prev => {
          if (prev.find(m => m.id === message.id)) return prev;

          const tempIndex = prev.findIndex(m => {
            if (!m.id?.startsWith('temp-') && m.status !== 'SENDING') return false;
            return isLikelySameMessage(m, message);
          });

          if (tempIndex >= 0) {
            const next = [...prev];
            next[tempIndex] = { ...message, status: 'SENT' };
            return next;
          }

          return [...prev, message];
        });
        
        // Mark as read immediately if current user is viewing this group and message is from others
        if (message.senderId !== user?.id) {
            apiClient.post('/chat/messages/read', { messageId: message.id }).catch(console.error);
        }
      }

      // Update sidebar group list (move to top, update preview/time/unread)
      setGroups(prev => {
        if (!messageGroupId) return prev;
        
        const groupIndex = prev.findIndex(g => g.id === messageGroupId);
        if (groupIndex === -1) return prev;

        const group = prev[groupIndex];
        const isCurrentGroup = (currentGroupId === messageGroupId);
        
        const newUnreadCount = (message.senderId !== user?.id && !isCurrentGroup)
          ? (group.unreadCount || 0) + 1
          : group.unreadCount;

        const updatedGroup = {
          ...group,
          lastMessage: message,
          unreadCount: newUnreadCount
        };

        const newGroups = [...prev];
        newGroups.splice(groupIndex, 1);
        newGroups.unshift(updatedGroup);
        
        return newGroups;
      });
    });

    newSocket.on('user_typing', ({ fullName }: { userId: string, fullName: string }) => {
      setTypingUsers(prev => {
        if (!prev.includes(fullName)) return [...prev, fullName];
        return prev;
      });
    });

    newSocket.on('user_stop_typing', ({ userId }: { userId: string }) => {
      setTypingUsers(prev => prev.filter(name => name !== userId)); // Note: backend sends userId, frontend needs mapping or backend sends name
      // Correction: backend sends { userId, fullName } for typing, and { userId } for stop.
      // We need to map userId to name or just clear carefully. 
      // Simplified: Just clear for now or ignore userId matching for name since we don't have a map here easily without extra lookups.
      // Better: Backend `stop_typing` could send name too, or we rely on just clearing after timeout.
      // Let's just clear all for simplicity or match if we store objects.
      setTypingUsers([]); 
    });

    newSocket.on('group_created', (group: ChatGroup) => {
      setGroups(prev => {
        if (prev.find(g => g.id === group.id)) return prev;
        return [group, ...prev];
      });
      newSocket.emit('join_group', group.id);
    });

    newSocket.on('group_updated', (group: ChatGroup) => {
      setGroups(prev => prev.map(g => g.id === group.id ? group : g));
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(group);
      }
    });

    newSocket.on('message_read', ({ messageId, userId, user, groupId }: { messageId: string, userId: string, user: User, groupId?: string }) => {
      // Update messages in current view
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
           const currentReadBy = msg.readBy || [];
           if (currentReadBy.some(r => r.userId === userId)) return msg;
           return {
             ...msg,
             readBy: [...currentReadBy, { userId, readAt: new Date().toISOString(), user }]
           };
        }
        return msg;
      }));

      // Update sidebar unread count if I am the one who read it
      if (userId === user?.id && groupId) {
         setGroups(prev => prev.map(g => {
             if (g.id === groupId) {
                 return {
                     ...g,
                     unreadCount: Math.max(0, (g.unreadCount || 0) - 1)
                 };
             }
             return g;
         }));
      }
    });

    newSocket.on('user_status_update', ({ userId, isOnline, lastActiveAt }: { userId: string, isOnline: boolean, lastActiveAt: string }) => {
      setGroups(prev => prev.map(group => {
        const updatedMembers = group.members.map(member => {
          if (member.employeeId === userId) {
            return {
              ...member,
              employee: {
                ...member.employee,
                isOnline,
                lastActiveAt
              }
            };
          }
          return member;
        });
        return { ...group, members: updatedMembers };
      }));

      // Also update selectedGroup if it's the one affected
      setSelectedGroup(prev => {
        if (!prev) return null;
        const updatedMembers = prev.members.map(member => {
          if (member.employeeId === userId) {
            return {
              ...member,
              employee: {
                ...member.employee,
                isOnline,
                lastActiveAt
              }
            };
          }
          return member;
        });
        return { ...prev, members: updatedMembers };
      });
    });

    // Listen for background color updates (áp dụng cho tất cả thành viên)
    newSocket.on('background_updated', (data: { groupId: string; backgroundColor: string | null }) => {
      // Cập nhật nếu đang xem cuộc trò chuyện này
      if (selectedGroupRef.current?.id === data.groupId) {
        setMyBackgroundColor(data.backgroundColor);
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [user?.id]);

  // Join all groups to receive real-time updates for sidebar
  useEffect(() => {
    if (socket && groups.length > 0) {
      groups.forEach(g => {
        socket.emit('join_group', g.id);
      });
    }
  }, [socket, groups.length]);

  // Fetch Groups
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const data = await apiClient.get('/chat/groups');
        if (data && Array.isArray(data)) {
          setGroups(data);
          // Only auto-select first group if no specific user is requested
          if (data.length > 0 && !targetUserId) {
            handleSelectGroup(data[0]);
          }
        } else {
          setGroups([]);
        }
      } catch (error) {
        console.error('Failed to fetch groups:', error);
      }
    };

    fetchGroups();
  }, []);

  // Handle Pin/Unpin Conversation
  const handleTogglePin = async (group: ChatGroup, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const newPinState = !group.isPinned;
      await apiClient.put(`/chat/groups/${group.id}/pin`, { isPinned: newPinState });
      
      // Update local state
      setGroups(prev => {
        const updated = prev.map(g => 
          g.id === group.id ? { ...g, isPinned: newPinState, pinnedAt: newPinState ? new Date().toISOString() : undefined } : g
        );
        // Re-sort: pinned first
        return updated.sort((a, b) => {
          if (a.isPinned && !b.isPinned) return -1;
          if (!a.isPinned && b.isPinned) return 1;
          if (a.isPinned && b.isPinned) {
            const pinnedA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
            const pinnedB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
            return pinnedB - pinnedA;
          }
          const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
          const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
          return timeB - timeA;
        });
      });
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  // Handle Group Selection
  const handleSelectGroup = async (group: ChatGroup) => {
    setSelectedGroup(group);
    setHasMoreMessages(true);
    setShowMobileSidebar(false); // Hide sidebar on mobile when selecting a chat
    
    // Reset unread count locally
    setGroups(prev => prev.map(g => g.id === group.id ? { ...g, unreadCount: 0 } : g));
    
    // Join room
    if (socket && !group.id.startsWith('temp-group-')) {
      // Leave previous room if needed? Socket.io handles multiple rooms, but usually we focus on one.
      // Backend: socket.join(groupId)
      socket.emit('join_group', group.id);
    }

    try {
      if (!group.id.startsWith('temp-group-')) {
        const msgs = await apiClient.get(`/chat/groups/${group.id}/messages`);
        setMessages(Array.isArray(msgs) ? msgs : []);
        if (msgs.length < 50) setHasMoreMessages(false);
        // Load full group details including all members
        await loadGroupDetails(group);
      } else {
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  // Mark as read when messages change and group is selected
  useEffect(() => {
    if (selectedGroup && messages.length > 0) {
      const unreadExists = messages.some(msg => 
        msg.senderId !== user?.id && (!msg.readBy || !msg.readBy.some(r => r.userId === user?.id))
      );
      if (unreadExists) {
        apiClient.post('/chat/messages/read', { groupId: selectedGroup.id }).catch(console.error);
      }
    }
  }, [messages, selectedGroup, user?.id]);

  // Scroll to bottom
  useEffect(() => {
    if (!isLoadingMore) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, isLoadingMore]);

  const handleScroll = async (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop } = e.currentTarget;
    if (scrollTop === 0 && hasMoreMessages && !isLoadingMore && selectedGroup && !selectedGroup.id.startsWith('temp-group-')) {
        setIsLoadingMore(true);
        const oldestMessage = messages[0];
        if (!oldestMessage) {
            setIsLoadingMore(false);
            return;
        }

        try {
            const currentHeight = e.currentTarget.scrollHeight;
            const moreMsgs = await apiClient.get(`/chat/groups/${selectedGroup.id}/messages?before=${oldestMessage.createdAt}`);
            
            if (Array.isArray(moreMsgs) && moreMsgs.length > 0) {
                if (moreMsgs.length < 50) setHasMoreMessages(false);
                setMessages(prev => [...moreMsgs, ...prev]);
                
                // Maintain scroll position
                // We need to wait for render to adjust scroll
                requestAnimationFrame(() => {
                    if (messagesContainerRef.current) {
                        const newHeight = messagesContainerRef.current.scrollHeight;
                        messagesContainerRef.current.scrollTop = newHeight - currentHeight;
                    }
                });
            } else {
                setHasMoreMessages(false);
            }
        } catch (error) {
            console.error('Failed to load more messages', error);
        } finally {
            setIsLoadingMore(false);
        }
    }
  };


  const updateTypingState = () => {
    if (!socket || !selectedGroup) return;
    if (selectedGroup.id.startsWith('temp-group-')) return; // Don't emit typing for temp groups

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing', { groupId: selectedGroup.id, userId: user?.id, fullName: user?.name });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('stop_typing', { groupId: selectedGroup.id, userId: user?.id });
    }, 2000);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const plainText = getPlainText(inputText);
    if ((!plainText.trim() && selectedFiles.length === 0) || !selectedGroup || !user) return;

    let groupId = selectedGroup.id;
    let finalGroup = selectedGroup;

    // Create group if it is temporary
    if (groupId.startsWith('temp-group-')) {
        const targetUserId = groupId.replace('temp-group-', '');
        try {
            const newGroup = await apiClient.post('/chat/private', { targetUserId });
            setGroups(prev => {
                if (prev.find(g => g.id === newGroup.id)) return prev;
                return [newGroup, ...prev];
            });
            groupId = newGroup.id;
            finalGroup = newGroup;
            setSelectedGroup(newGroup);
            if (socket) {
                socket.emit('join_group', newGroup.id);
            }
        } catch (error) {
            console.error('Failed to create private chat:', error);
            alert('Không thể tạo cuộc trò chuyện');
            return;
        }
    }

    const tempId = `temp-${Date.now()}`;
    const newMessage: Message = {
      id: tempId,
      content: inputText,
      type: selectedFiles.length > 0 ? 'FILE' : 'TEXT',
      createdAt: new Date().toISOString(),
      senderId: user.id,
      sender: {
        id: user.id,
        fullName: user.name || 'Bạn',
        avatarUrl: user.avatar
      },
      attachments: selectedFiles.map((file, idx) => ({
        id: `temp-att-${idx}`,
        fileName: file.name,
        fileUrl: URL.createObjectURL(file), // Local preview
        fileSize: file.size,
        fileType: file.type
      })),
      status: 'SENDING'
    };

    // Optimistic update
    setMessages(prev => [...prev, newMessage]);

    // Optimistic sidebar update
    setGroups(prev => {
        const groupIndex = prev.findIndex(g => g.id === groupId);
        
        let updatedGroup;
        if (groupIndex === -1) {
            // Should be the newly created group or existing one
            updatedGroup = {
                ...finalGroup,
                lastMessage: newMessage
            };
            return [updatedGroup, ...prev];
        } else {
            const group = prev[groupIndex];
            updatedGroup = {
                ...group,
                lastMessage: newMessage,
            };
            const newGroups = [...prev];
            newGroups.splice(groupIndex, 1);
            newGroups.unshift(updatedGroup);
            return newGroups;
        }
    });

    setInputText('');
    if (inputRef.current) {
      inputRef.current.innerHTML = '';
    }
    setSelectedFiles([]);
    
    if (socket) {
      socket.emit('stop_typing', { groupId: groupId, userId: user?.id });
    }

    const formData = new FormData();
    formData.append('groupId', groupId);
    formData.append('content', newMessage.content);
    
    if (selectedFiles.length > 0) {
      formData.append('type', 'FILE');
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });
    } else {
      formData.append('type', 'TEXT');
    }

    try {
      const response = await apiClient.postMultipart('/chat/messages', formData);
      
      // Update the temp message with the real one from response
      setMessages(prev => {
        if (prev.some(m => m.id === response.id)) {
          return prev.filter(m => m.id !== tempId);
        }
        return prev.map(m => m.id === tempId ? { ...response, status: 'SENT' } : m);
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, status: 'ERROR' } : m));
    }
  };

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);
    updateTypingState();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      const validFiles = files.filter(f => f.size <= 25 * 1024 * 1024);
      if (validFiles.length !== files.length) {
        alert('Một số file vượt quá giới hạn 25MB và đã bị bỏ qua.');
      }
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
    e.target.value = '';
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      const validFiles = files.filter(f => f.size <= 25 * 1024 * 1024);
      if (validFiles.length !== files.length) {
        alert('Một số ảnh vượt quá giới hạn 25MB và đã bị bỏ qua.');
      }
      setSelectedFiles(prev => [...prev, ...validFiles]);
    }
    e.target.value = '';
  };

  const insertTextAtCursor = (text: string) => {
    if (!inputRef.current) return;
    inputRef.current.focus();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      inputRef.current.innerHTML += text;
    }
    setInputText(inputRef.current.innerHTML);
    updateTypingState();
  };

  const openQuickMsgEditorAdd = () => {
    setQuickMsgEditorIndex(null);
    setQuickMsgEditorDraft('');
    setShowQuickMessages(false);
    setQuickMsgEditorOpen(true);
  };

  const openQuickMsgEditorEdit = (index: number) => {
    setQuickMsgEditorIndex(index);
    setQuickMsgEditorDraft(quickMessagesList[index] ?? '');
    setShowQuickMessages(false);
    setQuickMsgEditorOpen(true);
  };

  const saveQuickMsgEditor = () => {
    const t = quickMsgEditorDraft.trim();
    if (!t) {
      toast.error('Nội dung không được để trống');
      return;
    }
    let next: string[];
    if (quickMsgEditorIndex === null) {
      next = [...quickMessagesList, t];
    } else {
      next = [...quickMessagesList];
      next[quickMsgEditorIndex] = t;
    }
    setQuickMessagesList(next);
    saveChatQuickMessages(next);
    setQuickMsgEditorOpen(false);
    toast.success(quickMsgEditorIndex === null ? 'Đã thêm tin nhắn nhanh' : 'Đã cập nhật tin nhắn nhanh');
  };

  const deleteQuickMessageAt = (index: number) => {
    const next = quickMessagesList.filter((_, i) => i !== index);
    setQuickMessagesList(next);
    saveChatQuickMessages(next);
    toast.success('Đã xóa tin nhắn nhanh');
  };

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleToggleEmojiPicker = () => {
    setShowEmojiPicker(prev => !prev);
    setShowColorPicker(false);
    setShowFontSizePicker(false);
    setShowQuickMessages(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    if (inputRef.current) {
      // Insert emoji at cursor position in contenteditable
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(emoji));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        inputRef.current.innerHTML += emoji;
      }
      setInputText(inputRef.current.innerHTML);
    }
    updateTypingState();
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // Handle paste from clipboard (images)
  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          // Validate size
          if (file.size > 25 * 1024 * 1024) {
            alert('Ảnh vượt quá giới hạn 25MB');
            return;
          }
          setSelectedFiles(prev => [...prev, file]);
        }
        return;
      }
    }
    // Allow normal text paste - it will be handled by contenteditable
  };

  const TOOLBAR_MOUSE_DOWN = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Rich text formatting functions — focus contenteditable trước execCommand; giữ selection bằng preventDefault trên mousedown nút
  const applyFormat = (command: string, value?: string) => {
    const el = inputRef.current;
    if (el) {
      el.focus();
    }
    document.execCommand(command, false, value);
    if (el) {
      setInputText(el.innerHTML);
    }
  };

  const handleBold = () => applyFormat('bold');
  const handleItalic = () => applyFormat('italic');
  const handleUnderline = () => applyFormat('underline');
  const handleStrikeThrough = () => applyFormat('strikeThrough');
  const handleFontSizePick = (size: string) => {
    applyFormat('fontSize', size);
    setShowFontSizePicker(false);
  };
  const handleRemoveFormat = () => applyFormat('removeFormat');
  const handleUnorderedList = () => applyFormat('insertUnorderedList');
  const handleOrderedList = () => applyFormat('insertOrderedList');
  const handleOutdent = () => applyFormat('outdent');
  const handleIndent = () => applyFormat('indent');
  const handleUndo = () => applyFormat('undo');
  const handleRedo = () => applyFormat('redo');
  const handleTextColor = (color: string, options?: { close?: boolean }) => {
    applyFormat('foreColor', color);
    if (options?.close !== false) {
      setShowColorPicker(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      if (e.key.toLowerCase() !== 'x') return;
      e.preventDefault();
      setShowFormattingToolbar((v) => !v);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // Get plain text from HTML for display purposes
  const getPlainText = (html: string) => {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  };

  const formatTime = (dateString: string) => {
    return formatDateTime(dateString).split(' ')[1]; // Get HH:mm part from standardized format
  };

  // Strip HTML tags for preview text
  const stripHtml = (html: string) => {
    if (!html) return '';
    // Remove HTML tags and decode entities
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  const formatDateHeader = (dateString: string) => {
    return formatDateWeekday(dateString);
  };

  const getDateKey = (dateString: string) => {
    try {
      return format(new Date(dateString), 'yyyy-MM-dd');
    } catch {
      return '';
    }
  };

  const isImage = (fileType: string) => {
    return fileType.startsWith('image/');
  };

  const getAttachmentSignature = (attachments: Attachment[] | undefined) => {
    const list = (attachments || []).map(a => a.fileName || '').filter(Boolean).sort();
    return list.join('|');
  };

  const isLikelySameMessage = (a: Message, b: Message) => {
    if (a.senderId !== b.senderId) return false;

    const aText = (a.content || '').trim();
    const bText = (b.content || '').trim();
    if (aText !== bText) return false;

    if (getAttachmentSignature(a.attachments) !== getAttachmentSignature(b.attachments)) return false;

    const aTime = Date.parse(a.createdAt);
    const bTime = Date.parse(b.createdAt);
    if (!Number.isFinite(aTime) || !Number.isFinite(bTime)) return false;

    return Math.abs(aTime - bTime) <= 20000;
  };

  const getOnlineStatus = (userObj: User) => {
    if (userObj.isOnline) return 'Trực tuyến';
    if (!userObj.lastActiveAt) return 'Ngoại tuyến';

    try {
      const lastActive = new Date(userObj.lastActiveAt);
      const now = new Date();
      const diffMs = now.getTime() - lastActive.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 1) return 'Vừa mới hoạt động';
      if (diffMins < 60) return `Hoạt động ${diffMins} phút trước`;
      if (diffHours < 24) return `Hoạt động ${diffHours} giờ trước`;
      return `Hoạt động ${diffDays} ngày trước`;
    } catch {
      return 'Ngoại tuyến';
    }
  };

  // Helper to get correct group name
  const getGroupName = (group: ChatGroup) => {
    if (group.type === 'PRIVATE') {
      const otherMember = group.members.find(m => m.employeeId !== user?.id);
      return otherMember ? otherMember.employee.fullName : 'Private Chat';
    }
    return group.name;
  };

  const getChatFileUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('blob:')) return url;
    const normalized = url.startsWith('/') ? url : `/${url}`;
    if (normalized.startsWith('/uploads')) return resolveUploadUrl(normalized);
    const baseUrl = (API_URL || '').replace('/api', '');
    return `${baseUrl}${normalized}`;
  };

  const getAvatarUrl = (avatarUrl: string | undefined, name: string) => {
    if (avatarUrl) {
      return resolveUploadUrl(avatarUrl);
    }
    return getUiAvatarFallbackUrl(name);
  };

  const renderAvatar = (url: string | undefined, name: string, size: string = 'w-10 h-10') => (
    <div className={`${size} rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 relative`}>
      <img
        src={getAvatarUrl(url, name)}
        alt={name}
        className="w-full h-full object-cover"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.src = getUiAvatarFallbackUrl(name);
        }}
      />
    </div>
  );

  const getGroupAvatar = (group: ChatGroup) => {
    let avatarUrl = '';
    if (group.type === 'PRIVATE') {
      const otherMember = group.members.find(m => m.employeeId !== user?.id);
      avatarUrl = otherMember?.employee.avatarUrl || '';
    } else {
      avatarUrl = group.avatarUrl || '';
    }

    if (avatarUrl) {
      return resolveUploadUrl(avatarUrl);
    }

    return getUiAvatarFallbackUrl(getGroupName(group));
  };

  const getCurrentUserRole = () => {
    if (!selectedGroup || !user) return null;
    const member = selectedGroup.members.find(m => m.employeeId === user.id);
    return member?.role || null;
  };

  const isOwner = () => {
    const role = getCurrentUserRole();
    return role === 'OWNER' || role === 'ADMIN';
  };

  const isCoOwner = () => {
    const role = getCurrentUserRole();
    return role === 'CO_OWNER';
  };

  const canManageGroup = () => {
    return isOwner() || isCoOwner();
  };

  const canDeleteConversation = () => {
    return hasPermission('DELETE_CONVERSATION') || hasPermission('FULL_ACCESS');
  };

  // Open Modal and Fetch Users
  const handleOpenNewChat = async () => {
    setShowNewChatModal(true);
    try {
        const users = await apiClient.get('/chat/users');
        setAvailableUsers(users);
    } catch (error) {
        console.error('Failed to fetch users:', error);
    }
  };

  // Create Chat Logic
  const handleCreateChat = async () => {
    if (selectedUserIds.length === 0) return;

    try {
        let newGroup;
        if (selectedUserIds.length === 1) {
            // Private Chat
            const response = await apiClient.post('/chat/private', { targetUserId: selectedUserIds[0] });
            newGroup = response;
        } else {
            // Group Chat
            const name = newGroupName.trim() || `Nhóm ${selectedUserIds.length + 1} thành viên`;
            const response = await apiClient.post('/chat/groups', { name, memberIds: selectedUserIds });
            newGroup = response;
        }

        // Add to groups list if not exists
        setGroups(prev => {
            if (prev.find(g => g.id === newGroup.id)) return prev;
            return [newGroup, ...prev];
        });
        
        handleSelectGroup(newGroup);
        setShowNewChatModal(false);
        setSelectedUserIds([]);
        setNewGroupName('');
    } catch (error) {
        console.error('Failed to create chat:', error);
        alert('Có lỗi xảy ra khi tạo nhóm chat');
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) return prev.filter(id => id !== userId);
      return [...prev, userId];
    });
  };

  const handleOpenAddMember = async () => {
    setShowAddMemberView(true);
    // Fetch users if not already fetched
    if (availableUsers.length === 0) {
      try {
        const users = await apiClient.get('/chat/users');
        setAvailableUsers(Array.isArray(users) ? users : []);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    }
  };

  const handleAddMemberToGroup = async () => {
    if (!selectedGroup || selectedUserIds.length === 0) return;
    
    try {
      if (canManageGroup()) {
        await apiClient.post(`/chat/groups/${selectedGroup.id}/members`, {
          memberIds: selectedUserIds
        });
      } else {
        await apiClient.post(`/chat/groups/${selectedGroup.id}/member-requests`, {
          memberIds: selectedUserIds
        });
      }
      setShowAddMemberView(false);
      setSelectedUserIds([]);
    } catch (error) {
      console.error('Failed to add members:', error);
      const message = (error as any).message || 'Không thể thêm thành viên';
      alert(message);
    }
  };

  const loadGroupDetails = async (group: ChatGroup) => {
    try {
      const full = await apiClient.get(`/chat/groups/${group.id}`);
      setSelectedGroup(full);
      setGroupSettingsName(full.name || '');
      setGroupBackgroundColor(full.backgroundColor || '');
      setMyBackgroundColor(full.backgroundColor || null);
      await loadAttachments(full.id, attachmentFilter);
    } catch (error) {
      console.error('Failed to load group details:', error);
    }
  };

  const loadAttachments = async (groupId: string, filter: 'ALL' | 'IMAGE' | 'FILE' | 'LINK') => {
    try {
      const params = filter === 'ALL' ? '' : `?type=${filter}`;
      const data = await apiClient.get(`/chat/groups/${groupId}/attachments${params}`);
      setAttachments(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load attachments:', error);
    }
  };

  const handleOpenGroupInfo = async () => {
    if (!selectedGroup) return;
    setShowGroupInfoModal(true);
    setShowAddMemberView(false);
    setGroupSettingsName(selectedGroup.name || '');
    setGroupBackgroundColor(selectedGroup.backgroundColor || '');
    await loadGroupDetails(selectedGroup);
  };

  const handleSaveGroupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup || !canManageGroup()) return;
    setIsSavingGroupSettings(true);
    try {
      const payload: any = {};
      if (groupSettingsName.trim() && groupSettingsName.trim() !== selectedGroup.name) {
        payload.name = groupSettingsName.trim();
      }
      if (
        groupBackgroundColor &&
        groupBackgroundColor !== selectedGroup.backgroundColor
      ) {
        payload.backgroundColor = groupBackgroundColor;
      }
      if (Object.keys(payload).length === 0) {
        setIsSavingGroupSettings(false);
        return;
      }
      const updated = await apiClient.put(`/chat/groups/${selectedGroup.id}/settings`, payload);
      setSelectedGroup(updated);
    } catch (error) {
      console.error('Failed to update group settings:', error);
      alert('Không thể cập nhật thông tin nhóm');
    } finally {
      setIsSavingGroupSettings(false);
    }
  };

  const handleUploadGroupAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedGroup || !e.target.files || !canManageGroup()) return;
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      alert('Ảnh vượt quá kích thước tối đa 25MB');
      return;
    }
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const result = await apiClient.postMultipart(`/chat/groups/${selectedGroup.id}/avatar`, formData);
      const group = result.group as ChatGroup;
      setSelectedGroup(group);
    } catch (error) {
      console.error('Failed to upload group avatar:', error);
      alert('Không thể tải lên ảnh nhóm');
    } finally {
      e.target.value = '';
    }
  };

  const startEditNickname = (member: ChatMember) => {
    setNicknameEditingId(member.employeeId);
    setNicknameInput(member.nickname || '');
  };

  const handleSaveNickname = async (member: ChatMember) => {
    if (!selectedGroup) return;
    try {
      const updated = await apiClient.put(`/chat/groups/${selectedGroup.id}/members/${member.employeeId}`, {
        nickname: nicknameInput
      });
      setSelectedGroup(updated);
      setNicknameEditingId(null);
      setNicknameInput('');
    } catch (error) {
      console.error('Failed to update nickname:', error);
      alert('Không thể cập nhật nickname');
    }
  };

  const handleChangeMemberRole = async (member: ChatMember, role: string) => {
    if (!selectedGroup || !isOwner()) return;
    try {
      const updated = await apiClient.put(`/chat/groups/${selectedGroup.id}/members/${member.employeeId}`, {
        role
      });
      setSelectedGroup(updated);
    } catch (error) {
      console.error('Failed to change role:', error);
      const message = (error as any).message || 'Không thể cập nhật quyền';
      alert(message);
    }
  };

  const handleRemoveMember = async (member: ChatMember) => {
    if (!selectedGroup) return;
    if (!window.confirm(`Xóa ${member.employee.fullName} khỏi nhóm?`)) return;
    try {
      const updated = await apiClient.delete(`/chat/groups/${selectedGroup.id}/members/${member.employeeId}`);
      setSelectedGroup(updated);
    } catch (error) {
      console.error('Failed to remove member:', error);
      const message = (error as any).message || 'Không thể xóa thành viên';
      alert(message);
    }
  };

  const handleTransferOwnership = async (member: ChatMember) => {
    if (!selectedGroup || !isOwner()) return;
    if (!window.confirm(`Chuyển quyền Trưởng nhóm cho ${member.employee.fullName}?`)) return;
    try {
      const updated = await apiClient.post(`/chat/groups/${selectedGroup.id}/transfer-ownership`, {
        targetEmployeeId: member.employeeId
      });
      setSelectedGroup(updated);
    } catch (error) {
      console.error('Failed to transfer ownership:', error);
      alert('Không thể chuyển quyền Trưởng nhóm');
    }
  };

  const handleChangeBackground = async (color: string | null) => {
    if (!selectedGroup) return;
    try {
      await apiClient.put(`/chat/groups/${selectedGroup.id}/background`, { backgroundColor: color });
      setMyBackgroundColor(color);
      setShowBackgroundPicker(false);
    } catch (error) {
      console.error('Failed to update background:', error);
      alert('Không thể cập nhật màu nền');
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedGroup) return;
    
    const isGroup = selectedGroup.type === 'GROUP';
    const confirmMessage = isGroup 
      ? 'Bạn chắc chắn muốn xóa cuộc trò chuyện này? Tất cả tin nhắn, tệp đính kèm và thông tin nhóm sẽ bị xóa vĩnh viễn.' 
      : 'Bạn chắc chắn muốn xóa cuộc trò chuyện này? Toàn bộ lịch sử tin nhắn sẽ bị xóa vĩnh viễn.';

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      await apiClient.delete(`/chat/groups/${selectedGroup.id}`);
      setShowGroupInfoModal(false);
      setSelectedGroup(null);
      setGroups(prev => prev.filter(g => g.id !== selectedGroup.id));
      alert('Đã xóa cuộc trò chuyện thành công');
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      const message = (error as any).message || 'Không thể xóa cuộc trò chuyện';
      alert(message);
    }
  };

  const displayNameForSender = (senderId: string, fallback: string) => {
    if (!selectedGroup) return fallback;
    const m = selectedGroup.members.find(member => member.employeeId === senderId);
    if (!m) return fallback;
    return m.nickname || m.employee.fullName || fallback;
  };

  const filteredUsers = availableUsers.filter(u => 
    u.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.department?.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  // Filter out existing members for "Add Member" view
  const usersToAdd = filteredUsers.filter(u => 
    !selectedGroup?.members.some(m => m.employeeId === u.id)
  );

  const chatListFilteredGroups = groups.filter(group => {
    const term = chatListSearchTerm.toLowerCase();
    const groupName = getGroupName(group).toLowerCase();
    
    // Check if group name matches
    if (groupName.includes(term)) return true;

    // Check if any member name matches
    const hasMemberMatch = group.members.some(m => 
        (m.nickname || m.employee.fullName || '').toLowerCase().includes(term)
    );
    if (hasMemberMatch) return true;

    return false;
  });

  return (
    <div className="flex h-[calc(100vh-6rem)] bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200 relative">
      {/* Sidebar - Group List */}
      <div className={`
        ${showMobileSidebar ? 'flex' : 'hidden'} 
        md:flex
        ${isConversationListCollapsed ? 'w-16' : 'w-full md:w-80'}
        border-r border-gray-200 
        flex-col
        absolute md:relative
        inset-0 md:inset-auto
        z-20 md:z-auto
        bg-white
        transition-all duration-300
      `}>
        <div className={`p-4 border-b border-gray-200 flex ${isConversationListCollapsed ? 'justify-center' : 'justify-between'} items-center bg-gray-50`}>
          {!isConversationListCollapsed && (
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-lg text-gray-800">Tin nhắn</h2>
            </div>
          )}
          <div className="flex items-center gap-1">
            {!isConversationListCollapsed && (
              <button 
                className="p-2 hover:bg-gray-200 rounded-full text-gray-600"
                onClick={handleOpenNewChat}
                title="Tạo cuộc trò chuyện mới"
              >
                <Plus size={20} />
              </button>
            )}
            <button 
              className="hidden md:block p-2 hover:bg-gray-200 rounded-full text-gray-600"
              onClick={() => setIsConversationListCollapsed(!isConversationListCollapsed)}
              title={isConversationListCollapsed ? "Mở rộng danh sách" : "Thu gọn danh sách"}
            >
              {isConversationListCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
            </button>
          </div>
        </div>
        
        {!isConversationListCollapsed && (
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Tìm kiếm..." 
                value={chatListSearchTerm}
                onChange={(e) => setChatListSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {chatListFilteredGroups.map(group => {
            const otherMember = group.type === 'PRIVATE' ? group.members.find(m => m.employeeId !== user?.id) : null;
            const isOnline = otherMember?.employee.isOnline;
            
            return (
              <div 
                key={group.id}
                onClick={() => handleSelectGroup(group)}
                className={`${isConversationListCollapsed ? 'p-2 justify-center' : 'p-4'} flex gap-3 cursor-pointer hover:bg-gray-50 transition-colors ${selectedGroup?.id === group.id ? 'bg-blue-50' : ''} ${group.isPinned ? 'bg-yellow-50/50' : ''} group/item relative`}
                title={isConversationListCollapsed ? getGroupName(group) : undefined}
              >
                {/* Pin indicator */}
                {group.isPinned && !isConversationListCollapsed && (
                  <div className="absolute top-1 right-1">
                    <Pin size={12} className="text-yellow-600 fill-yellow-600" />
                  </div>
                )}
                
                <div className="relative">
                  <div 
                    className={`${isConversationListCollapsed ? 'w-10 h-10' : 'w-12 h-12'} rounded-full overflow-hidden border border-gray-100 bg-gray-50 flex-shrink-0 relative ${group.type === 'PRIVATE' ? 'cursor-pointer hover:opacity-80 transition' : ''}`}
                    onClick={(e) => {
                      if (group.type === 'PRIVATE' && !isConversationListCollapsed) {
                        e.stopPropagation();
                        if (otherMember) {
                          setSelectedEmployeeId(otherMember.employeeId);
                          setShowEmployeeModal(true);
                        }
                      }
                    }}
                  >
                    <img 
                      src={getGroupAvatar(group)}
                      alt={getGroupName(group)} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = getUiAvatarFallbackUrl(getGroupName(group));
                      }}
                    />
                  </div>
                  {/* Pin indicator for collapsed mode */}
                  {isConversationListCollapsed && group.isPinned && (
                    <span className="absolute -top-1 -left-1 w-4 h-4 flex items-center justify-center">
                      <Pin size={10} className="text-yellow-600 fill-yellow-600" />
                    </span>
                  )}
                  {/* Unread badge for collapsed mode */}
                  {isConversationListCollapsed && group.unreadCount && group.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
                      {group.unreadCount > 9 ? '9+' : group.unreadCount}
                    </span>
                  )}
                </div>
                {!isConversationListCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <h3 className={`text-gray-800 truncate ${group.unreadCount && group.unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>{getGroupName(group)}</h3>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {/* Pin/Unpin button - visible on hover */}
                        <button
                          onClick={(e) => handleTogglePin(group, e)}
                          className="p-1 rounded opacity-0 group-hover/item:opacity-100 hover:bg-gray-200 transition-all"
                          title={group.isPinned ? 'Bỏ ghim' : 'Ghim cuộc trò chuyện'}
                        >
                          {group.isPinned ? (
                            <PinOff size={14} className="text-gray-500" />
                          ) : (
                            <Pin size={14} className="text-gray-400" />
                          )}
                        </button>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {group.lastMessage ? formatTime(group.lastMessage.createdAt) : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <p className={`text-sm truncate flex-1 pr-2 ${group.unreadCount && group.unreadCount > 0 ? 'font-bold text-gray-800' : 'text-gray-500'}`}>
                        {group.lastMessage ? (
                          <>
                            <span className={`${group.unreadCount && group.unreadCount > 0 ? 'font-bold text-gray-800' : 'font-medium text-gray-700'}`}>{group.lastMessage.senderId === user?.id ? 'Bạn: ' : `${group.lastMessage.sender?.fullName || 'Người dùng'}: `}</span>
                            {group.lastMessage.type === 'CALL'
                              ? getCallPreviewText(group.lastMessage.content)
                              : (group.lastMessage.content ? stripHtml(group.lastMessage.content) : (group.lastMessage.attachments?.length ? '[File đính kèm]' : ''))}
                          </>
                        ) : 'Chưa có tin nhắn'}
                      </p>
                      {group.unreadCount ? (
                        <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center flex-shrink-0">
                          {group.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      {selectedGroup ? (
        <div ref={chatColumnRef} className={`
          ${!showMobileSidebar ? 'flex' : 'hidden'} 
          md:flex
          flex-1 flex-col
          absolute md:relative
          inset-0 md:inset-auto
          z-10 md:z-auto
          bg-white
        `}>
          {/* Chat Header */}
          <div className="h-16 border-b border-gray-200 flex justify-between items-center px-3 md:px-6 bg-white">
            <div className="flex items-center gap-2 md:gap-3">
              {/* Back Button for Mobile */}
              <button 
                onClick={() => {
                  setShowMobileSidebar(true);
                  if (backState && backState.from === '/hr') {
                    navigate('/hr', { state: backState });
                  }
                }}
                className="md:hidden p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
                title="Quay lại danh sách"
              >
                <ArrowLeft size={20} />
              </button>
              
              {/* Back Button for Navigation (Desktop) */}
              {backState && backState.from === '/hr' && (
                  <button 
                      onClick={() => navigate('/hr', { state: backState })}
                      className="hidden md:block mr-2 p-2 hover:bg-gray-100 rounded-full text-gray-600 transition-colors"
                      title="Quay lại danh sách nhân sự"
                  >
                      <ArrowLeft size={20} />
                  </button>
              )}
              
              <div className="relative">
                <div 
                  className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0 relative cursor-pointer hover:opacity-90 transition"
                  onClick={() => {
                    if (selectedGroup.type === 'PRIVATE') {
                      const otherMember = selectedGroup.members.find(m => m.employeeId !== user?.id);
                      if (otherMember) {
                        setSelectedEmployeeId(otherMember.employeeId);
                        setShowEmployeeModal(true);
                      }
                    } else {
                      handleOpenGroupInfo();
                    }
                  }}
                  title={selectedGroup.type === 'PRIVATE' ? "Xem chi tiết nhân sự" : "Xem thông tin cuộc trò chuyện"}
                >
                  <img 
                    src={getGroupAvatar(selectedGroup)}
                    alt={getGroupName(selectedGroup)} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = getUiAvatarFallbackUrl(getGroupName(selectedGroup));
                    }}
                  />
              </div>
              </div>
              <div>
                <h3 className="font-bold text-gray-800">{getGroupName(selectedGroup)}</h3>
                {selectedGroup.type === 'GROUP' && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <Users size={12} />
                    {selectedGroup.members.length} thành viên
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <button
                className="p-2 hover:bg-green-50 hover:text-green-600 rounded-full transition-colors"
                onClick={() => {
                  if (!selectedGroup || !socket || !user) return;
                  setCallType('audio');
                  setIsCallCaller(true);
                  setIsInCall(true);
                  socket.emit('call:initiate', {
                    groupId: selectedGroup.id,
                    callerId: user.id,
                    callerName: user.name || 'Bạn',
                    callerAvatar: user.avatar,
                    callType: 'audio',
                  });
                }}
                title="Gọi thoại"
              >
                <Phone size={20} />
              </button>
              <button
                className="p-2 hover:bg-blue-50 hover:text-blue-600 rounded-full transition-colors"
                onClick={() => {
                  if (!selectedGroup || !socket || !user) return;
                  setCallType('video');
                  setIsCallCaller(true);
                  setIsInCall(true);
                  socket.emit('call:initiate', {
                    groupId: selectedGroup.id,
                    callerId: user.id,
                    callerName: user.name || 'Bạn',
                    callerAvatar: user.avatar,
                    callType: 'video',
                  });
                }}
                title="Gọi video"
              >
                <Video size={20} />
              </button>
              <button 
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                onClick={handleOpenGroupInfo}
                title="Thông tin trò chuyện"
              >
                <Info size={20} />
              </button>
            </div>
          </div>

          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-6 space-y-4"
            style={{ background: myBackgroundColor || selectedGroup.backgroundColor || '#F9FAFB' }}
          >
            {isLoadingMore && (
                <div className="flex justify-center py-2">
                    <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            {messages.map((msg, index) => {
              const isOwn = msg.senderId === user?.id;
              const showAvatar = index === 0 || messages[index - 1].senderId !== msg.senderId;
              const currentDateKey = getDateKey(msg.createdAt);
              const previousDateKey = index > 0 ? getDateKey(messages[index - 1].createdAt) : null;
              const showDateHeader = index === 0 || currentDateKey !== previousDateKey;
              
              // Only show read receipts on the very last message of the conversation
              const isLastMessage = index === messages.length - 1;
              
              // Filter out the message sender from read receipts
              // (In 1-1, if I sent the message, I want to see if the other person read it.
              //  If the other person sent it, I want to see if I read it? No, usually sender sees who read.
              //  Actually, in 1-1, both parties can see "read" status usually.
              //  The requirement says: "The avatar shown must be the recipient’s avatar, not the sender’s own avatar."
              //  So we filter out the current user (viewer) AND the message sender just in case?
              //  Actually, `readBy` usually contains everyone who read it.
              //  If I am the viewer:
              //    - If I sent the message: I want to see if others read it. So filter out ME (sender/viewer).
              //    - If others sent the message: I want to see if OTHERS read it (in group). 
              //      In 1-1, if other sent it, and I read it, do I need to see my own avatar? "not the sender's own avatar".
              //      Wait, "sender's own avatar" in the context of "The avatar shown must be the recipient’s avatar".
              //      It implies: When I look at a message I SENT, I shouldn't see MY avatar (obviously, I read it as I wrote it).
              //      I should see the RECIPIENT's avatar.
              //      When I look at a message I RECEIVED, usually apps show who ELSE read it (in groups).
              //      In 1-1 received message, usually no read receipt is shown for ME reading it, or maybe just a checkmark?
              //      The prompt says: "In 1-1 conversations, the read receipt avatar should still be displayed."
              //      "The avatar shown must be the recipient’s avatar, not the sender’s own avatar."
              //      So: Filter out `msg.senderId`.
              //      Also, usually we filter out the `currentUser` because we know we read it?
              //      Let's strictly follow: "not the sender’s own avatar".
              //      So `r.userId !== msg.senderId`.
              //      And also typically we don't show OUR own avatar to ourselves as "read".
              //      So filter out `user?.id` as well?
              //      "not the sender's own avatar" -> likely means the person who SENT the message shouldn't see their own avatar as 'read'.
              //      But `readBy` wouldn't contain senderId normally unless they read it later? 
              //      Actually, senders are implicitly 'read'.
              //      Let's filter out `msg.senderId` (the author of the message).
              //      AND filter out `user.id` (me, the viewer) because I don't need to see my own face telling me I read it.
              
              const readByUsers = (msg.readBy || []).filter(r => r.userId !== msg.senderId && r.userId !== user?.id);

              return (
                <React.Fragment key={msg.id}>
                  {showDateHeader && (
                    <div className="flex items-center justify-center my-4">
                      <div className="flex-1 h-px bg-gray-300" />
                      <span className="px-3 text-xs font-medium text-gray-500 bg-gray-50">
                        {formatDateHeader(msg.createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-gray-300" />
                    </div>
                  )}
                  {/* CALL message — special rendering */}
                  {msg.type === 'CALL' ? (() => {
                    let callData: { duration?: number; result?: string; callType?: string } = {};
                    try { callData = JSON.parse(msg.content || '{}'); } catch (_) { /* ignore */ }
                    const dur = callData.duration || 0;
                    const fmtDur = dur > 0 ? `${Math.floor(dur / 60).toString().padStart(2, '0')}:${(dur % 60).toString().padStart(2, '0')}` : '';
                    const isVideo = callData.callType === 'video';
                    const icon = isVideo ? '📹' : '📞';
                    let label = '';
                    let colorClass = '';
                    if (callData.result === 'completed') {
                      label = `Cuộc gọi ${isVideo ? 'video' : 'thoại'} • ${fmtDur}`;
                      colorClass = 'text-green-600 bg-green-50 border-green-200';
                    } else if (callData.result === 'rejected') {
                      label = `Cuộc gọi ${isVideo ? 'video' : 'thoại'} bị từ chối`;
                      colorClass = 'text-red-500 bg-red-50 border-red-200';
                    } else {
                      label = `Cuộc gọi ${isVideo ? 'video' : 'thoại'} nhỡ`;
                      colorClass = 'text-orange-500 bg-orange-50 border-orange-200';
                    }
                    return (
                      <div className="flex justify-center my-2">
                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border ${colorClass}`}>
                          <span>{icon}</span>
                          <span>{label}</span>
                          <span className="text-xs opacity-60">{formatTime(msg.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })() : (
                  <div className={`flex gap-3 ${isOwn ? 'flex-row-reverse' : ''}`}>
                    {/* Avatar */}
                    <div 
                      className={`w-8 flex-shrink-0 cursor-pointer hover:opacity-80 transition ${!showAvatar ? 'opacity-0' : ''}`}
                      onClick={() => {
                        setSelectedEmployeeId(msg.senderId);
                        setShowEmployeeModal(true);
                      }}
                    >
                      {renderAvatar(msg.sender.avatarUrl, displayNameForSender(msg.senderId, msg.sender.fullName), "w-8 h-8")}
                    </div>

                    <div className={`max-w-[70%] space-y-1`}>
                      {/* Sender Name */}
                      {showAvatar && !isOwn && (
                        <p className="text-xs text-gray-500 ml-1">
                          {displayNameForSender(msg.senderId, msg.sender.fullName)}
                        </p>
                      )}

                      {/* Text Bubble */}
                      {msg.content && (
                        <div className={`p-3 rounded-2xl shadow-sm ${
                          isOwn 
                            ? 'bg-primary text-white rounded-tr-none' 
                            : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                        }`}>
                          <div 
                            className="whitespace-pre-wrap chat-message-content"
                            dangerouslySetInnerHTML={{ __html: renderChatMessageHtml(msg.content) }}
                          />
                        </div>
                      )}

                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className={`flex flex-col gap-1 ${msg.content ? 'mt-1' : ''}`}>
                          {msg.attachments.map(att => (
                            <div key={att.id}>
                              {isImage(att.fileType) ? (
                                <img 
                                  src={getChatFileUrl(att.fileUrl)} 
                                  alt={att.fileName} 
                                  className="rounded-2xl max-w-full max-h-64 object-contain cursor-pointer hover:opacity-95 shadow-sm"
                                  onClick={() => window.open(getChatFileUrl(att.fileUrl), '_blank')}
                                />
                              ) : (
                                <a 
                                  href={getChatFileUrl(att.fileUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className={`flex items-center gap-3 p-2 rounded-2xl shadow-sm ${isOwn ? 'bg-primary/80 text-white hover:bg-primary/90' : 'bg-white border border-gray-100 text-gray-800 hover:bg-gray-50'} transition-colors`}
                                >
                                  <div className="p-2 bg-white rounded-lg text-primary">
                                    <File size={20} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate">{att.fileName}</p>
                                    <p className={`text-xs ${isOwn ? 'text-white/70' : 'text-gray-500'}`}>
                                      {(att.fileSize / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                  </div>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Time & Status */}
                      <div className={`flex items-center gap-2 text-[10px] text-gray-400 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <span>{formatTime(msg.createdAt)}</span>
                        
                        <div className="flex items-center gap-1">
                          {isOwn && msg.status === 'SENDING' && (
                             <span className="animate-pulse">Đang gửi...</span>
                          )}
                          
                          {/* Only show read receipts on the last message */}
                          {isLastMessage && readByUsers.length > 0 ? (
                            <div className="flex -space-x-1.5 overflow-hidden hover:space-x-0.5 transition-all duration-300 ml-1 py-0.5">
                              {readByUsers.slice(0, 4).map((read) => (
                                <img
                                  key={read.userId}
                                  src={read.user.avatarUrl ? resolveUploadUrl(read.user.avatarUrl) : getUiAvatarFallbackUrl(read.user.fullName)}
                                  alt={read.user.fullName}
                                  title={`Đã xem: ${read.user.fullName}`}
                                  className="inline-block h-4 w-4 rounded-full ring-1 ring-white cursor-pointer hover:z-10 transition-transform hover:scale-125 object-cover"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedEmployeeId(read.userId);
                                    setShowEmployeeModal(true);
                                  }}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src = getUiAvatarFallbackUrl(read.user.fullName);
                                  }}
                                />
                              ))}
                              {readByUsers.length > 4 && (
                                <div 
                                  className="flex items-center justify-center h-4 w-4 rounded-full bg-gray-100 text-[8px] font-bold text-gray-500 ring-1 ring-white cursor-default"
                                  title={`Và ${readByUsers.length - 4} người khác: ${readByUsers.slice(4).map(r => r.user.fullName).join(', ')}`}
                                >
                                  +{readByUsers.length - 4}
                                </div>
                              )}
                            </div>
                          ) : (
                             isOwn && (!isLastMessage || readByUsers.length === 0) && <Check size={12} className="text-gray-400" />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  )}{/* end CALL ternary */}
                </React.Fragment>
              );
            })}
            
            {/* Typing Indicator */}
            {typingUsers.length > 0 && (
               <div className="flex gap-3">
                 <div className="w-8 flex-shrink-0 opacity-0"></div>
                 <div className="bg-gray-100 rounded-full px-4 py-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                 </div>
               </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Resize Handle */}
          <div
            onMouseDown={handleResizeMouseDown}
            className="h-1.5 bg-transparent hover:bg-primary/20 active:bg-primary/30 cursor-ns-resize flex-shrink-0 relative group transition-colors"
          >
            <div className="absolute inset-x-0 -top-1 -bottom-1" />
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 rounded-full bg-gray-300 group-hover:bg-primary/50 transition-colors" />
          </div>

          {/* Input Area */}
          <div
            data-input-area
            className="p-4 bg-white border-t border-gray-200 flex-shrink-0 overflow-visible flex flex-col min-h-0"
            style={inputAreaHeight ? { height: inputAreaHeight } : undefined}
          >
            {/* Selected Files Preview */}
            {selectedFiles.length > 0 && (
              <div className="flex gap-2 overflow-x-auto mb-3 pb-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="relative flex-shrink-0 w-20 h-20 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden group">
                    <button 
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <X size={12} />
                    </button>
                    {file.type.startsWith('image/') ? (
                      <img 
                        src={URL.createObjectURL(file)} 
                        alt="preview" 
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <File className="text-gray-400" />
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[8px] px-1 truncate">
                      {file.name}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Menu chat kiểu Zalo: hàng công cụ trên — ô nhập — thanh định dạng dưới (không gửi danh thiếp) */}
            <div className="flex flex-col gap-2">
              <input
                type="file"
                ref={imageInputRef}
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageFileSelect}
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple
                className="hidden"
              />

              <div className="flex flex-wrap items-center gap-0.5 relative z-30">
                <div className="relative">
                  <button
                    type="button"
                    onMouseDown={TOOLBAR_MOUSE_DOWN}
                    onClick={handleToggleEmojiPicker}
                    className={`p-2 rounded-lg transition-colors ${
                      showEmojiPicker ? 'bg-sky-100 text-sky-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title="Emoji & sticker cute"
                  >
                    <Smile size={20} />
                  </button>
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-xl shadow-xl p-2 max-h-72 w-72 overflow-y-auto z-[100]">
                      <div className="flex gap-1 mb-2 border-b border-gray-100 pb-2">
                        <button
                          type="button"
                          onMouseDown={TOOLBAR_MOUSE_DOWN}
                          onClick={() => setEmojiPickerTab('emoji')}
                          className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
                            emojiPickerTab === 'emoji'
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Emoji
                        </button>
                        <button
                          type="button"
                          onMouseDown={TOOLBAR_MOUSE_DOWN}
                          onClick={() => setEmojiPickerTab('sticker')}
                          className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors ${
                            emojiPickerTab === 'sticker'
                              ? 'bg-primary text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          Sticker cute
                        </button>
                      </div>
                      <div
                        className={`grid grid-cols-8 gap-1 ${
                          emojiPickerTab === 'sticker' ? 'text-2xl' : 'text-xl'
                        }`}
                      >
                        {(emojiPickerTab === 'emoji' ? EMOJI_LIST : STICKER_CUTE_LIST).map((emoji, idx) => (
                          <button
                            key={`${emojiPickerTab}-${idx}`}
                            type="button"
                            className="flex items-center justify-center rounded-lg hover:bg-gray-100 min-h-[2rem]"
                            onMouseDown={TOOLBAR_MOUSE_DOWN}
                            onClick={() => handleSelectEmoji(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onMouseDown={TOOLBAR_MOUSE_DOWN}
                  onClick={() => imageInputRef.current?.click()}
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                  title="Gửi ảnh"
                >
                  <ImageIcon size={20} />
                </button>

                <button
                  type="button"
                  onMouseDown={TOOLBAR_MOUSE_DOWN}
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 rounded-lg text-gray-600 hover:bg-gray-100"
                  title="Đính kèm file"
                >
                  <Paperclip size={20} />
                </button>

                <button
                  type="button"
                  onMouseDown={TOOLBAR_MOUSE_DOWN}
                  onClick={() => {
                    setShowFormattingToolbar((v) => !v);
                    setShowColorPicker(false);
                    setShowFontSizePicker(false);
                    setShowEmojiPicker(false);
                    setShowQuickMessages(false);
                  }}
                  className={`p-2 rounded-lg transition-colors ${
                    showFormattingToolbar ? 'bg-sky-100 text-sky-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  title="Bật/tắt định dạng (Ctrl+Shift+X)"
                >
                  <SquarePen size={20} />
                </button>

                <div className="relative">
                  <button
                    type="button"
                    onMouseDown={TOOLBAR_MOUSE_DOWN}
                    onClick={() => {
                      setShowQuickMessages((v) => !v);
                      setShowEmojiPicker(false);
                      setShowColorPicker(false);
                      setShowFontSizePicker(false);
                    }}
                    className={`p-2 rounded-lg flex items-center gap-0.5 transition-colors ${
                      showQuickMessages ? 'bg-sky-100 text-sky-700' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                    title="Tin nhắn nhanh"
                  >
                    <MessageSquare size={18} />
                    <Zap size={14} className="text-amber-500" />
                  </button>
                  {showQuickMessages && (
                    <div className="absolute bottom-full left-0 mb-2 w-[min(100vw-2rem,22rem)] max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-[100] flex flex-col">
                      <div className="p-1 space-y-0.5">
                        {quickMessagesList.length === 0 ? (
                          <p className="text-sm text-gray-500 px-2 py-3 text-center">Chưa có tin nhắn nhanh</p>
                        ) : (
                          quickMessagesList.map((msg, i) => (
                            <div
                              key={`${i}-${msg.slice(0, 12)}`}
                              className="flex items-start gap-1 rounded-lg hover:bg-gray-50 group"
                            >
                              <button
                                type="button"
                                className="flex-1 min-w-0 text-left text-sm px-2 py-2 text-gray-800 rounded-lg"
                                onMouseDown={TOOLBAR_MOUSE_DOWN}
                                onClick={() => {
                                  insertTextAtCursor(msg);
                                  setShowQuickMessages(false);
                                }}
                              >
                                <span className="line-clamp-3 break-words">{msg}</span>
                              </button>
                              <div className="flex flex-col gap-0.5 py-1 pr-1 shrink-0">
                                <button
                                  type="button"
                                  className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200 hover:text-primary"
                                  title="Sửa"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openQuickMsgEditorEdit(i);
                                  }}
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="p-1.5 rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600"
                                  title="Xóa"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteQuickMessageAt(i);
                                  }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <div className="border-t border-gray-100 p-2">
                        <button
                          type="button"
                          className="w-full flex items-center justify-center gap-1.5 py-2 text-sm font-medium text-primary bg-primary/5 hover:bg-primary/10 rounded-lg"
                          onMouseDown={TOOLBAR_MOUSE_DOWN}
                          onClick={() => {
                            openQuickMsgEditorAdd();
                          }}
                        >
                          <Plus size={16} />
                          Thêm tin nhắn nhanh
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={handleSendMessage} className="flex items-end gap-2 flex-1 min-h-0 relative z-10">
                <div className="flex-1 flex flex-col border border-gray-200 rounded-xl bg-white overflow-visible shadow-sm min-h-0">
                  <div
                    ref={inputRef}
                    contentEditable
                    onInput={(e) => {
                      const target = e.target as HTMLDivElement;
                      setInputText(target.innerHTML);
                      updateTypingState();
                    }}
                    onPaste={handlePaste}
                    onKeyDown={(e) => {
                      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'x') {
                        e.preventDefault();
                        setShowFormattingToolbar((v) => !v);
                      }
                    }}
                    data-placeholder="Nhấn Ctrl + Shift + X để định dạng tin nhắn"
                    className={`px-3 py-2 overflow-y-auto focus:outline-none focus:ring-0 empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 text-gray-900 ${
                      inputExpanded ? 'min-h-[120px] max-h-64' : 'min-h-[48px] max-h-52'
                    }`}
                    style={{ wordBreak: 'break-word' }}
                  />

                  {showFormattingToolbar && (
                    <div className="border-t border-gray-100 bg-gray-50 px-1 py-1 flex flex-wrap items-center gap-0.5 relative z-20">
                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleBold}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="In đậm (Ctrl+B)"
                      >
                        <Bold size={18} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleItalic}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="In nghiêng (Ctrl+I)"
                      >
                        <Italic size={18} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleUnderline}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Gạch chân (Ctrl+U)"
                      >
                        <Underline size={18} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleStrikeThrough}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Gạch ngang"
                      >
                        <Strikethrough size={18} />
                      </button>

                      <div className="w-px h-5 bg-gray-300 mx-0.5" />

                      <div className="relative">
                        <button
                          type="button"
                          onMouseDown={TOOLBAR_MOUSE_DOWN}
                          onClick={() => {
                            setShowFontSizePicker((v) => !v);
                            setShowColorPicker(false);
                          }}
                          className={`p-1.5 rounded transition-colors ${
                            showFontSizePicker ? 'bg-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
                          }`}
                          title="Cỡ chữ"
                        >
                          <ALargeSmall size={18} />
                        </button>
                        {showFontSizePicker && (
                          <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-[100] min-w-[140px]">
                            {FONT_SIZE_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onMouseDown={TOOLBAR_MOUSE_DOWN}
                                onClick={() => handleFontSizePick(opt.value)}
                                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="relative">
                        <button
                          type="button"
                          onMouseDown={TOOLBAR_MOUSE_DOWN}
                          onClick={() => {
                            setShowColorPicker((v) => !v);
                            setShowFontSizePicker(false);
                            setShowEmojiPicker(false);
                          }}
                          className={`p-1.5 rounded transition-colors ${
                            showColorPicker ? 'bg-white shadow-sm' : 'text-gray-600 hover:bg-gray-200'
                          }`}
                          title="Màu chữ"
                        >
                          <Palette size={18} />
                        </button>
                        {showColorPicker && (
                          <div className="absolute bottom-full left-0 mb-1 z-[100]">
                            <ChatTextColorPopover
                              open={showColorPicker}
                              presets={TEXT_COLORS}
                              onApply={handleTextColor}
                            />
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleRemoveFormat}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Xóa định dạng"
                      >
                        <RemoveFormatting size={18} />
                      </button>

                      <div className="w-px h-5 bg-gray-300 mx-0.5" />

                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleUnorderedList}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Danh sách dấu đầu dòng"
                      >
                        <List size={18} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleOrderedList}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Danh sách đánh số"
                      >
                        <ListOrdered size={18} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleOutdent}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Giảm lề"
                      >
                        <Outdent size={18} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleIndent}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Tăng lề"
                      >
                        <Indent size={18} />
                      </button>

                      <div className="w-px h-5 bg-gray-300 mx-0.5" />

                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleUndo}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Hoàn tác"
                      >
                        <Undo2 size={18} />
                      </button>
                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={handleRedo}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title="Làm lại"
                      >
                        <Redo2 size={18} />
                      </button>

                      <div className="w-px h-5 bg-gray-300 mx-0.5" />

                      <button
                        type="button"
                        onMouseDown={TOOLBAR_MOUSE_DOWN}
                        onClick={() => setInputExpanded((v) => !v)}
                        className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                        title={inputExpanded ? 'Thu gọn ô nhập' : 'Mở rộng ô nhập'}
                      >
                        {inputExpanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!getPlainText(inputText).trim() && selectedFiles.length === 0}
                  className="p-3 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex-shrink-0"
                >
                  <Send size={20} />
                </button>
              </form>
              <p className="text-xs text-gray-400 mt-1 text-center">
                Enter xuống dòng. Ctrl+Shift+X bật/tắt định dạng. Ctrl+V dán ảnh. Nút Gửi để gửi tin nhắn.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center text-gray-400 bg-gray-50">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <MessageSquare size={48} className="text-gray-300" />
          </div>
          <p>Chọn một nhóm để bắt đầu trò chuyện</p>
        </div>
      )}

      {quickMsgEditorOpen && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setQuickMsgEditorOpen(false)}
          role="presentation"
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-4 border border-gray-100"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-gray-900 mb-3">
              {quickMsgEditorIndex === null ? 'Tin nhắn nhanh mới' : 'Sửa tin nhắn nhanh'}
            </h3>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[120px] focus:outline-none focus:ring-2 focus:ring-primary/30 resize-y"
              value={quickMsgEditorDraft}
              onChange={(e) => setQuickMsgEditorDraft(e.target.value)}
              placeholder="Nhập nội dung chèn vào ô tin nhắn..."
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 text-sm font-medium"
                onClick={() => setQuickMsgEditorOpen(false)}
              >
                Hủy
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium"
                onClick={saveQuickMsgEditor}
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Group Info Modal */}
      {showGroupInfoModal && selectedGroup && (
        <div className="absolute inset-0 z-50 flex items-center justify-end bg-black/20 backdrop-blur-sm">
          <div className="bg-white h-full w-full md:w-80 shadow-xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="font-bold text-lg text-gray-800">
                {showAddMemberView ? 'Thêm thành viên' : 'Thông tin trò chuyện'}
              </h3>
              <button 
                onClick={() => {
                   if (showAddMemberView) {
                     setShowAddMemberView(false);
                     setSelectedUserIds([]);
                   } else {
                     setShowGroupInfoModal(false);
                   }
                }}
                className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
              >
                {showAddMemberView ? <ArrowLeft size={20} /> : <X size={20} />}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
               {showAddMemberView ? (
                  <div className="space-y-4">
                     {/* Search for Add Member */}
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input 
                          type="text" 
                          placeholder="Tìm người thêm..." 
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        {usersToAdd.length === 0 ? (
                           <p className="text-center text-gray-400 text-sm py-4">Không tìm thấy ai để thêm</p>
                        ) : (
                           usersToAdd.map(u => {
                              const isSelected = selectedUserIds.includes(u.id);
                              return (
                                <div 
                                    key={u.id}
                                    onClick={() => toggleUserSelection(u.id)}
                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
                                >
                                   <img 
                                      src={u.avatarUrl ? resolveUploadUrl(u.avatarUrl) : getUiAvatarFallbackUrl(u.fullName)} 
                                      className="w-8 h-8 rounded-full object-cover" 
                                      alt={u.fullName}
                                   />
                                   <div className="flex-1 min-w-0">
                                      <p className="font-medium text-sm truncate">{u.fullName}</p>
                                   </div>
                                   {isSelected && <Check size={16} className="text-primary" />}
                                </div>
                              );
                           })
                        )}
                      </div>
                      
                      <div className="pt-4 border-t border-gray-100">
                        <button 
                          onClick={handleAddMemberToGroup}
                          disabled={selectedUserIds.length === 0}
                          className="w-full py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                        >
                          Thêm vào nhóm
                        </button>
                      </div>
                  </div>
                 ) : (
                  <div className="space-y-6">
                    <div className="flex flex-col items-center">
                      <div className="relative">
                        <img 
                          src={getGroupAvatar(selectedGroup)} 
                          alt={selectedGroup.name}
                          className={`w-20 h-20 rounded-full object-cover mb-3 shadow-sm ${selectedGroup.type === 'PRIVATE' ? 'cursor-pointer hover:opacity-80 transition' : ''}`}
                          onClick={() => {
                            if (selectedGroup.type === 'PRIVATE') {
                               const otherMember = selectedGroup.members.find(m => m.employeeId !== user?.id);
                               if (otherMember) {
                                  setSelectedEmployeeId(otherMember.employeeId);
                                  setShowEmployeeModal(true);
                               }
                            }
                          }}
                        />
                        {canManageGroup() && selectedGroup.type === 'GROUP' && (
                          <>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleUploadGroupAvatar}
                              className="absolute inset-0 opacity-0 cursor-pointer z-10"
                            />
                            <div className="absolute inset-0 bg-black/30 rounded-full flex items-center justify-center text-white text-xs font-medium pointer-events-none">
                              Đổi ảnh
                            </div>
                          </>
                        )}
                      </div>
                      {selectedGroup.type === 'GROUP' && canManageGroup() ? (
                        <form onSubmit={handleSaveGroupSettings} className="w-full mt-2 space-y-2">
                          <input
                            type="text"
                            value={groupSettingsName}
                            onChange={e => setGroupSettingsName(e.target.value)}
                            className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-center"
                          />
                          <div className="flex items-center justify-center gap-2">
                            <span className="text-xs text-gray-500">Màu nền:</span>
                            {BACKGROUND_COLORS.slice(0, 6).map(color => (
                              <button
                                key={color.value}
                                type="button"
                                onClick={() => setGroupBackgroundColor(color.value)}
                                className={`w-6 h-6 rounded-full border ${groupBackgroundColor === color.value ? 'border-primary ring-2 ring-primary/50' : 'border-gray-200'}`}
                                style={{ backgroundColor: color.value }}
                                title={color.name}
                              />
                            ))}
                          </div>
                          <button
                            type="submit"
                            disabled={isSavingGroupSettings}
                            className="w-full py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"
                          >
                            Lưu thay đổi
                          </button>
                        </form>
                      ) : (
                        <div className="w-full mt-2 space-y-3">
                          <h2 className="font-bold text-gray-800 text-center">{getGroupName(selectedGroup)}</h2>
                          <p className="text-sm text-gray-500 text-center">
                            {selectedGroup.type === 'PRIVATE'
                              ? 'Cuộc trò chuyện riêng'
                              : `Nhóm • ${selectedGroup.members?.length || 0} thành viên`}
                          </p>
                          {/* Màu nền cho cuộc trò chuyện cá nhân */}
                          <div className="flex items-center justify-center gap-2 pt-2">
                            <span className="text-xs text-gray-500">Màu nền:</span>
                            {BACKGROUND_COLORS.slice(0, 6).map(color => (
                              <button
                                key={color.value}
                                type="button"
                                onClick={() => handleChangeBackground(color.value)}
                                className={`w-6 h-6 rounded-full border transition-all ${myBackgroundColor === color.value ? 'border-primary ring-2 ring-primary/50' : 'border-gray-200 hover:border-gray-300'}`}
                                style={{ backgroundColor: color.value }}
                                title={color.name}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {selectedGroup.type === 'GROUP' && (
                      <button 
                        onClick={handleOpenAddMember}
                        className="w-full flex items-center justify-center gap-2 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors font-medium text-sm"
                      >
                        <Plus size={16} />
                        Thêm thành viên
                      </button>
                    )}

                    <div className="space-y-4">
                      {canDeleteConversation() && (
                        <button
                          onClick={handleDeleteConversation}
                          className="w-full py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                        >
                          <Trash2 size={16} />
                          Xóa cuộc trò chuyện
                        </button>
                      )}

                      <div>
                        <h4 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">Tệp đính kèm</h4>
                        <div className="flex gap-2 mb-3">
                          {[
                            { key: 'ALL', label: 'Tất cả' },
                            { key: 'LINK', label: 'Link' },
                            { key: 'IMAGE', label: 'Ảnh' },
                            { key: 'FILE', label: 'File' }
                          ].map(item => (
                            <button
                              key={item.key}
                              onClick={() => {
                                const k = item.key as 'ALL' | 'IMAGE' | 'FILE' | 'LINK';
                                setAttachmentFilter(k);
                                loadAttachments(selectedGroup.id, k);
                              }}
                              className={`px-3 py-1 rounded-full text-xs font-medium border ${
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
                            <p className="text-xs text-gray-400">Chưa có tệp đính kèm</p>
                          ) : (
                            attachments.map(item => (
                              <button
                                key={item.id}
                                onClick={() => window.open(getChatFileUrl(item.url), '_blank')}
                                className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 text-left"
                              >
                                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                                  {item.kind === 'IMAGE' ? <ImageIcon size={16} /> : item.kind === 'LINK' ? <LinkIcon /> : <File size={16} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-800 truncate">
                                    {item.kind === 'LINK' ? item.url : item.name}
                                  </p>
                                  <p className="text-[10px] text-gray-500 truncate">
                                    {item.sender?.fullName} • {formatTime(item.createdAt)}
                                  </p>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">Thành viên ({selectedGroup.members?.length || 0})</h4>
                        <div className="space-y-2">
                          {selectedGroup.members.map(member => {
                            const isSelf = member.employeeId === user?.id;
                            const isOwnerMember = member.role === 'OWNER';
                            const isCoOwnerMember = member.role === 'CO_OWNER';
                            const canManage = isOwner() || isCoOwner();
                            const employeeName = member.employee?.fullName || 'Không xác định';
                            const isOnline = member.employee?.isOnline;
                            const isMenuOpen = memberMenuOpenId === member.employeeId;
                            const isCompanyGroup = selectedGroup.name === 'K-VENTURES | OFFICE';

                            const getRoleBadge = () => {
                              if (isOwnerMember) return (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-medium">
                                  👑 Trưởng nhóm
                                </span>
                              );
                              if (isCoOwnerMember) return (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                  ⭐ Phó nhóm
                                </span>
                              );
                              return null;
                            };

                            return (
                              <div key={member.employeeId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors relative">
                                {/* Avatar */}
                                <div 
                                  className="relative cursor-pointer flex-shrink-0"
                                  onClick={() => {
                                    setSelectedEmployeeId(member.employeeId);
                                    setShowEmployeeModal(true);
                                  }}
                                >
                                  <img 
                                    src={member.employee?.avatarUrl ? resolveUploadUrl(member.employee.avatarUrl) : getUiAvatarFallbackUrl(employeeName)} 
                                    className="w-10 h-10 rounded-full object-cover border-2 border-gray-200"
                                    alt={employeeName}
                                  />
                                </div>
                                
                                {/* Name and Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span 
                                      className="text-sm font-semibold text-gray-900 cursor-pointer hover:text-primary"
                                      onClick={() => {
                                        setSelectedEmployeeId(member.employeeId);
                                        setShowEmployeeModal(true);
                                      }}
                                    >
                                      {employeeName}
                                    </span>
                                    {isSelf && (
                                      <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Bạn</span>
                                    )}
                                    {getRoleBadge()}
                                  </div>
                                  {member.nickname && (
                                    <p className="text-xs text-gray-500">Biệt danh: {member.nickname}</p>
                                  )}
                                </div>

                                {/* Three Dots Menu */}
                                <div className="relative flex-shrink-0">
                                  <button
                                    onClick={() => setMemberMenuOpenId(isMenuOpen ? null : member.employeeId)}
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
                                          setEditingMember(member);
                                          setNicknameInput(member.nickname || '');
                                          setShowNicknameModal(true);
                                          setMemberMenuOpenId(null);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                      >
                                        ✏️ Đặt biệt danh
                                      </button>

                                      {/* Bổ nhiệm/Hủy phó nhóm - Only for non-self, non-owner members */}
                                      {!isSelf && !isOwnerMember && canManage && selectedGroup.type === 'GROUP' && (
                                        <button
                                          onClick={async () => {
                                            const newRole = isCoOwnerMember ? 'MEMBER' : 'CO_OWNER';
                                            await handleChangeMemberRole(member, newRole);
                                            setMemberMenuOpenId(null);
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                          {isCoOwnerMember ? '⭐ Hủy phó nhóm' : '⭐ Bổ nhiệm phó nhóm'}
                                        </button>
                                      )}

                                      {/* Trao quyền trưởng nhóm - Only owner can transfer */}
                                      {!isSelf && isOwner() && selectedGroup.type === 'GROUP' && (
                                        <button
                                          onClick={() => {
                                            handleTransferOwnership(member);
                                            setMemberMenuOpenId(null);
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                          👑 Trao quyền trưởng nhóm
                                        </button>
                                      )}

                                      {/* Xóa khỏi nhóm - Not allowed for self, owner, or company group */}
                                      {!isSelf && !isOwnerMember && canManage && !isCompanyGroup && (
                                        <button
                                          onClick={() => {
                                            handleRemoveMember(member);
                                            setMemberMenuOpenId(null);
                                          }}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                          🚫 Xóa khỏi nhóm
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Nickname Edit Modal */}
                      {showNicknameModal && editingMember && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowNicknameModal(false)}>
                          <div className="bg-white rounded-xl p-6 w-80 shadow-xl" onClick={e => e.stopPropagation()}>
                            <h3 className="font-bold text-lg mb-4">Đặt biệt danh</h3>
                            <p className="text-sm text-gray-600 mb-3">
                              Biệt danh cho: <strong>{editingMember.employee?.fullName}</strong>
                            </p>
                            <input
                              type="text"
                              value={nicknameInput}
                              onChange={e => setNicknameInput(e.target.value)}
                              placeholder="Nhập biệt danh..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4 focus:outline-none focus:ring-2 focus:ring-primary/50"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => setShowNicknameModal(false)}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                              >
                                Hủy
                              </button>
                              <button
                                onClick={async () => {
                                  await handleSaveNickname(editingMember);
                                  setShowNicknameModal(false);
                                  setEditingMember(null);
                                }}
                                className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                              >
                                Lưu
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {isOwner() && selectedGroup.memberRequests && selectedGroup.memberRequests.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-700 mb-3 text-sm uppercase tracking-wide">
                            Yêu cầu tham gia
                          </h4>
                          <div className="space-y-2 max-h-40 overflow-y-auto">
                            {selectedGroup.memberRequests.map(req => (
                              <div key={req.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50">
                                <img
                                  src={
                                    req.targetEmployee.avatarUrl
                                      ? resolveUploadUrl(req.targetEmployee.avatarUrl)
                                      : getUiAvatarFallbackUrl(req.targetEmployee.fullName)
                                  }
                                  className="w-8 h-8 rounded-full object-cover"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-800 truncate">
                                    {req.targetEmployee.fullName}
                                  </p>
                                  <p className="text-[11px] text-gray-500 truncate">
                                    Được đề xuất bởi {req.requester.fullName}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button
                                    className="px-2 py-1 text-[11px] text-primary hover:bg-primary/10 rounded-lg"
                                    onClick={async () => {
                                      try {
                                          const updated = await apiClient.post(
                                            `/chat/groups/${selectedGroup.id}/member-requests/${req.id}/approve`,
                                            {}
                                          );
                                        setSelectedGroup(updated);
                                      } catch (error) {
                                        console.error('Failed to approve request', error);
                                        alert('Không thể duyệt yêu cầu');
                                      }
                                    }}
                                  >
                                    Duyệt
                                  </button>
                                  <button
                                    className="px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-200 rounded-lg"
                                    onClick={async () => {
                                      try {
                                          await apiClient.post(
                                            `/chat/groups/${selectedGroup.id}/member-requests/${req.id}/reject`,
                                            {}
                                          );
                                        setSelectedGroup({
                                          ...selectedGroup,
                                          memberRequests: selectedGroup.memberRequests?.filter(r => r.id !== req.id)
                                        });
                                      } catch (error) {
                                        console.error('Failed to reject request', error);
                                        alert('Không thể từ chối yêu cầu');
                                      }
                                    }}
                                  >
                                    Từ chối
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* New Chat Modal */}
      {showNewChatModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-bold text-lg text-gray-800">Tạo cuộc trò chuyện</h3>
              <button 
                onClick={() => {
                    setShowNewChatModal(false);
                    setSelectedUserIds([]);
                    setNewGroupName('');
                    setSearchTerm('');
                }}
                className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 overflow-hidden flex flex-col gap-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Tìm kiếm nhân sự..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                />
              </div>

              {/* Group Name (Only for > 1 selected) */}
              {selectedUserIds.length > 1 && (
                <div className="space-y-1.5 animate-in slide-in-from-top-2 duration-200">
                    <label className="text-sm font-medium text-gray-700">Tên nhóm</label>
                    <input 
                      type="text" 
                      placeholder="Đặt tên nhóm..." 
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                </div>
              )}

              {/* User List */}
              <div className="flex-1 overflow-y-auto space-y-1 min-h-[200px]">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Danh sách nhân sự ({filteredUsers.length})
                </p>
                {filteredUsers.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                        <Users size={32} className="mx-auto mb-2 opacity-50" />
                        <p>Không tìm thấy nhân sự nào</p>
                    </div>
                ) : (
                    filteredUsers.map(u => {
                        const isSelected = selectedUserIds.includes(u.id);
                        return (
                            <div 
                                key={u.id}
                                onClick={() => toggleUserSelection(u.id)}
                                className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                                    isSelected 
                                        ? 'bg-primary/5 border-primary/20' 
                                        : 'hover:bg-gray-50 border-transparent'
                                }`}
                            >
                                <div className="relative">
                                    <img 
                                        src={u.avatarUrl ? resolveUploadUrl(u.avatarUrl) : getUiAvatarFallbackUrl(u.fullName)} 
                                        alt={u.fullName}
                                        className="w-10 h-10 rounded-full object-cover" 
                                    />
                                    {isSelected && (
                                        <div className="absolute -bottom-1 -right-1 bg-primary text-white rounded-full p-0.5 border-2 border-white">
                                            <Check size={10} />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <h4 className={`font-medium ${isSelected ? 'text-primary' : 'text-gray-800'}`}>
                                        {u.fullName}
                                    </h4>
                                    <p className="text-xs text-gray-500 flex items-center gap-1">
                                        {u.position?.name || 'N/A'} • {u.department?.name || 'N/A'}
                                    </p>
                                </div>
                                <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                                    isSelected 
                                        ? 'bg-primary border-primary' 
                                        : 'border-gray-300'
                                }`}>
                                    {isSelected && <Check size={12} className="text-white" />}
                                </div>
                            </div>
                        );
                    })
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 rounded-b-2xl">
                <button 
                    onClick={() => {
                        setShowNewChatModal(false);
                        setSelectedUserIds([]);
                    }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors"
                >
                    Hủy
                </button>
                <button 
                    onClick={handleCreateChat}
                    disabled={selectedUserIds.length === 0}
                    className="px-6 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center gap-2"
                >
                    {selectedUserIds.length > 1 ? 'Tạo nhóm' : 'Bắt đầu chat'}
                    {selectedUserIds.length > 0 && (
                        <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs">
                            {selectedUserIds.length}
                        </span>
                    )}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Detail Modal */}
      {showEmployeeModal && selectedEmployeeId && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex-1 overflow-y-auto relative">
               <button 
                  onClick={() => {
                    setShowEmployeeModal(false);
                    setSelectedEmployeeId(null);
                  }}
                  className="absolute top-4 right-4 z-[70] p-2 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"
               >
                  <X size={20} />
               </button>
               <EmployeeDetail 
                  employeeId={selectedEmployeeId} 
                  onClose={() => {
                    setShowEmployeeModal(false);
                    setSelectedEmployeeId(null);
                  }} 
               />
            </div>
          </div>
        </div>
      )}

      {/* ─── Video Call Modal ─── */}
      {isInCall && selectedGroup && socket && user && (() => {
        const otherMember = selectedGroup.members.find(m => m.employeeId !== user.id);
        const rName = selectedGroup.type === 'PRIVATE'
          ? (otherMember?.employee?.fullName || selectedGroup.name)
          : selectedGroup.name;
        const rAvatar = selectedGroup.type === 'PRIVATE'
          ? otherMember?.employee?.avatarUrl
          : selectedGroup.avatarUrl;
        return (
          <VideoCallModal
            socket={socket}
            groupId={selectedGroup.id}
            currentUserId={user.id}
            currentUserName={user.name || 'Bạn'}
            currentUserAvatar={user.avatar}
            remoteName={rName}
            remoteAvatar={rAvatar}
            callType={callType}
            isCaller={isCallCaller}
            onClose={async (info: CallEndInfo) => {
              setIsInCall(false);
              setIsCallCaller(false);
              // Save call history message
              if (selectedGroup && !selectedGroup.id.startsWith('temp-group-')) {
                try {
                  await apiClient.post('/chat/messages/call', {
                    groupId: selectedGroup.id,
                    duration: info.duration,
                    result: info.result,
                    callType: info.callType,
                  });
                } catch (e) {
                  console.error('Failed to save call history:', e);
                }
              }
            }}
          />
        );
      })()}

    </div>
  );
};

export default Chat;
