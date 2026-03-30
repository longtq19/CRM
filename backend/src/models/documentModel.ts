import { Document as PrismaDocument } from '@prisma/client';
import { prisma } from '../config/database';

export interface Document {
  id: string;
  code: string;
  name: string;
  content?: string;
  type: string;
  uploadDate: string;
  size: string;
  uploadedBy: string;
  category: 'Hợp đồng' | 'Báo cáo' | 'Kỹ thuật' | 'Pháp lý' | 'Khác';
  path: string; // File path or URL
  description?: string;
  tags?: string[];
  version?: string;
  status?: 'active' | 'archived' | 'draft';
  createdAt: string;
  updatedAt: string;
}

const mapToInterface = (doc: PrismaDocument): Document => {
  let tags: string[] = [];
  if (doc.tags) {
    try {
      tags = JSON.parse(doc.tags);
    } catch (e) {
      // ignore
    }
  }

  return {
    id: doc.id,
    code: doc.code,
    name: doc.name,
    content: doc.content || undefined,
    type: doc.type,
    uploadDate: doc.uploadDate.toISOString(),
    size: doc.size || '',
    uploadedBy: doc.uploadedBy,
    category: doc.category as any,
    path: doc.path,
    // description: doc.description || undefined, // Not in schema
    tags: tags,
    version: doc.version || undefined,
    status: (doc.status as any) || undefined,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString()
  };
};

export const documentModel = {
  findAll: async () => {
    const docs = await prisma.document.findMany({
      orderBy: { uploadDate: 'desc' }
    });
    return docs.map(mapToInterface);
  },

  findById: async (id: string) => {
    const doc = await prisma.document.findUnique({ where: { id } });
    return doc ? mapToInterface(doc) : null;
  },

  create: async (doc: Omit<Document, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newDoc = await prisma.document.create({
      data: {
        code: doc.code,
        name: doc.name,
        content: doc.content,
        type: doc.type,
        uploadDate: new Date(doc.uploadDate),
        size: doc.size,
        uploadedBy: doc.uploadedBy,
        category: doc.category,
        path: doc.path,
        // description: doc.description, // Not in schema
        tags: doc.tags ? JSON.stringify(doc.tags) : undefined,
        version: doc.version,
        status: doc.status
      }
    });
    return mapToInterface(newDoc);
  },

  update: async (id: string, updates: Partial<Document>) => {
    try {
      const data: any = { ...updates };
      if (updates.uploadDate) data.uploadDate = new Date(updates.uploadDate);
      if (updates.tags) data.tags = JSON.stringify(updates.tags);

      const updatedDoc = await prisma.document.update({
        where: { id },
        data
      });
      return mapToInterface(updatedDoc);
    } catch (error) {
      return null;
    }
  },

  delete: async (id: string) => {
    try {
      await prisma.document.delete({ where: { id } });
      return true;
    } catch (error) {
      return false;
    }
  },

  generateCode: async (category: string) => {
    const prefixMap: Record<string, string> = {
      'Hợp đồng': 'HD',
      'Báo cáo': 'BC',
      'Kỹ thuật': 'KT',
      'Pháp lý': 'PL',
      'Khác': 'KH',
      // Frontend types
      'guide': 'HD',      // Hướng dẫn
      'process': 'QT',    // Quy trình
      'technical': 'KT',  // Kỹ thuật
      'policy': 'CS',     // Chính sách
      'customer_care': 'CK' // CSKH
    };
    const prefix = prefixMap[category] || 'VB';
    const year = new Date().getFullYear();
    const baseCode = `${prefix}${year}`;

    const lastDoc = await prisma.document.findFirst({
      where: {
        code: {
          startsWith: baseCode
        }
      },
      orderBy: {
        code: 'desc'
      }
    });

    let sequence = 1;
    if (lastDoc) {
      const lastSeq = parseInt(lastDoc.code.slice(baseCode.length));
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }

    return `${baseCode}${sequence.toString().padStart(4, '0')}`;
  }
};
