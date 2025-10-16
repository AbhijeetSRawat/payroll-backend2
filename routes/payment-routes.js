import express from 'express';
import {
  processMonthlySalary,
  getEmployeeSalary,
  approveSalaryPayment,
  markSalaryPaid,
  applyLoanAdvance,
  approveLoanAdvance,
  disburseLoanAdvance,
  getPaymentDashboard,
  generatePayslip
} from '../controllers/payment-controller.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// Salary Routes
router.post('/salary/process', restrictTo('Admin', 'HR'), processMonthlySalary);
router.get('/salary/employee/:employeeId', restrictTo('Admin', 'HR', 'Employee'), getEmployeeSalary);
router.put('/salary/:id/approve', restrictTo('Admin', 'HR'), approveSalaryPayment);
router.put('/salary/:id/pay', restrictTo('Admin', 'HR'), markSalaryPaid);
router.get('/payslip/:id', restrictTo('Admin', 'HR', 'Employee'), generatePayslip);

// Loan & Advance Routes
router.post('/loan-advance/apply', restrictTo('Admin', 'HR', 'Employee'), applyLoanAdvance);
router.put('/loan-advance/:id/approve', restrictTo('Admin', 'HR'), approveLoanAdvance);
router.put('/loan-advance/:id/disburse', restrictTo('Admin', 'HR'), disburseLoanAdvance);

// Dashboard
router.get('/dashboard', restrictTo('Admin', 'HR'), getPaymentDashboard);

export default router;
