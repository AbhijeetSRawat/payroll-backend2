import express from 'express';
import {
  calculateIndividualPayroll,
  batchCalculatePayroll,
  getPayrollDetails,
  getPayrollHistory,
  getCompanyPayrollSummary,
  approvePayroll,
  getEligibleEmployees
} from '../controllers/payrollWorkflowController.js';
import { protect } from '../middleware/authMiddleware.js';
import { checkPermission } from '../middleware/permission.middleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Individual payroll calculation
router.post('/calculate', 
  checkPermission(['payroll:create', 'admin']), 
  calculateIndividualPayroll
);

// Batch payroll calculation
router.post('/batch-calculate', 
  checkPermission(['payroll:create', 'admin']), 
  batchCalculatePayroll
);

// Get payroll details for specific employee and period
router.get('/:employeeId/:month/:year', 
  checkPermission(['payroll:read', 'admin']), 
  getPayrollDetails
);

// Get payroll history for an employee
router.get('/history/:employeeId', 
  checkPermission(['payroll:read', 'admin']), 
  getPayrollHistory
);

// Get company payroll summary
router.get('/company-summary', 
  checkPermission(['payroll:read', 'admin']), 
  getCompanyPayrollSummary
);

// Approve payroll
router.put('/approve/:payrollId', 
  checkPermission(['payroll:approve', 'admin']), 
  approvePayroll
);

// Get eligible employees for payroll processing
router.get('/eligible-employees', 
  checkPermission(['payroll:read', 'admin']), 
  getEligibleEmployees
);

export default router;
