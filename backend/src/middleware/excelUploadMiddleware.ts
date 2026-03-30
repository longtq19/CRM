import multer from 'multer';
import path from 'path';
import { capUploadFileSize } from '../config/publicUploadUrl';

const storage = multer.memoryStorage();

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedExtensions = ['.xlsx', '.xls', '.csv'];
  const allowedMimeTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/csv'
  ];

  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext) || allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only Excel files (.xlsx, .xls) and CSV are allowed.'));
  }
};

export const excelUploadMiddleware = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: capUploadFileSize(10 * 1024 * 1024)
  }
});
