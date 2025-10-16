// // routes/reimbursement-routes.js
// // routes/reimbursement-routes.js
// import express from 'express';
// import {
//   createReimbursement,
//   updateReimbursementStatus,
//   getCompanyReimbursements,
//   getEmployeeReimbursements,
//   bulkUpdateReimbursementStatus
// } from '../controllers/reimbursement-controllers.js';
// import { protect, restrictTo } from '../middleware/protect.js';


// const router = express.Router();

// router.post('/', protect, createReimbursement);
// router.put('/:id/status', protect, updateReimbursementStatus);
// router.get('/company/:companyId', protect, getCompanyReimbursements);
// router.get('/employee/:employeeId', protect, getEmployeeReimbursements);
// router.patch('/bulkupdate', protect, restrictTo("superadmin", "admin","subadmin"), bulkUpdateReimbursementStatus);

// export default router;

// routes/reimbursementRoutes.js
import express from "express";
import {
  applyReimbursement,
  managerApproveReimbursement,
  hrApproveReimbursement,
  adminApproveReimbursement,
  rejectReimbursement,
  bulkUpdateReimbursements,
  getPendingReimbursementsByLevel,
  getReimbursementsForManager,
  getReimbursementsForHR,
  getReimbursementsForAdmin,
  getReimbursementsForEmployee,
  markAsPaid
} from '../controllers/reimbursement-controllers.js';
import { protect, restrictTo } from "../middleware/authMiddleware.js";



const router = express.Router();

// Employee applies for reimbursement
router.post("/apply", protect, applyReimbursement);

// Approvals
router.put("/manager/approve/:id", protect, managerApproveReimbursement);
router.put("/hr/approve/:id", protect, hrApproveReimbursement);
router.put("/admin/approve/:id", protect, adminApproveReimbursement);
router.put("/admin/mark-as-paid/:reimbursementId", protect, restrictTo("admin","superadmin"), markAsPaid);

// Reject at any level
router.put("/reject/:id", protect, rejectReimbursement);

// Bulk update reimbursements (approve/reject multiple)
router.put("/bulk-update", protect, bulkUpdateReimbursements);

// Pending reimbursements by level (manager/hr/admin)
router.get("/pending/:level", protect, getPendingReimbursementsByLevel);

// Reimbursements for specific roles
router.get("/manager/:managerId", protect, getReimbursementsForManager);
router.get("/hr/:hrId", protect, getReimbursementsForHR);
router.get("/admin/:adminId", protect, getReimbursementsForAdmin);
router.get("/employee/:employeeId", protect, getReimbursementsForEmployee);


export default router;
