// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import env from 'dotenv';
import { AppError } from '../utils/errorHandler.js';
env.config();

export const protect = async (req, res, next) => {
  let token;

  // Check Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
 

      // Decode token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Attach user to request
      req.user = await User.findById(decoded.id).select('-password');
      
      if (!req.user) {
       return res.status(401).json({ message: 'User not found' });
      }

      next();
    } catch (err) {
      console.log(err)
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    return res.status(401).json({ message: 'Not authorized, no token' });
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