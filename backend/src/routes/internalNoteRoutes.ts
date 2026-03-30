import { Router } from 'express';
import * as internalNoteController from '../controllers/internalNoteController';
import { authMiddleware, checkPermission } from '../middleware/authMiddleware';

const router = Router();

router.get('/internal-notes', authMiddleware, checkPermission('MANAGE_INTERNAL_NOTES'), internalNoteController.getAllNotes);
router.post('/internal-notes', authMiddleware, checkPermission('MANAGE_INTERNAL_NOTES'), internalNoteController.createNote);
router.put('/internal-notes/:id', authMiddleware, checkPermission('MANAGE_INTERNAL_NOTES'), internalNoteController.updateNote);
router.delete('/internal-notes/:id', authMiddleware, checkPermission('MANAGE_INTERNAL_NOTES'), internalNoteController.deleteNote);

export default router;
