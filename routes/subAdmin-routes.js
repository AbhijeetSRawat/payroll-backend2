import express from 'express';
import { createsubadmin, getSubAdmins,  toggleSubAdminStatus, updateUserDetails, updateUserPermissions } from '../controllers/subAdmin-controllers.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();


router.post('/createsubadmin', protect, restrictTo("superadmin", "admin"), createsubadmin);
router.put('/updatePermissions/:userId', protect, restrictTo("superadmin", "admin"), updateUserPermissions);
router.patch('/updateDetails/:userId', protect, restrictTo("superadmin", "admin", "subadmin"), updateUserDetails);
router.get('/getDetails/:companyId', protect, restrictTo("superadmin", "admin", "subadmin"), getSubAdmins);
router.patch('/terminate/:userId', protect, restrictTo("superadmin", "admin"), toggleSubAdminStatus);

export default router;