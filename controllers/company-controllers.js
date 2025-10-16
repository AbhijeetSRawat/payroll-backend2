
import Company from "../models/Company.js"
import User from '../models/User.js';
import { generateRandomPassword, sendAdminCredentials} from "../utils/helper.js"
import bcrypt from "bcryptjs"
import mongoose from 'mongoose';

import Shift from '../models/Shifts.js';
import Resignation from '../models/Resignation.js';
import ReimbursementCategory from '../models/ReimbursementCategory.js';
import Policy from '../models/Policy.js';
import Reimbursement from '../models/Reimbursement.js';
import LeavePolicy from '../models/LeavePolicy.js';
import Leave from '../models/Leave.js';
import EmployeeLeaveBalance from '../models/EmployeeLeaveBalance.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import AttendanceRegularization from '../models/AttendanceRegularization.js';
import Counter from '../models/Counter.js';
import uploadFileToCloudinary from "../utils/fileUploader.js";

const getNextCompanyId = async () => {
  const result = await Counter.findOneAndUpdate(
    { _id: 'companyId' },
    { $inc: { sequence_value: 1 } },
    { new: true, upsert: true }
  );

  return result.sequence_value.toString().padStart(4, '0');
};


export const registerCompany = async (req, res) => {
  try {
    const { 
      name, email, registrationNumber, website,
      contactEmail, contactPhone,
      street, city, state, pincode,
      gstNumber, panNumber, tanNumber,
      accountNumber, ifscCode, accountHolderName,
      hrName, hrEmail, hrDesignation,hrPhone,
      customFields,
    } = req.body;

    const {thumbnail} = req.files;

    let parsedCustomFields = [];

try {
  parsedCustomFields = typeof req.body.customFields === "string"
    ? JSON.parse(req.body.customFields)
    : req.body.customFields;
} catch (error) {
  console.error("❌ Error parsing customFields:", error);
  return res.status(400).json({
    success: false,
    message: "Invalid customFields format",
  });
}
  
    const documentUrl = await uploadFileToCloudinary(
          thumbnail,
          process.env.FOLDER_NAME
        );

     const newCompanyId = await getNextCompanyId();

    // 0. Check if company already exists by email or registration number
    const existingCompany = await Company.findOne({
      $or: [
        { email: email },
        { registrationNumber: registrationNumber }
      ]

    });

    if (existingCompany) {
      return res.status(400).json({
        success: false,
        message: "Company already exists with the provided email or registration number."
      });
    }
    const permissions = req.body.permissions || [];
    // 1. Create Company
   const company = new Company({
       name,
      email,
      registrationNumber,
      website,
      contactEmail,
      contactPhone,
      thumbnail:documentUrl.result.secure_url,
      address: { street, city, state, pincode },
      companyId: newCompanyId,
      taxDetails: {
        gstNumber,
        panNumber,
        tanNumber
      },

      bankDetails: {
        accountNumber,
        ifscCode,
        accountHolderName
      },

      hrDetails: {
        name: hrName,
        email: hrEmail,
        phone: hrPhone,
        designation: hrDesignation
      },

   
  customFields: parsedCustomFields,


    });

    console.log('before save')

    await company.save();

    console.log('after save')

    // 2. Check if admin email is already taken
    const existingAdmin = await User.findOne({ email: contactEmail });
    if (existingAdmin) {
      return res.status(400).json({
        success: false,
        message: "Admin user with this contact email already exists."
      });
    }

    // 3. Create Admin User
    const plainPassword =  generateRandomPassword();
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const adminEmail = `${name.replace(/\s+/g, '').toLowerCase()}${randomSuffix}@masu.com`;

    const adminUser = new User({
      email: adminEmail,
      password: hashedPassword,
      role: 'admin',
      companyId: company._id,
      firstTimeLogin: true,
      profile:{
        firstName: 'Admin',
        lastName: '',
        designation: 'Admin'
      }// to be configured by superadmin
    });

    await adminUser.save();

    // 4. Send Email
     await sendAdminCredentials(contactEmail, adminEmail, plainPassword, company.companyId);

    return res.status(201).json({
      success: true,
      message: "Company registered successfully. Admin credentials sent to email.",
      companyId: company.companyId,
      adminEmail: adminEmail,
      password: plainPassword,
    });

  } catch (error) {
    console.error("Register Company Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const getCompanyDetails = async (req, res) => {
  try {
    const {companyId} = req.params;

    // 0. Validate companyId
    if (!companyId) {
      return res.status(400).json({ success: false, message: "Company ID is required" });
    }

    // 1. Fetch company details
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }

    return res.status(200).json({
      success: true,
      data: company,
    });

  } catch (error) {
    console.error("Get Company Details Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
}


export const getAllCompanies = async (req, res) => {
  try {
    // 1. Fetch all companies
    const companies = await Company.find({});

    // 2. Merge each company with its admin user
    const mergedData = await Promise.all(
      companies.map(async (company) => {
        const adminUser = await User.findOne({ companyId: company._id, role: 'admin' }).lean();
        return {
          ...company.toObject(),
          adminUser: adminUser || null, // if no admin found
        };
      })
    );

    // 3. Send merged data
    return res.status(200).json({
      success: true,
      data: mergedData,
    });

  } catch (error) {
    console.error("Get All Companies Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const updateCompanyPermissions = async (req, res) => {
  try {
    const { companyId, permissions } = req.body;

    if (!companyId || !Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Company ID and permissions (as array) are required.' });
    }

    // Find and update company permissions
    const company = await Company.findOneAndUpdate(
      { companyId: companyId },
      { $set: { permissions } },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ message: 'Company not found.' });
    }

    res.status(200).json({
      message: 'Permissions updated successfully.',
      companyId: company._id,
      updatedPermissions: company.permissions
    });

  } catch (error) {
    console.error('Error in updateCompanyPermissions:', error);
    res.status(500).json({ message: 'Failed to update permissions.', error: error.message });
  }
};

export const updateCompanyDetails = async (req, res) => {
  try {
    const { companyId } = req.params;
   
    // 0. Check if company exists
    const company = await Company.findOne({_id: companyId });
  if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found with the provided ID.",
      });
    }

    
    // 1. Update allowed fields from req.body
    const {
      name, email, registrationNumber, website,
      contactEmail, contactPhone,
      street, city, state, pincode,
      gstNumber, panNumber, tanNumber,
      accountNumber, ifscCode, accountHolderName,
      hrName, hrEmail, hrDesignation, hrPhone,
      customFields,
    
    } = req.body;

    
    let thumbnail;
   let documentUrl = null;

if (req.files && req.files.thumbnail) {

  const {thumbnail} = req.files;

  try {
    documentUrl = await uploadFileToCloudinary(
      req.files.thumbnail,
      process.env.FOLDER_NAME
    );
  } catch (uploadError) {
    return res.status(500).json({
      success: false,
      message: "Error uploading thumbnail.",
    });
  }
}



        let parsedFields = [];
try {
  parsedFields = typeof customFields === "string"
    ? JSON.parse(customFields)
    : customFields;
} catch (err) {
  return res.status(400).json({ success: false, message: "Invalid customFields format" });
}

    // 2. Apply updates only if values are provided
    if (name) company.name = name;
    if (email) company.email = email;
    if (registrationNumber) company.registrationNumber = registrationNumber;
    if (website) company.website = website;
    if (contactEmail) company.contactEmail = contactEmail;
    if (contactPhone) company.contactPhone = contactPhone;
   

    if (street) company.address.street = street;
    if (city) company.address.city = city;
    if (state) company.address.state = state;
    if (pincode) company.address.pincode = pincode;

    if (gstNumber) company.taxDetails.gstNumber = gstNumber;
    if (panNumber) company.taxDetails.panNumber = panNumber;
    if (tanNumber) company.taxDetails.tanNumber = tanNumber;

    if (accountNumber) company.bankDetails.accountNumber = accountNumber;
    if (ifscCode) company.bankDetails.ifscCode = ifscCode;
    if (accountHolderName) company.bankDetails.accountHolderName = accountHolderName;

    if (hrName) company.hrDetails.name = hrName;
    if (hrEmail) company.hrDetails.email = hrEmail;
    if (hrPhone) company.hrDetails.phone = hrPhone;
    if (hrDesignation) company.hrDetails.designation = hrDesignation;

    if (parsedFields) company.customFields = parsedFields;

  

    if (documentUrl?.result?.secure_url) {
  company.thumbnail = documentUrl.result.secure_url;
}

    // 3. Save updated company
    await company.save();

    return res.status(200).json({
      success: true,
      message: "Company details updated successfully.",
      data: company
    });

  } catch (error) {
    console.error("Update Company Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};


// Utility: safely execute a query
const safeFetch = async (query, label) => {
  try {
    return await query;
  } catch (err) {
    console.error(`❌ Error fetching ${label}:`, err.message);
    return [];
  }
};

export const downloadCompanyData = async (req, res) => {
  try {
    const { companyId } = req.params;
   

    // Validate companyId
    if (!mongoose.Types.ObjectId.isValid(companyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid company ID format",
      });
    }

    // Check company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({
        success: false,
        message: "Company not found",
      });
    }

    // Fetch all related data
    const users = await safeFetch(
      User.find({ companyId })
        .select("-password -passwordResetToken -passwordResetExpires")
        .populate("companyId")
        .lean(),
      "Users"
    );

    const shifts = await safeFetch(
      Shift.find({ company: companyId }).populate("company").lean(),
      "Shifts"
    );

    const resignations = await safeFetch(
      Resignation.find({ company: companyId })
        .populate("user company approvedBy")
        .populate({
          path: "employee",
          populate: { path: "user", select: "email profile" }
        })
        .lean(),
      "Resignations"
    );

    const reimbursementCategories = await safeFetch(
      ReimbursementCategory.find({ company: companyId })
        .populate("company createdBy")
        .lean(),
      "ReimbursementCategories"
    );

    const policies = await safeFetch(
      Policy.find({ company: companyId }).populate("company").lean(),
      "Policies"
    );

    const reimbursements = await safeFetch(
      Reimbursement.find({ company: companyId })
        .populate("company category reviewedBy paymentSlip.paidBy")
        .populate({
          path: "employee",
          populate: { path: "user", select: "email profile" }
        })
        .lean(),
      "Reimbursements"
    );

    const leavePolicies = await safeFetch(
      LeavePolicy.find({ company: companyId }).populate("company").lean(),
      "LeavePolicies"
    );

    const leaves = await safeFetch(
      Leave.find({ company: companyId })
        .populate("company approvedBy rejectedBy")
        .populate({
          path: "employee",
          populate: { path: "user", select: "email profile" }
        })
        .lean(),
      "Leaves"
    );

    const employeeLeaveBalances = await safeFetch(
      EmployeeLeaveBalance.find({ company: companyId })
        .populate("company")
        .populate({
          path: "employee",
          populate: { path: "user", select: "email profile" }
        })
        .lean(),
      "EmployeeLeaveBalances"
    );

    const employees = await safeFetch(
      Employee.find({ company: companyId })
        .populate(
          "user company employmentDetails.department employmentDetails.shift employmentDetails.reportingTo"
        )
        .lean(),
      "Employees"
    );

    const departments = await safeFetch(
      Department.find({ company: companyId }).populate("company") // populate company
    .populate({
      path: "manager",   // populate manager
      populate: {
        path: "user",    select: "email profile" // inside manager, populate user
      },
    }).lean(),
      "Departments"
    );

    const attendanceRegularizations = await safeFetch(
      AttendanceRegularization.find({ company: companyId })
        .populate("employee user company shift reviewedBy createdBy")
        .lean(),
      "AttendanceRegularizations"
    );

    // Final response
    return res.status(200).json({
      success: true,
      exportedAt: new Date().toISOString(),
      company,
      data: {
        users,
        shifts,
        resignations,
        reimbursementCategories,
        policies,
        reimbursements,
        leavePolicies,
        leaves,
        employeeLeaveBalances,
        employees,
        departments,
        attendanceRegularizations,
      },
      counts: {
        users: users.length,
        shifts: shifts.length,
        resignations: resignations.length,
        reimbursementCategories: reimbursementCategories.length,
        policies: policies.length,
        reimbursements: reimbursements.length,
        leavePolicies: leavePolicies.length,
        leaves: leaves.length,
        employeeLeaveBalances: employeeLeaveBalances.length,
        employees: employees.length,
        departments: departments.length,
        attendanceRegularizations: attendanceRegularizations.length,
      },
    });
  } catch (error) {
    console.error("❌ Download controller error:", error);
    return res.status(500).json({
      success: false,
      message: "Error processing request",
      error: error.message,
    });
  }
};

