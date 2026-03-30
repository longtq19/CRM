import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { getIO } from '../socket';
import path from 'path';
import fs from 'fs';
import { getRootDir } from '../utils/pathHelper';
import { toPublicUploadUrl } from '../config/publicUploadUrl';
import { ensureCompanyChatGroupForEmployee, syncCompanyChatGroupMembers } from './hrController';

const SUPER_ADMIN_PHONE = '0977350931';

const isOwnerRole = (role: string) => role === 'OWNER' || role === 'ADMIN';
const isCoOwnerRole = (role: string) => role === 'CO_OWNER';

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
};

const normalizeMimeType = (mimeType: string | null | undefined, nameOrUrl: string) => {
  const raw = (mimeType || '').toLowerCase();
  if (raw.startsWith('image/')) return raw;

  const base = (nameOrUrl || '').split('?')[0].split('#')[0];
  const ext = path.extname(base).toLowerCase();
  const inferred = IMAGE_MIME_BY_EXT[ext];
  if (!inferred) return raw || 'application/octet-stream';
  return inferred;
};

const ensureSuperAdminOwnership = async (userId: string) => {
  const employee = await prisma.employee.findUnique({
    where: { id: userId }
  });

  if (!employee || employee.phone !== SUPER_ADMIN_PHONE) {
    return;
  }

  const targetGroups = await prisma.chatGroup.findMany({
    where: {
      name: {
        in: ['K-VENTURES I OFFICE', 'Công ty Kagri Tech']
      }
    },
    select: { id: true }
  });

  if (!targetGroups.length) {
    return;
  }

  await prisma.chatMember.updateMany({
    where: {
      employeeId: userId,
      groupId: { in: targetGroups.map(g => g.id) }
    },
    data: { role: 'OWNER' }
  });
};

export const getGroups = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  try {
    // Self-healing: đảm bảo user hiện tại luôn có mặt trong nhóm công ty.
    await ensureCompanyChatGroupForEmployee(userId);
    // Nếu user là admin (OWNER ở nhóm công ty), đồng bộ toàn bộ membership theo nghiệp vụ.
    await ensureSuperAdminOwnership(userId);
    const ownerMembership = await prisma.chatMember.findFirst({
      where: { employeeId: userId, role: 'OWNER' },
      include: { group: { select: { name: true } } },
    });
    if (ownerMembership?.group?.name === 'K-VENTURES I OFFICE' || ownerMembership?.group?.name === 'Công ty Kagri Tech') {
      await syncCompanyChatGroupMembers();
    }

    const memberships = await prisma.chatMember.findMany({
      where: { employeeId: userId },
      include: {
        group: {
          include: {
            members: {
              include: { employee: { select: { id: true, fullName: true, avatarUrl: true, isOnline: true, lastActiveAt: true } } }
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: { sender: { select: { fullName: true } }, attachments: true }
            }
          }
        }
      }
    });

    const groupsWithUnread = await Promise.all(memberships.map(async (m) => {
        const group = m.group;
        let lastReadTime = m.joinedAt;

        if (m.lastReadMessageId) {
            const lastReadMsg = await prisma.chatMessage.findUnique({
                where: { id: m.lastReadMessageId },
                select: { createdAt: true }
            });
            if (lastReadMsg) {
                lastReadTime = lastReadMsg.createdAt;
            }
        }
        
        // Count unread messages created AFTER the last read message
        const unreadCount = await prisma.chatMessage.count({
            where: {
                groupId: group.id,
                senderId: { not: userId }, // Messages not sent by me
                createdAt: { gt: lastReadTime }
            }
        });

        return {
            ...group,
            lastMessage: group.messages[0] || null,
            unreadCount,
            isPinned: m.isPinned,
            pinnedAt: m.pinnedAt,
            messages: undefined
        };
    }));

    // Sort: Pinned first (by pinnedAt desc), then by last message time
    const sortedGroups = groupsWithUnread
        .filter(g => {
            if (g.type === 'PRIVATE') {
                return g.members.length === 2;
            }
            return true;
        })
        .sort((a, b) => {
            // Pinned conversations first
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            
            // If both pinned, sort by pinnedAt
            if (a.isPinned && b.isPinned) {
                const pinnedA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
                const pinnedB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
                return pinnedB - pinnedA;
            }
            
            // Otherwise sort by last message time
            const timeA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : new Date(a.createdAt).getTime();
            const timeB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : new Date(b.createdAt).getTime();
            return timeB - timeA;
        });
    
    res.json(sortedGroups);
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ message: 'Error fetching groups', error });
  }
};

