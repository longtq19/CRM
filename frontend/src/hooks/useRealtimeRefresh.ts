import { useEffect } from 'react';
import { useChat } from '../context/ChatContext';

/**
 * Hook to automatically trigger a refresh function when a specific entity is updated in the backend.
 * 
 * @param entity The name of the Prisma model to watch (e.g., 'Customer', 'Order')
 * @param refreshFn The function to call when an update is detected
 */
export const useRealtimeRefresh = (entity: string | string[], refreshFn: () => void) => {
  const { socket } = useChat();

  useEffect(() => {
    if (!socket) return;

    const handleDataChange = (data: { entity: string; action: string }) => {
      const entities = Array.isArray(entity) ? entity : [entity];
      if (entities.includes(data.entity) || entities.includes('all')) {
        console.log(`[RealtimeRefresh] Detected change in ${data.entity}, refreshing...`);
        refreshFn();
      }
    };

    socket.on('data_change', handleDataChange);
    
    return () => {
      socket.off('data_change', handleDataChange);
    };
  }, [socket, entity, refreshFn]);
};
