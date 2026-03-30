
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';
import { getRootDir } from '../utils/pathHelper';
import { capUploadFileSize } from '../config/publicUploadUrl';

// Ensure uploads directory exists
const uploadDir = path.join(getRootDir(), 'uploads/contracts');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Use MemoryStorage to validate total size before saving
const storage = multer.memoryStorage();

const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file định dạng PDF.'));
  }
};

export const contractUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: capUploadFileSize(5 * 1024 * 1024)
  }
});
