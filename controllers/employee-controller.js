import Employee from "../models/Employee.js";
import User from "../models/User.js";
import Department from "../models/Department.js";
import Company from "../models/Company.js";
import bcrypt from "bcryptjs";
import crypto from 'crypto';

import {
  generateEmployeeId,
  generateRandomPassword,
  sendAdminCredentials,
  sendWelcome,
} from "../utils/helper.js";
import Shifts from "../models/Shifts.js";
import uploadFileToCloudinary from "../utils/fileUploader.js";

// Updated getEmployee function
import asyncHandler from 'express-async-handler';

import mongoose from "mongoose";
export const getEmployee = async (req, res, next) => {
  try {
    const { employeeId } = req.params;

    // ✅ Check if ID is provided
    if (!employeeId) {
      return res.status(400).json({
        status: "fail",
        message: "Employee ID is required",
      });
    }

    let query = Employee.findById(employeeId)
      .populate("user", "email role profile")
      .populate("company", "name");

    const employeeExists = await Employee.findById(employeeId).select(
      "employmentDetails"
    );

    if (!employeeExists) {
      return res.status(404).json({
        status: "fail",
        message: "No employee found with that ID",
      });
    }

    // ✅ Conditional populates
    if (employeeExists.employmentDetails?.department) {
      query = query.populate("employmentDetails.department", "name");
    }

    if (employeeExists.employmentDetails?.shift) {
      query = query.populate(
        "employmentDetails.shift",
        "name startTime endTime"
      );
    }

    if (employeeExists.employmentDetails?.reportingTo) {
      query = query.populate({
        path: "employmentDetails.reportingTo",
        select: "user",
        populate: {
          path: "user",
          select: "email role profile",
        },
      });
    }

    const employee = await query;

    res.status(200).json({
      status: "success",
      data: { employee },
    });
  } catch (error) {
    console.error("Get Employee Error:", error);
    res.status(500).json({
      status: "error",
      message: "Server error",
    });
  }
};



// Updated updateBasicEmployeeInfo function
export const updateBasicEmployeeInfo = async (req, res) => {
  try {
    const id = req.params.employeeId;

    // Extract fields from request body
    const {
      firstName,
      lastName,
      gender,
      dob,
      city,
      state,
      personalEmail,
      personalMobile,
      skills,
    } = req.body;

    const avatar = req.files?.avatar;

    console.log("avatar is : ", avatar);

    // console.log('Raw request body:', req.body);
    // console.log('Skills received:', skills, 'Type:', typeof skills);

    let documentUrl = null;

    // Handle avatar upload
    if (avatar) {
      documentUrl = await uploadFileToCloudinary(
        avatar,
        process.env.FOLDER_NAME
      );
      console.log("Avatar uploaded:", documentUrl);
    }

    // Find the employee first to get user ID
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({
        status: "fail",
        message: "Employee not found",
      });
    }

    // Process skills - handle different formats
    let processedSkills = [];
    if (skills !== undefined) {
      try {
        if (typeof skills === "string") {
          // Try to parse as JSON first
          try {
            const parsed = JSON.parse(skills);
            if (Array.isArray(parsed)) {
              processedSkills = parsed.filter(
                (skill) => skill && skill.trim() !== ""
              );
            } else {
              // If not an array after parsing, split by comma
              processedSkills = skills
                .split(",")
                .map((s) => s.trim())
                .filter((s) => s !== "");
            }
          } catch (parseError) {
            // If JSON parse fails, treat as comma-separated string
            processedSkills = skills
              .split(",")
              .map((s) => s.trim())
              .filter((s) => s !== "");
          }
        } else if (Array.isArray(skills)) {
          processedSkills = skills.filter(
            (skill) => skill && skill.trim() !== ""
          );
        }
      } catch (error) {
        console.error("Error processing skills:", error);
        processedSkills = [];
      }
    }

    // console.log('Processed skills:', processedSkills);

    // console.log("documenturl",documentUrl.secure_url)

    // Update User profile fields (if provided)
    const userUpdates = {};
    if (firstName !== undefined) userUpdates["profile.firstName"] = firstName;
    if (lastName !== undefined) userUpdates["profile.lastName"] = lastName;
    if (avatar && documentUrl)
      userUpdates["profile.avatar"] = documentUrl.result.secure_url;

    if (Object.keys(userUpdates).length > 0) {
      await User.findByIdAndUpdate(
        employee.user,
        { $set: userUpdates },
        { new: true, runValidators: true }
      );
      console.log("User updated with:", userUpdates);
    }

    // Update Employee fields (if provided)
    const employeeUpdates = {};
    if (gender !== undefined)
      employeeUpdates["personalDetails.gender"] = gender;
    if (dob !== undefined) employeeUpdates["personalDetails.dateOfBirth"] = dob;
    if (city !== undefined) employeeUpdates["personalDetails.city"] = city;
    if (state !== undefined) employeeUpdates["personalDetails.state"] = state;
    if (personalEmail !== undefined)
      employeeUpdates["personalDetails.personalEmail"] = personalEmail;
    if (personalMobile !== undefined)
      employeeUpdates["personalDetails.personalMobile"] = personalMobile;
    if (skills !== undefined)
      employeeUpdates["employmentDetails.skills"] = processedSkills;

    if (Object.keys(employeeUpdates).length > 0) {
      await Employee.findByIdAndUpdate(
        id,
        { $set: employeeUpdates },
        { new: true, runValidators: true }
      );
      console.log("Employee updated with:", employeeUpdates);
    }

    // Return updated employee with all populated fields
    const updatedEmployee = await Employee.findById(id)
      .populate("user", "email role profile")
      .populate("company", "name")
      .populate("employmentDetails.department", "name")
      .populate("employmentDetails.shift", "name startTime endTime")
      .populate({
        path: "employmentDetails.reportingTo",
        select: "user",
        populate: {
          path: "user",
          select: "email role profile",
        },
      });

    res.status(200).json({
      status: "success",
      data: {
        employee: updatedEmployee,
      },
    });
  } catch (err) {
    console.error("Error in updateBasicEmployeeInfo:", err);
    res.status(400).json({
      status: "fail",
      message: err.message,
    });
  }
};

