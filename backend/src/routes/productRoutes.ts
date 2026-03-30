import { Router } from 'express';
import { getProducts, getProduct, getProductOptions, createProduct, updateProduct, deleteProduct, exportProducts, importProducts, downloadTemplate, uploadProductImage, getProductUnits, getProductCategories, createProductCategory, updateProductCategory, deleteProductCategory } from '../controllers/productController';
import { authenticate, checkPermission } from '../middleware/authMiddleware';
import { excelUploadMiddleware } from '../middleware/excelUploadMiddleware';
import multer from 'multer';
import { capUploadFileSize } from '../config/publicUploadUrl';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: capUploadFileSize(25 * 1024 * 1024) }
});

// Everyone can view products if authenticated
router.get('/', authenticate, getProducts);
router.get('/options', authenticate, getProductOptions);
router.get('/units', authenticate, getProductUnits);
router.get('/categories', authenticate, getProductCategories);
router.get('/export', authenticate, exportProducts);
router.get('/template', authenticate, downloadTemplate);
router.get('/:id', authenticate, getProduct);

// Only MANAGE_PRODUCTS can modify
router.post('/', authenticate, checkPermission('MANAGE_PRODUCTS'), createProduct);
router.post('/categories', authenticate, checkPermission('MANAGE_PRODUCTS'), createProductCategory);
router.post('/import', authenticate, checkPermission('MANAGE_PRODUCTS'), excelUploadMiddleware.single('file'), importProducts);
router.put('/:id', authenticate, checkPermission('MANAGE_PRODUCTS'), updateProduct);
router.put('/categories/:id', authenticate, checkPermission('MANAGE_PRODUCTS'), updateProductCategory);
router.delete('/:id', authenticate, checkPermission('MANAGE_PRODUCTS'), deleteProduct);
router.delete('/categories/:id', authenticate, checkPermission('MANAGE_PRODUCTS'), deleteProductCategory);

// Image upload
router.post('/:id/image', authenticate, checkPermission('MANAGE_PRODUCTS'), upload.single('image'), uploadProductImage);

export default router;
