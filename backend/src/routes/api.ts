import { Router } from 'express';
import authRoutes from './authRoutes';
import customerRoutes from './customerRoutes';
import logRoutes from './logRoutes';
import internalNoteRoutes from './internalNoteRoutes';
import notificationRoutes from './notificationRoutes';
import documentRoutes from './documentRoutes';
import dashboardRoutes from './dashboardRoutes';
import hrRoutes from './hrRoutes';
import roleGroupRoutes from './roleGroupRoutes';
import contractRoutes from './contractRoutes';
import chatRoutes from './chatRoutes';
import marketingRoutes from './marketingRoutes';
import productRoutes from './productRoutes';
import warrantyRoutes from './warrantyRoutes';
import dataPoolRoutes from './dataPoolRoutes';
import salesRoutes from './salesRoutes';
import resalesRoutes from './resalesRoutes';
import orderRoutes from './orderRoutes';
import publicApiRoutes from './publicApiRoutes';
import userNotificationRoutes from './userNotificationRoutes';
import systemConfigRoutes from './systemConfigRoutes';
import accountingRoutes from './accountingRoutes';
import customerRankRoutes from './customerRankRoutes';
import addressRoutes from './addressRoutes';
import webhookRoutes from './webhookRoutes';
import leaveRequestRoutes from './leaveRequestRoutes';
import performanceRoutes from './performanceRoutes';
import divisionRoutes from './divisionRoutes';
import reportRoutes from './reportRoutes';
import marketingGroupRoutes from './marketingGroupRoutes';
import supportTicketRoutes from './supportTicketRoutes';
import seedRoutes from './seedRoutes';
import inventoryRoutes from './inventoryRoutes';
import customerStatusRoutes from './customerStatusRoutes';

const router = Router();

// Mount all routes
// We use '/' because the individual route files define their full paths relative to /api
// e.g. authRoutes defines '/login', so mounted here it becomes '/login', and in app.ts mounted on '/api', it becomes '/api/login'

router.use('/', authRoutes);
// Public lead (X-API-Key) đăng ký sớm — tránh bị middleware của router mount sau (vd. dashboard) chặn trước.
router.use('/', publicApiRoutes);
router.use('/', customerRoutes);
router.use('/', logRoutes);
router.use('/', internalNoteRoutes);
router.use('/', notificationRoutes);
router.use('/', documentRoutes);
router.use('/', dashboardRoutes);
router.use('/hr', hrRoutes);
router.use('/role-groups', roleGroupRoutes);
router.use('/contracts', contractRoutes);
router.use('/chat', chatRoutes);
router.use('/products', productRoutes);
router.use('/warranty', warrantyRoutes);
router.use('/', marketingRoutes);
router.use('/data-pool', dataPoolRoutes);
router.use('/sales', salesRoutes);
router.use('/resales', resalesRoutes);
router.use('/orders', orderRoutes);
router.use('/user-notifications', userNotificationRoutes);
router.use('/system-configs', systemConfigRoutes);
router.use('/accounting', accountingRoutes);
router.use('/customer-ranks', customerRankRoutes);
router.use('/customer-statuses', customerStatusRoutes);
router.use('/', addressRoutes);
router.use('/webhook', webhookRoutes);
router.use('/leave-requests', leaveRequestRoutes);
router.use('/performance', performanceRoutes);
router.use('/divisions', divisionRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/marketing-groups', marketingGroupRoutes);
router.use('/support-tickets', supportTicketRoutes);
router.use('/seed', seedRoutes);
router.use('/inventory', inventoryRoutes);

export default router;