/**
 * Get company data statistics without downloading
 */
export const getCompanyDataStats = async (req, res) => {
  try {
    const { companyId } = req.params;
    
    // Validate companyId format
    if (!isValidObjectId(companyId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid company ID format' 
      });
    }

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    // Get counts for each collection with error handling
    const countPromises = [
      User.countDocuments({ companyId }).catch(() => 0),
      Shift.countDocuments({ company: companyId }).catch(() => 0),
      Resignation.countDocuments({ company: companyId }).catch(() => 0),
      ReimbursementCategory.countDocuments({ company: companyId }).catch(() => 0),
      Policy.countDocuments({ company: companyId }).catch(() => 0),
      Reimbursement.countDocuments({ company: companyId }).catch(() => 0),
      LeavePolicy.countDocuments({ company: companyId }).catch(() => 0),
      Leave.countDocuments({ company: companyId }).catch(() => 0),
      EmployeeLeaveBalance.countDocuments({ company: companyId }).catch(() => 0),
      Employee.countDocuments({ company: companyId }).catch(() => 0),
      Department.countDocuments({ company: companyId }).catch(() => 0),
      AttendanceRegularization.countDocuments({ company: companyId }).catch(() => 0)
    ];

    const counts = await Promise.all(countPromises);

    const [
      usersCount,
      shiftsCount,
      resignationsCount,
      reimbursementCategoriesCount,
      policiesCount,
      reimbursementsCount,
      leavePoliciesCount,
      leavesCount,
      employeeLeaveBalancesCount,
      employeesCount,
      departmentsCount,
      attendanceRegularizationsCount
    ] = counts;

    res.json({
      success: true,
      data: {
        company: {
          name: company.name,
          id: company._id.toString(),
          email: company.email
        },
        counts: {
          users: usersCount,
          shifts: shiftsCount,
          resignations: resignationsCount,
          reimbursementCategories: reimbursementCategoriesCount,
          policies: policiesCount,
          reimbursements: reimbursementsCount,
          leavePolicies: leavePoliciesCount,
          leaves: leavesCount,
          employeeLeaveBalances: employeeLeaveBalancesCount,
          employees: employeesCount,
          departments: departmentsCount,
          attendanceRegularizations: attendanceRegularizationsCount
        },
        totalRecords: counts.reduce((sum, count) => sum + count, 0),
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching company data statistics', 
      error: error.message 
    });
  }
};

