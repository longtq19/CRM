import { Request, Response } from 'express';
import { prisma } from '../config/database';

/**
 * Lưu subscription Web Push của nhân viên (gọi từ frontend sau khi subscribe)
 */
export const saveSubscription = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Thiếu endpoint hoặc keys (p256dh, auth)' });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        employeeId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers['user-agent'] || null
      },
      update: {
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: req.headers['user-agent'] || null
      }
    });

    res.json({ success: true, message: 'Đã bật thông báo push' });
  } catch (error) {
    console.error('Save push subscription error:', error);
    res.status(500).json({ message: 'Lỗi lưu đăng ký thông báo' });
  }
};

/**
 * Lấy VAPID public key cho frontend subscribe
 */
export const getVapidPublicKey = async (_req: Request, res: Response) => {
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) {
    return res.status(503).json({ message: 'Push chưa được cấu hình' });
  }
  res.json({ publicKey: key });
};
