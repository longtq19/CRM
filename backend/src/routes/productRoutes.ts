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

// Everyone can view products if authenticated and has permission
const VIEW_PRODUCT_PERMS = ['VIEW_PRODUCTS', 'MANAGE_PRODUCTS'] as const;
router.get('/', authenticate, checkPermission([...VIEW_PRODUCT_PERMS]), getProducts);
router.get('/options', authenticate, checkPermission([...VIEW_PRODUCT_PERMS]), getProductOptions);
router.get('/units', authenticate, checkPermission([...VIEW_PRODUCT_PERMS]), getProductUnits);
router.get('/categories', authenticate, checkPermission([...VIEW_PRODUCT_PERMS]), getProductCategories);
router.get('/export', authenticate, checkPermission([...VIEW_PRODUCT_PERMS]), exportProducts);
router.get('/template', authenticate, checkPermission([...VIEW_PRODUCT_PERMS]), downloadTemplate);
router.get('/:id', authenticate, checkPermission([...VIEW_PRODUCT_PERMS]), getProduct);

// Only MANAGE_PRODUCTS or specific CRUD can modify
router.post('/', authenticate, checkPermission(['MANAGE_PRODUCTS', 'CREATE_PRODUCT']), createProduct);
router.post('/categories', authenticate, checkPermission(['MANAGE_PRODUCTS', 'CREATE_PRODUCT']), createProductCategory);
router.post('/import', authenticate, checkPermission(['MANAGE_PRODUCTS', 'CREATE_PRODUCT']), excelUploadMiddleware.single('file'), importProducts);
router.put('/:id', authenticate, checkPermission(['MANAGE_PRODUCTS', 'UPDATE_PRODUCT']), updateProduct);
router.put('/categories/:id', authenticate, checkPermission(['MANAGE_PRODUCTS', 'UPDATE_PRODUCT']), updateProductCategory);
router.delete('/:id', authenticate, checkPermission(['MANAGE_PRODUCTS', 'DELETE_PRODUCT']), deleteProduct);
router.delete('/categories/:id', authenticate, checkPermission(['MANAGE_PRODUCTS', 'DELETE_PRODUCT']), deleteProductCategory);

// Image upload
router.post('/:id/image', authenticate, checkPermission(['MANAGE_PRODUCTS', 'UPDATE_PRODUCT']), upload.single('image'), uploadProductImage);

export default router;