/**
 * Get list of available collections for a company
 */
export const getAvailableCollections = async (req, res) => {
  try {
    const { companyId } = req.params;
    
    // Validate companyId format
    if (!isValidObjectId(companyId)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid company ID format' 
      });
    }

    // Verify company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ 
        success: false, 
        message: 'Company not found' 
      });
    }

    res.json({
      success: true,
      data: {
        company: {
          name: company.name,
          id: company._id.toString()
        },
        collections: [
          { name: 'users', description: 'System users with roles and permissions' },
          { name: 'shifts', description: 'Work shift definitions' },
          { name: 'resignations', description: 'Employee resignation records' },
          { name: 'reimbursementCategories', description: 'Reimbursement categories' },
          { name: 'policies', description: 'Company policies' },
          { name: 'reimbursements', description: 'Employee reimbursement requests' },
          { name: 'leavePolicies', description: 'Leave policy configurations' },
          { name: 'leaves', description: 'Employee leave requests' },
          { name: 'employeeLeaveBalances', description: 'Employee leave balances' },
          { name: 'employees', description: 'Employee profiles and details' },
          { name: 'departments', description: 'Company departments' },
          { name: 'attendanceRegularizations', description: 'Attendance regularization requests' },
          { name: 'company', description: 'Company information' }
        ]
      }
    });

  } catch (error) {
    console.error('Collections error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching available collections', 
      error: error.message 
    });
  }
};


export const changeStatus = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ success: false, message: "isActive must be a boolean" });
    }
    // 1. Find and update company status
    const company = await Company.findOneAndUpdate(
      { _id: companyId },
      { isActive, updatedAt: Date.now() },
      { new: true }
    );

    if (!company) {
      return res.status(404).json({ success: false, message: "Company not found" });
    }
    return res.status(200).json({
      success: true,
      message: `Company has been ${isActive ? 'activated' : 'deactivated'}.`,
      data: { companyId: company._id, isActive: company.isActive }
    });
  } catch (error) {
    console.error("Change Status Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};