import express from 'express';
import {
  applyForResignation,
  getResignations,
  withdrawResignation,
  getResignationsForManager,
  getResignationsForHR,
  getResignationsForAdmin,
  getResignationsForEmployee,
  managerApproveResignation,
  hrApproveResignation,
  adminApproveResignation,
  rejectResignation,
  bulkUpdateResignations,
  resetResignationForAll
} from '../controllers/resignation-controllers.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';


const router = express.Router();

// Employee routes
router.post('/apply/:userId', protect, applyForResignation);
router.put('/withdraw/:resignationId', protect, withdrawResignation);
router.get('/employee/:employeeId', protect, getResignationsForEmployee);

// Manager routes
router.put('/manager-approval/:resignationId', protect, restrictTo('manager', 'admin',"superadmin"), managerApproveResignation);
router.get('/manager/:managerId', protect, restrictTo('manager', 'admin',"superadmin"), getResignationsForManager);

// HR routes
router.put('/hr-approval/:resignationId', protect, restrictTo('hr', 'admin',"superadmin"), hrApproveResignation);
router.get('/hr/:hrId', protect, restrictTo('hr', 'admin',"superadmin"), getResignationsForHR);

// Admin routes
router.put('/admin-approval/:resignationId', protect, restrictTo('admin',"superadmin"), adminApproveResignation);
router.get('/admin/:adminId', protect, restrictTo('admin',"superadmin"), getResignationsForAdmin);

//bulk-update
router.put('/bulk-update', protect, restrictTo('manager', 'hr', 'admin','manager','superadmin'), bulkUpdateResignations)

//reject
router.put('/reject/:resignationId', protect, restrictTo('manager', 'hr', 'admin','manager','superadmin'), rejectResignation)

// General routes
router.get('/', protect, getResignations);

router.put('/test', resetResignationForAll)


export default router;