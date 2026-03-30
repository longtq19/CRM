import multer from 'multer';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { Request, Response, NextFunction } from 'express';
import { getRootDir } from '../utils/pathHelper';
import { capUploadFileSize } from '../config/publicUploadUrl';

// Ensure uploads directory exists
const uploadDir = path.join(getRootDir(), 'uploads/avatars');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Use MemoryStorage to process image before saving
const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp'
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only .jpg, .jpeg, .png, .gif, .webp are allowed.'));
  }
};

export const imageUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: capUploadFileSize(25 * 1024 * 1024)
  }
});

const removeAccents = (str: string) => {
  return str.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]/g, "");
};

// Middleware to process/compress the image
export const processAvatar = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.file) return next();

  try {
    const maxSize = 50 * 1024; // 50KB
    let filename = '';
    
    // Một file duy nhất / nhân viên: ưu tiên employeeId (ghi đè cùng đường dẫn, tránh nhiều file khi đổi tên/mã).
    const { code, fullName, employeeId } = req.body as { code?: string; fullName?: string; employeeId?: string };
    const idRaw = employeeId != null ? String(employeeId).trim() : '';
    if (idRaw && /^[a-f0-9-]{36}$/i.test(idRaw)) {
        filename = `${idRaw}.jpg`;
    } else if (code && fullName) {
        const safeName = removeAccents(fullName);
        const safeCode = code.replace(/[^a-zA-Z0-9]/g, '');
        // Format: CODE_Name.jpg (thêm mới nhân viên chưa có id)
        filename = `${safeCode}_${safeName}.jpg`;
    } else {
        const namePart = path.parse(req.file.originalname).name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
        filename = `avatar-${Date.now()}-${namePart}.jpg`;
    }

    const filepath = path.join(uploadDir, filename);

    let width = 512;
    let quality = 80;
    // Một lần giải mã ảnh gốc (có thể rất lớn); các vòng sau xử lý từ buffer JPEG đã nhỏ hơn — tránh treo Node/proxy 502 khi nén lặp từ file gốc.
    let buffer = await sharp(req.file.buffer)
      .rotate()
      .resize(width, width, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality,
        mozjpeg: true
      })
      .toBuffer();

    while (buffer.length > maxSize && (quality > 40 || width > 256)) {
      if (quality > 40) {
        quality -= 10;
      } else if (width > 256) {
        width = 256;
      } else {
        break;
      }

      buffer = await sharp(buffer)
        .resize(width, width, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({
          quality,
          mozjpeg: true
        })
        .toBuffer();
    }

    await fs.promises.writeFile(filepath, buffer);

    req.file.path = filepath;
    req.file.filename = filename;
    req.file.destination = uploadDir;
    req.file.mimetype = 'image/jpeg';

    next();
  } catch (error) {
    console.error('Image processing error:', error);
    // Continue to next error handler
    next(error);
  }
};
