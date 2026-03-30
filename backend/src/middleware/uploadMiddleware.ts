import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getRootDir } from '../utils/pathHelper';
import { capUploadFileSize } from '../config/publicUploadUrl';

// Ensure uploads directory exists
const uploadDir = path.join(getRootDir(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.docx', '.html', '.md', '.xlsx', '.pdf'];
  const allowedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/html',
    'text/markdown',
    'text/x-markdown',
    'text/plain', // Markdown often comes as text/plain
    'application/pdf'
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  
  // Allow octet-stream for xlsx/docx as fallback
  if (allowedExtensions.includes(ext) && (allowedMimeTypes.includes(file.mimetype) || file.mimetype === 'application/octet-stream')) {
    cb(null, true);
  } else {
    // Check if it's markdown with text/plain
    if (ext === '.md' && file.mimetype === 'text/plain') {
      cb(null, true);
      return;
    }
    cb(new Error('Invalid file type. Only .docx, .xlsx, .html, .md, .pdf are allowed.'));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: capUploadFileSize(5 * 1024 * 1024)
  }
});