export const getMessages = async (req: Request, res: Response) => {
  const { groupId } = req.params;
  const { limit = 50, before } = req.query;
  const userId = (req as any).user.id;

  try {
    // 1. Check if user is a member of the group
    const membership = await prisma.chatMember.findFirst({
        where: { groupId: groupId as string, employeeId: userId }
    });
    if (!membership) {
        return res.status(403).json({ message: 'Bạn không có quyền truy cập cuộc trò chuyện này' });
    }

    // 2. Fetch messages
    const messages = await prisma.chatMessage.findMany({
      where: { 
        groupId: groupId as string,
        createdAt: before ? { lt: new Date(before as string) } : undefined
      },
      take: Number(limit),
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true
      }
    });

    // 3. Get read status information
    // Fetch all members of the group to know their last read status
    const groupMembers = await prisma.chatMember.findMany({
        where: { groupId: groupId as string },
        select: { 
            employeeId: true, 
            lastReadMessageId: true,
            updatedAt: true,
            employee: { select: { id: true, fullName: true, avatarUrl: true } }
        }
    });

    // Get the createdAt times for all lastReadMessageIds involved
    const lastReadIds = groupMembers.map(m => m.lastReadMessageId).filter(id => id !== null) as string[];
    const lastReadMessages = await prisma.chatMessage.findMany({
        where: { id: { in: lastReadIds } },
        select: { id: true, createdAt: true }
    });
    
    // Map memberId -> readUpToTime
    const memberReadMap = new Map<string, number>();
    groupMembers.forEach(m => {
        if (m.lastReadMessageId) {
            const msg = lastReadMessages.find(msg => msg.id === m.lastReadMessageId);
            if (msg) {
                memberReadMap.set(m.employeeId, new Date(msg.createdAt).getTime());
            }
        }
    });

    // 4. Construct response
    const formattedMessages = messages.map(msg => {
        const msgTime = new Date(msg.createdAt).getTime();
        
        // Find members who have read this message (readUpToTime >= msgTime)
        // Also exclude sender (optional, but frontend usually filters sender anyway)
        const readBy = groupMembers
            .filter(m => {
                const readTime = memberReadMap.get(m.employeeId);
                return readTime && readTime >= msgTime;
            })
            .map(m => ({
                userId: m.employeeId,
                readAt: m.updatedAt, // Use actual read timestamp from member record
                user: m.employee
            }));

        return {
            ...msg,
            attachments: (msg.attachments || []).map(att => ({
                ...att,
                fileType: normalizeMimeType(att.fileType, att.fileName || att.fileUrl)
            })),
            readBy
        };
    });

    res.json(formattedMessages.reverse());
  } catch (error) {
    res.status(500).json({ message: 'Error fetching messages', error });
  }
};

export const sendMessage = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId, content, type } = req.body;
  const files = (req as any).files as Express.Multer.File[];

  try {
    const message = await prisma.chatMessage.create({
      data: {
        groupId,
        senderId: userId,
        content,
        type: type || 'TEXT',
        attachments: files?.length ? {
          create: files.map(file => ({
            fileName: file.originalname,
            fileUrl: `/uploads/chat/${file.filename}`,
            fileSize: file.size,
            fileType: normalizeMimeType(file.mimetype, file.originalname || file.filename)
          }))
        } : undefined
      },
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true
      }
    });

    // Emit socket event
    try {
        const io = getIO();
        io.to(groupId).emit('new_message', message);
    } catch (e) {
        console.error('Socket emit failed:', e);
    }

    res.json(message);
  } catch (error) {
    res.status(500).json({ message: 'Error sending message', error });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { messageId, groupId } = req.body;

    try {
        let targetMessageId = messageId;
        let targetGroupId = groupId;

        if (groupId && !messageId) {
            // Find the latest message in the group
            const latestMessage = await prisma.chatMessage.findFirst({
                where: { groupId: groupId as string },
                orderBy: { createdAt: 'desc' },
                select: { id: true }
            });

            if (!latestMessage) {
                return res.json({ success: true, message: 'No messages to mark as read' });
            }
            targetMessageId = latestMessage.id;
        } else if (messageId) {
            const msg = await prisma.chatMessage.findUnique({
                where: { id: messageId },
                select: { groupId: true }
            });
            if (msg) targetGroupId = msg.groupId;
        }

        if (!targetMessageId || !targetGroupId) {
            return res.status(400).json({ message: 'Invalid request' });
        }

        // Update ChatMember's lastReadMessageId
        // We use updateMany to avoid error if member doesn't exist (though they should)
        // or findUnique then update.
        // Also check if the new message is actually newer?
        // For simplicity, we assume the frontend sends the latest read message.
        // Or we can just update it.
        
        await prisma.chatMember.update({
            where: {
                groupId_employeeId: {
                    groupId: targetGroupId,
                    employeeId: userId
                }
            },
            data: {
                lastReadMessageId: targetMessageId
            }
        });

        // Emit read event for the target message
        try {
            const io = getIO();
            const user = await prisma.employee.findUnique({
                where: { id: userId },
                select: { id: true, fullName: true, avatarUrl: true }
            });
            
            io.to(targetGroupId).emit('message_read', { 
                messageId: targetMessageId, 
                userId, 
                user, 
                groupId: targetGroupId 
            });
        } catch (e) {
            console.error('Socket emit failed:', e);
        }

        res.json({ success: true, lastReadMessageId: targetMessageId });
    } catch (error) {
        // If record not found, it might be that user is not in group?
        console.error('Error marking as read:', error);
        res.status(500).json({ message: 'Error marking as read', error });
    }
};

