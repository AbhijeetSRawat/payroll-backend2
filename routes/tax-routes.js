import express from 'express';
import {
  calculateEmployeeTax,
  getTaxComputation,
  submitTaxDeclaration
} from '../controllers/tax-controller.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

 router.use(protect);

// Tax calculation routes
router.post('/calculate/:employeeId/:companyId', restrictTo("superadmin","admin","hr","manager"), calculateEmployeeTax);
router.get('/computation/:employeeId/:companyId', restrictTo("superadmin", "admin", "hr", "manager"), getTaxComputation);

// Tax declaration routes
router.post('/declaration', restrictTo("superadmin", "admin", "hr", "manager"), submitTaxDeclaration);

export default router;