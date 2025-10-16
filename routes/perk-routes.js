// routes/perkRoutes.js
import express from 'express';

import { protect, restrictTo } from '../middleware/authMiddleware.js';
import {
  createPerk,
  bulkCreatePerks,
  getCompanyPerks,
  getPerksByDepartment,
  assignPerkToEmployee,
  bulkAssignPerks,
  getEmployeePerks,
  updatePerkStatus,
  removeEmployeePerk
}  from '../controllers/perk-controllers.js';

const router = express.Router();

// All routes protected
router.use(protect);

// Perk management routes (HR/Admin only)
router.post('/', restrictTo('hr', 'admin', "superadmin"), createPerk);
router.post('/bulk', restrictTo('hr', 'admin', "superadmin"), bulkCreatePerks);
router.get('/company/:companyId', restrictTo('hr', 'admin', "superadmin"),  getCompanyPerks);
router.put('/:perkId/status', restrictTo('hr', 'admin', "superadmin"), updatePerkStatus);

// Department-based perks
router.get('/department/:departmentId', restrictTo('hr', 'admin', 'manager', "superadmin"), getPerksByDepartment);

// Employee perk assignment
router.post('/assign', restrictTo('hr', 'admin', "superadmin"), assignPerkToEmployee);
router.post('/assign/bulk', restrictTo('hr', 'admin', "superadmin"), bulkAssignPerks);
router.get('/employee/:employeeId', getEmployeePerks);
router.put('/remove/:employeePerkId', restrictTo('hr', 'admin', "superadmin"), removeEmployeePerk);

export default router;