export const deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!employee) {
      return next(new AppError("No employee found with that ID", 404));
    }

    await User.findByIdAndUpdate(employee.user, { isActive: false });

    res.status(204).json({
      status: "success",
      data: null,
    });
  } catch (err) {
    next(err);
  }
};

export const getAllEmployees = async (req, res, next) => {
  try {
    const { companyId } = req.user;
    const employees = await Employee.find({
      company: companyId,
      isActive: true,
    }).populate("user", "email role profile");

    res.status(200).json({
      status: "success",
      results: employees.length,
      data: {
        employees,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const addHrEmployee = async (req, res) => {
  try {
    const {
      email,
      companyId,
      firstName,
      lastName,
      phone,
      department,
      designation,
      joiningDate,
      employmentType,
      salary,
      reportingTo,
      skills,
      documents,
      shiftId, // NEW FIELD,
      customFields, // Optional custom fields
      employeeId,
    } = req.body;

    // 1. Check if company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    // 2. Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const existingUserWithId = await Employee.findOne({
      "employmentDetails.employeeId": employeeId,
    });
    if (existingUserWithId) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    // 3. Validate shift (if shiftId provided)
    if (shiftId) {
      const shift = await Shifts.findById(shiftId);
      if (!shift) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid shift ID" });
      }
    }

    // 4. Create User (role: hr)
    const plainPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const newUser = new User({
      email,
      password: hashedPassword,
      role: "hr",
      companyId,
      customFields: customFields || [], // Optional custom fields
      profile: {
        firstName,
        lastName,
        phone,
        designation,
        department,
        avatar: null,
      },
      isActive: true,
    });

    await newUser.save();

    // 5. Generate employeeId dynamically (count existing employees)
    const employeeCount = await Employee.countDocuments({ company: companyId });

    // 6. Create Employee
    const newEmployee = new Employee({
      user: newUser._id,
      company: company._id,
      employmentDetails: {
        employeeId,
        joiningDate,
        department,
        designation,
        employmentType,
        salary,
        reportingTo: reportingTo || null,
        skills: skills || [],
        documents: documents || [],
        shift: shiftId || null,
      },
    });

    await newEmployee.save();

    // 7. Send credentials
    await sendAdminCredentials(email, email, plainPassword, company.companyId);

    return res.status(201).json({
      success: true,
      message: "HR added successfully",
      data: {
        user: newUser,
        employee: newEmployee,
      },
    });
  } catch (error) {
    console.error("Add HR Error:", error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

export const getAllHrOrManagers = async (req, res) => {
  try {
    const { companyId } = req.params;

    // 0. Validate company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res
        .status(404)
        .json({ success: false, message: "Company not found" });
    }

    // 1. Get HR/Manager users for this company
    const users = await User.find({
      companyId: company._id,
      role: { $in: [ "manager"] },
      isActive: true,
    }).populate("companyId"); // Optionally populate department

    if (!users.length) {
      return res.status(200).json({ success: true, data: [] });
    }

    const userIds = users.map((u) => u._id);

    // 2. Fetch corresponding employees and populate shift
    const employees = await Employee.find({
      user: { $in: userIds },
    })
      .populate("user")
      .populate("employmentDetails.department")
      // Optionally get user email/profile
      .populate("employmentDetails.shift"); // Populating shift

    return res.status(200).json({
      success: true,
      data: employees,
    });
  } catch (error) {
    console.error("Get HR/Managers Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updateHrEmployee = async (req, res) => {
  try {
    const { hrEmployeeId } = req.params; // Employee _id from params

    const {
      firstName,
      lastName,
      phone,
      department,
      designation,
      joiningDate,
      employmentType,
      salary,
      reportingTo,
      skills,
      documents,
      shiftId,
      customFields,
      employeeId,
    } = req.body;

    // 1. Find the Employee
    const employee = await Employee.findById(hrEmployeeId).populate("user");
    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "HR Employee not found" });
    }

    // 2. Validate shift if provided
    if (shiftId) {
      const shift = await Shifts.findById(shiftId);
      if (!shift) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid shift ID" });
      }
    }

    // 3. Update User (profile)
    const user = await User.findById(employee.user._id);
    if (user) {
      if (firstName) user.profile.firstName = firstName;
      if (lastName) user.profile.lastName = lastName;
      if (phone) user.profile.phone = phone;
      if (designation) user.profile.designation = designation;
      if (department) user.profile.department = department;
      if (customFields) user.customFields = customFields; // Update custom fields if provided
      await user.save();
    }

    // 4. Update Employee details
    const details = employee.employmentDetails;

    if (joiningDate) details.joiningDate = joiningDate;
    if (department) details.department = department;
    if (designation) details.designation = designation;
    if (employmentType) details.employmentType = employmentType;
    if (salary) details.salary = salary;
    if (reportingTo !== undefined) details.reportingTo = reportingTo;
    if (skills) details.skills = skills;
    if (documents) details.documents = documents;
    if (shiftId !== undefined) details.shift = shiftId;
    if (employeeId) details.employeeId = employeeId;

    await employee.save();

    return res.status(200).json({
      success: true,
      message: "HR Employee updated successfully",
      data: {
        user,
        employee,
      },
    });
  } catch (error) {
    console.error("Update HR Error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Server Error", error: error.message });
  }
};

export const createEmployee = async (req, res) => {
  try {
    const {
      email,
      profile = {},
      companyId,
      role,
      employmentDetails = {},
      leaveBalance = {},
      customFields,
      personalDetails = {},
    } = req.body;

    // 1. Company check
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // 2. Email uniqueness check
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // 3. Employee ID uniqueness check
    const existingEmp = await Employee.findOne({
      "employmentDetails.employeeId": employmentDetails.employeeId,
    });
    if (existingEmp) {
      return res.status(400).json({ message: "Employee ID already exists" });
    }

    // 4. Department validity check
    const departmentData = await Department.findById(
      employmentDetails.department
    );
    if (!departmentData) {
      return res.status(400).json({ message: "Invalid department ID" });
    }

    // 5. Password setup
    const plainPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 12);

    // 6. Create User
    const newUser = await User.create({
      email,
      password: hashedPassword,
      role: role || "employee",
      companyId,
      profile: {
        firstName: profile.firstName,
        lastName: profile.lastName,
        phone: profile.phone,
        avatar: profile.avatar || "",
        designation: employmentDetails.designation || "",
        department: departmentData.name,
      },
      customFields: customFields || [], 
      isActive: true,
      lastLogin: null,
      passwordChangedAt: new Date(),
    });

    // 7. Get auto-incremented Sr No (for example use case)
    const employeeCount = await Employee.countDocuments({ company: companyId });
    const srNo = employeeCount + 1;

    // 8. Create Employee
    const newEmployee = await Employee.create({
      srNo,
      user: newUser._id,
      company: companyId,
      personalDetails: {
        gender: personalDetails.gender || "null",
        dateOfBirth: personalDetails.dateOfBirth || null,
        city: personalDetails.city || "",
        state: personalDetails.state || "",
        panNo: personalDetails.panNo || "",
        aadharNo: personalDetails.aadharNo || "",
        uanNo: personalDetails.uanNo || "",
        esicNo: personalDetails.esicNo || "",
        bankAccountNo: personalDetails.bankAccountNo || "",
        ifscCode: personalDetails.ifscCode || "",
        personalEmail: personalDetails.personalEmail || "",
        officialMobile: personalDetails.officialMobile || "",
        personalMobile: personalDetails.personalMobile || "",
      },
      employmentDetails: {
        employeeId: employmentDetails.employeeId,
        joiningDate: new Date(employmentDetails.joiningDate),
        resignationDate: employmentDetails.resignationDate || null,
        lastWorkingDate: employmentDetails.lastWorkingDate || null,
        department: departmentData._id,
        shift: employmentDetails.shift || null,
        designation: employmentDetails.designation,
        employmentType: employmentDetails.employmentType || "full-time",
        workLocation: employmentDetails.workLocation || "",
        costCenter: employmentDetails.costCenter || "",
        businessArea: employmentDetails.businessArea || "",
        pfFlag: employmentDetails.pfFlag || false,
        esicFlag: employmentDetails.esicFlag || false,
        ptFlag: employmentDetails.ptFlag || false,
        salary: {
          base: employmentDetails.salary?.base || 0,
          bonus: employmentDetails.salary?.bonus || 0,
          taxDeductions: employmentDetails.salary?.taxDeductions || 0,
        },
        reportingTo: employmentDetails.reportingTo || null,
        skills: employmentDetails.skills || [],
        documents: employmentDetails.documents || [],
      },
      leaveBalance: {
        casual: leaveBalance.casual || 0,
        sick: leaveBalance.sick || 0,
        earned: leaveBalance.earned || 0,
      },
      isActive: true,
    });

    
            // Generate a reset token
              const resetToken = crypto.randomBytes(32).toString('hex');
              const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
          
              // Set reset token and expiry on user
              newUser.passwordResetToken = resetTokenHash;
              newUser.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
              await newUser.save({ validateBeforeSave: false });
    
              // Send email (customize URL according to frontend)
              const resetURL = `${req.protocol}://localhost:5173/reset-password/${resetToken}`;
              const message = `Forgot your password? Reset it here: ${resetURL}\n\nIf you didn't request this, ignore this email.`;
    
              await newUser.save();
      
          // 9. Send Credentials via email
          await sendWelcome(email, role, email, message, company.companyId);
  

    // 10. Final response
    return res.status(201).json({
      message: "Employee created successfully",
      userId: newUser._id,
      employeeId: newEmployee._id,
      department: departmentData.name,
      joiningDate: newEmployee.employmentDetails.joiningDate,
    });
  } catch (error) {
    console.error("[CREATE_EMPLOYEE_ERROR]", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const editEmployee = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      email,
      role,
      profile = {},
      companyId,
      employmentDetails = {},
      leaveBalance = {},
      personalDetails = {},
      customFields = [],
    } = req.body;

    let documentUrl = null;

    // Handle avatar upload
    if (req.files && req.files.avatar) {
      documentUrl = await uploadFileToCloudinary(
        req.files.avatar,
        process.env.FOLDER_NAME
      );
    }

    // Validate company
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ message: "Company not found" });
    }

    // Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Validate employee record
    const existingEmployee = await Employee.findOne({ user: userId });
    if (!existingEmployee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Validate department if provided
    let departmentData = null;
    if (employmentDetails.department) {
      departmentData = await Department.findById(employmentDetails.department);
      if (!departmentData) {
        return res.status(400).json({ message: "Invalid department ID" });
      }
    }

    // Validate joining date if provided
    let parsedJoiningDate = existingEmployee.employmentDetails.joiningDate;
    if (employmentDetails.joiningDate) {
      parsedJoiningDate = new Date(employmentDetails.joiningDate);
      if (isNaN(parsedJoiningDate)) {
        return res.status(400).json({ message: "Invalid joining date" });
      }
    }

    // Update User
    await User.findByIdAndUpdate(userId, {
      email,
      companyId,
      role: role || user.role,
      profile: {
        firstName: profile.firstName || user.profile.firstName,
        lastName: profile.lastName || user.profile.lastName,
        phone: profile.phone || user.profile.phone,
        avatar: documentUrl ? documentUrl.secure_url : user.profile.avatar,
        designation: employmentDetails.designation || user.profile.designation,
        department: departmentData?.name || user.profile.department,
      },
      customFields: customFields.length ? customFields : user.customFields,
    });

    // Keep existing employeeId if not updating
    const employeeIdToUse =
      employmentDetails.employeeId ||
      existingEmployee.employmentDetails.employeeId;

    // Update Employee
    await Employee.findOneAndUpdate(
      { user: userId },
      {
        company: companyId,
        personalDetails: {
          ...existingEmployee.personalDetails,
          ...personalDetails,
        },
        employmentDetails: {
          ...existingEmployee.employmentDetails,
          employeeId: employeeIdToUse,
          joiningDate: parsedJoiningDate,
          department: departmentData?._id || existingEmployee.employmentDetails.department,
          designation: employmentDetails.designation || existingEmployee.employmentDetails.designation,
          shift: employmentDetails.shift || existingEmployee.employmentDetails.shift,
          employmentType: employmentDetails.employmentType || existingEmployee.employmentDetails.employmentType,
          workLocation: employmentDetails.workLocation || existingEmployee.employmentDetails.workLocation,
          costCenter: employmentDetails.costCenter || existingEmployee.employmentDetails.costCenter,
          businessArea: employmentDetails.businessArea || existingEmployee.employmentDetails.businessArea,
          pfFlag: employmentDetails.pfFlag ?? existingEmployee.employmentDetails.pfFlag,
          esicFlag: employmentDetails.esicFlag ?? existingEmployee.employmentDetails.esicFlag,
          ptFlag: employmentDetails.ptFlag ?? existingEmployee.employmentDetails.ptFlag,
          salary: {
            base: employmentDetails.salary?.base ?? existingEmployee.employmentDetails.salary.base,
            bonus: employmentDetails.salary?.bonus ?? existingEmployee.employmentDetails.salary.bonus,
            taxDeductions: employmentDetails.salary?.taxDeductions ?? existingEmployee.employmentDetails.salary.taxDeductions,
          },
          reportingTo: employmentDetails.reportingTo || existingEmployee.employmentDetails.reportingTo,
          skills: employmentDetails.skills || existingEmployee.employmentDetails.skills,
          documents: employmentDetails.documents || existingEmployee.employmentDetails.documents,
        },
        leaveBalance: {
          casual: leaveBalance.casual ?? existingEmployee.leaveBalance.casual,
          sick: leaveBalance.sick ?? existingEmployee.leaveBalance.sick,
          earned: leaveBalance.earned ?? existingEmployee.leaveBalance.earned,
        },
      }
    );

    return res.status(200).json({ message: "Employee updated successfully" });
  } catch (error) {
    console.error("Error updating employee:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const getAllEmployeesByCompanyId = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const employees = await Employee.find({ company: companyId })
      .populate({
        path: "user",
        match: { role: "employee" },
      })
      .populate({ path: "employmentDetails.department", select: "name" })
      .populate({
        path: "employmentDetails.shift",
        select: "name startTime endTime",
      })
      .populate({
        path: "employmentDetails.reportingTo",
        populate: {
          path: "user",
        },
      });

    const filtered = employees.filter((emp) => emp.user !== null);

    res.status(200).json({
      message: "Employees fetched successfully",
      count: filtered.length,
      employees: filtered,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getAllEmployeesByCompanyIdPagination = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { page = 1, limit = 10, search = "" } = req.query;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const pageNumber = parseInt(page);
    const limitNumber = parseInt(limit);
    const skip = (pageNumber - 1) * limitNumber;

    // Search filter
    const searchFilter = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: "i" } },
            { lastName: { $regex: search, $options: "i" } },
            { personalEmail: { $regex: search, $options: "i" } },
            { personalMobile: { $regex: search, $options: "i" } },
             { employeeId: { $regex: search, $options: "i" } }
          ]
        }
      : {};

    // Query with user != null directly using match in populate
    const employees = await Employee.find({
      company: companyId,
      ...searchFilter
    })
      .populate({
        path: "user",
        match: { role: "employee" },
      })
      .populate({ path: "employmentDetails.department", select: "name" })
      .populate({
        path: "employmentDetails.shift",
        select: "name startTime endTime",
      })
      .populate({
        path: "employmentDetails.reportingTo",
        populate: { path: "user" },
      })
      .skip(skip)
      .limit(limitNumber)
      .lean();

    // Filter null users BEFORE counting to keep counts accurate
     const filteredEmployees = employees.filter(emp => emp.user);

    // Accurate total count with same condition
    const total = await Employee.countDocuments({
      company: companyId,
      ...searchFilter,
      user: { $ne: null } // ensures count matches
    });

    res.status(200).json({
      message: "Employees fetched successfully",
      count: filteredEmployees.length,
      total,
      currentPage: pageNumber,
      totalPages: Math.ceil(total / limitNumber),
      employees: filteredEmployees,
    });

  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};




