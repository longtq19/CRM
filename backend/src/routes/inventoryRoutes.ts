
import { Router } from 'express';
import { 
  getWarehouses,
  getWarehouseDetail,
  createWarehouse, 
  updateWarehouse, 
  deleteWarehouse, 
  getStocks, 
  createTransaction,
  getTransactions,
  getTransactionDetail,
  getInventoryLogs,
  adjustStock,
  importReturnedStock,
  reportDamagedStock
} from '../controllers/inventoryController';
import { authenticate, checkPermission } from '../middleware/authMiddleware';

const router = Router();

// Warehouses
router.get('/warehouses', authenticate, getWarehouses);
router.get('/warehouses/:id', authenticate, getWarehouseDetail);
router.post('/warehouses', authenticate, checkPermission('MANAGE_WAREHOUSE'), createWarehouse);
router.put('/warehouses/:id', authenticate, checkPermission('MANAGE_WAREHOUSE'), updateWarehouse);
router.delete('/warehouses/:id', authenticate, checkPermission('MANAGE_WAREHOUSE'), deleteWarehouse);

// Stocks
router.get('/stocks', authenticate, getStocks);

// Transactions
router.get('/transactions', authenticate, getTransactions);
router.get('/transactions/:id', authenticate, getTransactionDetail);
router.post('/transactions', authenticate, checkPermission('MANAGE_WAREHOUSE'), createTransaction);

// Inventory Logs
router.get('/logs', authenticate, getInventoryLogs);

// Stock adjustments (bắt buộc note lý do)
router.post('/adjust', authenticate, checkPermission('MANAGE_WAREHOUSE'), adjustStock);
router.post('/import-returned', authenticate, checkPermission('MANAGE_WAREHOUSE'), importReturnedStock);
router.post('/report-damaged', authenticate, checkPermission('MANAGE_WAREHOUSE'), reportDamagedStock);

export default router;