export const createGroup = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { name, memberIds } = req.body; // memberIds: string[]

    try {
        console.log('createGroup called with:', { userId, name, memberIds });
        const createData: any = {
            name,
            type: 'GROUP',
            members: {
                create: [
                    { employeeId: userId, role: 'OWNER' },
                    ...(memberIds || []).map((id: string) => ({
                        employeeId: id,
                        role: 'MEMBER'
                    }))
                ]
            }
        };

        const group = await prisma.chatGroup.create({
            data: createData,
            include: {
                members: {
                    include: {
                        employee: {
                            select: { id: true, fullName: true, avatarUrl: true }
                        }
                    }
                }
            }
        });
        
        // Emit event to notify members about new group
        try {
             const io = getIO();
             const memberIdsToNotify = [userId, ...(memberIds || [])];
             
             memberIdsToNotify.forEach((mid: string) => {
                 io.to(mid).emit('group_created', group);
             });
        } catch (e) {
            console.error('Socket emit failed:', e);
        }

        res.json(group);
    } catch (error) {
        console.error('Error creating group:', error);
        res.status(500).json({ message: 'Error creating group' });
    }
};

export const createPrivateChat = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { targetUserId } = req.body;
    
    try {
        // Optimize: Find existing private chat directly via DB query
        const existing = await prisma.chatGroup.findFirst({
            where: { 
                type: 'PRIVATE', 
                AND: [
                    { members: { some: { employeeId: userId } } },
                    { members: { some: { employeeId: targetUserId } } }
                ]
            },
            include: { members: { include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } } } }
        });
        
        if (existing) {
             return res.json(existing);
        }
        
        // Create new
        const newGroup = await prisma.chatGroup.create({
            data: {
                name: 'Private Chat',
                type: 'PRIVATE',
                members: {
                    create: [
                        { employeeId: userId },
                        { employeeId: targetUserId }
                    ]
                }
            },
            include: { members: { include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } } } }
        });
        
        // Notify
        try {
            const io = getIO();
            io.to(userId).emit('group_created', newGroup);
            io.to(targetUserId).emit('group_created', newGroup);
        } catch (e) { console.error(e); }

        res.json(newGroup);
    } catch (error) {
        res.status(500).json({ message: 'Error creating private chat', error });
    }
};

export const getPrivateChat = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    const { targetUserId } = req.params;

    try {
        const groups = await prisma.chatGroup.findMany({
            where: {
                type: 'PRIVATE',
                members: { some: { employeeId: userId } }
            },
            include: { members: true }
        });

        const existing = groups.find(g => g.members.some(m => m.employeeId === targetUserId));

        if (existing) {
             const fullGroup = await prisma.chatGroup.findUnique({
                where: { id: existing.id },
                include: { members: { include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } } } }
             });
             return res.json(fullGroup);
        }

        res.status(404).json({ message: 'Private chat not found' });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching private chat', error });
    }
};

export const getChatUsers = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        const users = await prisma.employee.findMany({
            where: { 
                id: { not: userId },
                // status: { code: 'WORKING' } // Optional: filter active
            },
            select: { id: true, fullName: true, avatarUrl: true, department: { select: { name: true } } }
        });
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chat users', error });
    }
};

