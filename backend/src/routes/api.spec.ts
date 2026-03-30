/**
 * Test API: kiểm tra app khởi động và các route phản hồi đúng (auth, phân quyền).
 * Không test module: Đơn hàng, Sản phẩm, Tồn kho, Bảo hành.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('API HCRM', () => {
  beforeAll(() => {
    // App đã load; kết nối DB thực tế trong `server.ts` (không chạy khi test import chỉ `app`).
  });

  afterAll(async () => {
    // Có thể đóng pool Prisma nếu cần
  });

  it('app được export và có method use', () => {
    expect(app).toBeDefined();
    expect(typeof app.use).toBe('function');
  });

  it('GET /api/logs không có token trả 401', async () => {
    const res = await request(app)
      .get('/api/logs')
      .expect(401);
    expect(typeof res.body?.message).toBe('string');
    expect(String(res.body.message).length).toBeGreaterThan(0);
  });

  it('GET /api/dashboard không có token trả 401', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .expect(401);
    expect(typeof res.body?.message).toBe('string');
    expect(String(res.body.message).length).toBeGreaterThan(0);
  });

  it('GET /api/customers không có token trả 401', async () => {
    const res = await request(app)
      .get('/api/customers')
      .expect(401);
    expect(typeof res.body?.message).toBe('string');
    expect(String(res.body.message).length).toBeGreaterThan(0);
  });

  it('GET /api/address/provinces phản hồi (200/401/500 tùy cấu hình route)', async () => {
    const res = await request(app).get('/api/address/provinces');
    expect([200, 401, 500]).toContain(res.status);
  });

  it('POST /api/public/lead thiếu API key trả 401', async () => {
    const res = await request(app)
      .post('/api/public/lead')
      .set('Content-Type', 'application/json')
      .send({ phone: '0901234567', name: 'Test' });
    expect(res.status).toBe(401);
    expect(res.body?.message).toBeDefined();
  });

  it('POST /api/public/lead sai API key trả 401', async () => {
    const res = await request(app)
      .post('/api/public/lead')
      .set('Content-Type', 'application/json')
      .set('X-API-Key', 'invalid_key_xyz')
      .send({ phone: '0901234567', name: 'Test' });
    expect(res.status).toBe(401);
    expect(res.body?.message).toBeDefined();
  });
});
