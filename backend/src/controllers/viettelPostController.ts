import { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../config/database';
import { runVtpAddressSync, type VtpAddressSource } from '../services/addressVtpSyncService';
import { viettelPostService } from '../services/viettelPostService';
import {
  mergeWardsByNormalizedNameForResponse,
  storageAdministrativeName
} from '../utils/addressDisplayNormalize';

/** Thư mục JSON địa chỉ (backend/data/addresses) */
const getAddressDataDir = () => path.join(process.cwd(), 'data', 'addresses');

/**
 * Viettel Post API Integration
 * 
 * API Base URL: https://partner.viettelpost.vn/v2
 * 
 * === API PATHS ===
 * 
 * 1. Authentication:
 *    POST /user/Login - Đăng nhập lấy token
 *    
 * 2. Address (Địa chỉ hành chính):
 *    GET /categories/listProvince - Danh sách tỉnh/thành phố
 *    GET /categories/listProvinceById?provinceId={id} - Chi tiết tỉnh
 *    GET /categories/listDistrict?provinceId={id} - Danh sách quận/huyện theo tỉnh
 *    GET /categories/listWards?districtId={id} - Danh sách phường/xã theo quận
 *    
 * 3. Shipping Services:
 *    GET /categories/listService - Danh sách dịch vụ vận chuyển
 *    POST /order/getPrice - Tính phí vận chuyển
 *    POST /order/createOrder - Tạo đơn hàng
 *    POST /order/createOrderByInventory - Tạo đơn từ kho
 *    
 * 4. Order Management:
 *    GET /order/getOrderByCode?orderCode={code} - Lấy thông tin đơn hàng
 *    POST /order/UpdateOrder - Cập nhật đơn hàng
 *    POST /order/cancelOrder - Hủy đơn hàng
 *    
 * 5. Tracking:
 *    GET /order/tracking?orderCode={code} - Theo dõi đơn hàng
 *    
 * === SECRET PARAMETERS ===
 * 
 * Headers required:
 * - Token: {VTP_TOKEN} - Token xác thực (lưu trong .env)
 * - Content-Type: application/json
 * 
 * === CHECKLIST GO-LIVE ===
 * 
 * 1. [ ] Đăng ký tài khoản đối tác tại partner.viettelpost.vn
 * 2. [ ] Lấy token dài hạn (long-term token)
 * 3. [ ] Cấu hình thông tin kho hàng (warehouse/inventory)
 * 4. [ ] Test API trên môi trường sandbox
 * 5. [ ] Đồng bộ danh sách địa chỉ hành chính (Province/District/Ward)
 * 6. [ ] Test tạo đơn hàng và tracking
 * 7. [ ] Cấu hình webhook nhận callback trạng thái đơn hàng
 * 8. [ ] Chuyển sang môi trường production
 * 9. [ ] Kiểm tra COD và thanh toán
 * 10. [ ] Đào tạo nhân viên sử dụng
 */

const VTP_API_URL = process.env.VTP_API_URL || 'https://partner.viettelpost.vn/v2';
const VTP_TOKEN = process.env.VTP_TOKEN || '';

// Helper function to call VTP API
const callVTPApi = async (endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any) => {
  const url = `${VTP_API_URL}${endpoint}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Token': VTP_TOKEN
    }
  };
  
  if (body && method === 'POST') {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  return response.json();
};

/** Chuẩn hóa mảng dữ liệu từ JSON VTP (đôi khi body là mảng, đôi khi { data: [...] }). */
const vtpResponseRows = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (data?.error === true) return [];
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const vtpResponseOk = (data: any): boolean => {
  if (Array.isArray(data)) return true;
  if (data?.error === true) return false;
  return data?.error === false || data?.status === 200 || Array.isArray(data?.data);
};

/**
 * Lấy danh sách tỉnh/thành phố từ VTP
 */
export const getVTPProvinces = async (req: Request, res: Response) => {
  try {
    const data = await callVTPApi('/categories/listProvinceById?provinceId=-1');
    if (!vtpResponseOk(data)) {
      return res.status(400).json({
        success: false,
        message: data.message || 'Lỗi khi lấy danh sách tỉnh/thành phố'
      });
    }
    res.json({ success: true, data: vtpResponseRows(data) });
  } catch (error) {
    console.error('Get VTP provinces error:', error);
    res.status(500).json({ success: false, message: 'Lỗi kết nối Viettel Post' });
  }
};

/**
 * Lấy danh sách quận/huyện từ VTP
 */
export const getVTPDistricts = async (req: Request, res: Response) => {
  try {
    const provinceId = req.query.provinceId as string;
    
    if (!provinceId) {
      return res.status(400).json({ success: false, message: 'Thiếu provinceId' });
    }
    
    const data = await callVTPApi(`/categories/listDistrict?provinceId=${provinceId}`);
    if (!vtpResponseOk(data)) {
      return res.status(400).json({
        success: false,
        message: data.message || 'Lỗi khi lấy danh sách quận/huyện'
      });
    }
    res.json({ success: true, data: vtpResponseRows(data) });
  } catch (error) {
    console.error('Get VTP districts error:', error);
    res.status(500).json({ success: false, message: 'Lỗi kết nối Viettel Post' });
  }
};

/**
 * Lấy danh sách phường/xã từ VTP
 */
export const getVTPWards = async (req: Request, res: Response) => {
  try {
    const districtId = req.query.districtId as string;
    
    if (!districtId) {
      return res.status(400).json({ success: false, message: 'Thiếu districtId' });
    }
    
    const data = await callVTPApi(`/categories/listWards?districtId=${districtId}`);
    if (!vtpResponseOk(data)) {
      return res.status(400).json({
        success: false,
        message: data.message || 'Lỗi khi lấy danh sách phường/xã'
      });
    }
    res.json({ success: true, data: vtpResponseRows(data) });
  } catch (error) {
    console.error('Get VTP wards error:', error);
    res.status(500).json({ success: false, message: 'Lỗi kết nối Viettel Post' });
  }
};

/**
 * Đồng bộ địa chỉ hành chính từ VTP vào database.
 * - `source=new`: V3 listProvinceNew + listWardsNew (sau sáp nhập, không cấp huyện trong DB).
 * - `source=old`: V2 listProvinceById + listDistrict + listWards (trước sáp nhập).
 * - `source=both` (mặc định): nạp new rồi old (khớp seed JSON).
 * - `clear=true`: xóa danh mục và gỡ FK khách / xóa customer_addresses trước khi nạp (cần backup DB).
 */
export const syncAddressFromVTP = async (req: Request, res: Response) => {
  try {
    if (!VTP_TOKEN.trim()) {
      return res.status(400).json({ success: false, message: 'Thiếu VTP_TOKEN trong cấu hình backend' });
    }
    const rawSource = (req.query.source as string) || (req.body?.source as string) || 'both';
    const source = (['old', 'new', 'both'].includes(rawSource) ? rawSource : 'both') as VtpAddressSource;
    const clearRaw = req.query.clear ?? req.body?.clear;
    const clear =
      clearRaw === true ||
      clearRaw === 1 ||
      String(clearRaw).toLowerCase() === 'true' ||
      String(clearRaw) === '1';

    const result = await runVtpAddressSync({ source, clear });

    res.json({
      success: true,
      message: 'Đồng bộ địa chỉ từ Viettel Post thành công',
      source: result.source,
      cleared: result.cleared,
      stats: result.stats
    });
  } catch (error: any) {
    console.error('Sync address error:', error);
    res.status(500).json({
      success: false,
      message: error?.message || 'Lỗi khi đồng bộ địa chỉ'
    });
  }
};

/**
 * Auto-seed: nạp địa chỉ từ JSON nếu bảng provinces rỗng.
 * Gọi khi khởi động server (connectDB).
 */
export async function ensureAddressCatalog(): Promise<void> {
  try {
    const count = await prisma.province.count();
    if (count > 0) return;
    console.log('[HCRM] Bảng provinces rỗng — tự động nạp danh mục địa chỉ từ JSON...');
    const dataDir = getAddressDataDir();
    if (!fs.existsSync(dataDir)) {
      console.warn('[HCRM] Thư mục data/addresses không tồn tại, bỏ qua seed địa chỉ.');
      return;
    }
    const load = (filename: string) => {
      const p = path.join(dataDir, filename);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    };
    let stats = { provinces: 0, districts: 0, wards: 0 };

    const provincesNew = load('provinces-new.json') as { PROVINCES?: any[] } | null;
    const wardsNew = load('wards-new.json') as { WARDS?: any[] } | null;
    if (provincesNew?.PROVINCES) {
      for (const p of provincesNew.PROVINCES) {
        const nm = storageAdministrativeName(String(p.PROVINCE_NAME || ''));
        await prisma.province.upsert({
          where: { id: String(p.PROVINCE_ID) },
          update: { name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) },
          create: { id: String(p.PROVINCE_ID), name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) }
        });
        stats.provinces++;
      }
    }
    if (wardsNew?.WARDS) {
      for (const w of wardsNew.WARDS) {
        const wnm = storageAdministrativeName(String(w.WARDS_NAME || ''));
        await prisma.ward.upsert({
          where: { id: String(w.WARDS_ID) },
          update: { name: wnm, code: String(w.WARDS_ID), provinceId: String(w.PROVINCE_ID), districtId: null },
          create: { id: String(w.WARDS_ID), name: wnm, code: String(w.WARDS_ID), provinceId: String(w.PROVINCE_ID), districtId: null }
        });
        stats.wards++;
      }
    }

    const provincesOld = load('provinces-old.json') as { PROVINCES?: any[] } | null;
    const districtsOld = load('districts-old.json') as { DISTRICTS?: any[] } | null;
    const wardsOld = load('wards-old.json') as { WARDS?: any[] } | null;
    if (provincesOld?.PROVINCES) {
      for (const p of provincesOld.PROVINCES) {
        const nm = storageAdministrativeName(String(p.PROVINCE_NAME || ''));
        await prisma.province.upsert({
          where: { id: String(p.PROVINCE_ID) },
          update: { name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) },
          create: { id: String(p.PROVINCE_ID), name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) }
        });
        stats.provinces++;
      }
    }
    const districtToProvince: Record<number, number> = {};
    if (districtsOld?.DISTRICTS) {
      for (const d of districtsOld.DISTRICTS) {
        districtToProvince[d.DISTRICT_ID] = d.PROVINCE_ID;
        const dnm = storageAdministrativeName(String(d.DISTRICT_NAME || ''));
        await prisma.district.upsert({
          where: { id: String(d.DISTRICT_ID) },
          update: { name: dnm, code: d.DISTRICT_VALUE || String(d.DISTRICT_ID), provinceId: String(d.PROVINCE_ID) },
          create: { id: String(d.DISTRICT_ID), name: dnm, code: d.DISTRICT_VALUE || String(d.DISTRICT_ID), provinceId: String(d.PROVINCE_ID) }
        });
        stats.districts++;
      }
    }
    if (wardsOld?.WARDS && Object.keys(districtToProvince).length) {
      for (const w of wardsOld.WARDS) {
        const provinceId = districtToProvince[w.DISTRICT_ID];
        if (provinceId == null) continue;
        const wnm = storageAdministrativeName(String(w.WARDS_NAME || ''));
        await prisma.ward.upsert({
          where: { id: String(w.WARDS_ID) },
          update: { name: wnm, code: String(w.WARDS_ID), districtId: String(w.DISTRICT_ID), provinceId: String(provinceId) },
          create: { id: String(w.WARDS_ID), name: wnm, code: String(w.WARDS_ID), districtId: String(w.DISTRICT_ID), provinceId: String(provinceId) }
        });
        stats.wards++;
      }
    }
    console.log(`[HCRM] Nạp địa chỉ xong: ${stats.provinces} tỉnh, ${stats.districts} huyện, ${stats.wards} xã`);
  } catch (error) {
    console.error('[HCRM] Lỗi auto-seed địa chỉ (không critical):', error);
  }
}

/**
 * Nạp địa chỉ từ file JSON trong backend/data/addresses vào DB
 * Query: ?source=new | old | both (mặc định: both)
 */
export const syncAddressFromJson = async (req: Request, res: Response) => {
  try {
    const dataDir = getAddressDataDir();
    if (!fs.existsSync(dataDir)) {
      return res.status(400).json({ success: false, message: 'Thư mục data/addresses không tồn tại' });
    }
    const source = (req.query.source as string) || (req.body?.source as string) || 'both';
    let stats = { provinces: 0, districts: 0, wards: 0 };

    const load = (filename: string) => {
      const p = path.join(dataDir, filename);
      if (!fs.existsSync(p)) return null;
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    };

    if (source === 'new' || source === 'both') {
      const provincesNew = load('provinces-new.json') as { PROVINCES?: Array<{ PROVINCE_ID: number; PROVINCE_CODE?: string; PROVINCE_NAME: string }> } | null;
      const wardsNew = load('wards-new.json') as { WARDS?: Array<{ WARDS_ID: number; WARDS_NAME: string; PROVINCE_ID: number }> } | null;
      if (provincesNew?.PROVINCES) {
        for (const p of provincesNew.PROVINCES) {
          const nm = storageAdministrativeName(p.PROVINCE_NAME);
          await prisma.province.upsert({
            where: { id: String(p.PROVINCE_ID) },
            update: { name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) },
            create: { id: String(p.PROVINCE_ID), name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) }
          });
          stats.provinces++;
        }
      }
      if (wardsNew?.WARDS) {
        for (const w of wardsNew.WARDS) {
          const wnm = storageAdministrativeName(w.WARDS_NAME);
          await prisma.ward.upsert({
            where: { id: String(w.WARDS_ID) },
            update: { name: wnm, code: String(w.WARDS_ID), provinceId: String(w.PROVINCE_ID), districtId: null },
            create: { id: String(w.WARDS_ID), name: wnm, code: String(w.WARDS_ID), provinceId: String(w.PROVINCE_ID), districtId: null }
          });
          stats.wards++;
        }
      }
    }

    if (source === 'old' || source === 'both') {
      const provincesOld = load('provinces-old.json') as { PROVINCES?: Array<{ PROVINCE_ID: number; PROVINCE_CODE?: string; PROVINCE_NAME: string }> } | null;
      const districtsOld = load('districts-old.json') as { DISTRICTS?: Array<{ DISTRICT_ID: number; DISTRICT_VALUE?: string; DISTRICT_NAME: string; PROVINCE_ID: number }> } | null;
      const wardsOld = load('wards-old.json') as { WARDS?: Array<{ WARDS_ID: number; WARDS_NAME: string; DISTRICT_ID: number }> } | null;
      if (provincesOld?.PROVINCES) {
        for (const p of provincesOld.PROVINCES) {
          const nm = storageAdministrativeName(p.PROVINCE_NAME);
          await prisma.province.upsert({
            where: { id: String(p.PROVINCE_ID) },
            update: { name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) },
            create: { id: String(p.PROVINCE_ID), name: nm, code: p.PROVINCE_CODE || String(p.PROVINCE_ID) }
          });
          stats.provinces++;
        }
      }
      const districtToProvince: Record<number, number> = {};
      if (districtsOld?.DISTRICTS) {
        for (const d of districtsOld.DISTRICTS) {
          districtToProvince[d.DISTRICT_ID] = d.PROVINCE_ID;
          const dnm = storageAdministrativeName(d.DISTRICT_NAME);
          await prisma.district.upsert({
            where: { id: String(d.DISTRICT_ID) },
            update: { name: dnm, code: d.DISTRICT_VALUE || String(d.DISTRICT_ID), provinceId: String(d.PROVINCE_ID) },
            create: { id: String(d.DISTRICT_ID), name: dnm, code: d.DISTRICT_VALUE || String(d.DISTRICT_ID), provinceId: String(d.PROVINCE_ID) }
          });
          stats.districts++;
        }
      }
      if (wardsOld?.WARDS && Object.keys(districtToProvince).length) {
        for (const w of wardsOld.WARDS) {
          const provinceId = districtToProvince[w.DISTRICT_ID];
          if (provinceId == null) continue;
          const wnm = storageAdministrativeName(w.WARDS_NAME);
          await prisma.ward.upsert({
            where: { id: String(w.WARDS_ID) },
            update: { name: wnm, code: String(w.WARDS_ID), districtId: String(w.DISTRICT_ID), provinceId: String(provinceId) },
            create: { id: String(w.WARDS_ID), name: wnm, code: String(w.WARDS_ID), districtId: String(w.DISTRICT_ID), provinceId: String(provinceId) }
          });
          stats.wards++;
        }
      }
    }

    res.json({
      success: true,
      message: 'Đã nạp địa chỉ từ file JSON',
      stats
    });
  } catch (error) {
    console.error('Sync address from JSON error:', error);
    res.status(500).json({ success: false, message: 'Lỗi khi nạp địa chỉ từ JSON' });
  }
};

// ==================== LOCAL ADDRESS APIs (từ DB đã đồng bộ) ====================

/**
 * Lấy danh sách tỉnh/thành phố từ DB
 */
export const getProvinces = async (req: Request, res: Response) => {
  try {
    const { search } = req.query;
    
    const where: any = {};
    if (search) {
      where.name = { contains: String(search), mode: 'insensitive' };
    }
    
    const provinces = await prisma.province.findMany({
      where,
      orderBy: { name: 'asc' }
    });
    
    res.json(provinces);
  } catch (error) {
    console.error('Get provinces error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách tỉnh/thành phố' });
  }
};

/**
 * Lấy danh sách quận/huyện từ DB
 */
export const getDistricts = async (req: Request, res: Response) => {
  try {
    const { provinceId, search } = req.query;
    
    const where: any = {};
    if (provinceId) {
      where.provinceId = String(provinceId);
    }
    if (search) {
      where.name = { contains: String(search), mode: 'insensitive' };
    }
    
    const districts = await prisma.district.findMany({
      where,
      include: {
        province: { select: { id: true, name: true } }
      },
      orderBy: { name: 'asc' }
    });
    
    res.json(districts);
  } catch (error) {
    console.error('Get districts error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách quận/huyện' });
  }
};

/**
 * Lấy danh sách phường/xã từ DB
 * Hỗ trợ cả 2 loại địa chỉ:
 * - Cũ (trước sáp nhập): lọc theo districtId
 * - Mới (sau sáp nhập): lọc theo provinceId; nên dùng directOnly=true để chỉ lấy xã gắn trực tiếp tỉnh (district_id null),
 *   tránh trộn bản ghi cùng tỉnh thuộc hệ cũ (gây trùng / nhầm sau khi sync cả old+new).
 */
export const getWards = async (req: Request, res: Response) => {
  try {
    const { districtId, provinceId, search } = req.query;
    const directOnly =
      req.query.directOnly === '1' ||
      req.query.directOnly === 'true' ||
      String(req.query.directToProvince || '').toLowerCase() === 'true';

    const where: any = {};
    if (districtId) {
      where.districtId = String(districtId);
    }
    if (provinceId) {
      where.provinceId = String(provinceId);
    }
    if (directOnly && provinceId && !districtId) {
      // Fetch all wards in province, then merge by name for a flat 'Ward -> Province' list
    }
    if (search) {
      where.name = { contains: String(search), mode: 'insensitive' };
    }
    
    let wards = await prisma.ward.findMany({
      where,
      include: {
        district: { 
          select: { 
            id: true, 
            name: true,
            province: { select: { id: true, name: true } }
          } 
        }
      },
      orderBy: { name: 'asc' }
    });

    // Sau sáp nhập: VTP/DB có thể có 2+ id khác nhau cùng địa danh (Title Case vs ALL CAPS) — gộp theo tên chuẩn hóa
    if (directOnly && provinceId && !districtId) {
      wards = mergeWardsByNormalizedNameForResponse(wards);
    }

    res.json(wards);
  } catch (error) {
    console.error('Get wards error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách phường/xã' });
  }
};

/**
 * Tìm kiếm địa chỉ thông minh (autocomplete)
 * Cho phép nhập: "Phường X, Quận Y, TP Z" hoặc "X, Y, Z"
 */
export const searchAddress = async (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    
    if (!q || String(q).length < 2) {
      return res.json([]);
    }
    
    const searchTerm = String(q).trim();
    const parts = searchTerm.split(',').map(p => p.trim()).filter(Boolean);
    
    // Tìm kiếm theo từng phần
    let results: any[] = [];
    
    if (parts.length === 1) {
      // Tìm tất cả (ward, district, province)
      const [wards, districts, provinces] = await Promise.all([
        prisma.ward.findMany({
          where: { name: { contains: parts[0], mode: 'insensitive' } },
          include: {
            district: {
              include: { province: true }
            },
            province: true
          },
          take: 15
        }),
        prisma.district.findMany({
          where: { name: { contains: parts[0], mode: 'insensitive' } },
          include: { province: true },
          take: 5
        }),
        prisma.province.findMany({
          where: { name: { contains: parts[0], mode: 'insensitive' } },
          take: 5
        })
      ]);
      
      // Format kết quả — xã sau sáp nhập (không cấp huyện): districtId null, dùng province trực tiếp
      const seenWard = new Set<string>();
      const oldStyle = wards
        .filter(w => w.district)
        .map(w => ({
          type: 'full' as const,
          label: `${w.name}, ${w.district!.name}, ${w.district!.province.name}`,
          wardId: w.id,
          wardName: w.name,
          districtId: w.district!.id,
          districtName: w.district!.name,
          provinceId: w.district!.province.id,
          provinceName: w.district!.province.name
        }));
      oldStyle.forEach(r => seenWard.add(r.wardId));
      const newStyle = wards
        .filter(w => w.districtId == null && w.province && !seenWard.has(w.id))
        .map(w => ({
          type: 'full' as const,
          label: `${w.name}, ${w.province.name}`,
          wardId: w.id,
          wardName: w.name,
          districtId: null as string | null,
          districtName: null as string | null,
          provinceId: w.province.id,
          provinceName: w.province.name
        }));
      results = [
        ...oldStyle,
        ...newStyle,
        ...districts.map(d => ({
          type: 'district',
          label: `${d.name}, ${d.province.name}`,
          districtId: d.id,
          districtName: d.name,
          provinceId: d.province.id,
          provinceName: d.province.name
        })),
        ...provinces.map(p => ({
          type: 'province',
          label: p.name,
          provinceId: p.id,
          provinceName: p.name
        }))
      ];
    } else if (parts.length === 2) {
      // ward + huyện (cũ) hoặc ward + tỉnh (mới, sau sáp nhập)
      const [wardsOld, wardsNew] = await Promise.all([
        prisma.ward.findMany({
          where: {
            name: { contains: parts[0], mode: 'insensitive' },
            district: {
              name: { contains: parts[1], mode: 'insensitive' }
            }
          },
          include: {
            district: { include: { province: true } }
          },
          take: 10
        }),
        prisma.ward.findMany({
          where: {
            name: { contains: parts[0], mode: 'insensitive' },
            districtId: null,
            province: { name: { contains: parts[1], mode: 'insensitive' } }
          },
          include: { province: true },
          take: 10
        })
      ]);
      const seen = new Set<string>();
      const oldResults = wardsOld.filter(w => w.district).map(w => {
        seen.add(w.id);
        return {
          type: 'full' as const,
          label: `${w.name}, ${w.district!.name}, ${w.district!.province.name}`,
          wardId: w.id,
          wardName: w.name,
          districtId: w.district!.id,
          districtName: w.district!.name,
          provinceId: w.district!.province.id,
          provinceName: w.district!.province.name
        };
      });
      const newResults = wardsNew
        .filter(w => !seen.has(w.id))
        .map(w => ({
          type: 'full' as const,
          label: `${w.name}, ${w.province.name}`,
          wardId: w.id,
          wardName: w.name,
          districtId: null as string | null,
          districtName: null as string | null,
          provinceId: w.province.id,
          provinceName: w.province.name
        }));
      results = [...oldResults, ...newResults];
    } else if (parts.length >= 3) {
      // Tìm chính xác ward + district + province
      const wards = await prisma.ward.findMany({
        where: {
          name: { contains: parts[0], mode: 'insensitive' },
          district: {
            name: { contains: parts[1], mode: 'insensitive' },
            province: {
              name: { contains: parts[2], mode: 'insensitive' }
            }
          }
        },
        include: {
          district: { include: { province: true } }
        },
        take: 10
      });
      
      results = wards.filter(w => w.district).map(w => ({
        type: 'full',
        label: `${w.name}, ${w.district!.name}, ${w.district!.province.name}`,
        wardId: w.id,
        wardName: w.name,
        districtId: w.district!.id,
        districtName: w.district!.name,
        provinceId: w.district!.province.id,
        provinceName: w.district!.province.name
      }));
    }
    
    res.json(results);
  } catch (error) {
    console.error('Search address error:', error);
    res.status(500).json({ message: 'Lỗi khi tìm kiếm địa chỉ' });
  }
};

// ==================== VTP SHIPPING APIs ====================

/**
 * Lấy danh sách dịch vụ vận chuyển
 */
export const getVTPServices = async (req: Request, res: Response) => {
  try {
    const data = await callVTPApi('/categories/listService');
    res.json(data);
  } catch (error) {
    console.error('Get VTP services error:', error);
    res.status(500).json({ success: false, message: 'Lỗi kết nối Viettel Post' });
  }
};

/**
 * Tính phí vận chuyển — gọi VTP `getPriceAll` với **tổng khối lượng** (gram), không gửi kích thước.
 * Body: senderProvince, senderDistrict, receiverProvince, receiverDistrict (bắt buộc);
 * senderWard, receiverWard (khuyến nghị); productWeight, productPrice, moneyCollection.
 */
export const calculateShippingFee = async (req: Request, res: Response) => {
  try {
    const {
      senderProvince,
      senderDistrict,
      senderWard,
      receiverProvince,
      receiverDistrict,
      receiverWard,
      productWeight,
      productPrice,
      moneyCollection,
    } = req.body;

    if (
      senderProvince == null ||
      senderDistrict == null ||
      receiverProvince == null ||
      receiverDistrict == null
    ) {
      return res.status(400).json({ success: false, message: 'Thiếu ID tỉnh/huyện gửi hoặc nhận' });
    }

    const defaultSenderWard = parseInt(process.env.VTP_SENDER_WARD || '175', 10);
    const sWard =
      senderWard != null && senderWard !== ''
        ? parseInt(String(senderWard), 10)
        : defaultSenderWard;
    const rWard =
      receiverWard != null && receiverWard !== '' ? parseInt(String(receiverWard), 10) : NaN;

    const list = await viettelPostService.getPriceAllList({
      senderProvince: Number(senderProvince),
      senderDistrict: Number(senderDistrict),
      senderWard: Number.isFinite(sWard) ? sWard : undefined,
      receiverProvince: Number(receiverProvince),
      receiverDistrict: Number(receiverDistrict),
      receiverWard: Number.isFinite(rWard) ? rWard : undefined,
      productWeight: Number(productWeight) || 500,
      productPrice: Number(productPrice) || 0,
      moneyCollection: Number(moneyCollection) || 0,
    });

    res.json(list);
  } catch (error: any) {
    console.error('Calculate shipping fee error:', error);
    res.status(500).json({ success: false, message: error?.message || 'Lỗi tính phí vận chuyển' });
  }
};

/**
 * Tạo đơn hàng Viettel Post
 */
export const createVTPOrder = async (req: Request, res: Response) => {
  try {
    const {
      orderCode,
      senderName,
      senderPhone,
      senderAddress,
      senderProvince,
      senderDistrict,
      senderWard,
      receiverName,
      receiverPhone,
      receiverAddress,
      receiverProvince,
      receiverDistrict,
      receiverWard,
      productName,
      productWeight,
      productPrice,
      moneyCollection,
      serviceType,
      note,
      orderPayment
    } = req.body;
    // ORDER_PAYMENT: 1=Không thu hộ, 2=Thu hộ hàng+cước, 3=Thu hộ tiền hàng, 4=Thu hộ tiền cước
    const ORDER_PAYMENT = orderPayment ?? (moneyCollection > 0 ? 3 : 1);
    
    const payload = {
      ORDER_NUMBER: orderCode,
      SENDER_FULLNAME: senderName,
      SENDER_PHONE: senderPhone,
      SENDER_ADDRESS: senderAddress,
      SENDER_PROVINCE: senderProvince,
      SENDER_DISTRICT: senderDistrict,
      SENDER_WARD: senderWard,
      RECEIVER_FULLNAME: receiverName,
      RECEIVER_PHONE: receiverPhone,
      RECEIVER_ADDRESS: receiverAddress,
      RECEIVER_PROVINCE: receiverProvince,
      RECEIVER_DISTRICT: receiverDistrict,
      RECEIVER_WARD: receiverWard,
      PRODUCT_NAME: productName,
      PRODUCT_WEIGHT: productWeight || 500,
      PRODUCT_PRICE: productPrice || 0,
      MONEY_COLLECTION: moneyCollection || 0,
      ORDER_PAYMENT,
      ORDER_SERVICE: serviceType || 'VCN', // VCN: Vận chuyển nhanh
      ORDER_NOTE: note || ''
    };
    
    const data = await callVTPApi('/order/createOrder', 'POST', payload);
    res.json(data);
  } catch (error) {
    console.error('Create VTP order error:', error);
    res.status(500).json({ success: false, message: 'Lỗi tạo đơn hàng' });
  }
};

/**
 * Theo dõi đơn hàng
 */
export const trackVTPOrder = async (req: Request, res: Response) => {
  try {
    const { orderCode } = req.params;
    
    if (!orderCode) {
      return res.status(400).json({ success: false, message: 'Thiếu mã đơn hàng' });
    }
    
    const data = await callVTPApi(`/order/tracking?orderCode=${orderCode}`);
    res.json(data);
  } catch (error) {
    console.error('Track VTP order error:', error);
    res.status(500).json({ success: false, message: 'Lỗi theo dõi đơn hàng' });
  }
};

/**
 * Hủy đơn hàng
 */
export const cancelVTPOrder = async (req: Request, res: Response) => {
  try {
    const { orderCode } = req.body;
    
    if (!orderCode) {
      return res.status(400).json({ success: false, message: 'Thiếu mã đơn hàng' });
    }
    
    const data = await callVTPApi('/order/cancelOrder', 'POST', { ORDER_NUMBER: orderCode });
    res.json(data);
  } catch (error) {
    console.error('Cancel VTP order error:', error);
    res.status(500).json({ success: false, message: 'Lỗi hủy đơn hàng' });
  }
};
