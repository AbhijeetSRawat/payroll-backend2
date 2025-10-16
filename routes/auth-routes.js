// routes/auth-routes.js
import express from 'express';
import { firstLoginReset, forgotPassword, getMe, login, register, resetPassword } from '../controllers/auth-controllers.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/create', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password/:token', resetPassword); // Assuming this is for resetting password with OTP
//router.post('/first-login-reset',protect, firstLoginReset);
router.get('/me', protect, getMe);
export default router;
