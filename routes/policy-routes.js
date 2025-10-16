import express from 'express';
import { addCompanyPolicy, deletePolicy, getCompanyPolicies, getPolicyById, updatePolicy } from '../controllers/policy-controllers.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';



const router = express.Router();
router.post('/add', protect, restrictTo("superadmin", "admin","subadmin"), addCompanyPolicy); // Add new policy
router.get('/company/:companyId', protect, getCompanyPolicies); // Get all policies of a company
router.get('/:policyId', protect, getPolicyById); // Get one policy
router.put('/update/:policyId', protect, restrictTo("superadmin", "admin","subadmin"), updatePolicy); // Update policy
router.delete('/delete/:policyId', protect, restrictTo("superadmin", "admin","subadmin"), deletePolicy); // Delete policy
export default router;