export const bulkCreateEmployees = async (req, res) => {
  const { employees } = req.body;

  if (!Array.isArray(employees) || employees.length === 0) {
    return res.status(400).json({ message: "No employees provided" });
  }

  try {
    const results = [];
    const failed = [];

    for (const emp of employees) {
      try {
        const {
          email,
          profile,
          companyId,
          personalDetails,
          employmentDetails,
          leaveBalance,
        } = emp;

        const company = await Company.findById(companyId);
        if (!company) throw new Error("Company not found");

        const existingUser = await User.findOne({ email });
        if (existingUser) throw new Error("Email already registered");

        // Validate department if provided
        let departmentData = null;
        if (employmentDetails.department) {
          departmentData = await Department.findById(
            employmentDetails.department
          );
          if (!departmentData) throw new Error("Invalid department ID");
        }

        // Validate shift if provided
        let shiftData = null;
        if (employmentDetails.shift) {
          shiftData = await Shift.findById(employmentDetails.shift);
          if (!shiftData) throw new Error("Invalid shift ID");
        }

        // Validate reporting manager if provided
        let reportingManager = null;
        if (employmentDetails.reportingTo) {
          reportingManager = await Employee.findById(
            employmentDetails.reportingTo
          );
          if (!reportingManager)
            throw new Error("Invalid reporting manager ID");
        }

        const plainPassword = generateRandomPassword();
        const hashedPassword = await bcrypt.hash(plainPassword, 12);

        // Create User with extended profile and personal details
        const newUser = await User.create({
          email,
          password: hashedPassword,
          role: "employee",
          companyId,
          profile: {
            firstName: profile.firstName,
            lastName: profile.lastName,
            phone:
              profile.phone ||
              personalDetails.officialMobile ||
              personalDetails.personalMobile ||
              "",
            avatar: profile.avatar || "",
            designation: employmentDetails.designation,
            department: departmentData ? departmentData.name : "",
          },
          isActive: true,
          lastLogin: null,
          passwordChangedAt: new Date(),
        });

        // Create Employee with comprehensive details
        const newEmployee = await Employee.create({
          user: newUser._id,
          company: companyId,
          personalDetails: {
            gender: personalDetails.gender || "",
            dateOfBirth: personalDetails.dateOfBirth
              ? new Date(personalDetails.dateOfBirth)
              : null,
            city: personalDetails.city || "",
            state: personalDetails.state || "",
            panNo: personalDetails.panNo || "",
            aadharNo: personalDetails.aadharNo || "",
            uanNo: personalDetails.uanNo || "",
            esicNo: personalDetails.esicNo || "",
            bankAccountNo: personalDetails.bankAccountNo || "",
            ifscCode: personalDetails.ifscCode || "",
            personalEmail: personalDetails.personalEmail || "",
            officialMobile: personalDetails.officialMobile || "",
            personalMobile: personalDetails.personalMobile || "",
          },
          employmentDetails: {
            employeeId: employmentDetails.employeeId,
            joiningDate: employmentDetails.joiningDate
              ? new Date(employmentDetails.joiningDate)
              : new Date(),
            resignationDate: employmentDetails.resignationDate
              ? new Date(employmentDetails.resignationDate)
              : null,
            lastWorkingDate: employmentDetails.lastWorkingDate
              ? new Date(employmentDetails.lastWorkingDate)
              : null,
            department: departmentData ? departmentData._id : null,
            designation: employmentDetails.designation,
            employmentType:
              employmentDetails.employmentType?.toLowerCase() || "full-time",
            status: employmentDetails.status?.toLowerCase() || "active",
            workLocation: employmentDetails.workLocation || "",
            costCenter: employmentDetails.costCenter || "",
            businessArea: employmentDetails.businessArea || "",
            pfFlag: employmentDetails.pfFlag || false,
            esicFlag: employmentDetails.esicFlag || false,
            ptFlag: employmentDetails.ptFlag || false,

            documents: employmentDetails.documents || [],
          },

          isActive: employmentDetails.status?.toLowerCase() === "active",
        });

        // Send credentials email
        await sendAdminCredentials(
          email,
          email,
          plainPassword,
          company.companyId
        );

        results.push({
          email,
          employeeId: employmentDetails.employeeId,
          userId: newUser._id,
          employeeRecordId: newEmployee._id,
        });
      } catch (err) {
        failed.push({
          email: emp?.email,
          employeeId: emp?.employmentDetails?.employeeId,
          reason: err.message,
        });
        console.error("Error while creating employee:", err);
      }
    }

    return res.status(201).json({
      message: "Bulk creation completed",
      created: results.length,
      failed,
      successList: results,
    });
  } catch (error) {
    console.error("Bulk create error:", error);
    return res.status(500).json({
      message: "Bulk creation failed",
      error: error.message,
    });
  }
};