export const addMembersToGroup = async (req: Request, res: Response) => {
    const { groupId } = req.params;
    const { memberIds } = req.body;
    
    try {
        const userId = (req as any).user.id;
        const currentMember = await prisma.chatMember.findFirst({
            where: { groupId: groupId as string, employeeId: userId }
        });
        if (!currentMember || (!isOwnerRole(currentMember.role) && !isCoOwnerRole(currentMember.role))) {
            return res.status(403).json({ message: 'Chỉ Trưởng nhóm hoặc Phó nhóm được thêm thành viên trực tiếp' });
        }

        await prisma.chatMember.createMany({
            data: memberIds.map((id: string) => ({ groupId: groupId as string, employeeId: id, role: 'MEMBER' })),
            skipDuplicates: true
        });
        
        const group = await prisma.chatGroup.findUnique({
            where: { id: groupId as string },
            include: { members: { include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } } } }
        });
        
        try {
            const io = getIO();
            io.to(groupId as string).emit('group_updated', group);
            memberIds.forEach((mid: string) => io.to(mid).emit('group_created', group));
        } catch (e) { console.error(e); }
        
        res.json(group);
    } catch (error) {
        res.status(500).json({ message: 'Error adding members', error });
    }
};

export const getUnreadCount = async (req: Request, res: Response) => {
    const userId = (req as any).user.id;
    try {
        // Find all groups user is part of
        const memberships = await prisma.chatMember.findMany({
            where: { employeeId: userId },
            select: { 
                groupId: true, 
                lastReadMessageId: true, 
                joinedAt: true 
            }
        });

        // Resolve last read message timestamps
        const lastReadMessageIds = memberships
            .map(m => m.lastReadMessageId)
            .filter(id => id !== null) as string[];

        const lastReadMessages = await prisma.chatMessage.findMany({
            where: { id: { in: lastReadMessageIds } },
            select: { id: true, createdAt: true }
        });

        const messageTimeMap = new Map<string, Date>();
        lastReadMessages.forEach(msg => {
            messageTimeMap.set(msg.id, msg.createdAt);
        });

        // Calculate unread for each group
        const unreadCounts = await Promise.all(memberships.map(async (m) => {
            let lastReadTime = m.joinedAt;
            if (m.lastReadMessageId && messageTimeMap.has(m.lastReadMessageId)) {
                lastReadTime = messageTimeMap.get(m.lastReadMessageId)!;
            }

            return await prisma.chatMessage.count({
                where: {
                    groupId: m.groupId,
                    senderId: { not: userId },
                    createdAt: { gt: lastReadTime }
                }
            });
        }));

        const totalUnread = unreadCounts.reduce((a, b) => a + b, 0);
        res.json({ count: totalUnread });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ message: 'Error fetching unread count' });
    }
};

export const getGroupDetails = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;

  try {
    await ensureSuperAdminOwnership(userId);

    const membership = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!membership) {
      return res.status(403).json({ message: 'Bạn không thuộc nhóm này' });
    }

    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId as string },
      include: {
        members: {
          include: {
            employee: { 
              select: { 
                id: true, 
                fullName: true, 
                avatarUrl: true,
                isOnline: true,
                code: true
              } 
            }
          },
          orderBy: { joinedAt: 'asc' }
        },
        memberRequests: {
          where: { status: 'PENDING' },
          include: {
            requester: { select: { id: true, fullName: true, avatarUrl: true } },
            targetEmployee: { select: { id: true, fullName: true, avatarUrl: true } }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: 'Nhóm không tồn tại' });
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching group details', error });
  }
};

export const updateGroupSettings = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;
  const { name, backgroundColor } = req.body;

  try {
    const currentMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!currentMember || (!isOwnerRole(currentMember.role) && !isCoOwnerRole(currentMember.role))) {
      return res.status(403).json({ message: 'Chỉ Trưởng nhóm hoặc Phó nhóm được phép chỉnh sửa nhóm' });
    }

    const data: any = {};
    if (typeof name === 'string' && name.trim()) {
      data.name = name.trim();
    }
    if (typeof backgroundColor === 'string' && backgroundColor.trim()) {
      data.backgroundColor = backgroundColor.trim();
    }

    const group = await prisma.chatGroup.update({
      where: { id: groupId as string },
      data,
      include: {
        members: {
          include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } }
        }
      }
    });

    try {
      const io = getIO();
      io.to(groupId as string).emit('group_updated', group);
    } catch (e) {
      console.error(e);
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error updating group', error });
  }
};

