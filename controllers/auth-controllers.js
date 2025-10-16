import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import {AppError} from '../utils/errorHandler.js';
import { createUser, getUserByEmail } from '../services/user.service.js';
import { comparePasswords, hashPassword, sendOtpEmail, sendPasswordResetEmail } from '../utils/helper.js';
import crypto from 'crypto';
import Employee from '../models/Employee.js';

const JWT_SECRET =  "krishna";
const JWT_EXPIRES_IN = 24 * 60 * 60; // 1 day in seconds



export const register = async (req, res, next) => {
  try {
    const { email, password, role, companyId } = req.body;
    
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return next(new AppError('Email already in use', 400));
    }

    const hashedPassword = await hashPassword(password);
    const newUser = await createUser({
      email,
      password: hashedPassword,
      role,
      companyId,
      profile:req.body.profile || {},
    });

    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    res.status(201).json({
      status: 'success',
      token,
      data: {
        user: newUser
      }
    });
  } catch (err) {
    next(err);
  }
};

export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return next(new AppError('Please provide email and password', 400));
    }

    const user = await getUserByEmail(email, true);
    const employee = await Employee.findOne({ user: user._id });

    if (employee?.isActive === false) {
      return next(new AppError('Employee is not active', 403));
    }

    if (!user || !(await comparePasswords(password, user.password))) {
      return next(new AppError('Incorrect email or password', 401));
    }

    if(user?.isFirstLogin){
      return res.status(400).json({
        status: false,
        message: "Please reset your password before logging in."
      })
    }

    // 🔑 Generate JWT
    const token = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });

    // ⏰ Update last login
    user.lastLogin = new Date();
    await user.save();

    // 🍪 Send token as HTTP-only cookie
    res.cookie("token", token, {
      httpOnly: true,       // prevent JS access
      secure: process.env.NODE_ENV === "production", // only HTTPS in prod
      sameSite: "strict",   // protect from CSRF
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    // ✅ Response without exposing token
    res.status(200).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user._id,
          employeeId: employee?._id || null,
          companyId: user.companyId,
          email: user.email,
          role: user.role,
          permissions: user?.permissions,
          fistLogin:user?.isFirstLogin || false,
        }
      }
    });
  } catch (err) {
    next(err);
  }
};


export const getMe = async (req, res, next) => {
  try {
    
    const user = await User.findById(req.user._id).select('-password');
     const employee = await Employee.findOne({ user: user._id });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    res.status(200).json({
      status: 'success',
      token,
      data: {
        user: {
          id: user._id,
          employeeId: employee?._id || null,
          companyId: user.companyId,
          email: user.email,
          role: user.role,
          user:user
        }
      }
    });
  } catch (err) {
    return next(new AppError('Invalid or expired token', 401));
  }
};

export const protect = async (req, res, next) => {
  try {
    let token;
    
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new AppError('You are not logged in! Please log in to get access.', 401));
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const currentUser = await User.findById(decoded.id);

    if (!currentUser) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    req.user = currentUser;
    next();
  } catch (err) {
    next(err);
  }
};

export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await getUserByEmail(email);
    if (!user) {
      return next(new AppError('No user found with this email', 404));
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set reset token and expiry on user
    user.passwordResetToken = resetTokenHash;
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    // Send email (customize URL according to frontend)
    const resetURL = `${req.protocol}://localhost:5173/reset-password/${resetToken}`;
    const message = `Forgot your password? Reset it here: ${resetURL}\n\nIf you didn't request this, ignore this email.`;

    await sendOtpEmail(user.email, message);

    res.status(200).json({
      status: 'success',
      message: 'Token sent to email!',
    });
  } catch (err) {
    next(err);
  }
};


export const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });


    // If expired, clear token immediately
if (user.passwordResetExpires < Date.now()) {
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save({ validateBeforeSave: false });
  return next(new AppError('Token expired. Please request a new one.', 400));
}

    if (!user) {
      return next(new AppError('Token is invalid or has expired', 400));
    }

    // Update password and clear reset fields
    user.password = await hashPassword(password);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.isFirstLogin = false; // Mark first login as completed
    await user.save();

    // Log the user in
    const jwtToken = jwt.sign({ id: user._id }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN
    });
     await sendPasswordResetEmail(user?.email, user?.role, password, user?.companyId);

    res.status(200).json({
      status: 'success',
      token: jwtToken,
      message: 'Password reset successful',
    });
  } catch (err) {
    next(err);
  }
};


export const firstLoginReset = async (req, res) => {
  const { email, newPassword } = req.body;

  const hashedPassword = await hashPassword(newPassword);
  const user =  await User.findOneAndUpdate(
    { email },
    { password: hashedPassword, isFirstLogin: false } // 👈 set first login to false
  );
 await sendPasswordResetEmail(email, user?.role, newPassword, user?.companyId);
  res.json({ message: "Password reset successful. You can now log in." });
};
