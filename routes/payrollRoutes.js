import express from 'express';

import { protect, restrictTo } from '../middleware/authMiddleware.js';
import { 
  calculatePayroll, 
  downloadPayslipExcel, 
  downloadPayslipPDF,
  getPayrollHistory,
  generatePayrollReport,
  getMonthlySalary,
  getSalaryHistory
} from '../controllers/payrollController.js';

const router = express.Router();

// Payroll calculation and management
router.post('/calculatePayroll', protect, calculatePayroll); // calculate payroll
router.get('/history/:employeeId', protect, getPayrollHistory); // get payroll history
router.get('/report/:companyId', protect, generatePayrollReport); // generate payroll report

router.get('/:employeeId/:year/:month', getMonthlySalary);

// Route to get salary history for an employee
router.get('/history/:employeeId', getSalaryHistory);

// Payslip downloads
router.get('/downloadPaySlipPdf/:employeeId', protect, downloadPayslipPDF); // payslip pdf
router.get('/downloadPaySlipExcel/:employeeId', protect, downloadPayslipExcel); // payslip excel

export default router;
