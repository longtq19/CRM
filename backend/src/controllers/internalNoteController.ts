import { Request, Response } from 'express';
import { internalNoteModel } from '../models/internalNoteModel';
import { logModel } from '../models/logModel';

export const getAllNotes = async (req: Request, res: Response) => {
  try {
    const notes = await internalNoteModel.findAll();
    res.json(notes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching internal notes', error });
  }
};

export const createNote = async (req: Request, res: Response) => {
  try {
    const newNote = await internalNoteModel.create(req.body);
    
    // Log system action
    const user = (req as any).user;
    await logModel.create({
      userId: user?.id || 'system',
      userName: user?.name || 'System',
      action: 'CREATE_NOTE',
      object: `InternalNote ${newNote.id}`,
      details: 'Created internal note',
      result: 'Thành công'
    });

    res.status(201).json(newNote);
  } catch (error) {
    res.status(500).json({ message: 'Error creating internal note', error });
  }
};

export const updateNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const updatedNote = await internalNoteModel.update(id, req.body);
    if (updatedNote) {
      // Log system action
      const user = (req as any).user;
      await logModel.create({
        userId: user?.id || 'system',
        userName: user?.name || 'System',
        action: 'UPDATE_NOTE',
        object: `InternalNote ${id}`,
        details: 'Updated internal note',
        result: 'Thành công'
      });

      res.json(updatedNote);
    } else {
      res.status(404).json({ message: 'Internal note not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error updating internal note', error });
  }
};

export const deleteNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id: string };
    const success = await internalNoteModel.delete(id);
    if (success) {
      // Log system action
      const user = (req as any).user;
      await logModel.create({
        userId: user?.id || 'system',
        userName: user?.name || 'System',
        userPhone: user?.phone,
        action: 'DELETE_NOTE',
        object: `InternalNote ${id}`,
        details: 'Deleted internal note',
        result: 'Thành công'
      });

      res.json({ message: 'Internal note deleted successfully' });
    } else {
      res.status(404).json({ message: 'Internal note not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error deleting internal note', error });
  }
};
