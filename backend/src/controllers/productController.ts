import { Request, Response } from 'express';
import { prisma } from '../config/database';
import { Prisma, Status } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { getUploadDir } from '../utils/pathHelper';
import { getPaginationParams } from '../utils/pagination';
import { toPublicUploadUrl, localRelativePathFromUploadUrl } from '../config/publicUploadUrl';

const DEFAULT_PRODUCT_CATEGORIES: Array<{ code: string; name: string; description: string }> = [
  { code: 'BIO', name: 'Phân bón sinh học', description: 'Nhóm sản phẩm phân bón sinh học' },
  { code: 'TECH', name: 'Sản phẩm công nghệ', description: 'Nhóm thiết bị và sản phẩm công nghệ' },
  { code: 'GIFT', name: 'Quà tặng', description: 'Nhóm sản phẩm quà tặng' },
  { code: 'COMBO', name: 'Combo', description: 'Nhóm sản phẩm combo gồm nhiều sản phẩm thành phần' },
];

const DEFAULT_PRODUCT_UNITS = ['Cái', 'Chiếc', 'Chai', 'Lọ', 'Can', 'Túi', 'Gói'];

const toHeaderKey = (value: unknown): string => {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const toCellText = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'object' && value && 'text' in (value as any)) {
    return String((value as any).text ?? '').trim();
  }
  return String(value).trim();
};

const parseNumberOrNull = (value: unknown): number | null => {
  const text = toCellText(value);
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

const normalizeComboProductIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((v) => String(v ?? '').trim()).filter(Boolean)));
};

const isMissingComboTableError = (error: unknown): boolean => {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2021') return false;
  const table = (error.meta as { table?: string } | undefined)?.table || '';
  return String(table).toLowerCase().includes('product_combo_items');
};

export const ensureDefaultProductCategories = async (): Promise<void> => {
  for (const item of DEFAULT_PRODUCT_CATEGORIES) {
    await prisma.productCategory.upsert({
      where: { code: item.code },
      update: {
        name: item.name,
        description: item.description,
      },
      create: {
        code: item.code,
        name: item.name,
        description: item.description,
      },
    });
  }
};

// Helper to normalize filename
const normalizeFilename = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^a-zA-Z0-9-]/g, '') // Remove special chars
    .toUpperCase(); // Uppercase
};

export const uploadProductImage = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'Vui lòng chọn ảnh' });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }

    // 1. Prepare filename
    const ext = path.extname(file.originalname).toLowerCase();
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
    if (!allowedExts.includes(ext)) {
      return res.status(400).json({ message: 'Chỉ chấp nhận ảnh jpg, jpeg, png, webp' });
    }

    const normalizedCode = normalizeFilename(product.code);
    const normalizedName = normalizeFilename(product.name);
    const filename = `${normalizedCode}_${normalizedName}${ext}`;
    
    // Ensure upload directory exists
    const uploadDir = getUploadDir('products');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const filePath = path.join(uploadDir, filename);

    // 2. Delete old image if exists
    // Strategy: Delete ANY file that starts with this product code to ensure 1 image per product?
    // Or just delete the one in DB?
    // User requirement: "Không được để tồn tại nhiều ảnh của cùng một sản phẩm."
    // Let's scan directory for files starting with `${normalizedCode}_` and delete them.
    
    const files = fs.readdirSync(uploadDir);
    for (const f of files) {
      if (f.startsWith(`${normalizedCode}_`) && f !== filename) {
        try {
          fs.unlinkSync(path.join(uploadDir, f));
        } catch (err) {
          console.error('Error deleting old file:', err);
        }
      }
    }
    
    // Also delete the file pointed by current thumbnail if it's different and exists locally
    const thumbRel = product.thumbnail ? localRelativePathFromUploadUrl(product.thumbnail) : null;
    if (thumbRel?.startsWith('uploads/products/')) {
       const oldFilename = path.basename(thumbRel);
       if (oldFilename !== filename) {
          const oldPath = path.join(uploadDir, oldFilename);
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch (err) {}
          }
       }
    }

    // 3. Process and Save Image
    // Resize/Compress if needed. User said limit 1MB.
    // Sharp can limit size? Not directly size, but quality/dimensions.
    // We'll resize to max width 1920 (HD) and compress with high quality first.
    // If buffer is large, reduce quality.
    
    let imageBuffer = file.buffer;
    
    // Basic compression
    if (ext === '.jpg' || ext === '.jpeg') {
      imageBuffer = await sharp(file.buffer)
        .resize({ width: 1920, withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer();
    } else if (ext === '.png') {
      imageBuffer = await sharp(file.buffer)
        .resize({ width: 1920, withoutEnlargement: true })
        .png({ quality: 80, compressionLevel: 8 })
        .toBuffer();
    } else if (ext === '.webp') {
      imageBuffer = await sharp(file.buffer)
        .resize({ width: 1920, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    }

    // Write file
    fs.writeFileSync(filePath, imageBuffer);

    // 4. Update Database
    const publicPath = `/uploads/products/${filename}`;
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: { thumbnail: publicPath },
    });

    res.json({ 
      message: 'Upload ảnh thành công', 
      thumbnail: toPublicUploadUrl(publicPath),
      product: updatedProduct
    });

  } catch (error) {
    console.error('Upload product image error:', error);
    res.status(500).json({ message: 'Lỗi khi upload ảnh' });
  }
};

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { search, type, status } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    if (type) {
      if (type === 'GIFT' || type === 'BIO' || type === 'TECH' || type === 'COMBO') {
          // If filtering by legacy type string, try to match by category code
           where.category = {
               code: type as string
           };
      } else {
           // Assume it's a category code
           where.category = {
               code: type as string
           };
      }
    }

    if (status) {
      where.status = status as Status;
    }

    const [total, products] = await Promise.all([
      prisma.product.count({ where }),
      (async () => {
        const baseArgs = {
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' as const },
          include: {
            category: true,
            bioDetail: true,
            techDetail: true,
            comboItems: {
              include: {
                componentProduct: {
                  select: { id: true, code: true, name: true, thumbnail: true, unit: true, status: true },
                },
              },
            },
            stocks: {
              select: {
                quantity: true,
                warehouse: { select: { name: true } },
              },
            },
          },
        };
        try {
          return await prisma.product.findMany(baseArgs as any);
        } catch (e) {
          if (!isMissingComboTableError(e)) throw e;
          // Compat khi DB chưa migrate bảng combo: vẫn trả danh sách sản phẩm thường.
          return await prisma.product.findMany({
            where,
            skip,
            take: limit,
            orderBy: { createdAt: 'desc' },
            include: {
              category: true,
              bioDetail: true,
              techDetail: true,
              stocks: {
                select: {
                  quantity: true,
                  warehouse: { select: { name: true } },
                },
              },
            },
          });
        }
      })(),
    ]);

    res.json({
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách sản phẩm' });
  }
};

