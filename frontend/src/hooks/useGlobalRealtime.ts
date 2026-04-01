import { useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import { useNotificationStore } from '../context/useNotificationStore';
import { useDataStore } from '../context/useDataStore';

/**
 * Global hook to handle system-wide real-time updates.
 * This should be used in a high-level layout component.
 */
export const useGlobalRealtime = () => {
  const { socket } = useChat();
  const { fetchUnreadCount, handleNewLead } = useNotificationStore();
  const { fetchNotifications: fetchAdminNotifications, fetchCustomerStats } = useDataStore();

  useEffect(() => {
    if (!socket) return;

    // Handle generic data change events from Prisma middleware
    const handleDataChange = (data: { entity: string; action: string }) => {
      console.log(`[GlobalRealtime] Data change detected: ${data.entity}:${data.action}`);
      
      switch (data.entity) {
        case 'Notification':
          fetchUnreadCount();
          fetchAdminNotifications();
          break;
        case 'Customer':
        case 'CustomerStatus':
          // We don't necessarily want to refresh EVERYTHING every time, 
          // but for global stats/counts, it's useful.
          fetchCustomerStats();
          break;
        case 'Employee':
          // Could refresh current user info if needed
          break;
        case 'ChatMessage':
          // Handled by specific chat logic usually, but we can trigger unread refresh
          break;
      }
    };

    // Chat specific updates
    const handleChatUpdate = () => {
      // Trigger a custom event or call a function to refresh unread chat count
      // This is often handled within the Header component currently
      window.dispatchEvent(new CustomEvent('hcrm_chat_unread_refresh'));
    };

    socket.on('data_change', handleDataChange);
    socket.on('new_message', handleChatUpdate);
    socket.on('message_read', handleChatUpdate);
    socket.on('new_lead', handleNewLead);
    socket.on('notification:new', () => fetchUnreadCount());

    return () => {
      socket.off('data_change', handleDataChange);
      socket.off('new_message', handleChatUpdate);
      socket.off('message_read', handleChatUpdate);
      socket.off('new_lead', handleNewLead);
      socket.off('notification:new');
    };
  }, [socket, fetchUnreadCount, handleNewLead, fetchAdminNotifications, fetchCustomerStats]);
};
