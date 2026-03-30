import express from 'express';
import {
  getGroups,
  getMessages,
  sendMessage,
  markAsRead,
  createGroup,
  createPrivateChat,
  getPrivateChat,
  getChatUsers,
  addMembersToGroup,
  getUnreadCount,
  getGroupDetails,
  updateGroupSettings,
  uploadGroupAvatar,
  getGroupAttachments,
  getChatAttachment,
  createMemberRequests,
  listMemberRequests,
  approveMemberRequest,
  rejectMemberRequest,
  updateGroupMember,
  removeMember,
  transferOwnership,
  dissolveGroup,
  deleteConversation,
  updateChatBackground,
  getMyChatSettings,
  togglePinConversation,
  createCallMessage
} from '../controllers/chatController';
import { authenticate } from '../middleware/authMiddleware';
import { chatUploadMiddleware } from '../middleware/chatUploadMiddleware';
import { imageUploadMiddleware, processAvatar } from '../middleware/imageUploadMiddleware';

const router = express.Router();

router.use(authenticate);

router.get('/unread', getUnreadCount);

router.get('/groups', getGroups);
router.get('/groups/:groupId', getGroupDetails);
router.get('/groups/:groupId/messages', getMessages);

router.post('/groups/:groupId/members', addMembersToGroup);
router.put('/groups/:groupId/settings', updateGroupSettings);
router.put('/groups/:groupId/background', updateChatBackground);
router.put('/groups/:groupId/pin', togglePinConversation);
router.get('/groups/:groupId/my-settings', getMyChatSettings);
router.post(
  '/groups/:groupId/avatar',
  imageUploadMiddleware.single('avatar'),
  processAvatar,
  uploadGroupAvatar
);

router.get('/groups/:groupId/attachments', getGroupAttachments);
router.get('/attachments/:filename', getChatAttachment);

router.post('/groups/:groupId/member-requests', createMemberRequests);
router.get('/groups/:groupId/member-requests', listMemberRequests);
router.post('/groups/:groupId/member-requests/:requestId/approve', approveMemberRequest);
router.post('/groups/:groupId/member-requests/:requestId/reject', rejectMemberRequest);

router.put('/groups/:groupId/members/:memberId', updateGroupMember);
router.delete('/groups/:groupId/members/:memberId', removeMember);

router.post('/groups/:groupId/transfer-ownership', transferOwnership);
router.delete('/groups/:groupId', deleteConversation);

router.post('/messages', chatUploadMiddleware.array('files'), sendMessage);
router.post('/messages/read', markAsRead);
router.post('/messages/call', createCallMessage);

router.post('/groups', createGroup);
router.post('/private', createPrivateChat);
router.get('/private/:targetUserId', getPrivateChat);

router.get('/users', getChatUsers);

export default router;
