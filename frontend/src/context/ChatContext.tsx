import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_URL, getStoredAuthToken } from '../api/client';
import { useAuthStore } from './useAuthStore';

export type ChatUser = {
  id: string;
  fullName: string;
  avatarUrl?: string;
  isOnline?: boolean;
};

export type ChatSession = {
  id: string; // Group ID
  type?: 'PRIVATE' | 'GROUP';
  user?: ChatUser; // For direct messages
  groupName?: string; // For group messages
  avatarUrl?: string;
  minimized: boolean;
  isOpen: boolean;
};

interface ChatContextType {
  isChatListOpen: boolean;
  toggleChatList: () => void;
  openChats: ChatSession[];
  openChat: (chat: ChatSession) => void;
  closeChat: (chatId: string) => void;
  minimizeChat: (chatId: string) => void;
  restoreChat: (chatId: string) => void;
  socket: Socket | null;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuthStore();
  const [isChatListOpen, setIsChatListOpen] = useState(false);
  const [openChats, setOpenChats] = useState<ChatSession[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketNeeded, setSocketNeeded] = useState(false);

  // Kết nối socket khi user đăng nhập để nhận thông báo realtime (vd: new_lead từ API public)
  useEffect(() => {
    if (!user) return;
    setSocketNeeded(true);
  }, [user?.id]);

  // Socket: connect khi user có và socketNeeded (mặc định true khi đã login)
  useEffect(() => {
    if (!user || !socketNeeded) return;
    if (socket?.connected) return;

    const socketUrl = API_URL ? API_URL.replace('/api', '') : 'http://localhost:5000';
    const newSocket = io(socketUrl, {
      auth: { token: getStoredAuthToken() },
      transports: ['websocket', 'polling'],
      query: { userId: user.id }
    });

    newSocket.on('connect', () => {
      console.log('Chat Context Socket Connected:', newSocket.id);
    });

    newSocket.on('connect_error', (err) => {
      console.error('Chat Context Socket Connection Error:', err);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [user, socketNeeded]);

  const toggleChatList = () => {
    setSocketNeeded(true);
    setIsChatListOpen(prev => !prev);
  };

  const openChat = (chat: ChatSession) => {
    setSocketNeeded(true);
    setOpenChats(prev => {
      const isMobile = window.innerWidth < 768; // Check mobile breakpoint

      const existing = prev.find(c => c.id === chat.id);
      if (existing) {
        // If minimized, restore it
        if (existing.minimized) {
          const updated = { ...existing, minimized: false, isOpen: true };
          return isMobile ? [updated] : prev.map(c => c.id === chat.id ? updated : c);
        }
        
        // If already open and mobile, ensure it's the only one
        if (isMobile) {
            return [existing];
        }

        return prev;
      }

      // Add new chat
      if (isMobile) {
        // On mobile, only allow 1 chat open at a time
        return [chat];
      }

      let newChats = [...prev, chat];
      if (newChats.length > 3) {
        // Remove the oldest (first in array)
        newChats = newChats.slice(1);
      }
      return newChats;
    });
    setIsChatListOpen(false); // Close the list when opening a chat
  };

  const closeChat = (chatId: string) => {
    setOpenChats(prev => prev.filter(c => c.id !== chatId));
  };

  const minimizeChat = (chatId: string) => {
    setOpenChats(prev => prev.map(c => c.id === chatId ? { ...c, minimized: true } : c));
  };

  const restoreChat = (chatId: string) => {
    setOpenChats(prev => prev.map(c => c.id === chatId ? { ...c, minimized: false } : c));
  };

  return (
    <ChatContext.Provider value={{
      isChatListOpen,
      toggleChatList,
      openChats,
      openChat,
      closeChat,
      minimizeChat,
      restoreChat,
      socket
    }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
};
