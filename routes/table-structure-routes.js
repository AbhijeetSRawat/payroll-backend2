import express from 'express';
import {
  createTableStructure,
  getCompanyTableStructures,
  updateTableStructure,
  deleteTableStructure
} from '../controllers/table-structure-controller.js';

import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// Create table structure
router.post('/', protect, createTableStructure);

// Get all for a company
router.get('/:companyId', protect, getCompanyTableStructures);

// Update
router.put('/:id', protect, updateTableStructure);

// Delete
router.delete('/:id', protect, deleteTableStructure);

export default router;