export const uploadGroupAvatar = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;

  if (!req.file) {
    return res.status(400).json({ message: 'Chưa chọn file tải lên' });
  }

  try {
    const currentMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!currentMember || (!isOwnerRole(currentMember.role) && !isCoOwnerRole(currentMember.role))) {
      return res.status(403).json({ message: 'Chỉ Trưởng nhóm hoặc Phó nhóm được phép đổi ảnh nhóm' });
    }

    const fileUrl = `/uploads/avatars/${req.file.filename}`;

    const group = await prisma.chatGroup.update({
      where: { id: groupId as string },
      data: { avatarUrl: fileUrl },
      include: {
        members: {
          include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } }
        }
      }
    });

    try {
      const io = getIO();
      io.to(groupId as string).emit('group_updated', group);
    } catch (e) {
      console.error(e);
    }

    res.json({ url: toPublicUploadUrl(fileUrl), group });
  } catch (error) {
    res.status(500).json({ message: 'Error uploading group avatar', error });
  }
};

export const getGroupAttachments = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;
  const { type } = req.query;

  try {
    const membership = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!membership) {
      return res.status(403).json({ message: 'Bạn không thuộc nhóm này' });
    }

    const attachments = await prisma.chatAttachment.findMany({
      where: { message: { groupId: groupId as string } },
      include: {
        message: {
          include: {
            sender: { select: { id: true, fullName: true, avatarUrl: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const items: any[] = attachments.map(att => ({
      id: att.id,
      kind: normalizeMimeType(att.fileType, att.fileName || att.fileUrl).startsWith('image/') ? 'IMAGE' : 'FILE',
      name: att.fileName,
      url: toPublicUploadUrl(att.fileUrl),
      size: att.fileSize,
      mimeType: normalizeMimeType(att.fileType, att.fileName || att.fileUrl),
      createdAt: att.createdAt,
      sender: att.message.sender
    }));

    const messagesWithContent = await prisma.chatMessage.findMany({
      where: {
        groupId: groupId as string,
        content: { not: null }
      },
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    for (const msg of messagesWithContent) {
      const content = msg.content || '';
      const match = content.match(/https?:\/\/\S+/);
      if (!match) continue;
      items.push({
        id: msg.id,
        kind: 'LINK',
        name: content,
        url: match[0],
        size: null,
        mimeType: 'LINK',
        createdAt: msg.createdAt,
        sender: msg.sender
      });
    }

    const filterType = ((type as string) || 'ALL').toUpperCase();
    let filtered = items;
    if (filterType === 'IMAGE' || filterType === 'FILE' || filterType === 'LINK') {
      filtered = items.filter(it => it.kind === filterType);
    }

    res.json(filtered);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching attachments', error });
  }
};

export const getChatAttachment = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const filename = req.params.filename as string;

  try {
    // Find the attachment in DB to check permissions
    const attachment = await prisma.chatAttachment.findFirst({
      where: {
        fileUrl: `/uploads/chat/${filename}`
      },
      include: {
        message: {
          include: {
            group: {
              include: {
                members: true
              }
            }
          }
        }
      }
    });

    if (!attachment) {
      return res.status(404).json({ message: 'Không tìm thấy tệp đính kèm' });
    }

    // Check if user is a member of the group
    const isMember = attachment.message.group.members.some(m => m.employeeId === userId);
    if (!isMember) {
      return res.status(403).json({ message: 'Bạn không có quyền truy cập tệp này' });
    }

    // Serve the file
    const filePath = path.join(getRootDir(), 'uploads/chat', filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ message: 'Tệp không tồn tại trên hệ thống' });
    }
  } catch (error) {
    console.error('getChatAttachment error:', error);
    res.status(500).json({ message: 'Lỗi khi tải tệp đính kèm', error });
  }
};

export const createMemberRequests = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;
  const { memberIds } = req.body;

  try {
    const membership = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!membership) {
      return res.status(403).json({ message: 'Bạn không thuộc nhóm này' });
    }

    const targets = Array.isArray(memberIds) ? memberIds : [];
    if (targets.length === 0) {
      return res.status(400).json({ message: 'Không có thành viên nào' });
    }

    const existingMembers = await prisma.chatMember.findMany({
      where: {
        groupId: groupId as string,
        employeeId: { in: targets }
      },
      select: { employeeId: true }
    });
    const existingIds = new Set(existingMembers.map(m => m.employeeId));

    const pendingRequests = await prisma.chatMemberRequest.findMany({
      where: {
        groupId: groupId as string,
        targetEmployeeId: { in: targets },
        status: 'PENDING'
      },
      select: { targetEmployeeId: true }
    });
    const pendingIds = new Set(pendingRequests.map(r => r.targetEmployeeId));

    const toCreate = targets.filter((id: string) => !existingIds.has(id) && !pendingIds.has(id));

    const created: any[] = [];

    for (const targetId of toCreate) {
      const row = await prisma.chatMemberRequest.create({
        data: {
          groupId: groupId as string,
          requesterId: userId,
          targetEmployeeId: targetId
        }
      });
      created.push(row);
    }

    res.json(created);
  } catch (error) {
    res.status(500).json({ message: 'Error creating member requests', error });
  }
};

export const listMemberRequests = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;

  try {
    const currentMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!currentMember || !isOwnerRole(currentMember.role)) {
      return res.status(403).json({ message: 'Chỉ Trưởng nhóm được xem yêu cầu thành viên' });
    }

    const requests = await prisma.chatMemberRequest.findMany({
      where: {
        groupId: groupId as string,
        status: 'PENDING'
      },
      include: {
        requester: { select: { id: true, fullName: true, avatarUrl: true } },
        targetEmployee: { select: { id: true, fullName: true, avatarUrl: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching member requests', error });
  }
};

export const approveMemberRequest = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId, requestId } = req.params;

  try {
    const currentMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!currentMember || !isOwnerRole(currentMember.role)) {
      return res.status(403).json({ message: 'Chỉ Trưởng nhóm được duyệt yêu cầu' });
    }

    const requestRow = await prisma.chatMemberRequest.findUnique({
      where: { id: requestId as string }
    });

    if (!requestRow || requestRow.groupId !== groupId) {
      return res.status(404).json({ message: 'Yêu cầu không tồn tại' });
    }
    if (requestRow.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu đã được xử lý' });
    }

    await prisma.$transaction(async tx => {
      await tx.chatMember.upsert({
        where: {
          groupId_employeeId: {
            groupId: groupId as string,
            employeeId: requestRow.targetEmployeeId
          }
        },
        update: { role: 'MEMBER' },
        create: {
          groupId: groupId as string,
          employeeId: requestRow.targetEmployeeId,
          role: 'MEMBER'
        }
      });

      await tx.chatMemberRequest.update({
        where: { id: requestRow.id },
        data: { status: 'APPROVED' }
      });
    });

    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId as string },
      include: {
        members: {
          include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } }
        }
      }
    });

    try {
      const io = getIO();
      io.to(groupId as string).emit('group_updated', group);
    } catch (e) {
      console.error(e);
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error approving request', error });
  }
};

