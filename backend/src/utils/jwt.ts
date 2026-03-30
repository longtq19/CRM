import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { Response } from 'express';

const getSecret = () => process.env.JWT_SECRET || 'default_secret_key';

export const STAFF_CHECK_PURPOSE = 'staff_check_login' as const;

export type StaffCheckJwtPayload = {
  purpose: typeof STAFF_CHECK_PURPOSE;
  targetEmployeeId: string;
  issuedByEmployeeId: string;
  /** Mã một lần — backend chặn dùng lại sau khi consume thành công. */
  jti: string;
};

/** Payload sau verify (kèm exp từ JWT). */
export type StaffCheckVerifiedPayload = StaffCheckJwtPayload & { exp: number };

export const generateToken = (payload: any) => {
  return jwt.sign(payload, getSecret(), {
    expiresIn: '30d',
  });
};

/** JWT ngắn hạn để mở tab mới và đăng nhập thay nhân sự (kiểm tra tài khoản). Hiệu lực 15 phút. */
export const generateStaffCheckToken = (payload: {
  targetEmployeeId: string;
  issuedByEmployeeId: string;
}) => {
  const body: StaffCheckJwtPayload = {
    purpose: STAFF_CHECK_PURPOSE,
    targetEmployeeId: payload.targetEmployeeId,
    issuedByEmployeeId: payload.issuedByEmployeeId,
    jti: randomUUID(),
  };
  return jwt.sign(body, getSecret(), { expiresIn: '15m' });
};

export const verifyStaffCheckToken = (token: string): StaffCheckVerifiedPayload => {
  const decoded = jwt.verify(token, getSecret()) as Record<string, unknown>;
  if (
    decoded?.purpose !== STAFF_CHECK_PURPOSE ||
    typeof decoded.targetEmployeeId !== 'string' ||
    typeof decoded.issuedByEmployeeId !== 'string' ||
    typeof decoded.jti !== 'string' ||
    !String(decoded.jti).trim()
  ) {
    throw new Error('INVALID_STAFF_CHECK_TOKEN');
  }
  const exp = decoded.exp;
  if (typeof exp !== 'number') {
    throw new Error('INVALID_STAFF_CHECK_TOKEN');
  }
  return {
    purpose: STAFF_CHECK_PURPOSE,
    targetEmployeeId: decoded.targetEmployeeId as string,
    issuedByEmployeeId: decoded.issuedByEmployeeId as string,
    jti: decoded.jti as string,
    exp,
  };
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, getSecret());
};

export const setTokenCookie = (res: Response, token: string) => {
  res.cookie('jwt', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    sameSite: 'lax', // Relaxed for better dev experience (vs strict)
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};
