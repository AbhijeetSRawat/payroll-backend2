import express from 'express';
import {
  processPayroll,
  getEmployeePayroll,
  processBulkPayroll,
  generatePayrollReport,
  downloadPayslipPDF,
  downloadPayslipExcel,
  downloadBulkPayslips,
  getPayrollHistory,
  changeStatus,
  getPayrollsByStatus,
 
} from '../controllers/payrollNew-controller.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// Payroll processing routes
router.post('/process', restrictTo('superadmin','admin','hr','manager'), processPayroll);
router.post('/bulk', restrictTo('superadmin','admin','hr','manager'), processBulkPayroll);

// Payroll data access routes
router.get('/employee/:employeeId/:companyId', restrictTo('superadmin','admin','hr','manager','employee'), getEmployeePayroll);
router.get('/history/:employeeId', restrictTo('superadmin','admin','hr','manager','employee'), getPayrollHistory);
router.get('/report', restrictTo('superadmin','admin','hr','manager'), generatePayrollReport);

// Payslip download routes
router.get('/payslip/pdf/:payrollId', restrictTo('superadmin','admin','hr','manager','employee'), downloadPayslipPDF);
router.get('/payslip/excel/:payrollId', restrictTo('superadmin','admin','hr','manager','employee'), downloadPayslipExcel);
router.get('/payslip/bulk', restrictTo('superadmin','admin','hr','manager'), downloadBulkPayslips);


// Additional route for changing payroll status
router.patch('/status', restrictTo('superadmin','admin','hr','manager'), changeStatus);

router.get('/all', restrictTo('superadmin','admin','hr','manager'), getPayrollsByStatus)

export default router;