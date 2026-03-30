import type { Request, Response, NextFunction } from 'express';

/**
 * Chỉ xử lý lỗi truyền qua `next(err)` (Multer, fileFilter, Sharp trong processAvatar).
 * Route đã bắt try/catch và gửi JSON không đi qua đây.
 */
export function apiErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) return next(err);
  if (!req.originalUrl.startsWith('/api')) return next(err);

  const errAny = err as { code?: string; message?: string; name?: string };

  const isMulterLike =
    errAny?.name === 'MulterError' ||
    errAny?.code === 'LIMIT_FILE_SIZE' ||
    errAny?.code === 'LIMIT_UNEXPECTED_FILE';

  if (isMulterLike) {
    if (errAny.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message:
          'File quá lớn (vượt giới hạn đã cấu hình). Nếu dùng nginx trước Node, tăng client_max_body_size (ví dụ 25m).',
      });
    }
    if (errAny.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Tên trường file không đúng (mong đợi avatar).' });
    }
    return res.status(400).json({ message: 'Lỗi tải file lên.' });
  }

  if (err instanceof Error) {
    if (err.message.includes('Invalid file type')) {
      return res.status(400).json({ message: 'Chỉ chấp nhận ảnh JPG, PNG, GIF hoặc WebP.' });
    }
    if (/Input buffer|unsupported image|Vips|invalid image|corrupt|truncated/i.test(err.message)) {
      return res.status(400).json({
        message: 'File không phải ảnh hợp lệ hoặc bị hỏng. Hãy thử ảnh JPG/PNG khác.',
      });
    }
  }

  console.error('Unhandled API error:', err);
  return res.status(500).json({ message: 'Lỗi khi xử lý yêu cầu.' });
}