export const rejectMemberRequest = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId, requestId } = req.params;

  try {
    const currentMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!currentMember || !isOwnerRole(currentMember.role)) {
      return res.status(403).json({ message: 'Chỉ Trưởng nhóm được duyệt yêu cầu' });
    }

    const requestRow = await prisma.chatMemberRequest.findUnique({
      where: { id: requestId as string }
    });

    if (!requestRow || requestRow.groupId !== groupId) {
      return res.status(404).json({ message: 'Yêu cầu không tồn tại' });
    }

    if (requestRow.status !== 'PENDING') {
      return res.status(400).json({ message: 'Yêu cầu đã được xử lý' });
    }

    await prisma.chatMemberRequest.update({
      where: { id: requestId as string },
      data: { status: 'REJECTED' }
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error rejecting request', error });
  }
};

export const updateGroupMember = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId, memberId } = req.params;
  const { nickname, role } = req.body;

  try {
    const currentMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!currentMember) {
      return res.status(403).json({ message: 'Bạn không thuộc nhóm này' });
    }

    const targetMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: memberId as string }
    });
    if (!targetMember) {
      return res.status(404).json({ message: 'Thành viên không tồn tại trong nhóm' });
    }

    const data: any = {};
    if (typeof nickname === 'string') {
      const trimmed = nickname.trim();
      data.nickname = trimmed || null;
    }

    if (role) {
      if (!isOwnerRole(currentMember.role)) {
        return res.status(403).json({ message: 'Chỉ Trưởng nhóm được phân quyền thành viên' });
      }
      if (role === 'OWNER') {
        return res.status(400).json({ message: 'Vui lòng dùng chức năng chuyển quyền Trưởng nhóm' });
      }
      if (isOwnerRole(targetMember.role) && memberId !== userId) {
        return res.status(400).json({ message: 'Không thể thay đổi quyền của Trưởng nhóm' });
      }
      data.role = role;
    }

    if (Object.keys(data).length === 0) {
      return res.json(targetMember);
    }

    await prisma.chatMember.update({
      where: { id: targetMember.id },
      data
    });

    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId as string },
      include: {
        members: {
          include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } }
        }
      }
    });

    try {
      const io = getIO();
      io.to(groupId as string).emit('group_updated', group);
    } catch (e) {
      console.error(e);
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error updating member', error });
  }
};

