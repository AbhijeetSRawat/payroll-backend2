import express from 'express';
import { addShift, getAllShifts, updateShift } from '../controllers/shift-controller.js';

const router = express.Router();

router.post('/add', addShift);
router.put('/update/:shiftId', updateShift);
router.get('/getAllShifts/:companyId', getAllShifts);


export default router;
