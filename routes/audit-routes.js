import express from 'express';
import {
  getAuditLogsController,
  getAuditStatisticsController,
  searchAuditLogs,
  exportAuditLogs
} from '../controllers/audit-controller.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

// All audit routes are protected and admin-only
router.use(protect);
router.use(restrictTo('admin', 'superadmin'));

router.get('/logs', getAuditLogsController);
router.get('/statistics', getAuditStatisticsController);
router.get('/search', searchAuditLogs);
router.get('/export', exportAuditLogs);

export default router;
