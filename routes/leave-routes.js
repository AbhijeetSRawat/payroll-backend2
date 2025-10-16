import express from 'express';
import {
  applyLeave,
  managerApprove,
  hrApprove,
  adminApprove,
  rejectLeave,
  getPendingLeavesByLevel,
  cancelLeave,
  bulkUpdateLeaves,
  getCancelledLeavesForCompany,
  getLeavesForManager,
  getLeavesForHR,
  getLeavesForAdmin,
  getLeavesForEmployee,
  getRestLeaveOfEmployee
} from '../controllers/leave-controller.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Leave Application
 */
router.post('/apply', protect, applyLeave);

/**
 * Approval Flow
 */
router.put('/:id/manager-approve', protect, restrictTo('manager',"superadmin","admin"), managerApprove);
router.put('/:id/hr-approve', protect, restrictTo('hr',"superadmin","admin"), hrApprove);
router.put('/:id/admin-approve', protect, restrictTo('admin',"superadmin"), adminApprove);

/**
 * Rejection (any level)
 */
router.put('/:id/reject', protect, rejectLeave);

/**
 * Pending Leaves (by level)
 */
router.get('/pending/:level', protect, getPendingLeavesByLevel);

/**
 * Cancel Leave (by employee or admin)
 */
router.put('/:id/:employeeId/cancel',protect,  cancelLeave);

/**
 * Bulk Approval / Rejection
 */
router.put('/bulk/update/:userId', protect, restrictTo('manager', 'hr', 'admin', 'superadmin'), bulkUpdateLeaves);

/**
 * Get Cancelled Leaves for Company
 */
router.get('/company/:companyId/cancelled', protect, getCancelledLeavesForCompany);
4
/**
 * Manager-specific view (leaves from their department employees)
 */
router.get('/manager/leaves/:managerId', protect, restrictTo('manager','admin','superadmin'), getLeavesForManager);
router.get('/hr/leaves/:hrId',protect, restrictTo('hr','admin','superadmin'), getLeavesForHR)
router.get('/admin/leaves/:adminId', getLeavesForAdmin)
router.get('/employee/leaves/:employeeId',protect, restrictTo('hr','manager','admin','superadmin','employee'), getLeavesForEmployee)

router.get('/:employeeId/summary',protect, restrictTo('hr','manager','admin','superadmin','employee'),  getRestLeaveOfEmployee);

export default router;
