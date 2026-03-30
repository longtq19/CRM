import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useChat, type ChatSession } from '../../context/ChatContext';
import { useAuthStore } from '../../context/useAuthStore';
import { apiClient, API_URL } from '../../api/client';
import { X, Minus, Send, Paperclip, Smile, Loader2, Image as ImageIcon, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import ChatInfo from './ChatInfo';
import { renderChatMessageHtml } from '../../utils/chatMessageHtml';
import { useNavigate } from 'react-router-dom';
import { getUiAvatarFallbackUrl } from '../../utils/uiAvatar';
import { resolveUploadUrl } from '../../utils/assetsUrl';
import { parseCallContent, formatCallDuration } from '../../utils/callMessageUtils';

// Lazy load trang nặng — chỉ tải khi mở tab "Thông tin nhân viên" trong popup chat
const EmployeeDetailLazy = React.lazy(() => import('../../pages/EmployeeDetail'));

interface ChatPopupProps {
  session: ChatSession;
  index: number;
}

const EMOJI_LIST: string[] = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','😢','😭','😡',
  '👍','👎','👏','🙏','💪','🎉','❤️','🔥','⭐','✅','❌',
  '💼','📌','📎','📝','📷','📊','🚀','🤝'
];

const ChatPopup: React.FC<ChatPopupProps> = ({ session, index }) => {
  const { closeChat, minimizeChat, restoreChat, socket } = useChat();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // View State
  const [view, setView] = useState<'CHAT' | 'INFO' | 'EMPLOYEE'>('CHAT');
  const [previousView, setPreviousView] = useState<'CHAT' | 'INFO'>('CHAT');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [myBackgroundColor, setMyBackgroundColor] = useState<string | null>(null);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenInfo = () => {
    setView('INFO');
  };

  const handleOpenEmployee = (employeeId: string) => {
    if (!employeeId) return;
    setPreviousView(view === 'INFO' ? 'INFO' : 'CHAT');
    setSelectedEmployeeId(employeeId);
    setView('EMPLOYEE');
  };

  const handleBack = () => {
    setView(previousView);
    if (previousView === 'CHAT') {
        setTimeout(scrollToBottom, 100);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Mark as read when messages update or window opens
  useEffect(() => {
    if (session.isOpen && !session.minimized && messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      // Only mark as read if the last message is NOT from me
      if (lastMsg.senderId !== user?.id) {
         apiClient.post('/chat/messages/read', { groupId: session.id }).catch(console.error);
      }
    }
  }, [session.isOpen, session.minimized, messages, session.id, user?.id]);

  // Fetch messages on mount
  useEffect(() => {
    const fetchMessages = async () => {
      // If we already have messages for this session, don't refetch
      if (messages.length > 0) return;

      setLoading(true);
      try {
        const res = await apiClient.get(`/chat/groups/${session.id}/messages`);
        if (Array.isArray(res)) {
          // Sort by createdAt ascending
          const sorted = res.sort((a: any, b: any) => 
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          setMessages(sorted);
          setTimeout(scrollToBottom, 100);
        }
        // Fetch group details for background color
        try {
          const groupDetails = await apiClient.get(`/chat/groups/${session.id}`);
          setMyBackgroundColor(groupDetails?.backgroundColor || null);
        } catch (e) {
          console.error('Failed to fetch group details', e);
        }
      } catch (error) {
        console.error('Failed to fetch messages', error);
      } finally {
        setLoading(false);
      }
    };

    if (session.isOpen && !session.minimized) {
      fetchMessages();
    }
  }, [session.id, session.isOpen, session.minimized]);

  // Listen for socket messages
  useEffect(() => {
    if (!socket) return;


    // Join the group room
    socket.emit('join_group', session.id);

    const handleNewMessage = (message: any) => {
      if (message.groupId === session.id) {
        setMessages((prev) => {
          // Prevent duplicates by ID
          if (prev.some(m => m.id === message.id)) return prev;

          // If message is from current user, check for a matching temporary message
          if (message.senderId === user?.id) {
             const tempIndex = prev.findIndex(m => 
                 m.status === 'SENDING' && 
                 m.content === message.content
             );
             
             if (tempIndex !== -1) {
                 const newMessages = [...prev];
                 // Replace temp message with real one from socket
                 newMessages[tempIndex] = message;
                 return newMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
             }
          }

          const newMessages = [...prev, message];
          // Sort again to be safe
          return newMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        });
        setTimeout(scrollToBottom, 100);
      }
    };

    socket.on('new_message', handleNewMessage);

    // Listen for background color updates (áp dụng cho tất cả thành viên)
    const handleBackgroundUpdate = (data: { groupId: string; backgroundColor: string | null }) => {
      if (data.groupId === session.id) {
        setMyBackgroundColor(data.backgroundColor);
      }
    };
    socket.on('background_updated', handleBackgroundUpdate);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('background_updated', handleBackgroundUpdate);
    };
  }, [socket, session.id, user?.id]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if ((!inputText.trim() && selectedFiles.length === 0) || isUploading) return;

    const content = inputText;
    const filesToSend = [...selectedFiles];
    
    setInputText('');
    setSelectedFiles([]);
    setShowEmojiPicker(false);

    try {
      // Optimistic update
      const tempId = Date.now().toString();
      const tempMessage = {
        id: tempId,
        content,
        senderId: user?.id,
        sender: user,
        createdAt: new Date().toISOString(),
        groupId: session.id,
        status: 'SENDING',
        attachments: filesToSend.map((file, idx) => ({
            id: `temp-att-${idx}`,
            fileName: file.name,
            fileUrl: URL.createObjectURL(file),
            fileSize: file.size,
            fileType: file.type
        })),
        type: filesToSend.length > 0 ? 'FILE' : 'TEXT'
      };

      setMessages(prev => [...prev, tempMessage]);
      scrollToBottom();

      const formData = new FormData();
      formData.append('groupId', session.id);
      formData.append('content', content);
      
      if (filesToSend.length > 0) {
        formData.append('type', 'FILE');
        setIsUploading(true);
        filesToSend.forEach(file => {
            formData.append('files', file);
        });
      } else {
        formData.append('type', 'TEXT');
      }

      const res = await apiClient.postMultipart('/chat/messages', formData);
      
      // Replace temp message with real one
      setMessages(prev => prev.map(m => m.id === tempId ? { ...res, status: 'SENT' } : m));

    } catch (error) {
      console.error('Failed to send message', error);
      // Mark as error
    } finally {
        setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      // Validate size (25MB total or per file?)
      // Backend limit is 25MB per request usually or per file. 
      const validFiles = files.filter(f => f.size <= 25 * 1024 * 1024);
      if (validFiles.length !== files.length) {
        alert('Một số file vượt quá giới hạn 25MB và đã bị bỏ qua.');
      }
      
      setSelectedFiles(prev => [...prev, ...validFiles]);
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setInputText(prev => prev + emoji);
    setShowEmojiPicker(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const timestamp = Date.now();
          const newFile = new File([file], `pasted-image-${timestamp}.png`, { type: file.type });
          imageFiles.push(newFile);
        }
      }
    }

    if (imageFiles.length > 0) {
      e.preventDefault();
      setSelectedFiles(prev => [...prev, ...imageFiles]);
    }
  };

  const isImageFile = (fileType: string) => {
    return fileType?.startsWith('image/');
  };

  const getFileUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('blob:')) return url;
    const normalized = url.startsWith('/') ? url : `/${url}`;
    if (normalized.startsWith('/uploads')) return resolveUploadUrl(normalized);
    const baseUrl = (API_URL || '').replace('/api', '');
    return `${baseUrl}${normalized}`;
  };

  const handleOpenInChat = () => {
    closeChat(session.id);
    navigate(`/chat?groupId=${session.id}`);
  };

  if (session.minimized) {
    return (
      <div 
        className={`fixed bottom-0 bg-white shadow-lg border border-gray-200 rounded-t-lg cursor-pointer hover:bg-gray-50 z-50 flex items-center gap-2 px-3 py-2 ${isMobile ? 'right-2 left-2 w-auto' : 'w-48'}`}
        style={isMobile ? { bottom: '0' } : { right: `${20 + index * 200}px` }}
        onClick={() => restoreChat(session.id)}
      >
        <div className="relative">
          <img 
            src={session.avatarUrl ? resolveUploadUrl(session.avatarUrl) : getUiAvatarFallbackUrl(session.groupName || 'User')} 
            alt={session.groupName}
            className="w-6 h-6 rounded-full object-cover"
          />
          {session.user?.isOnline && (
            <span className="absolute bottom-0 right-0 w-1.5 h-1.5 bg-green-500 border border-white rounded-full"></span>
          )}
        </div>
        <span className="text-sm font-medium truncate flex-1">{session.groupName}</span>
        <button 
          onClick={(e) => { e.stopPropagation(); closeChat(session.id); }}
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div 
      className={`fixed bottom-0 bg-white shadow-xl border border-gray-200 rounded-t-lg z-50 flex flex-col ${isMobile ? 'left-0 right-0 h-[85vh]' : 'w-80 h-96'}`}
      style={isMobile ? {} : { right: `${20 + index * 340}px` }}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between p-2 border-b border-gray-100 bg-white rounded-t-lg cursor-pointer hover:bg-gray-50"
        onClick={() => minimizeChat(session.id)}
      >
        <div className="flex items-center gap-2">
          <div className="relative group/avatar">
            <img 
              src={session.avatarUrl ? resolveUploadUrl(session.avatarUrl) : getUiAvatarFallbackUrl(session.groupName || 'User')} 
              alt={session.groupName}
              className="w-8 h-8 rounded-full object-cover cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={(e) => {
                  e.stopPropagation();
                  handleOpenInChat();
              }}
            />
            {session.user?.isOnline && (
              <span className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-white rounded-full"></span>
            )}
            {/* Tooltip */}
            <div className="absolute left-0 top-full mt-1 hidden group-hover/avatar:block z-50">
              <div className="bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap flex items-center gap-1">
                <ExternalLink size={10} />
                Mở trong Tin nhắn
              </div>
            </div>
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-gray-800 truncate max-w-[120px]">{session.groupName}</span>
            {session.user?.isOnline && <span className="text-[10px] text-green-500">Đang hoạt động</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={(e) => { e.stopPropagation(); handleOpenInChat(); }}
            className="p-1 text-gray-400 hover:bg-blue-50 hover:text-primary rounded"
            title="Mở trong Tin nhắn"
          >
            <ExternalLink size={16} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); minimizeChat(session.id); }}
            className="p-1 text-gray-400 hover:bg-gray-100 rounded"
          >
            <Minus size={16} />
          </button>
          <button 
            onClick={(e) => { e.stopPropagation(); closeChat(session.id); }}
            className="p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 rounded"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {view === 'INFO' ? (
        <ChatInfo 
            sessionId={session.id} 
            onClose={() => setView('CHAT')} 
            onOpenEmployeeDetail={handleOpenEmployee}
        />
      ) : view === 'EMPLOYEE' && selectedEmployeeId ? (
        <div className="flex-1 overflow-y-auto bg-white relative">
          <Suspense fallback={
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          }>
            <EmployeeDetailLazy
              employeeId={selectedEmployeeId}
              onClose={handleBack}
            />
          </Suspense>
        </div>
      ) : (
      <>
      {/* Messages */}
      <div 
        className="flex-1 overflow-y-auto p-3 space-y-3"
        style={{ background: myBackgroundColor || '#F9FAFB' }}
      >
        {loading ? (
          <div className="text-center text-xs text-gray-400 mt-4">Đang tải tin nhắn...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-xs text-gray-400 mt-4">Bắt đầu cuộc trò chuyện</div>
        ) : (
          messages.map((msg, idx) => {
            const isOwn = msg.senderId === user?.id;
            const showAvatar = !isOwn && (idx === 0 || messages[idx - 1].senderId !== msg.senderId);
            const avatarUrl = msg.sender?.avatarUrl
              ? resolveUploadUrl(msg.sender.avatarUrl)
              : getUiAvatarFallbackUrl(msg.sender?.fullName || 'User');
            
            return (
              <div key={msg.id || idx} className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
                {!isOwn && (
                  <div className="w-6 flex-shrink-0">
                    {showAvatar && (
                      <img 
                        src={avatarUrl}
                        className="w-6 h-6 rounded-full object-cover cursor-pointer hover:opacity-80"
                        alt={msg.sender?.fullName}
                        onClick={() => handleOpenEmployee(msg.senderId)}
                      />
                    )}
                  </div>
                )}
                <div className="max-w-[75%]">
                    {/* CALL message rendering */}
                    {msg.type === 'CALL' ? (() => {
                      const cd = parseCallContent(msg.content);
                      const isVideo = cd.callType === 'video';
                      const icon = isVideo ? '📹' : '📞';
                      let label = '';
                      let cls = '';
                      if (cd.result === 'completed') {
                        label = `Cuộc gọi ${isVideo ? 'video' : 'thoại'} • ${formatCallDuration(cd.duration)}`;
                        cls = 'text-green-600 bg-green-50 border-green-200';
                      } else if (cd.result === 'rejected') {
                        label = `Cuộc gọi ${isVideo ? 'video' : 'thoại'} bị từ chối`;
                        cls = 'text-red-500 bg-red-50 border-red-200';
                      } else {
                        label = `Cuộc gọi ${isVideo ? 'video' : 'thoại'} nhỡ`;
                        cls = 'text-orange-500 bg-orange-50 border-orange-200';
                      }
                      return (
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border ${cls}`}>
                          <span>{icon}</span>
                          <span>{label}</span>
                        </div>
                      );
                    })() : (
                    <>
                    {msg.content && (
                      <div className={`p-2 rounded-lg text-sm ${
                          isOwn ? 'bg-primary text-white' : 'bg-white border border-gray-200 text-gray-800'
                      }`}>
                        <div 
                          className="whitespace-pre-wrap break-words chat-message-content"
                          dangerouslySetInnerHTML={{ __html: renderChatMessageHtml(msg.content) }}
                        />
                      </div>
                    )}

                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className={`flex flex-col gap-1 ${msg.content ? 'mt-1' : ''}`}>
                        {msg.attachments.map((att: any) => (
                          isImageFile(att.fileType) ? (
                            <img 
                              key={att.id}
                              src={getFileUrl(att.fileUrl)} 
                              alt={att.fileName}
                              className="max-w-full max-h-48 rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                              onClick={() => window.open(getFileUrl(att.fileUrl), '_blank')}
                            />
                          ) : (
                            <div key={att.id} className={`p-1.5 rounded-lg flex items-center gap-2 text-sm ${
                              isOwn ? 'bg-primary/80 text-white' : 'bg-white border border-gray-200 text-gray-800'
                            }`}>
                              <Paperclip size={12} />
                              <a 
                                href={getFileUrl(att.fileUrl)} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="text-xs hover:underline truncate max-w-[150px]"
                              >
                                {att.fileName}
                              </a>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                    </>)}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Selected Files Preview */}
      {selectedFiles.length > 0 && (
        <div className="px-2 pt-2 bg-white border-t border-gray-100 flex gap-2 overflow-x-auto">
            {selectedFiles.map((file, idx) => (
                <div key={idx} className="relative flex-shrink-0">
                    {file.type.startsWith('image/') ? (
                        <div className="relative">
                            <img 
                                src={URL.createObjectURL(file)} 
                                alt={file.name}
                                className="w-16 h-16 object-cover rounded border border-gray-200"
                            />
                            <button 
                                onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                                className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                            >
                                <X size={10} />
                            </button>
                        </div>
                    ) : (
                        <div className="bg-gray-100 rounded px-2 py-1 flex items-center gap-1 text-xs whitespace-nowrap">
                            <Paperclip size={12} />
                            <span className="truncate max-w-[80px]">{file.name}</span>
                            <button 
                                onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                                className="text-gray-500 hover:text-red-500"
                            >
                                <X size={12} />
                            </button>
                        </div>
                    )}
                </div>
            ))}
        </div>
      )}

      {/* Input */}
      <div className="p-2 border-t border-gray-100 bg-white relative">
        {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 bg-white shadow-xl rounded-lg border border-gray-200 p-2 grid grid-cols-6 gap-1 w-64 h-40 overflow-y-auto z-10">
                {EMOJI_LIST.map(emoji => (
                    <button 
                        key={emoji}
                        onClick={() => handleSelectEmoji(emoji)}
                        className="text-xl hover:bg-gray-100 rounded p-1"
                    >
                        {emoji}
                    </button>
                ))}
            </div>
        )}

        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <div className="flex gap-1 text-gray-400">
             <input 
                type="file" 
                multiple 
                className="hidden" 
                ref={fileInputRef}
                onChange={handleFileSelect}
             />
             <button 
                type="button" 
                className="p-1 hover:text-primary"
                onClick={() => fileInputRef.current?.click()}
                title="Đính kèm file (Max 25MB)"
             >
                <Paperclip size={18} />
             </button>
             <button 
                type="button" 
                className={`p-1 hover:text-primary ${showEmojiPicker ? 'text-primary' : ''}`}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
             >
                <Smile size={18} />
             </button>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPaste={handlePaste}
            placeholder="Nhập tin nhắn..."
            className="flex-1 bg-gray-100 border-none rounded-full px-3 py-1.5 text-sm focus:ring-1 focus:ring-primary focus:bg-white transition-colors"
          />
          <button 
            type="submit" 
            disabled={(!inputText.trim() && selectedFiles.length === 0) || isUploading}
            className="p-1.5 text-primary hover:bg-blue-50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </form>
      </div>
      </>
      )}
    </div>
  );
};

export default ChatPopup;
