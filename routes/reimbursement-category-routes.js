// routes/reimbursement-category-routes.js
import express from 'express';
import {
  createCategory,
  getAllCategories,
  updateCategory,
} from '../controllers/reimbursement-category-controller.js';

import { protect, restrictTo } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', protect,restrictTo('admin','superadmin','subadmin'), createCategory);
router.get('/:companyId', protect, getAllCategories);
router.put('/:id', protect,restrictTo('admin','superadmin','subadmin'), updateCategory);


export default router;
