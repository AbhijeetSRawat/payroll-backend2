import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import Employee from '../models/Employee.js';
import { sendSubAdminCredentials } from '../utils/helper.js';

export const createsubadmin = async (req, res) => {
  try {
    const { email, companyId, permissions, profile, employeeId } = req.body;

    if(!email || !companyId || !employeeId || !permissions) {
      return res.status(400).json({ message: 'Email, companyId, employeeId and permissions are required.' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    const existingEmployee = await Employee.findOne({ 'personalDetails.personalEmail': email });
    if (existingUser || existingEmployee) {
      return res.status(400).json({ message: 'Email already in use.' });
    }

    // Generate a random password
    const generatedPassword = crypto.randomBytes(8).toString('hex');

    // Hash the password
    const hashedPassword = await bcrypt.hash(generatedPassword, 12);

    // Create the user
    const user = await User.create({
      email,
      password: hashedPassword,
      role: 'hr',
      companyId,
      permissions,
      profile,
    });

    const employee = await Employee.create({
      user: user._id,
      personalDetails: {
        personalEmail: email,
      },
      company:companyId,
      employmentDetails: {
        joiningDate: new Date(),
        employeeId: employeeId
      }
    });

    // OPTIONAL: Send the password to user via email (not implemented here)
   await sendSubAdminCredentials(email, email, generatedPassword, companyId);

    res.status(201).json({
      message: 'subadmin created successfully.',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        permissions: user.permissions,
      },
      generatedPassword, // Remove in production!
    });
  } catch (err) {
    console.error('Error creating subadmin:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const updateUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Permissions must be an array.' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { permissions },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      message: 'Permissions updated successfully.',
      user: {
        id: user._id,
        email: user.email,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (err) {
    console.error('Error updating permissions:', err);
    res.status(500).json({ message: 'Server Error' });
  }
};


export const updateUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Prevent email or password update here for security
    if (updateData.email || updateData.password) {
      return res.status(400).json({ message: 'Email and password cannot be updated from this endpoint.' });
    }

    const allowedFields = ['profile', 'role', 'permissions', 'isActive', 'lastLogin', 'customFields'];
    const filteredData = {};

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: filteredData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({
      message: 'User details updated successfully.',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role,
        profile: updatedUser.profile,
        permissions: updatedUser.permissions,
        isActive: updatedUser.isActive
      }
    });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


export const getSubAdmins = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const subadmins = await User.find({
      companyId: companyId,
      role: "hr", // or whatever field identifies subadmins
    });

    res.status(200).json({ subadmins });
  } catch (error) {
    console.error("Error fetching subadmins:", error);
    res.status(500).json({ message: "Server error while fetching subadmins" });
  }
};


export const toggleSubAdminStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Find employee linked with the user
    const employee = await Employee.findOne({ user: userId });
    if (!employee) {
      return res.status(404).json({ message: "Associated employee record not found" });
    }

    // Determine new status based on current one
    let newStatus;
    const currentStatus = employee.employmentDetails?.status || "active";

    if (currentStatus === "active") {
      newStatus = "inactive"; // or "terminated" if you want
      user.isActive = false;
    } else {
      newStatus = "active";
      user.isActive = true;
    }

    // Update employmentDetails status safely
    if (employee.employmentDetails) {
      employee.employmentDetails.status = newStatus;
    }

    // Save both
    await user.save();
    await employee.save();

    res.status(200).json({
      message: `Subadmin status updated successfully to ${newStatus}`,
      newStatus,
    });
  } catch (error) {
    console.error("Error toggling subadmin status:", error);
    res.status(500).json({ message: "Server error while updating subadmin status" });
  }
};