export const removeMember = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId, memberId } = req.params;

  try {
    const currentMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!currentMember) {
      return res.status(403).json({ message: 'Bạn không thuộc nhóm này' });
    }

    const targetMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: memberId as string }
    });
    if (!targetMember) {
      return res.status(404).json({ message: 'Thành viên không tồn tại trong nhóm' });
    }

    const currentIsOwner = isOwnerRole(currentMember.role);
    const currentIsCoOwner = isCoOwnerRole(currentMember.role);
    if (!currentIsOwner && !currentIsCoOwner) {
      return res.status(403).json({ message: 'Chỉ Trưởng nhóm hoặc Phó nhóm được xóa thành viên' });
    }

    if (isOwnerRole(targetMember.role)) {
      if (!currentIsOwner || memberId === userId) {
        return res.status(403).json({ message: 'Không thể xóa Trưởng nhóm khỏi nhóm' });
      }
    }

    if (memberId === userId && currentIsOwner) {
      return res.status(400).json({ message: 'Trưởng nhóm cần chuyển quyền trước khi rời nhóm' });
    }

    await prisma.chatMember.delete({
      where: { id: targetMember.id }
    });

    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId as string },
      include: {
        members: {
          include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } }
        }
      }
    });

    try {
      const io = getIO();
      io.to(groupId as string).emit('group_updated', group);
    } catch (e) {
      console.error(e);
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error removing member', error });
  }
};

export const transferOwnership = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;
  const { targetEmployeeId } = req.body;

  try {
    const currentMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });
    if (!currentMember || !isOwnerRole(currentMember.role)) {
      return res.status(403).json({ message: 'Chỉ Trưởng nhóm được chuyển quyền' });
    }

    const targetMember = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: targetEmployeeId }
    });
    if (!targetMember) {
      return res.status(404).json({ message: 'Thành viên không tồn tại trong nhóm' });
    }

    await prisma.$transaction(async tx => {
      await tx.chatMember.update({
        where: { id: currentMember.id },
        data: { role: 'MEMBER' }
      });

      await tx.chatMember.update({
        where: { id: targetMember.id },
        data: { role: 'OWNER' }
      });
    });

    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId as string },
      include: {
        members: {
          include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } }
        }
      }
    });

    try {
      const io = getIO();
      io.to(groupId as string).emit('group_updated', group);
    } catch (e) {
      console.error(e);
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: 'Error transferring ownership', error });
  }
};

import { logAudit, getAuditUser } from '../utils/auditLog';

// Cập nhật màu nền cuộc trò chuyện (áp dụng cho tất cả thành viên)
export const updateChatBackground = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;
  const { backgroundColor } = req.body;

  try {
    // Kiểm tra user có trong cuộc trò chuyện không
    const membership = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });

    if (!membership) {
      return res.status(403).json({ message: 'Bạn không thuộc cuộc trò chuyện này' });
    }

    // Cập nhật màu nền cho group (áp dụng cho tất cả)
    const updatedGroup = await prisma.chatGroup.update({
      where: { id: groupId as string },
      data: {
        backgroundColor: backgroundColor || null
      },
      include: {
        members: {
          include: { employee: { select: { id: true, fullName: true, avatarUrl: true } } }
        }
      }
    });

    // Emit socket event để tất cả thành viên nhận được cập nhật
    try {
      const io = getIO();
      io.to(groupId as string).emit('background_updated', { 
        groupId, 
        backgroundColor: updatedGroup.backgroundColor 
      });
      io.to(groupId as string).emit('group_updated', updatedGroup);
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    res.json({ 
      success: true, 
      backgroundColor: updatedGroup.backgroundColor,
      message: 'Đã cập nhật màu nền'
    });
  } catch (error) {
    console.error('Update chat background error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật màu nền' });
  }
};

// Lấy cài đặt cuộc trò chuyện
export const getMyChatSettings = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;

  try {
    const membership = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId },
      include: {
        group: {
          select: { backgroundColor: true }
        }
      }
    });

    if (!membership) {
      return res.status(404).json({ message: 'Không tìm thấy' });
    }

    res.json({
      nickname: membership.nickname,
      backgroundColor: membership.group.backgroundColor,
      isPinned: membership.isPinned
    });
  } catch (error) {
    res.status(500).json({ message: 'Lỗi khi lấy cài đặt' });
  }
};