export const getProduct = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    let product;
    try {
      product = await prisma.product.findUnique({
        where: { id },
        include: {
          category: true,
          bioDetail: true,
          techDetail: true,
          comboItems: {
            include: {
              componentProduct: {
                select: { id: true, code: true, name: true, thumbnail: true, unit: true, status: true },
              },
            },
          },
          batches: true,
          serials: true,
        },
      });
    } catch (e) {
      if (!isMissingComboTableError(e)) throw e;
      product = await prisma.product.findUnique({
        where: { id },
        include: {
          category: true,
          bioDetail: true,
          techDetail: true,
          batches: true,
          serials: true,
        },
      });
    }

    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }

    res.json(product);
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy thông tin sản phẩm' });
  }
};

export const getProductOptions = async (req: Request, res: Response) => {
  try {
    const search = String(req.query?.search || '').trim();
    const excludeProductId = String(req.query?.excludeProductId || '').trim();
    const where: any = {};

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (excludeProductId) {
      where.id = { not: excludeProductId };
    }

    const rows = await prisma.product.findMany({
      where,
      orderBy: [{ name: 'asc' }],
      take: 300,
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        unit: true,
        thumbnail: true,
        category: { select: { code: true, name: true } },
      },
    });

    res.json(rows);
  } catch (error) {
    console.error('Get product options error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách sản phẩm chọn nhanh' });
  }
};

