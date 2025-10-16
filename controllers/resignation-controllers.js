import Resignation from '../models/Resignation.js';
import Employee from '../models/Employee.js';
import User from '../models/User.js';
import Department from '../models/Department.js';
import mongoose from 'mongoose';

// Helper for transaction handling
const withTransaction = async (fn) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// Employee applies for resignation
export const applyForResignation = async (req, res) => {
  try {
    const resignation = await withTransaction(async (session) => {
      const { resignationDate, reason, feedback } = req.body;
      const { userId }= req.params;
      
      // Get employee details
      const employee = await Employee.findOne({ user: userId })
        .populate('company')
        .session(session);
      
      if (!employee) {
        throw new Error('Employee not found');
      }
      
      if (employee.employmentDetails.resignation?.applied) {
        throw new Error('Resignation already applied');
      }
      
      // Calculate proposed last working date based on notice period
      const noticePeriodDays = employee.employmentDetails.noticePeriod || 30;
      const proposedLastWorkingDate = new Date(resignationDate);
      proposedLastWorkingDate.setDate(proposedLastWorkingDate.getDate() + noticePeriodDays);
      
      // Create resignation record with three-level approval
      const resignationData = {
        employee: employee._id,
        user: userId,
        company: employee.company,
        resignationDate: new Date(resignationDate),
        proposedLastWorkingDate,
        reason,
        feedback,
        status: 'pending',
        currentApprovalLevel: 'manager',
        approvalFlow: {
          manager: { status: 'pending' },
          hr: { status: 'pending' },
          admin: { status: 'pending' }
        }
      };
      
      const [newResignation] = await Resignation.create([resignationData], { session });
      
      // Update employee status
      await Employee.findByIdAndUpdate(employee._id, {
        'employmentDetails.status': 'notice-period',
        'employmentDetails.resignation.applied': true,
        'employmentDetails.resignation.appliedDate': new Date(),
        'employmentDetails.resignation.lastWorkingDate': proposedLastWorkingDate
      }, { session });
      
      await newResignation.populate([
        { path: 'employee', select: 'employmentDetails personalDetails' },
        { path: 'user', select: 'email profile' },
        { path: 'company', select: 'name' }
      ]);
      
      return newResignation;
    });

    res.status(201).json({
      success: true,
      message: 'Resignation applied successfully and sent for manager approval',
      resignation
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Manager approval
export const managerApproveResignation = async (req, res) => {
  try {
    const { resignationId } = req.params;
    const managerId = req.user._id;
    const { comment } = req.body;

    const resignation = await withTransaction(async (session) => {
      const resignationDoc = await Resignation.findById(resignationId).session(session);
      if (!resignationDoc) throw new Error("Resignation not found");
      
      if (resignationDoc.currentApprovalLevel !== "manager") {
        throw new Error("Resignation is not awaiting manager approval");
      }

      if (resignationDoc.approvalFlow.manager.status !== "pending") {
        throw new Error("Manager has already acted on this resignation");
      }

      // Update manager approval
      resignationDoc.approvalFlow.manager.status = "approved";
      resignationDoc.approvalFlow.manager.approvedBy = managerId;
      resignationDoc.approvalFlow.manager.approvedAt = new Date();
      resignationDoc.approvalFlow.manager.comment = comment || "";
      
      // Move to next level (HR)
      resignationDoc.currentApprovalLevel = "hr";
      
      await resignationDoc.save({ session });
      return resignationDoc;
    });

    res.json({
      success: true,
      message: "Resignation approved by manager and sent to HR",
      resignation
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// HR approval
export const hrApproveResignation = async (req, res) => {
  try {
    const { resignationId } = req.params;
    const hrId = req.user._id;
    const { comment } = req.body;

    const resignation = await withTransaction(async (session) => {
      const resignationDoc = await Resignation.findById(resignationId).session(session);
      if (!resignationDoc) throw new Error("Resignation not found");
      
      if (resignationDoc.currentApprovalLevel !== "hr") {
        throw new Error("Resignation is not awaiting HR approval");
      }

      if (resignationDoc.approvalFlow.hr.status !== "pending") {
        throw new Error("HR has already acted on this resignation");
      }

      // Update HR approval
      resignationDoc.approvalFlow.hr.status = "approved";
      resignationDoc.approvalFlow.hr.approvedBy = hrId;
      resignationDoc.approvalFlow.hr.approvedAt = new Date();
      resignationDoc.approvalFlow.hr.comment = comment || "";
      
      // Move to next level (Admin)
      resignationDoc.currentApprovalLevel = "admin";

      await resignationDoc.save({ session });
      return resignationDoc;
    });

    res.json({
      success: true,
      message: "Resignation approved by HR and sent to Admin",
      resignation
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Admin approval (final)
export const adminApproveResignation = async (req, res) => {
  try {
    const { resignationId } = req.params;
    const adminId = req.user._id;
    const { actualLastWorkingDate, comment } = req.body;

    const resignation = await withTransaction(async (session) => {
      const resignationDoc = await Resignation.findById(resignationId)
        .populate('employee')
        .session(session);
      
      if (!resignationDoc) throw new Error("Resignation not found");
      
      if (resignationDoc.currentApprovalLevel !== "admin") {
        throw new Error("Resignation is not awaiting admin approval");
      }

      if (resignationDoc.approvalFlow.admin.status !== "pending") {
        throw new Error("Admin has already acted on this resignation");
      }

      // Update admin approval
      resignationDoc.approvalFlow.admin.status = "approved";
      resignationDoc.approvalFlow.admin.approvedBy = adminId;
      resignationDoc.approvalFlow.admin.approvedAt = new Date();
      resignationDoc.approvalFlow.admin.comment = comment || "";
      
      // Complete the approval process
      resignationDoc.status = "approved";
      resignationDoc.currentApprovalLevel = "completed";
      resignationDoc.approvedBy = adminId;
      resignationDoc.approvalDate = new Date();
      resignationDoc.actualLastWorkingDate = actualLastWorkingDate || 
        resignationDoc.proposedLastWorkingDate;
      
      await resignationDoc.save({ session });
      
      // Update employee status
      await Employee.findByIdAndUpdate(resignationDoc.employee._id, {
        'employmentDetails.status': 'resigned',
        'employmentDetails.resignation.approvedDate': new Date(),
        'employmentDetails.resignation.lastWorkingDate': resignationDoc.actualLastWorkingDate,
        'employmentDetails.lastWorkingDate': resignationDoc.actualLastWorkingDate
      }, { session });
      
      return resignationDoc;
    });

    res.json({
      success: true,
      message: "Resignation approved by Admin",
      resignation
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Reject at any level
export const rejectResignation = async (req, res) => {
  try {
    const { resignationId } = req.params;
    const userId = req.user._id;
    const { reason, level } = req.body;

    if (!reason) throw new Error("Rejection reason is required");
    if (!["manager", "hr", "admin"].includes(level)) {
      throw new Error("Invalid approval level");
    }

    const resignation = await withTransaction(async (session) => {
      const resignationDoc = await Resignation.findById(resignationId)
        .populate('employee')
        .session(session);
      
      if (!resignationDoc) throw new Error("Resignation not found");
      
      if (resignationDoc.currentApprovalLevel !== level) {
        throw new Error(`Resignation is not awaiting ${level} approval`);
      }

      if (resignationDoc.approvalFlow[level].status !== "pending") {
        throw new Error(`${level} has already acted on this resignation`);
      }

      // Update rejection at the current level
      resignationDoc.approvalFlow[level].status = "rejected";
      resignationDoc.approvalFlow[level].approvedBy = userId;
      resignationDoc.approvalFlow[level].approvedAt = new Date();
      resignationDoc.approvalFlow[level].comment = reason;
      
      // Set overall status to rejected
      resignationDoc.status = "rejected";
      resignationDoc.rejectedBy = userId;
      resignationDoc.rejectionReason = reason;
      resignationDoc.currentApprovalLevel = "completed";
      
      await resignationDoc.save({ session });
      
      // Revert employee status
      await Employee.findByIdAndUpdate(resignationDoc.employee._id, {
        'employmentDetails.status': 'active',
        'employmentDetails.resignation.applied': false,
        'employmentDetails.resignation.appliedDate': null,
        'employmentDetails.resignation.lastWorkingDate': null
      }, { session });
      
      return resignationDoc;
    });

    res.json({
      success: true,
      message: `Resignation rejected by ${level}`,
      resignation
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get resignations pending at specific level
// ✅ Get resignations pending at specific approval level
export const getPendingResignationsByLevel = async (req, res) => {
  try {
    const { level } = req.params;
    const userId = req.user._id;

    // 🔸 Valid levels
    if (!["manager", "hr", "admin"].includes(level)) {
      return res.status(400).json({ success: false, message: "Invalid level" });
    }

    let query = {
      [`approvalFlow.${level}.status`]: "pending",
      currentApprovalLevel: level,
      status: { $ne: "cancelled" },
    };

    // 🧩 Manager level → resignations from their departments only
    if (level === "manager") {
      const managedDepartments = await Department.find({ manager: userId }).select("_id");
      const departmentIds = managedDepartments.map(d => d._id);

      const employees = await Employee.find({
        "employmentDetails.department": { $in: departmentIds },
      }).select("_id");

      const employeeIds = employees.map(e => e._id);
      query.employee = { $in: employeeIds };
    }

    // 🧩 HR level → company-wide (not department-based), only after manager approval
    else if (level === "hr") {
      const hrEmployee = await Employee.findOne({ _id: userId }).populate("company", "_id");
      if (!hrEmployee || !hrEmployee.company) {
        return res.status(404).json({ success: false, message: "HR or company not found" });
      }

      const companyId = hrEmployee.company._id;

      // All employees in this company
      const employees = await Employee.find({ company: companyId }).select("_id");
      const employeeIds = employees.map(e => e._id);

      query.employee = { $in: employeeIds };
      query["approvalFlow.manager.status"] = "approved"; // ✅ only manager-approved resignations
    }

    // 🧩 Admin level → only after HR approval, across company
    else if (level === "admin") {
      query["approvalFlow.hr.status"] = "approved";
    }

    // 🧾 Pagination
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const total = await Resignation.countDocuments(query);

    const resignations = await Resignation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: "employee",
        select: "user employmentDetails",
        populate: [
          { path: "user", select: "profile email" },
          { path: "employmentDetails.department", select: "name" },
        ],
      })
      .populate("company", "name")
      .populate("approvalFlow.manager.approvedBy", "profile email")
      .populate("approvalFlow.hr.approvedBy", "profile email")
      .populate("approvalFlow.admin.approvedBy", "profile email");

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: resignations.length,
      resignations,
    });
  } catch (error) {
    console.error("Error fetching pending resignations:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};


// Bulk update resignations with three-level approval
export const bulkUpdateResignations = async (req, res) => {
  try {
    const { ids, action, level, comment, reason, actualLastWorkingDate } = req.body;
    const userId = req.user._id;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Resignation IDs are required" });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid action. Use 'approve' or 'reject'" });
    }

    if (!["manager", "hr", "admin"].includes(level)) {
      return res.status(400).json({ success: false, message: "Invalid level. Use 'manager', 'hr', or 'admin'" });
    }

    if (action === "reject" && !reason) {
      return res.status(400).json({ success: false, message: "Rejection reason is required" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const resignations = await Resignation.find({ 
        _id: { $in: ids },
        currentApprovalLevel: level,
        [`approvalFlow.${level}.status`]: 'pending'
      }).populate('employee').session(session);

      if (resignations.length !== ids.length) {
        const invalidResignations = ids.length - resignations.length;
        throw new Error(`${invalidResignations} resignations are not eligible for ${level} ${action}`);
      }

      let updatePromises = [];

      if (action === "approve") {
        if (level === 'admin') {
          // Final approval
          updatePromises = resignations.map(resignation => 
            Resignation.findByIdAndUpdate(
              resignation._id,
              {
                [`approvalFlow.${level}.status`]: 'approved',
                [`approvalFlow.${level}.approvedBy`]: userId,
                [`approvalFlow.${level}.approvedAt`]: new Date(),
                [`approvalFlow.${level}.comment`]: comment || '',
                status: 'approved',
                currentApprovalLevel: 'completed',
                approvedBy: userId,
                approvalDate: new Date(),
                actualLastWorkingDate: actualLastWorkingDate || resignation.proposedLastWorkingDate
              },
              { new: true, session }
            )
          );

          // Update employee status for approved resignations
          const employeeUpdates = resignations.map(resignation =>
            Employee.findByIdAndUpdate(
              resignation.employee._id,
              {
                'employmentDetails.status': 'resigned',
                'employmentDetails.resignation.approvedDate': new Date(),
                'employmentDetails.resignation.lastWorkingDate': actualLastWorkingDate || resignation.proposedLastWorkingDate,
                'employmentDetails.lastWorkingDate': actualLastWorkingDate || resignation.proposedLastWorkingDate
              },
              { session }
            )
          );
          await Promise.all(employeeUpdates);

        } else {
          // Intermediate approval
          const nextLevel = level === 'manager' ? 'hr' : 'admin';
          updatePromises = resignations.map(resignation => 
            Resignation.findByIdAndUpdate(
              resignation._id,
              {
                [`approvalFlow.${level}.status`]: 'approved',
                [`approvalFlow.${level}.approvedBy`]: userId,
                [`approvalFlow.${level}.approvedAt`]: new Date(),
                [`approvalFlow.${level}.comment`]: comment || '',
                currentApprovalLevel: nextLevel
              },
              { new: true, session }
            )
          );
        }
      } else if (action === "reject") {
        // Rejection
        updatePromises = resignations.map(resignation => 
          Resignation.findByIdAndUpdate(
            resignation._id,
            {
              [`approvalFlow.${level}.status`]: 'rejected',
              [`approvalFlow.${level}.approvedBy`]: userId,
              [`approvalFlow.${level}.approvedAt`]: new Date(),
              [`approvalFlow.${level}.comment`]: reason,
              status: 'rejected',
              rejectedBy: userId,
              rejectionReason: reason,
              currentApprovalLevel: 'completed'
            },
            { new: true, session }
          )
        );

        // Revert employee status for rejected resignations
        const employeeUpdates = resignations.map(resignation =>
          Employee.findByIdAndUpdate(
            resignation.employee._id,
            {
              'employmentDetails.status': 'active',
              'employmentDetails.resignation.applied': false,
              'employmentDetails.resignation.appliedDate': null,
              'employmentDetails.resignation.lastWorkingDate': null
            },
            { session }
          )
        );
        await Promise.all(employeeUpdates);
      }

      const updatedResignations = await Promise.all(updatePromises);
      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: `${resignations.length} resignations ${action}d successfully at ${level} level`,
        count: resignations.length,
        data: updatedResignations,
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error("Bulk Update Resignations Error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Withdraw resignation (employee) - updated for three-level approval
export const withdrawResignation = async (req, res) => {
  try {
   
    const { resignationId } = req.params;
    const userId = req?.user?._id;
    
    const resignation = await withTransaction(async (session) => {
      const resignationDoc = await Resignation.findById(resignationId).session(session);
   
      if (!resignationDoc) {
        throw new Error("Resignation not found");
      }

      // Check if the user owns this resignation
      // if (resignationDoc.user.toString() !== userId.toString()) {
      //   throw new Error("You can only withdraw your own resignation");
      // }

      // Check if the request is still withdrawable (before any approval)
      if (resignationDoc.approvalFlow.manager.status !== 'pending' ||
          resignationDoc.approvalFlow.hr.status !== 'pending' ||
          resignationDoc.approvalFlow.admin.status !== 'pending') {
        throw new Error("Cannot withdraw resignation after approval process has started");
      }

      // Update status to withdrawn
      resignationDoc.status = 'withdrawn';
      resignationDoc.currentApprovalLevel = 'completed';
      
      await resignationDoc.save({ session });

      // Revert employee status
      await Employee.findOneAndUpdate({ user: resignationDoc?.user }, {
        'employmentDetails.status': 'active',
        'employmentDetails.resignation.applied': false,
        'employmentDetails.resignation.appliedDate': null,
        'employmentDetails.resignation.lastWorkingDate': null
      }, { session });

      return resignationDoc;
    });

    res.json({
      success: true,
      message: "Resignation withdrawn successfully",
      resignation
    });

  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Keep existing functions with updated population
export const getResignations = async (req, res) => {
  try {
    const { status, companyId, page = 1, limit = 10 } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (companyId) query.company = companyId;
    
    const resignations = await Resignation.find(query)
      .populate('employee', 'employmentDetails personalDetails')
      .populate('user', 'email profile')
      .populate('approvedBy', 'profile')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email')
      .populate('rejectedBy', 'profile email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Resignation.countDocuments(query);
    
    res.json({
      success: true,
      resignations,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ... keep other existing functions with appropriate updates

// Get resignations for manager
export const getResignationsForManager = async (req, res) => {
  try {
    const { managerId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    // Get departments managed by this user
    const managedDepartments = await Department.find({ manager: managerId }).select('_id');
    const departmentIds = managedDepartments.map(d => d._id);

    // Get employees in those departments
    const employees = await Employee.find({
      'employmentDetails.department': { $in: departmentIds }
    }).select('_id user');

    const employeeIds = employees.map(e => e._id);

       let query = {
  employee: { $in: employeeIds },
  $or: [
    // Waiting for manager approval (only if HR approved)
    { currentApprovalLevel: "manager", "approvalFlow.manager.status": "pending" },

    // Already acted by manager
    { "approvalFlow.manager.status": { $in: ["approved", "rejected"] } }
  ]
};

query.status = { $ne: "cancelled" };

   
if (status && status !== "all") {
  if (status === "pending") {
    query.$and = [
      { status: "pending" },
      { currentApprovalLevel: "manager" },
     
    ];
    delete query.$or;
  } else {
    query.$or = [
      { "approvalFlow.manager.status": status }
    ];
  }
}

    const skip = (page - 1) * limit;
    const total = await Resignation.countDocuments(query);

    const resignations = await Resignation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: 'employee',
        select: 'user employmentDetails personalDetails',
        populate: [
          {
            path: 'user',
            select: 'profile email',
            populate: { path: 'profile', select: 'firstName lastName' }
          },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: resignations.length,
      resignations
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get resignations for HR
export const getResignationsForHR = async (req, res) => {
  try {
     const { hrId } = req.params;
    const { status, page = 1, limit = 10, search } = req.query;

    // 🧩 Get HR's company
    const hrEmployee = await Employee.findOne({ _id: hrId }).populate("company", "_id");
    if (!hrEmployee || !hrEmployee.company) {
      return res.status(404).json({ success: false, message: "HR or company not found" });
    }

    const companyId = hrEmployee.company._id;

    // 🧩 Get all employees in that company
    const employees = await Employee.find({ company: companyId }).select("_id user");
    const employeeIds = employees.map(e => e._id);

    // 🧩 Build query: HR can see all manager-approved leaves
    let query = {
      employee: { $in: employeeIds },
      status: { $ne: "cancelled" },
      "approvalFlow.manager.status": "approved", // ✅ must be approved by manager
    };

    // 🔹 If filtering by HR status (approved/rejected/pending)
    if (status && status !== "all") {
      query["approvalFlow.hr.status"] = status;
    }

    // 🔍 Search by employee name
    if (search) {
      const employeeUsers = await Employee.find({
        _id: { $in: employeeIds },
      })
        .populate({
          path: "user",
          select: "profile",
          match: {
            $or: [
              { "profile.firstName": { $regex: search, $options: "i" } },
              { "profile.lastName": { $regex: search, $options: "i" } },
            ],
          },
        });

      const searchedEmployeeIds = employeeUsers
        .filter(e => e.user)
        .map(e => e._id);

      query.employee = { $in: searchedEmployeeIds };
    }

    // 🧾 Pagination
    const skip = (page - 1) * limit;
    const total = await Resignation.countDocuments(query);

    const resignations = await Resignation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: "employee",
        select: "user employmentDetails personalDetails",
        populate: [
          {
            path: "user",
            select: "profile email",
            populate: { path: "profile", select: "firstName lastName" },
          },
          { path: "employmentDetails.department", select: "name" },
        ],
      })
      .populate("company", "name")
      .populate("approvalFlow.hr.approvedBy", "profile email")
      .populate("approvalFlow.manager.approvedBy", "profile email");

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: resignations.length,
      resignations,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};



// Get resignations for Admin
export const getResignationsForAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { status, page = 1, limit = 10, department } = req.query;

    const adminUser = await User.findById(adminId).select('companyId');
    if (!adminUser || !adminUser.companyId) {
      throw new Error("Admin not associated with any company");
    }

   // Build query - Admin comes after Manager
     let query = { 
      company: adminUser.companyId,
      "approvalFlow.hr.status": "approved",
      "approvalFlow.manager.status": "approved"
    };

   if (status && status !== "all") {
    if (status === "pending") {
      query.$and = [
        { status: "pending" },
        { "approvalFlow.hr.status": "approved" },
        { "approvalFlow.manager.status": "approved" },
        { "approvalFlow.admin.status": "pending" }  // ✅ key fix
      ];
      delete query.$or;
    } else {
      query.$and = [
        { "approvalFlow.hr.status": "approved" },
        { "approvalFlow.manager.status": "approved" },
        { "approvalFlow.admin.status": status }
      ];
    }
  }

  query.status = { $ne: "cancelled" };

    // Filter by department if provided
    if (department) {
      const employeesInDept = await Employee.find({
        'employmentDetails.department': department,
        company: adminUser.companyId
      }).select('_id');
      const employeeIds = employeesInDept.map(e => e._id);
      query.employee = { $in: employeeIds };
    }

    const skip = (page - 1) * limit;
    const total = await Resignation.countDocuments(query);

    const resignations = await Resignation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: 'employee',
        select: 'user employmentDetails personalDetails',
        populate: [
          {
            path: 'user',
            select: 'profile email',
            populate: { path: 'profile', select: 'firstName lastName' }
          },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: resignations.length,
      resignations
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get resignations for Employee
export const getResignationsForEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      throw new Error("Employee not found");
    }

    let query = { employee: employee._id };

    if (status && status !== 'all') query.status = status;

    const skip = (page - 1) * limit;
    const total = await Resignation.countDocuments(query);

    const resignations = await Resignation.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('company', 'name')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: resignations.length,
      resignations
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};



export const resetResignationForAll = async (req, res) => {
  try {
    const result = await Employee.updateMany(
      {}, // empty filter → affects all employees
      { $set: { "employmentDetails.resignation.applied": false } }
    );

    res.status(200).json({
      success: true,
      message: "Resignation status reset for all employees",
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to reset resignation status",
      error: error.message
    });
  }
};