export const getEmployeeDocuments = async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!employeeId) {
      return res.status(400).json({
        success: false,
        message: "Employee ID is required",
      });
    }

    const employee = await Employee.findById(employeeId).select(
      "employmentDetails.documents"
    );

    if (!employee) {
      return res
        .status(404)
        .json({ success: false, message: "Employee not found" });
    }

    res.status(200).json({
      success: true,
      documents: employee.employmentDetails.documents,
    });
  } catch (error) {
    console.error("Get Documents Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const uploadDocument = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { documentName } = req.body; // e.g. "aadharCard"
    const { files } = req.files; // multiple files allowed

    if (!employeeId || !documentName) {
      return res.status(400).json({
        success: false,
        message: "Employee ID and document name are required",
      });
    }

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    if (!files || files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }

    // ✅ Validate and upload each file
    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];

    const fileArray = Array.isArray(files) ? files : [files];


    const uploadedFiles = [];
    for (const file of fileArray) {
      if (file.size > MAX_SIZE) {
        return res.status(400).json({
          success: false,
          message: `${file.originalname} exceeds 2MB size limit`,
        });
      }

      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: `${file.originalname} has invalid file type`,
        });
      }

      const result = await uploadFileToCloudinary(
        file,
        process.env.FOLDER_NAME
      );

      uploadedFiles.push({
        type: file.mimetype,
        url: result?.result?.secure_url || "",
        uploadedAt: new Date(),
      });
    }

    console.log("Uploaded Files:", uploadedFiles);
    // ✅ Check if document exists
    const existingDocIndex = employee.employmentDetails.documents.findIndex(
      (doc) => doc.name === documentName
    );

    if (existingDocIndex !== -1) {
      // 🔄 Update existing document (replace old files with new ones)
      employee.employmentDetails.documents[existingDocIndex].files =
        uploadedFiles;
      employee.employmentDetails.documents[existingDocIndex].updatedAt =
        new Date();
    } else {
      // ➕ Create new document entry
      employee.employmentDetails.documents.push({
        name: documentName,
        files: uploadedFiles,
        uploadedAt: new Date(),
      });
    }

    await employee.save();

    res.status(200).json({
      success: true,
      message: `${documentName} uploaded/updated successfully`,
      documents: employee.employmentDetails.documents,
    });
  } catch (error) {
    console.error("Upload Document Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


// GET employees by company + month + year
export const getEmployeesByMonth = async (req, res) => {
  try {
    const { companyId, month, year } = req.params; // month = 1-12, year = 2025 etc.

    if (!companyId || !month || !year) {
      return res.status(400).json({
        success: false,
        message: "companyId, month, and year are required"
      });
    }

    // Start & end of given month
    const startDate = new Date(year, month - 1, 1); // month-1 because JS months = 0-11
    const endDate = new Date(year, month, 0, 23, 59, 59, 999); // last day of month

    // Query employees
    const employees = await Employee.find({
      company: companyId,
      "employmentDetails.joiningDate": { $gte: startDate, $lte: endDate }
    }).populate("user"); // populate user details

    return res.status(200).json({
      success: true,
      count: employees.length,
      employees
    });
  } catch (error) {
    console.error("Get Employees by Month Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};


export const getAllNewJoinerByCompanyId = async (req, res) => {
  try {
    const { companyId } = req.params;

    if (!companyId) {
      return res.status(400).json({ message: "Company ID is required" });
    }

    const employees = await Employee.find({ company: companyId })
      .populate({
        path: "user",
        match: { role: "newjoiner" },
      })
      .populate({
        path: "employmentDetails.reportingTo",
        populate: {
          path: "user",
        },
      });

    const filtered = employees.filter((emp) => emp.user !== null);

    res.status(200).json({
      message: "Employees fetched successfully",
      count: filtered.length,
      employees: filtered,
    });
  } catch (error) {
    console.error("Error fetching employees:", error);
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};


export const makeuserinactive = async (req,res) =>{
  const {employeeId} = req.params;

  const employee = await Employee.findByIdAndUpdate(employeeId, { isActive: false }, { new: true });

  if (!employee) {
    return res.status(404).json({ message: "Employee not found" });
  }

  res.status(200).json({
    message: "Employee deactivated successfully",
    employee
  });
}


export const makeUserActive = async (req,res) =>{
  const {employeeId} = req.params;
  const employee = await Employee.findByIdAndUpdate(employeeId, { isActive: true }, { new: true });

  if (!employee) {
    return res.status(404).json({ message: "Employee not found" });
  }

  res.status(200).json({
    message: "Employee activated successfully",
    employee
  });
}

export const updateDocumentFields = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { documents } = req.body;

    if (!employeeId || !documents) {
      return res.status(400).json({
        success: false,
        message: "Employee ID and documents are required",
      });
    }

    const employee = await Employee.findByIdAndUpdate(
      employeeId,
      { "employmentDetails.documents": documents },
      { new: true, runValidators: true }
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Documents updated successfully",
      documents: employee.employmentDetails.documents,
    });
  } catch (error) {
    console.error("Update Document Fields Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

export const makedocumentInValid = async (req, res) =>{
  const { employeeId } = req.params;
  const { docName } = req.body;

  if (!employeeId || !docName) {
    return res.status(400).json({
      success: false,
      message: "Employee ID and Document Name are required",
    });
  }

  try {
    const employee = await Employee.findOneAndUpdate(
      { _id: employeeId, "employmentDetails.documents.name": docName },
      { $set: { "employmentDetails.documents.$.isValid": false, "employmentDetails.documents.$.validatedBy": req.user._id } },
      { new: true }
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee or Document not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Document marked as invalid",
      documents: employee.employmentDetails.documents,
    });
  } catch (error) {
    console.error("Mark Document Invalid Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}

export const makedocumentValid = async (req, res) =>{
  const { employeeId } = req.params;
  const { docName } = req.body;

  if (!employeeId || !docName) {
    return res.status(400).json({
      success: false,
      message: "Employee ID and Document Name are required",
    });
  }

  try {
    const employee = await Employee.findOneAndUpdate(
      { _id: employeeId, "employmentDetails.documents.name": docName },
      { $set: { "employmentDetails.documents.$.isValid": true, "employmentDetails.documents.$.validatedBy": req.user._id } },
      { new: true }
    );

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: "Employee or Document not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Document marked as invalid",
      documents: employee.employmentDetails.documents,
    });
  } catch (error) {
    console.error("Mark Document Invalid Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
}



// @desc    Update employee sales achievement
// @route   PUT /api/sales/update-achievement/:employeeId
// @access  Private (HR/Admin/Manager)
export const updateSalesAchievement = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { achievedAmount } = req.body;

  if (achievedAmount == null) {
    return res.status(400).json({ message: 'Achieved amount is required' });
  }

  // Find employee by employeeId
  const employee = await Employee.findById(employeeId);

  if (!employee) {
    return res.status(404).json({ message: 'Employee not found' });
  }

  // Extract current target and previous achievement
  const currentPerformance = employee.employmentDetails.salesPerformance;
  const { targetAmount } = currentPerformance;

  // Update achieved amount
  currentPerformance.incentivesEarned = achievedAmount;

  // Save the updated employee
  await employee.save();

  res.status(200).json({
    message: 'Sales achievement updated successfully',
    salesPerformance: currentPerformance
  });
});