export const getProductUnits = async (req: Request, res: Response) => {
  try {
    const units = await prisma.product.findMany({
      select: { unit: true },
      distinct: ['unit'],
    });
    const defaultUnits = ['Cái', 'Chiếc', 'Chai', 'Lọ', 'Can', 'Túi', 'Gói'];
    const dbUnits = units.map(u => u.unit).filter(Boolean);
    const allUnits = Array.from(new Set([...defaultUnits, ...dbUnits])).sort();
    
    res.json(allUnits);
  } catch (error) {
    console.error('Get product units error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách đơn vị' });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const {
      code,
      name,
      vatName,
      vatRate,
      categoryId, // New field
      type, // Legacy, use as fallback for category code lookup
      description,
      listPriceNet,
      minSellPriceNet,
      unit,
      thumbnail,
      gallery,
      status,
      // Bio details
      volume,
      weight,
      packType,
      ingredients,
      usage,
      expiryPeriod,
      // Tech details
      specifications,
      warrantyDuration,
      maintenancePeriod,
      manufacturer,
      modelYear,
      // Stock threshold
      lowStockThreshold,
      packagingSpec: packagingSpecBody,
      comboProductIds,
    } = req.body;

    const packagingSpec =
      packagingSpecBody != null && String(packagingSpecBody).trim() !== ''
        ? String(packagingSpecBody).trim().slice(0, 500)
        : null;
    const packTypeLegacy =
      packType != null && String(packType).trim() !== '' ? String(packType).trim().slice(0, 500) : null;
    const resolvedPackaging = packagingSpec ?? packTypeLegacy;

    if (!code || !/^[A-Z0-9]+$/.test(String(code))) {
      return res.status(400).json({ message: 'Mã sản phẩm chỉ được chứa chữ cái tiếng Anh in hoa và số, không có khoảng cách hoặc ký tự đặc biệt' });
    }

    const finalWeight = weight ? Number(weight) : 0;
    if (finalWeight <= 0) {
      return res.status(400).json({ message: 'Vui lòng nhập khối lượng hợp lệ lớn hơn 0' });
    }

    // Check if code exists
    const existing = await prisma.product.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Mã sản phẩm đã tồn tại' });
    }

    // Resolve Category
    let finalCategoryId = categoryId;
    if (!finalCategoryId && type) {
        const cat = await prisma.productCategory.findUnique({ where: { code: type } });
        if (cat) finalCategoryId = cat.id;
    }
    if (!finalCategoryId) {
      const cat = await prisma.productCategory.findUnique({ where: { code: 'BIO' } });
      if (cat) finalCategoryId = cat.id;
    }
    const normalizedComboProductIds = normalizeComboProductIds(comboProductIds);

    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          code,
          name,
          vatName,
          vatRate: vatRate ? Number(vatRate) : 0,
          categoryId: finalCategoryId,
          description,
          listPriceNet: listPriceNet !== undefined ? Number(listPriceNet) : 0,
          minSellPriceNet: minSellPriceNet !== undefined ? Number(minSellPriceNet) : 0,
          unit,
          thumbnail,
          gallery: gallery || [],
          status: status || 'ACTIVE',
          weight: finalWeight,
          lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : 50,
          packagingSpec: resolvedPackaging,
        },
      });

      // Fetch category code for logic branching
      const category = finalCategoryId ? await tx.productCategory.findUnique({ where: { id: finalCategoryId } }) : null;
      const categoryCode = category?.code || type || 'BIO';
      if (categoryCode === 'COMBO') {
        if (normalizedComboProductIds.length < 2) {
          throw new Error('COMBO_NEED_AT_LEAST_TWO_PRODUCTS');
        }
        const validProducts = await tx.product.findMany({
          where: { id: { in: normalizedComboProductIds } },
          select: { id: true },
        });
        if (validProducts.length !== normalizedComboProductIds.length) {
          throw new Error('COMBO_PRODUCT_NOT_FOUND');
        }
      }

      if (categoryCode === 'BIO') {
        await tx.productBio.create({
          data: {
            productId: product.id,
            volume: volume ? Number(volume) : null,
            weight: finalWeight,
            packType: resolvedPackaging,
            ingredients,
            usage,
            expiryPeriod: expiryPeriod ? Number(expiryPeriod) : null,
          },
        });
      } else if (categoryCode === 'TECH') {
        await tx.productTech.create({
          data: {
            productId: product.id,
            specifications: specifications || {},
            warrantyDuration: Number(warrantyDuration || 12),
            maintenancePeriod: maintenancePeriod ? Number(maintenancePeriod) : null,
            manufacturer,
            modelYear: modelYear ? Number(modelYear) : null,
          },
        });
      } else if (categoryCode === 'COMBO') {
        await tx.productComboItem.createMany({
          data: normalizedComboProductIds.map((componentProductId) => ({
            comboProductId: product.id,
            componentProductId,
          })),
          skipDuplicates: true,
        });
      }

      return product;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Create product error:', error);
    if ((error as Error).message === 'COMBO_NEED_AT_LEAST_TWO_PRODUCTS') {
      return res.status(400).json({ message: 'Combo phải chọn ít nhất 2 sản phẩm thành phần' });
    }
    if ((error as Error).message === 'COMBO_PRODUCT_NOT_FOUND') {
      return res.status(400).json({ message: 'Có sản phẩm thành phần không tồn tại' });
    }
    res.status(500).json({ message: 'Lỗi khi tạo sản phẩm' });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const {
      name,
      vatName,
      vatRate,
      categoryId, // New field
      type, // Legacy, use as fallback if needed or update category
      description,
      listPriceNet,
      minSellPriceNet,
      unit,
      thumbnail,
      gallery,
      status,
      // Bio details
      volume,
      weight,
      packType,
      ingredients,
      usage,
      expiryPeriod,
      // Tech details
      specifications,
      warrantyDuration,
      maintenancePeriod,
      manufacturer,
      modelYear,
      // Stock threshold
      lowStockThreshold,
      packagingSpec: packagingSpecBody,
      comboProductIds,
    } = req.body;

    let newPackaging: string | null | undefined = undefined;
    if (packagingSpecBody !== undefined) {
      newPackaging =
        String(packagingSpecBody ?? '').trim() === ''
          ? null
          : String(packagingSpecBody).trim().slice(0, 500);
    } else if (packType !== undefined) {
      newPackaging =
        String(packType ?? '').trim() === '' ? null : String(packType).trim().slice(0, 500);
    }

    const finalWeight = weight ? Number(weight) : undefined;
    if (finalWeight !== undefined && finalWeight <= 0) {
      return res.status(400).json({ message: 'Vui lòng nhập khối lượng hợp lệ lớn hơn 0' });
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      return res.status(404).json({ message: 'Không tìm thấy sản phẩm' });
    }

    // Resolve Category
    let finalCategoryId = categoryId;
    if (!finalCategoryId && type) {
        const cat = await prisma.productCategory.findUnique({ where: { code: type } });
        if (cat) finalCategoryId = cat.id;
    }

    // Check if category is being updated and has validation
    if (finalCategoryId && finalCategoryId !== product.categoryId) {
        const cat = await prisma.productCategory.findUnique({ where: { id: finalCategoryId } });
        if (!cat) return res.status(400).json({ message: 'Danh mục không tồn tại' });
    }
    let normalizedComboProductIds = normalizeComboProductIds(comboProductIds);
    normalizedComboProductIds = normalizedComboProductIds.filter((componentId) => componentId !== id);

    const result = await prisma.$transaction(async (tx) => {
      const updatedProduct = await tx.product.update({
        where: { id },
        data: {
          name,
          vatName,
          vatRate: vatRate !== undefined ? Number(vatRate) : undefined,
          categoryId: finalCategoryId, // Update category
          description,
          listPriceNet: listPriceNet ? Number(listPriceNet) : undefined,
          minSellPriceNet: minSellPriceNet !== undefined ? Number(minSellPriceNet) : undefined,
          unit,
          thumbnail,
          gallery,
          status,
          ...(finalWeight !== undefined ? { weight: finalWeight } : {}),
          lowStockThreshold: lowStockThreshold !== undefined ? Number(lowStockThreshold) : undefined,
          ...(newPackaging !== undefined ? { packagingSpec: newPackaging } : {}),
        },
      });

      // Fetch category code for logic branching
      const category = finalCategoryId 
          ? await tx.productCategory.findUnique({ where: { id: finalCategoryId } })
          : (product.categoryId ? await tx.productCategory.findUnique({ where: { id: product.categoryId } }) : null);
      
      const categoryCode = category?.code || 'BIO'; // Fallback to BIO if unknown
      if (categoryCode === 'COMBO') {
        if (normalizedComboProductIds.length < 2) {
          throw new Error('COMBO_NEED_AT_LEAST_TWO_PRODUCTS');
        }
        const validProducts = await tx.product.findMany({
          where: { id: { in: normalizedComboProductIds } },
          select: { id: true },
        });
        if (validProducts.length !== normalizedComboProductIds.length) {
          throw new Error('COMBO_PRODUCT_NOT_FOUND');
        }
      }

      const bioPackForRow =
        newPackaging !== undefined ? newPackaging : updatedProduct.packagingSpec ?? null;

      if (categoryCode === 'BIO') {
        await tx.productBio.upsert({
          where: { productId: id },
          create: {
            productId: id,
            volume: volume ? Number(volume) : null,
            weight: weight ? Number(weight) : null,
            packType: bioPackForRow,
            ingredients,
            usage,
            expiryPeriod: expiryPeriod ? Number(expiryPeriod) : null,
          },
          update: {
            volume: volume ? Number(volume) : null,
            weight: finalWeight,
            ...(newPackaging !== undefined ? { packType: newPackaging } : {}),
            ingredients,
            usage,
            expiryPeriod: expiryPeriod ? Number(expiryPeriod) : null,
          },
        });
        await tx.productTech.deleteMany({ where: { productId: id } });
        await tx.productComboItem.deleteMany({ where: { comboProductId: id } });
      } else if (categoryCode === 'TECH') {
        await tx.productTech.upsert({
          where: { productId: id },
          create: {
            productId: id,
            specifications: specifications || {},
            warrantyDuration: Number(warrantyDuration || 12),
            maintenancePeriod: maintenancePeriod ? Number(maintenancePeriod) : null,
            manufacturer,
            modelYear: modelYear ? Number(modelYear) : null,
          },
          update: {
            specifications: specifications || {},
            warrantyDuration: Number(warrantyDuration || 12),
            maintenancePeriod: maintenancePeriod ? Number(maintenancePeriod) : null,
            manufacturer,
            modelYear: modelYear ? Number(modelYear) : null,
          },
        });
        await tx.productBio.deleteMany({ where: { productId: id } });
        await tx.productComboItem.deleteMany({ where: { comboProductId: id } });
      } else if (categoryCode === 'GIFT') {
        await tx.productBio.deleteMany({ where: { productId: id } });
        await tx.productTech.deleteMany({ where: { productId: id } });
        await tx.productComboItem.deleteMany({ where: { comboProductId: id } });
      } else if (categoryCode === 'COMBO') {
        await tx.productBio.deleteMany({ where: { productId: id } });
        await tx.productTech.deleteMany({ where: { productId: id } });
        await tx.productComboItem.deleteMany({ where: { comboProductId: id } });
        await tx.productComboItem.createMany({
          data: normalizedComboProductIds.map((componentProductId) => ({
            comboProductId: id,
            componentProductId,
          })),
          skipDuplicates: true,
        });
      }

      return updatedProduct;
    });

    res.json(result);
  } catch (error) {
    console.error('Update product error:', error);
    if ((error as Error).message === 'COMBO_NEED_AT_LEAST_TWO_PRODUCTS') {
      return res.status(400).json({ message: 'Combo phải chọn ít nhất 2 sản phẩm thành phần' });
    }
    if ((error as Error).message === 'COMBO_PRODUCT_NOT_FOUND') {
      return res.status(400).json({ message: 'Có sản phẩm thành phần không tồn tại' });
    }
    res.status(500).json({ message: 'Lỗi khi cập nhật sản phẩm' });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    
    // Check if product is used in orders or campaigns
    const usedInOrders = await prisma.orderItem.findFirst({ where: { productId: id } });
    if (usedInOrders) {
      return res.status(400).json({ message: 'Không thể xóa sản phẩm đã có đơn hàng' });
    }
    const usedInCombo = await prisma.productComboItem.findFirst({ where: { componentProductId: id } });
    if (usedInCombo) {
      return res.status(400).json({ message: 'Không thể xóa sản phẩm đang nằm trong combo' });
    }

    await prisma.product.delete({ where: { id } });
    res.json({ message: 'Đã xóa sản phẩm thành công' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa sản phẩm' });
  }
};

export const exportProducts = async (req: Request, res: Response) => {
  try {
    const { search, type, status } = req.query;
    
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    if (type) {
      if (type === 'GIFT' || type === 'BIO' || type === 'TECH' || type === 'COMBO') {
          where.category = { code: type as string };
      } else {
          where.category = { code: type as string };
      }
    }

    if (status) {
      where.status = status as Status;
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        category: true,
        bioDetail: true,
        techDetail: true,
      },
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Products');

    worksheet.columns = [
      { header: 'Mã sản phẩm', key: 'code', width: 20 },
      { header: 'Tên thường gọi', key: 'name', width: 40 },
      { header: 'Tên VAT', key: 'vatName', width: 40 },
      { header: 'Loại', key: 'category', width: 20 },
      { header: 'Mô tả', key: 'description', width: 50 },
      { header: 'Giá niêm yết (chưa VAT)', key: 'listPriceNet', width: 15 },
      { header: 'Giá tối thiểu (chưa VAT)', key: 'minSellPriceNet', width: 15 },
      { header: 'VAT (%)', key: 'vatRate', width: 10 },
      { header: 'Đơn vị', key: 'unit', width: 10 },
      { header: 'Khối lượng', key: 'weight', width: 15 },
      { header: 'Quy cách đóng gói', key: 'packagingSpec', width: 28 },
      { header: 'Trạng thái', key: 'status', width: 15 },
      { header: 'Thành phần', key: 'ingredients', width: 30 },
      { header: 'Công dụng', key: 'usage', width: 30 },
      { header: 'Hạn sử dụng (tháng)', key: 'expiryPeriod', width: 15 },
    ];

    products.forEach((product) => {
      worksheet.addRow({
        code: product.code,
        name: product.name,
        vatName: product.vatName || '',
        category: product.category?.name || '',
        description: product.description,
        listPriceNet: product.listPriceNet,
        minSellPriceNet: product.minSellPriceNet,
        vatRate: product.vatRate,
        unit: product.unit,
        weight: product.weight,
        packagingSpec: product.packagingSpec || product.bioDetail?.packType || '',
        status: product.status,
        ingredients: product.bioDetail?.ingredients || '',
        usage: product.bioDetail?.usage || '',
        expiryPeriod: product.bioDetail?.expiryPeriod || '',
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'products.xlsx'
    );

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error('Export products error:', error);
    res.status(500).json({ message: 'Lỗi khi xuất danh sách sản phẩm' });
  }
};

export const downloadTemplate = async (req: Request, res: Response) => {
  try {
    await ensureDefaultProductCategories();
    const categories = await prisma.productCategory.findMany({
      orderBy: [{ name: 'asc' }],
      select: { code: true, name: true },
    });
    const unitRows = await prisma.product.findMany({
      select: { unit: true },
      distinct: ['unit'],
    });
    const units = Array.from(
      new Set([...DEFAULT_PRODUCT_UNITS, ...unitRows.map((u) => toCellText(u.unit)).filter(Boolean)])
    ).sort((a, b) => a.localeCompare(b, 'vi'));
    const statuses = ['ACTIVE', 'INACTIVE'];

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template');
    const listSheet = workbook.addWorksheet('DanhMuc');
    listSheet.state = 'hidden';

    listSheet.getCell('A1').value = 'LoaiSanPham';
    categories.forEach((cat, idx) => {
      listSheet.getCell(`A${idx + 2}`).value = cat.name;
    });
    listSheet.getCell('B1').value = 'DonVi';
    units.forEach((unit, idx) => {
      listSheet.getCell(`B${idx + 2}`).value = unit;
    });
    listSheet.getCell('C1').value = 'TrangThai';
    statuses.forEach((status, idx) => {
      listSheet.getCell(`C${idx + 2}`).value = status;
    });

    // Create header row
    worksheet.columns = [
      { header: 'Mã sản phẩm', key: 'code', width: 18 },
      { header: 'Tên thường gọi', key: 'name', width: 30 },
      { header: 'Tên VAT', key: 'vatName', width: 30 },
      { header: 'Loại sản phẩm', key: 'type', width: 30 },
      { header: 'Giá niêm yết (chưa VAT)', key: 'listPriceNet', width: 22 },
      { header: 'Giá tối thiểu (chưa VAT)', key: 'minSellPriceNet', width: 22 },
      { header: 'VAT (%)', key: 'vatRate', width: 10 },
      { header: 'Đơn vị tính', key: 'unit', width: 16 },
      { header: 'Quy cách đóng gói', key: 'packagingSpec', width: 24 },
      { header: 'Mô tả', key: 'description', width: 40 },
      { header: 'Khối lượng', key: 'weight', width: 15 },
      { header: 'Trạng thái', key: 'status', width: 25 },
      // BIO fields
      { header: '[BIO] Thể tích (ml)', key: 'bioVolume', width: 15 },
      { header: '[BIO] Thành phần', key: 'bioIngredients', width: 30 },
      { header: '[BIO] Công dụng', key: 'bioUsage', width: 30 },
      { header: '[BIO] Hạn sử dụng (tháng)', key: 'bioExpiryPeriod', width: 20 },
      // TECH fields
      { header: '[TECH] Bảo hành (tháng)', key: 'techWarranty', width: 20 },
      { header: '[TECH] Bảo trì (tháng)', key: 'techMaintenance', width: 20 },
      { header: '[TECH] Nhà sản xuất', key: 'techManufacturer', width: 20 },
      { header: '[TECH] Năm sản xuất', key: 'techModelYear', width: 15 },
    ];

    const requiredHeaders = new Set(['code', 'name', 'type', 'listPriceNet', 'minSellPriceNet', 'unit']);
    const headerRow = worksheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
      const key = String(worksheet.getColumn(colNumber).key || '');
      const baseText = String(cell.value ?? '');
      if (requiredHeaders.has(key)) {
        cell.value = {
          richText: [
            { text: baseText },
            { text: ' *', font: { color: { argb: 'FFFF0000' }, bold: true } },
          ],
        };
      } else {
        cell.value = baseText;
      }
      cell.font = { bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    headerRow.height = 24;

    for (let rowIdx = 2; rowIdx <= 2000; rowIdx++) {
      worksheet.getCell(`D${rowIdx}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`DanhMuc!$A$2:$A$${Math.max(categories.length + 1, 2)}`],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Giá trị không hợp lệ',
        error: 'Vui lòng chọn Loại sản phẩm từ danh sách.',
      };
      worksheet.getCell(`H${rowIdx}`).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`DanhMuc!$B$2:$B$${Math.max(units.length + 1, 2)}`],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Giá trị không hợp lệ',
        error: 'Vui lòng chọn Đơn vị tính từ danh sách.',
      };
      worksheet.getCell(`K${rowIdx}`).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`DanhMuc!$C$2:$C$${statuses.length + 1}`],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Giá trị không hợp lệ',
        error: 'Vui lòng chọn Trạng thái từ danh sách.',
      };
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=' + 'product_import_template.xlsx'
    );

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(buffer);
  } catch (error) {
    console.error('Download template error:', error);
    res.status(500).json({ message: 'Lỗi khi tải mẫu import' });
  }
};

export const importProducts = async (req: Request, res: Response) => {
  try {
    await ensureDefaultProductCategories();
    if (!req.file) {
      return res.status(400).json({ message: 'Vui lòng tải lên file Excel' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(req.file.buffer) as any);
    const worksheet = workbook.worksheets[0];
    if (!worksheet || worksheet.rowCount <= 1) {
      return res.status(400).json({ message: 'File Excel trống' });
    }

    const headerRow = worksheet.getRow(1);
    const headerMap = new Map<string, number>();
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = toHeaderKey(cell.value);
      if (key) headerMap.set(key, col - 1);
    });

    const packCol =
      headerMap.get('quy cách đóng gói') ??
      headerMap.get('packaging_spec') ??
      headerMap.get('packagingspec') ??
      headerMap.get('quy cach dong goi');

    const col = {
      code: headerMap.get('ma san pham') ?? 0,
      name: headerMap.get('ten thuong goi') ?? 1,
      vatName: headerMap.get('ten vat') ?? 2,
      type: headerMap.get('loai san pham') ?? headerMap.get('ma loai') ?? 3,
      listPriceNet: headerMap.get('gia niem yet') ?? 4,
      minSellPriceNet: headerMap.get('gia toi thieu') ?? 5,
      vatRate: headerMap.get('vat') ?? 6,
      unit: headerMap.get('don vi tinh') ?? 7,
      description: headerMap.get('mo ta') ?? 9,
      weight: headerMap.get('khoi luong') ?? 10,
      status: headerMap.get('trang thai') ?? 11,
      bioVolume: headerMap.get('the tich') ?? 12,
      bioIngredients: headerMap.get('thanh phan') ?? 13,
      bioUsage: headerMap.get('cong dung') ?? 14,
      bioExpiryPeriod: headerMap.get('han su dung') ?? 15,
      techWarranty: headerMap.get('bao hanh') ?? 16,
      techMaintenance: headerMap.get('bao tri') ?? 17,
      techManufacturer: headerMap.get('nha san xuat') ?? 18,
      techModelYear: headerMap.get('nam san xuat') ?? 19,
    };

    const categories = await prisma.productCategory.findMany({ select: { id: true, code: true, name: true } });
    const categoryByCode = new Map(categories.map((c) => [c.code.toUpperCase(), c]));
    const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c]));
    const unitRows = await prisma.product.findMany({ select: { unit: true }, distinct: ['unit'] });
    const allowedUnits = new Set(
      [...DEFAULT_PRODUCT_UNITS, ...unitRows.map((u) => toCellText(u.unit)).filter(Boolean)].map((u) =>
        u.trim().toLowerCase()
      )
    );
    const allowedStatuses = new Set(['ACTIVE', 'INACTIVE']);

    const data: Array<{ rowNumber: number; values: any[] }> = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const values: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        values[colNumber - 1] = cell.value;
      });
      data.push({ rowNumber: i, values });
    }

    let successCount = 0;
    let failCount = 0;
    const errors: Array<{ row: number; message: string }> = [];

    for (const { rowNumber, values } of data) {
      const code = toCellText(values[col.code]).toUpperCase();
      if (!code) continue;

      try {
        const name = toCellText(values[col.name]);
        const vatName = toCellText(values[col.vatName]);
        const typeRaw = toCellText(values[col.type]);
        const listPriceNet = parseNumberOrNull(values[col.listPriceNet]);
        const minSellPriceNet = parseNumberOrNull(values[col.minSellPriceNet]);
        const vatRate = parseNumberOrNull(values[col.vatRate]) ?? 0;
        const unit = toCellText(values[col.unit]);
        const description = toCellText(values[col.description]);
        const statusRaw = toCellText(values[col.status]).toUpperCase();

        if (!name) throw new Error('Thiếu Tên thường gọi');
        if (!typeRaw) throw new Error('Thiếu Loại sản phẩm');
        if (listPriceNet == null) throw new Error('Thiếu hoặc sai định dạng Giá niêm yết');
        if (minSellPriceNet == null) throw new Error('Thiếu hoặc sai định dạng Giá tối thiểu');
        if (!unit) throw new Error('Thiếu Đơn vị tính');

        const category =
          categoryByCode.get(typeRaw.toUpperCase()) || categoryByName.get(typeRaw.trim().toLowerCase());
        if (!category) {
          throw new Error('Loại sản phẩm không hợp lệ (phải chọn từ danh sách mẫu)');
        }
        if (!allowedUnits.has(unit.trim().toLowerCase())) {
          throw new Error('Đơn vị tính không hợp lệ (phải chọn từ danh sách mẫu)');
        }
        if (statusRaw && !allowedStatuses.has(statusRaw)) {
          throw new Error('Trạng thái không hợp lệ (chỉ ACTIVE/INACTIVE)');
        }
        const status: Status = statusRaw === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE';

        const weightRaw = parseNumberOrNull(values[col.weight]);
        const finalWeight = weightRaw ? Number(weightRaw) : 0;

        const bioVolume = parseNumberOrNull(values[col.bioVolume]);
        let packagingSpecRow: string | null | undefined = undefined;
        if (packCol !== undefined) {
          const packagingRaw = toCellText(values[packCol]);
          packagingSpecRow =
            packagingRaw.length > 500 ? packagingRaw.slice(0, 500) : packagingRaw || null;
        }
        const bioIngredients = toCellText(values[col.bioIngredients]);
        const bioUsage = toCellText(values[col.bioUsage]);
        const bioExpiryPeriod = parseNumberOrNull(values[col.bioExpiryPeriod]);

        const techWarranty = parseNumberOrNull(values[col.techWarranty]) ?? 12;
        const techMaintenance = parseNumberOrNull(values[col.techMaintenance]);
        const techManufacturer = toCellText(values[col.techManufacturer]);
        const techModelYear = parseNumberOrNull(values[col.techModelYear]);

        await prisma.$transaction(async (tx) => {
          const product = await tx.product.upsert({
            where: { code },
            update: {
              name,
              vatName,
              vatRate,
              categoryId: category.id,
              listPriceNet,
              minSellPriceNet,
              unit,
              description,
              status,
              weight: finalWeight,
              ...(packagingSpecRow !== undefined ? { packagingSpec: packagingSpecRow } : {}),
            },
            create: {
              code,
              name,
              vatName,
              vatRate,
              categoryId: category.id,
              listPriceNet,
              minSellPriceNet,
              unit,
              description,
              status,
              weight: finalWeight,
              packagingSpec: packagingSpecRow !== undefined ? packagingSpecRow : null,
            },
          });

          if (category.code === 'BIO') {
            await tx.productBio.upsert({
              where: { productId: product.id },
              create: {
                productId: product.id,
                volume: bioVolume,
                weight: finalWeight,
                packType: packagingSpecRow !== undefined ? packagingSpecRow : null,
                ingredients: bioIngredients,
                usage: bioUsage,
                expiryPeriod: bioExpiryPeriod,
              },
              update: {
                volume: bioVolume,
                weight: finalWeight,
                ...(packagingSpecRow !== undefined ? { packType: packagingSpecRow } : {}),
                ingredients: bioIngredients,
                usage: bioUsage,
                expiryPeriod: bioExpiryPeriod,
              },
            });
            await tx.productTech.deleteMany({ where: { productId: product.id } });
          } else if (category.code === 'TECH') {
            await tx.productTech.upsert({
              where: { productId: product.id },
              create: {
                productId: product.id,
                warrantyDuration: techWarranty,
                maintenancePeriod: techMaintenance,
                manufacturer: techManufacturer,
                modelYear: techModelYear,
                specifications: {},
              },
              update: {
                warrantyDuration: techWarranty,
                maintenancePeriod: techMaintenance,
                manufacturer: techManufacturer,
                modelYear: techModelYear,
              },
            });
            await tx.productBio.deleteMany({ where: { productId: product.id } });
          } else {
            await tx.productBio.deleteMany({ where: { productId: product.id } });
            await tx.productTech.deleteMany({ where: { productId: product.id } });
          }
        });

        successCount++;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Lỗi không xác định';
        errors.push({ row: rowNumber, message });
        console.error(`Failed to import row ${rowNumber} (${code}):`, error);
        failCount++;
      }
    }

    res.json({
      message: 'Import hoàn tất',
      stats: { success: successCount, failed: failCount },
      errors,
    });

  } catch (error) {
    console.error('Import products error:', error);
    res.status(500).json({ message: 'Lỗi khi nhập danh sách sản phẩm' });
  }
};

export const getProductCategories = async (req: Request, res: Response) => {
  try {
    await ensureDefaultProductCategories();
    const categories = await prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    res.json(categories);
  } catch (error) {
    console.error('Get product categories error:', error);
    res.status(500).json({ message: 'Lỗi khi lấy danh sách loại sản phẩm' });
  }
};

export const createProductCategory = async (req: Request, res: Response) => {
  try {
    const code = String(req.body?.code || '').trim().toUpperCase();
    const name = String(req.body?.name || '').trim();
    const description = req.body?.description ? String(req.body.description) : null;

    if (!code || !name) {
      return res.status(400).json({ message: 'Vui lòng nhập mã và tên loại sản phẩm' });
    }

    const existing = await prisma.productCategory.findUnique({ where: { code } });
    if (existing) {
      return res.status(400).json({ message: 'Mã loại sản phẩm đã tồn tại' });
    }

    const category = await prisma.productCategory.create({
      data: { code, name, description },
    });

    res.status(201).json(category);
  } catch (error) {
    console.error('Create product category error:', error);
    res.status(500).json({ message: 'Lỗi khi tạo loại sản phẩm' });
  }
};

export const updateProductCategory = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const code = req.body?.code !== undefined ? String(req.body.code).trim().toUpperCase() : undefined;
    const name = req.body?.name !== undefined ? String(req.body.name).trim() : undefined;
    const description = req.body?.description !== undefined ? (req.body.description ? String(req.body.description) : null) : undefined;

    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy loại sản phẩm' });
    }

    if (code && code !== existing.code) {
      const dup = await prisma.productCategory.findUnique({ where: { code } });
      if (dup) {
        return res.status(400).json({ message: 'Mã loại sản phẩm đã tồn tại' });
      }
    }

    const updated = await prisma.productCategory.update({
      where: { id },
      data: {
        code,
        name,
        description,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update product category error:', error);
    res.status(500).json({ message: 'Lỗi khi cập nhật loại sản phẩm' });
  }
};

export const deleteProductCategory = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const existing = await prisma.productCategory.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ message: 'Không tìm thấy loại sản phẩm' });
    }

    const productCount = await prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      return res.status(400).json({ message: 'Không thể xóa loại đã có sản phẩm' });
    }

    await prisma.productCategory.delete({ where: { id } });
    res.json({ message: 'Đã xóa loại sản phẩm thành công' });
  } catch (error) {
    console.error('Delete product category error:', error);
    res.status(500).json({ message: 'Lỗi khi xóa loại sản phẩm' });
  }
};
