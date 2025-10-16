import Department from '../models/Department.js';
import Company from '../models/Company.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js'
import crypto from 'crypto';


import bcrypt from "bcryptjs";

import {

  generateRandomPassword,
  sendAdminCredentials,
  sendSubAdminCredentials,
} from "../utils/helper.js";


// CREATE DEPARTMENT
export const createDepartment = async (req, res) => {
  try {
    const { name, companyId, description, salesConfig } = req.body;

    // Validate company
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    // Check if department already exists in this company
    const existing = await Department.findOne({ name, company: companyId });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Department already exists in this company' });
    }

    const department = new Department({
      name,
      company: companyId,
      description,
      manager: null,
      salesConfig: salesConfig || null
    });



    await department.save();
    
     await Employee.findByIdAndUpdate(manager, { 'employmentDetails.department': department._id });
    return res.status(201).json({ success: true, message: 'Department created', data: department });

  } catch (error) {
    console.error('Create Department Error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};



export const editDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { name, description, salesConfig } = req.body;

    const department = await Department.findById(departmentId);
    if (!department) {
      return res.status(404).json({ success: false, message: "Department not found" });
    }
  
    // Update name/description
    if (name) department.name = name;
    if (description) department.description = description;
    if (salesConfig) department.salesConfig = salesConfig;

    await department.save();

    return res.status(200).json({
      success: true,
      message: "Department updated successfully",
      data: department,
    });
  } catch (error) {
    console.error("Edit Department Error:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};



// GET ALL DEPARTMENTS FOR A COMPANY
export const getDepartmentsByCompany = async (req, res) => {
  try {
    const { companyId } = req.params;

    const departments = await Department.find({ company: companyId }).populate({
      path: 'manager',
      populate: {
        path: 'user', // this will populate employee's user
      }
    });

    return res.status(200).json({ success: true, data: departments });
  } catch (error) {
    console.error('Get Departments Error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};


export const AssignHRorManager = async (req, res) => {
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

      if(departmentData.hr && role === "hr"){
        return res.status(400).json({ message: "HR already assigned for this department" });
      }
      if(departmentData.manager && role === "manager"){
        return res.status(400).json({ message: "Manager already assigned for this department" });
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
      await sendSubAdminCredentials(email, email, message, company.companyId);

      

      if(role === "hr"){
        departmentData.hr = newEmployee._id;
        await departmentData.save();
      }
      if(role === "manager"){
        departmentData.manager = newEmployee._id; 
        await departmentData.save();
      }
  
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
  
}


export const updateHRorManager = async (req, res) => {
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
  
       if(departmentData.hr && role === "hr"){
        const hrEmployee = await Employee.findById(departmentData.hr);
        hrEmployee.isActive = false;
        await hrEmployee.save();
        departmentData.hr = newEmployee._id;
        await departmentData.save();
        // return res.status(400).json({ message: "HR already assigned for this department" }); 
      }
      if(departmentData.manager && role === "manager"){
        const managerEmployee = await Employee.findById(departmentData.manager);
        managerEmployee.isActive = false;
        await managerEmployee.save();
        departmentData.manager = newEmployee._id;
        await departmentData.save();
        // return res.status(400).json({ message: "Manager already assigned for this department" });
      }

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
      await sendSubAdminCredentials(email, email, message, company.companyId);


  
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
  
}

export const updateDetailsHRorManager = async (req, res) => {
  try {
    const {
      userId, // the ID of the User to update
      profile = {},
      personalDetails = {},
      employmentDetails = {},
      leaveBalance = {},
      customFields = [],
    } = req.body;

    // 1. Fetch User
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2. Fetch Employee record
    const employee = await Employee.findOne({ user: userId });
    if (!employee) {
      return res.status(404).json({ message: "Employee record not found" });
    }

    // 3. Update User Profile
    user.profile.firstName = profile.firstName || user.profile.firstName;
    user.profile.lastName = profile.lastName || user.profile.lastName;
    user.profile.phone = profile.phone || user.profile.phone;
    user.profile.avatar = profile.avatar || user.profile.avatar;
    user.profile.designation = profile.designation || user.profile.designation;
    user.customFields = customFields.length ? customFields : user.customFields;
    await user.save();

    // 4. Update Employee Personal Details
    employee.personalDetails = {
      ...employee.personalDetails,
      ...personalDetails,
    };

    // 5. Update Employment Details (Partial updates only)
    if (employmentDetails) {
      if (employmentDetails.designation) {
        employee.employmentDetails.designation = employmentDetails.designation;
        user.profile.designation = employmentDetails.designation; // sync designation with User profile
      }
      if (employmentDetails.department) {
        const department = await Department.findById(employmentDetails.department);
        if (!department) {
          return res.status(400).json({ message: "Invalid department ID" });
        }
        employee.employmentDetails.department = department._id;
        user.profile.department = department.name; // sync department name
      }
      // Update other fields similarly if needed...
    }

    // 6. Update Leave Balance
    if (leaveBalance) {
      employee.leaveBalance.casual = leaveBalance.casual ?? employee.leaveBalance.casual;
      employee.leaveBalance.sick = leaveBalance.sick ?? employee.leaveBalance.sick;
      employee.leaveBalance.earned = leaveBalance.earned ?? employee.leaveBalance.earned;
    }

    await employee.save();
    await user.save(); // saving again in case profile.department changed

    // 7. Final Response
    return res.status(200).json({
      message: "HR/Manager details updated successfully",
      userId: user._id,
      employeeId: employee._id,
    });
  } catch (error) {
    console.error("[UPDATE_HR_MANAGER_DETAILS_ERROR]", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getAllHRs = async (req, res) => {
  try {
    // 1. Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 2. Count total departments
    const totalDepartments = await Department.countDocuments({company: req.params.companyId});

    // 3. Fetch paginated departments and deeply populate hr → user & manager → user
    const departments = await Department.find({company: req.params.companyId})
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'hr',
        populate: {
          path: 'user',
          model: 'User',
        },
      })

    // 4. Build department-wise structure
    const departmentWise = departments.map((dept) => {
      const hrUser = dept.hr?.user;
    
      return {
        departmentId: dept._id,
        departmentName: dept.name,
        hr: dept.hr
          ? {
              employeeId: dept.hr._id,
              name: `${hrUser?.profile?.firstName || ""} ${hrUser?.profile?.lastName || ""}`,
              email: hrUser?.email,
              userId: hrUser?._id,
            }
          : null,
      };
    });

    // 5. Collect unique HRs and Managers from current page
    const hrMap = new Map();
    

    departmentWise.forEach((dept) => {
      if (dept.hr && !hrMap.has(dept.hr.employeeId.toString())) {
        hrMap.set(dept.hr.employeeId.toString(), dept.hr);
      }
    
    });

    // 6. Final response with pagination info
    return res.status(200).json({
      message: "Fetched HRs and Managers successfully",
      currentPage: page,
      totalPages: Math.ceil(totalDepartments / limit),
      totalDepartments,
      pageSize: departmentWise.length,
      allHRs: Array.from(hrMap.values()),
     
      departmentWise,
    });
  } catch (error) {
    console.error("[GET_HRS_MANAGERS_ERROR]", error);
    return res.status(500).json({
      message: "Internal server error while fetching HRs and Managers",
      error: error.message,
    });
  }
};



export const getAllManagers = async (req, res) => {
  try {
    // 1. Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // 2. Count total departments
    const totalDepartments = await Department.countDocuments({company: req.params.companyId});

    // 3. Fetch paginated departments and deeply populate hr → user & manager → user
    const departments = await Department.find({company: req.params.companyId})
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'manager',
        populate: {
          path: 'user',
          model: 'User',
        },
      })

    // 4. Build department-wise structure
    const departmentWise = departments.map((dept) => {
  
      const managerUser = dept.manager?.user;

      return {
        departmentId: dept._id,
        departmentName: dept.name,
        manager: dept.manager
          ? {
              employeeId: dept.manager._id,
              name: `${managerUser?.profile?.firstName || ""} ${managerUser?.profile?.lastName || ""}`,
              email: managerUser?.email,
              userId: managerUser?._id,
            }
          : null,
      };
    });

    // 5. Collect unique HRs and Managers from current page
 
    const managerMap = new Map();

    departmentWise.forEach((dept) => {

      if (dept.manager && !managerMap.has(dept.manager.employeeId.toString())) {
        managerMap.set(dept.manager.employeeId.toString(), dept.manager);
      }
    });

    // 6. Final response with pagination info
    return res.status(200).json({
      message: "Fetched HRs and Managers successfully",
      currentPage: page,
      totalPages: Math.ceil(totalDepartments / limit),
      totalDepartments,
      pageSize: departmentWise.length,
      allManagers: Array.from(managerMap.values()),
      departmentWise,
    });
  } catch (error) {
    console.error("[GET_HRS_MANAGERS_ERROR]", error);
    return res.status(500).json({
      message: "Internal server error while fetching HRs and Managers",
      error: error.message,
    });
  }
};



export const getHRAndManagerByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;

    if (!departmentId) {
      return res.status(400).json({ message: "Department ID is required" });
    }

    // 1. Fetch department with HR and Manager populated (including nested user)
    const department = await Department.findById(departmentId)
      .populate({
        path: 'hr',
        populate: {
          path: 'user',
          model: 'User',
        },
      })
      .populate({
        path: 'manager',
        populate: {
          path: 'user',
          model: 'User',
        },
      });

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    // 2. Extract HR and Manager details
    const hrUser = department.hr?.user;
    const managerUser = department.manager?.user;

    const hr = department.hr
      ? {
          employeeId: department.hr._id,
          name: `${hrUser?.profile?.firstName || ""} ${hrUser?.profile?.lastName || ""}`,
          email: hrUser?.email,
          userId: hrUser?._id,
        }
      : null;

    const manager = department.manager
      ? {
          employeeId: department.manager._id,
          name: `${managerUser?.profile?.firstName || ""} ${managerUser?.profile?.lastName || ""}`,
          email: managerUser?.email,
          userId: managerUser?._id,
        }
      : null;

    // 3. Send response
    return res.status(200).json({
      message: "Fetched HR and Manager successfully",
      departmentId: department._id,
      departmentName: department.name,
      hr,
      manager,
    });
  } catch (error) {
    console.error("[GET_HR_MANAGER_BY_DEPARTMENT_ERROR]", error);
    return res.status(500).json({
      message: "Internal server error while fetching HR and Manager",
      error: error.message,
    });
  }
};

