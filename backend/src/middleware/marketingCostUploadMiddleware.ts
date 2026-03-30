import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getRootDir } from '../utils/pathHelper';
import { capUploadFileSize } from '../config/publicUploadUrl';

const uploadDir = path.join(getRootDir(), 'uploads', 'marketing-costs');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    cb(null, `cost-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Chỉ chấp nhận file ảnh (JPG, PNG, GIF, WEBP), PDF, Word hoặc Excel'));
  }
};

export const marketingCostUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: capUploadFileSize(10 * 1024 * 1024) }
});
