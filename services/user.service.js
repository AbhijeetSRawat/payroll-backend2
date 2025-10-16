import User from '../models/User.js';

export const createUser = async (userData) => {
  const newUser = await User.create(userData);
  return newUser;
};

export const getUserById = async (userId) => {
  return User.findById(userId);
};

export const getUserByEmail = async (email, withPassword = false) => {
  if (withPassword) {
    return User.findOne({ email }).select('+password').populate("companyId");
  }
  return User.findOne({ email }).populate("companyId");
};

export const updateUser = async (userId, updateData) => {
  return User.findByIdAndUpdate(userId, updateData, { new: true });
};

export const deleteUser = async (userId) => {
  return User.findByIdAndUpdate(userId, { isActive: false }, { new: true });
};