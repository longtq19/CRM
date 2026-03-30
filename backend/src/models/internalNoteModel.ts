import { InternalNote as PrismaInternalNote } from '@prisma/client';
import { prisma } from '../config/database';

export interface InternalNote {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  date: string;
  relatedTo: string;
  customerId?: string;
}

export const internalNoteModel = {
  findAll: async () => {
    const notes = await prisma.internalNote.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    // Map to interface
    return notes.map(n => ({
      ...n,
      date: n.date.toISOString(),
      customerId: n.customerId || undefined
    }));
  },
  
  create: async (note: Omit<InternalNote, 'id'>) => {
    const newNote = await prisma.internalNote.create({
      data: {
        authorId: note.authorId,
        authorName: note.authorName,
        content: note.content,
        date: new Date(note.date),
        relatedTo: note.relatedTo,
        customerId: note.customerId
      }
    });

    return {
      ...newNote,
      date: newNote.date.toISOString(),
      customerId: newNote.customerId || undefined
    };
  },

  update: async (id: string, updates: Partial<InternalNote>) => {
    try {
      const updatedNote = await prisma.internalNote.update({
        where: { id },
        data: {
          ...updates,
          date: updates.date ? new Date(updates.date) : undefined
        }
      });
      
      return {
        ...updatedNote,
        date: updatedNote.date.toISOString(),
        customerId: updatedNote.customerId || undefined
      };
    } catch (error) {
      return null;
    }
  },

  delete: async (id: string) => {
    try {
      const deletedNote = await prisma.internalNote.delete({
        where: { id }
      });
      return {
        ...deletedNote,
        date: deletedNote.date.toISOString(),
        customerId: deletedNote.customerId || undefined
      };
    } catch (error) {
      return null;
    }
  }
};
