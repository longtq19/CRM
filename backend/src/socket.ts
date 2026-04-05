import { Server } from 'socket.io';
import { prisma } from './config/database';
import { AiService } from './modules/ai/ai.service';

let io: Server;

// For production with multiple instances, use Redis Adapter:
// import { createAdapter } from '@socket.io/redis-adapter';
// import { createClient } from 'redis';
// const pubClient = createClient({ url: 'redis://localhost:6379' });
// const subClient = pubClient.duplicate();
// io.adapter(createAdapter(pubClient, subClient));


export const initSocket = (serverIo: Server) => {
  io = serverIo;

  io.on('connection', async (socket) => {
    console.log('User connected:', socket.id);

    // Join user to their own room for notifications if userId is provided
    const userId = socket.handshake.query.userId as string;
    if (userId) {
      socket.join(userId);
      // Đồng bộ với emit `io.to(\`user:${id}\`)` (đơn hàng, nghỉ phép, …)
      socket.join(`user:${userId}`);
      console.log(`User ${userId} joined their private room.`);

      // Update online status (select chỉ các cột cần trả về để tránh lỗi khi DB chưa có is_locked)
      try {
        await prisma.employee.update({
          where: { id: userId },
          data: { isOnline: true, lastActiveAt: new Date() },
          select: { id: true, isOnline: true, lastActiveAt: true }
        });
        io.emit('user_status_update', { userId, isOnline: true, lastActiveAt: new Date() });
      } catch (e) {
        console.error('Failed to update online status on connect:', e);
      }
    }

    // Chat Group Logic
    socket.on('join_group', (groupId) => {
      socket.join(groupId);
      console.log(`Socket ${socket.id} joined group ${groupId}`);
    });

    socket.on('leave_group', (groupId) => {
      socket.leave(groupId);
      console.log(`Socket ${socket.id} left group ${groupId}`);
    });

    socket.on('typing', ({ groupId, userId, fullName }) => {
      socket.to(groupId).emit('user_typing', { userId, fullName });
    });

    socket.on('stop_typing', ({ groupId, userId }) => {
      socket.to(groupId).emit('user_stop_typing', { userId });
    });

    // ─── WebRTC Video Call Signaling ───
    socket.on('call:initiate', async (data: { groupId: string; callerId: string; callerName: string; callerAvatar?: string; callType: 'video' | 'audio' }) => {
      console.log(`[Call] ${data.callerName} initiating ${data.callType} call in group ${data.groupId}`);
      // Emit to group room (for Chat page sockets that joined the group)
      socket.to(data.groupId).emit('call:incoming', data);
      // Also emit to individual user rooms so GlobalCallHandler receives it on ANY page
      try {
        const members = await prisma.chatMember.findMany({
          where: { groupId: data.groupId },
          select: { employeeId: true },
        });
        for (const m of members) {
          if (m.employeeId !== data.callerId) {
            io.to(m.employeeId).emit('call:incoming', data);
          }
        }
      } catch (e) {
        console.error('[Call] Failed to notify members:', e);
      }
    });

    socket.on('call:accept', (data: { groupId: string; accepterId: string; accepterName: string }) => {
      console.log(`[Call] ${data.accepterName} accepted call in group ${data.groupId}`);
      socket.to(data.groupId).emit('call:accepted', data);
    });

    socket.on('call:reject', (data: { groupId: string; rejecterId: string; rejectorName: string }) => {
      console.log(`[Call] ${data.rejectorName} rejected call in group ${data.groupId}`);
      socket.to(data.groupId).emit('call:rejected', data);
    });

    socket.on('call:end', (data: { groupId: string; userId: string }) => {
      console.log(`[Call] User ${data.userId} ended call in group ${data.groupId}`);
      socket.to(data.groupId).emit('call:ended', data);
    });

    socket.on('call:offer', (data: { groupId: string; offer: RTCSessionDescriptionInit; fromUserId: string }) => {
      socket.to(data.groupId).emit('call:offer', data);
    });

    socket.on('call:answer', (data: { groupId: string; answer: RTCSessionDescriptionInit; fromUserId: string }) => {
      socket.to(data.groupId).emit('call:answer', data);
    });

    socket.on('call:ice-candidate', (data: { groupId: string; candidate: RTCIceCandidateInit; fromUserId: string }) => {
      socket.to(data.groupId).emit('call:ice-candidate', data);
    });

    // Zeno AI Logic - Stream response with Tool Access (MCP)
    socket.on('chat_message', async (data) => {
      console.log('Received chat_message from socket:', socket.id, data);
      const text = data.text || data; // handle object or string
      
      try {
        // Stream back using the AI Service
        for await (const chunk of AiService.streamChat(userId || 'system', text)) {
            socket.emit('stream_chunk', { chunk, isLast: false });
        }
        
        socket.emit('stream_chunk', { chunk: '', isLast: true });
        console.log('Finished streaming Zeno AI response to socket:', socket.id);
      } catch (error) {
        console.error('Error in Zeno AI chat_message handler:', error);
        socket.emit('stream_chunk', { 
          chunk: 'Hệ thống AI hiện chưa đáp ứng đầy đủ. Vui lòng kiểm tra API Key.', 
          isLast: true 
        });
      }
    });

    socket.on('disconnect', async () => {
      console.log('User disconnected:', socket.id);
      if (userId) {
          try {
              // Only update to offline if no other connections for this user exist?
              // Simple approach: just update to offline.
              // Better: Check if there are other sockets for the same userId
              const sockets = await io.in(`user:${userId}`).fetchSockets();
              if (sockets.length === 0) {
                  const lastActiveAt = new Date();
                  await prisma.employee.update({
                      where: { id: userId },
                      data: { isOnline: false, lastActiveAt },
                      select: { id: true, isOnline: true, lastActiveAt: true }
                  });
                  io.emit('user_status_update', { userId, isOnline: false, lastActiveAt });
              }
          } catch (e) {
              console.error('Failed to update offline status on disconnect:', e);
          }
      }
    });
  });
};

export const broadcastDataChange = (entity: string, action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SYNC', data?: any) => {
  if (!io) return;
  console.log(`Broadcasting data change: ${entity}:${action}`);
  io.emit('data_change', { entity, action, data });
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};