// Ghim/Bỏ ghim cuộc trò chuyện
export const togglePinConversation = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;
  const { isPinned } = req.body;

  try {
    const membership = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });

    if (!membership) {
      return res.status(404).json({ message: 'Không tìm thấy cuộc trò chuyện' });
    }

    const updated = await prisma.chatMember.update({
      where: { id: membership.id },
      data: {
        isPinned: isPinned,
        pinnedAt: isPinned ? new Date() : null
      }
    });

    res.json({ 
      success: true, 
      isPinned: updated.isPinned,
      message: isPinned ? 'Đã ghim cuộc trò chuyện' : 'Đã bỏ ghim cuộc trò chuyện'
    });
  } catch (error) {
    console.error('Error toggling pin:', error);
    res.status(500).json({ message: 'Lỗi khi ghim/bỏ ghim cuộc trò chuyện' });
  }
};

export const dissolveGroup = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId } = req.params;

  try {
    const membership = await prisma.chatMember.findFirst({
      where: { groupId: groupId as string, employeeId: userId }
    });

    if (!membership || !isOwnerRole(membership.role)) {
      return res.status(403).json({ message: 'Chỉ Trưởng nhóm mới được giải tán nhóm' });
    }

    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId as string }
    });

    if (!group) {
      return res.status(404).json({ message: 'Nhóm không tồn tại' });
    }

    if (group.type !== 'GROUP') {
      return res.status(400).json({ message: 'Chỉ có thể giải tán nhóm, không áp dụng cho chat riêng' });
    }

    await prisma.chatGroup.delete({
      where: { id: groupId as string }
    });

    try {
      const io = getIO();
      io.to(groupId as string).emit('group_dissolved', { groupId });
    } catch (e) {
      console.error(e);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: 'Error dissolving group', error });
  }
};

export const deleteConversation = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const permissions = (req as any).user.permissions || [];
  const { groupId } = req.params;

  try {
    if (!permissions.includes('DELETE_CONVERSATION') && !permissions.includes('FULL_ACCESS')) {
      return res.status(403).json({ message: 'Bạn không có quyền xóa cuộc trò chuyện.' });
    }

    const group = await prisma.chatGroup.findUnique({
      where: { id: groupId as string },
      include: {
        members: {
          include: { employee: true }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: 'Cuộc trò chuyện không tồn tại.' });
    }

    const auditUser = getAuditUser(req);

    // Perform deletion
    // Prisma delete cascade should handle related records if configured, 
    // but let's be explicit if needed or rely on schema.
    // Based on common patterns, we might need to delete related records first if not cascaded.
    
    await prisma.$transaction([
      prisma.chatReadStatus.deleteMany({ where: { message: { groupId: groupId as string } } }),
      prisma.chatAttachment.deleteMany({ where: { message: { groupId: groupId as string } } }),
      prisma.chatMessage.deleteMany({ where: { groupId: groupId as string } }),
      prisma.chatMemberRequest.deleteMany({ where: { groupId: groupId as string } }),
      prisma.chatMember.deleteMany({ where: { groupId: groupId as string } }),
      prisma.chatGroup.delete({ where: { id: groupId as string } })
    ]);

    // Log the action
    await logAudit({
      ...auditUser,
      action: 'DELETE',
      object: 'CONVERSATION',
      objectId: groupId as string,
      result: 'SUCCESS',
      details: `Đã xóa cuộc trò chuyện: ${group.name} (${group.type})`,
      req
    });

    try {
      const io = getIO();
      io.to(groupId as string).emit('conversation_deleted', { groupId });
    } catch (e) {
      console.error('Socket emit error:', e);
    }

    res.json({ success: true, message: 'Đã xóa cuộc trò chuyện thành công.' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ message: 'Lỗi khi xóa cuộc trò chuyện.', error });
  }
};

// ─── Call History Message ───
export const createCallMessage = async (req: Request, res: Response) => {
  const userId = (req as any).user.id;
  const { groupId, duration, result, callType } = req.body;
  // result: 'completed' | 'missed' | 'rejected'
  // callType: 'video' | 'audio'

  if (!groupId || !result) {
    return res.status(400).json({ message: 'groupId and result are required' });
  }

  try {
    const callContent = JSON.stringify({ duration: duration || 0, result, callType: callType || 'video' });

    const message = await prisma.chatMessage.create({
      data: {
        groupId,
        senderId: userId,
        content: callContent,
        type: 'CALL',
      },
      include: {
        sender: { select: { id: true, fullName: true, avatarUrl: true } },
        attachments: true,
      },
    });

    try {
      const io = getIO();
      io.to(groupId).emit('new_message', message);
    } catch (e) {
      console.error('Socket emit failed:', e);
    }

    res.json(message);
  } catch (error) {
    console.error('Error creating call message:', error);
    res.status(500).json({ message: 'Error creating call message', error });
  }
};

