import mongoose from 'mongoose';
import Leave from '../models/Leave.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import { 
  businessDaysBetween, 
  hasOverlappingLeaves, 
  validateLeaveType,
  getCompanyPolicy,
  getPolicyYearStart,
  getPolicyYearEnd
} from '../services/leaveUtils.js';
import uploadFileToCloudinary from '../utils/fileUploader.js';
import User from '../models/User.js';

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

// Apply for leave
export const applyLeave = async (req, res) => {
  try {
    const leave = await withTransaction(async (session) => {
      let {
        employeeId,
        companyId,
        leaveBreakup = [],
        startDate,
        endDate,
        reason,
        isHalfDay = false,
        halfDayType = null,
      } = req.body;

      // Validation and processing (same as before)
      isHalfDay = String(isHalfDay).toLowerCase() === "true";

      if (typeof leaveBreakup === "string") {
        try {
          leaveBreakup = JSON.parse(leaveBreakup);
        } catch (err) {
          throw new Error("Invalid leaveBreakup format");
        }
      }

      if (!employeeId || !companyId || !startDate || !endDate || !reason) {
        throw new Error("Missing required fields");
      }
      if (!Array.isArray(leaveBreakup) || leaveBreakup.length === 0) {
        throw new Error("At least one leave type required");
      }

      if (isHalfDay && !["first-half", "second-half"].includes(halfDayType)) {
        throw new Error("Invalid half-day type");
      }

      const s = new Date(startDate);
      const e = new Date(endDate);
      if (e < s) throw new Error("End date must be after start date");
      if (isHalfDay && s.toDateString() !== e.toDateString()) {
        throw new Error("Half-day must be a single day");
      }

      // Get employee department to determine manager and HR
      const employee = await Employee.findById(employeeId)
        .populate('employmentDetails.department');
      
      if (!employee) throw new Error("Employee not found");
      
      const departmentId = employee.employmentDetails.department;
      const department = await Department.findById(departmentId)
        .populate('manager hr');
      
      if (!department) throw new Error("Department not found");

      // File handling (same as before)
      let documentsArray = [];
      let filesToProcess = [];
      if (req.files) {
        if (req.files.documents) {
          filesToProcess = Array.isArray(req.files.documents)
            ? req.files.documents
            : [req.files.documents];
        } else if (Array.isArray(req.files)) {
          filesToProcess = req.files;
        } else if (req.files.filename || req.files.path) {
          filesToProcess = [req.files];
        }
      }
      
      if (filesToProcess.length > 0) {
        try {
          documentsArray = await Promise.all(
            filesToProcess.map(async (file, idx) => {
              const originalFileName = file.originalname || file.name || `Doc_${Date.now()}_${idx + 1}`;
              const uploaded = await uploadFileToCloudinary(file, process.env.FOLDER_NAME);
              return { name: originalFileName, url: uploaded?.result?.secure_url };
            })
          );
        } catch (err) {
          console.error("Doc upload error:", err);
          throw new Error("Failed to upload documents");
        }
      }

      // Calculate business days (same as before)
      const policy = await getCompanyPolicy(companyId);
      let businessDays = isHalfDay ? 0.5 : await businessDaysBetween({
        companyId,
        start: s,
        end: e,
        excludeHoliday: !policy.sandwichLeave,
        includeWeekOff: policy.sandwichLeave
      });

      if (businessDays <= 0) throw new Error("No business days in range");

      // Validate breakup and check overlaps (same as before)
      let totalDays = 0;
      for (const part of leaveBreakup) {
        if (!part.leaveType || !part.shortCode || !part.days) {
          throw new Error("Invalid leave breakup entry");
        }

        const typeDef = validateLeaveType(policy, part.leaveType);
        if (part.days > typeDef.maxPerRequest) {
          throw new Error(`${part.leaveType} exceeds max ${typeDef.maxPerRequest} days per request`);
        }
        if (part.days < typeDef.minPerRequest) {
          throw new Error(`${part.leaveType} requires min ${typeDef.minPerRequest} days`);
        }

        // Yearly balance check
        const yearStart = getPolicyYearStart(policy.yearStartMonth);
        const yearEnd = getPolicyYearEnd(policy.yearStartMonth);
        const yearLeaves = await Leave.aggregate([
          {
            $match: {
              employee: employeeId,
              company: companyId,
              "leaveBreakup.shortCode": part.shortCode,
              status: { $in: ["approved", "pending"] },
              startDate: { $gte: yearStart, $lte: yearEnd },
            },
          },
          { $unwind: "$leaveBreakup" },
          { $match: { "leaveBreakup.shortCode": part.shortCode } },
          { $group: { _id: null, total: { $sum: "$leaveBreakup.days" } } },
        ]);
        
        const usedYear = yearLeaves.length > 0 ? yearLeaves[0].total : 0;
        if (typeDef.maxInstancesPerYear && usedYear + part.days > typeDef.maxInstancesPerYear) {
          throw new Error(`${part.leaveType} yearly balance exceeded. Remaining: ${typeDef.maxInstancesPerYear - usedYear}`);
        }

        totalDays += part.days;
      }

      const overlap = await hasOverlappingLeaves(employeeId, companyId, s, e);
      if (overlap) throw new Error("Overlapping leave exists");

      // Create leave with approval flow
      const leaveData = {
        employee: employeeId,
        company: companyId,
        leaveBreakup,
        totalDays,
        startDate: s,
        endDate: e,
        reason: reason.trim(),
        documents: documentsArray,
        isHalfDay,
        halfDayType: isHalfDay ? halfDayType : null,
        status: "pending",
        currentApprovalLevel: "manager",
        approvalFlow: {
          manager: { status: "pending" },
          hr: { status: "pending" },
          admin: { status: "pending" }
        }
      };

      const [newLeave] = await Leave.create([leaveData], { session });
      
      // Auto approve if no approval needed for all leave types
      let autoApprove = leaveBreakup.every((p) => {
        const def = validateLeaveType(policy, p.leaveType);
        return !def.requiresApproval;
      });
      
      if (autoApprove) {
        newLeave.status = "approved";
        newLeave.currentApprovalLevel = "completed";
        newLeave.approvalFlow.manager.status = "approved";
        newLeave.approvalFlow.hr.status = "approved";
        newLeave.approvalFlow.admin.status = "approved";
        newLeave.approvalFlow.manager.approvedBy = employeeId;
        newLeave.approvalFlow.hr.approvedBy = employeeId;
        newLeave.approvalFlow.admin.approvedBy = employeeId;
        newLeave.approvalFlow.manager.approvedAt = new Date();
        newLeave.approvalFlow.hr.approvedAt = new Date();
        newLeave.approvalFlow.admin.approvedAt = new Date();
        await newLeave.save({ session });
      }

      await newLeave.populate([
        { path: 'employee', select: 'user', populate: { path: 'user', select: 'profile' } },
        { path: 'company', select: 'name' }
      ]);

      return newLeave;
    });

    res.status(201).json({
      success: true,
      message: leave.status === "approved" 
        ? "Leave auto-approved successfully" 
        : "Leave submitted for manager approval",
      leave,
      documentsUploaded: leave.documents ? leave.documents.length : 0,
    });
  } catch (err) {
    console.error("Apply Leave Error:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// Manager approval
export const managerApprove = async (req, res) => {
  try {
    const { id } = req.params;
    const managerId = req.user._id;
    const { comment } = req.body;

    const leave = await withTransaction(async (session) => {
      const leaveDoc = await Leave.findById(id).session(session);
      if (!leaveDoc) throw new Error("Leave not found");
      
      if (leaveDoc.currentApprovalLevel !== "manager") {
        throw new Error("Leave is not awaiting manager approval");
      }

      if (leaveDoc.approvalFlow.manager.status !== "pending") {
        throw new Error("Manager has already acted on this leave");
      }

      // Update manager approval
      leaveDoc.approvalFlow.manager.status = "approved";
      leaveDoc.approvalFlow.manager.approvedBy = managerId;
      leaveDoc.approvalFlow.manager.approvedAt = new Date();
      leaveDoc.approvalFlow.manager.comment = comment || "";
      
      // Move to next level (HR)
      leaveDoc.currentApprovalLevel = "hr";
      
      await leaveDoc.save({ session });
      return leaveDoc;
    });

    res.json({
      success: true,
      message: "Leave approved by manager and sent to HR",
      leave
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// HR approval
export const hrApprove = async (req, res) => {
  try {
    const { id } = req.params;
    const hrId = req.user._id;
    const { comment } = req.body;

    const leave = await withTransaction(async (session) => {
      const leaveDoc = await Leave.findById(id).session(session);
      if (!leaveDoc) throw new Error("Leave not found");
      
      if (leaveDoc.currentApprovalLevel !== "hr") {
        throw new Error("Leave is not awaiting HR approval");
      }

      if (leaveDoc.approvalFlow.hr.status !== "pending") {
        throw new Error("HR has already acted on this leave");
      }

      // Update HR approval
      leaveDoc.approvalFlow.hr.status = "approved";
      leaveDoc.approvalFlow.hr.approvedBy = hrId;
      leaveDoc.approvalFlow.hr.approvedAt = new Date();
      leaveDoc.approvalFlow.hr.comment = comment || "";
      
      // Move to next level (Admin)
      leaveDoc.currentApprovalLevel = "admin";
      
      await leaveDoc.save({ session });
      return leaveDoc;
    });

    res.json({
      success: true,
      message: "Leave approved by HR and sent to Admin",
      leave
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Admin approval (final)
export const adminApprove = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;
    const { comment } = req.body;

    const leave = await withTransaction(async (session) => {
      const leaveDoc = await Leave.findById(id).session(session);
      if (!leaveDoc) throw new Error("Leave not found");
      
      if (leaveDoc.currentApprovalLevel !== "admin") {
        throw new Error("Leave is not awaiting admin approval");
      }

      if (leaveDoc.approvalFlow.admin.status !== "pending") {
        throw new Error("Admin has already acted on this leave");
      }

      // Update admin approval
      leaveDoc.approvalFlow.admin.status = "approved";
      leaveDoc.approvalFlow.admin.approvedBy = adminId;
      leaveDoc.approvalFlow.admin.approvedAt = new Date();
      leaveDoc.approvalFlow.admin.comment = comment || "";
      
      // Complete the approval process
      leaveDoc.status = "approved";
      leaveDoc.currentApprovalLevel = "completed";
      
      await leaveDoc.save({ session });
      return leaveDoc;
    });

    res.json({
      success: true,
      message: "Leave approved by Admin",
      leave
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Reject at any level
export const rejectLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { reason, level } = req.body;

    if (!reason) throw new Error("Rejection reason is required");
    if (!["manager", "hr", "admin"].includes(level)) {
      throw new Error("Invalid approval level");
    }

    const leave = await withTransaction(async (session) => {
      const leaveDoc = await Leave.findById(id).session(session);
      if (!leaveDoc) throw new Error("Leave not found");
      
      if (leaveDoc.currentApprovalLevel !== level) {
        throw new Error(`Leave is not awaiting ${level} approval`);
      }

      if (leaveDoc.approvalFlow[level].status !== "pending") {
        throw new Error(`${level} has already acted on this leave`);
      }

      // Update rejection at the current level
      leaveDoc.approvalFlow[level].status = "rejected";
      leaveDoc.approvalFlow[level].approvedBy = userId;
      leaveDoc.approvalFlow[level].approvedAt = new Date();
      leaveDoc.approvalFlow[level].comment = reason;
      
      // Set overall leave status to rejected
      leaveDoc.status = "rejected";
      leaveDoc.rejectedBy = userId;
      leaveDoc.rejectionReason = reason;
      
      await leaveDoc.save({ session });
      return leaveDoc;
    });

    res.json({
      success: true,
      message: `Leave rejected by ${level}`,
      leave
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get leaves pending at specific level
export const getPendingLeavesByLevel = async (req, res) => {
  try {
    const { level } = req.params;
    const userId = req.user._id;
    
    if (!["manager", "hr", "admin"].includes(level)) {
      return res.status(400).json({ success: false, message: "Invalid level" });
    }

    // For manager level, get leaves where employee's department manager is the current user
    let query = { 
      [`approvalFlow.${level}.status`]: "pending",
      currentApprovalLevel: level
    };

    if (level === "manager") {
      // Get departments where user is manager
      const managedDepartments = await Department.find({ manager: userId }).select('_id');
      const departmentIds = managedDepartments.map(d => d._id);
      
      // Get employees in those departments
      const employees = await Employee.find({ 
        'employmentDetails.department': { $in: departmentIds } 
      }).select('_id');
      
      const employeeIds = employees.map(e => e._id);
      
      query.employee = { $in: employeeIds };
    } else if (level === "hr") {
      // Get departments where user is HR
      const hrDepartments = await Department.find({ hr: userId }).select('_id');
      const departmentIds = hrDepartments.map(d => d._id);
      
      // Get employees in those departments
      const employees = await Employee.find({ 
        'employmentDetails.department': { $in: departmentIds } 
      }).select('_id');
      
      const employeeIds = employees.map(e => e._id);
      
      query.employee = { $in: employeeIds };
    }
    // For admin, no additional filtering needed

    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const total = await Leave.countDocuments(query);
    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: 'employee',
        select: 'user employmentDetails',
        populate: [
          { path: 'user', select: 'profile' },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: leaves.length,
      leaves
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Cancel leave (only by employee or admin)
export const cancelLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { employeeId }= req.params;
    const employee = await Employee.findById(employeeId);
    if(!employee){
      return res.status(404).json({ success: false, message: "Employee not found" });
    }

    const leave = await Leave.findOneAndUpdate(
      {
        _id: id,
        $or: [
          { employee: employee._id },
        ],
        status: { $in: ["pending", "approved"] }
      },
      { 
        status: "cancelled",
        cancelledAt: new Date()
      },
      { new: true }
    );

    if (!leave) {
      throw new Error("Leave not found or cannot be cancelled");
    }

    res.json({
      success: true,
      message: "Leave cancelled successfully",
      leave
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};



// Other existing functions...


export const bulkUpdateLeaves = async (req, res) => {
  try {
    const { ids, action, level, comment, reason } = req.body;
    const { userId } = req.params;
    const user = await User.findById(userId);
    const employee = await Employee.findOne({ user: userId });
    if(!user){
      return res.status(404).json({ success: false, message: "User not found" });
    }
    const userRole = user?.role;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Leave IDs are required" });
    }

    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "Invalid action. Use 'approve' or 'reject'" });
    }

    if (!["manager", "hr", "admin"].includes(level)) {
      return res.status(400).json({ success: false, message: "Invalid level. Use 'manager', 'hr', or 'admin'" });
    }

    // Validate user has permission for this level
    // if (level === 'manager' && userRole !== 'manager') {
    //   return res.status(403).json({ success: false, message: "Only managers can perform bulk actions at manager level" });
    // }
    // if (level === 'hr' && userRole !== 'hr') {
    //   return res.status(403).json({ success: false, message: "Only HR can perform bulk actions at HR level" });
    // }
    // if (level === 'admin' && !['admin', 'superadmin'].includes(userRole)) {
    //   return res.status(403).json({ success: false, message: "Only admins can perform bulk actions at admin level" });
    // }

    if (action === "reject" && !reason) {
      return res.status(400).json({ success: false, message: "Rejection reason is required" });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // First, validate all leaves are at the correct level and pending
      const leaves = await Leave.find({ 
        _id: { $in: ids },
        currentApprovalLevel: level,
        [`approvalFlow.${level}.status`]: 'pending'
      }).session(session);

      if (leaves.length !== ids.length) {
        const invalidLeaves = ids.length - leaves.length;
        throw new Error(`${invalidLeaves} leaves are not eligible for ${level} ${action}. They may already be processed or at a different level.`);
      }

      // 🔹 ADD THIS BLOCK HERE
        for (const leave of leaves) {
          if (level === "hr" && leave?.approvalFlow?.manager?.status !== "approved") {
            throw new Error(`Leave ${leave._id} cannot be processed by HR because manager has not approved yet.`);
          }
          if (level === "admin") {
            if (leave?.approvalFlow?.hr?.status !== "approved") {
              throw new Error(`Leave ${leave._id} cannot be processed by Admin because HR has not approved yet.`);
            }
          }
        }
      // Check if user has permission to act on these leaves (department-based for manager/hr)
      if (['manager', 'hr'].includes(level)) {
        const departmentField = level === 'manager' ? 'manager' : 'hr';

      
     // Get departments where user has the role (manager/hr)
          const userDepartments = await Department.find({ [departmentField]: employee._id })
            .select('_id')
            .session(session);

          const departmentIds = userDepartments.map(d => d._id);

          // Get employees in those departments
          const employees = await Employee.find({
            'employmentDetails.department': { $in: departmentIds }
          }).select('_id').session(session);

          const authorizedEmployeeIds = employees.map(e => e._id.toString());
        

          // Check if all leaves belong to authorized employees
          const unauthorizedLeaves = leaves.filter(
            leave => !authorizedEmployeeIds.includes(leave.employee.toString())
          );

        

          if (unauthorizedLeaves.length > 0) {
            throw new Error(
              `You are not authorized to act on ${unauthorizedLeaves.length} leaves. They are not from your department.`
            );
          }
        }

      let updatePromises = [];

      if (action === "approve") {
        if (level === 'admin') {
          // Final approval - update all levels and mark as completed
          updatePromises = leaves.map(leave => 
            Leave.findByIdAndUpdate(
              leave._id,
              {
                [`approvalFlow.${level}.status`]: 'approved',
                [`approvalFlow.${level}.approvedBy`]: userId,
                [`approvalFlow.${level}.approvedAt`]: new Date(),
                [`approvalFlow.${level}.comment`]: comment || '',
                status: 'approved',
                currentApprovalLevel: 'completed'
              },
              { new: true, session }
            )
          );
        } else {
          // Intermediate approval - move to next level
          const nextLevel = level === 'manager' ? 'hr' : 'admin';
          updatePromises = leaves.map(leave => 
            Leave.findByIdAndUpdate(
              leave._id,
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
        // Rejection at any level
        updatePromises = leaves.map(leave => 
          Leave.findByIdAndUpdate(
            leave._id,
            {
              [`approvalFlow.${level}.status`]: 'rejected',
              [`approvalFlow.${level}.approvedBy`]: userId,
              [`approvalFlow.${level}.approvedAt`]: new Date(),
              [`approvalFlow.${level}.comment`]: reason,
              status: 'rejected',
              rejectedBy: userId,
              rejectionReason: reason,
              currentApprovalLevel: 'completed' // Stop the approval flow
            },
            { new: true, session }
          )
        );
      }

      const updatedLeaves = await Promise.all(updatePromises);

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: `${leaves.length} leaves ${action}d successfully at ${level} level`,
        count: leaves.length,
        data: updatedLeaves,
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error("Bulk Update Leaves Error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};


export const getCancelledLeavesForCompany = async (req, res) => {
  const { companyId } = req.params;
  const { page = 1, limit = 10 } = req.query; // default values

  try {
    const skip = (page - 1) * limit;

    // Total count before pagination
    const total = await Leave.countDocuments({ company: companyId });

    // Paginated and sorted (-1 for descending)
    const leaves = await Leave.find({ company: companyId , status: 'cancelled' })
      .sort({ _id: -1 }) // descending order
      .skip(skip)
      .limit(Number(limit))
       .populate({
        path: 'employee',
        select: 'user',
        populate:{
          path: 'user',
          select:'profile email'
        }
      });

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: leaves.length,
      leaves,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};



// ✅ Get leaves for HR (company-wide, only after manager approval)
export const getLeavesForHR = async (req, res) => {
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
    const total = await Leave.countDocuments(query);

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: "employee",
        select: "user employmentDetails",
        populate: [
          {
            path: "user",
            select: "profile email",
          },
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
      count: leaves.length,
      leaves,
    });
  } catch (error) {
    console.error("Error fetching HR leaves:", error);
    res.status(400).json({ success: false, message: error.message });
  }
};




// Get leaves for Manager (after HR approval)
export const getLeavesForManager = async (req, res) => {
  try {
    const {managerId} = req.params;
    const { status, page = 1, limit = 10, search } = req.query;

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
    { currentApprovalLevel: "manager" }
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



    if (search) {
      const employeeUsers = await Employee.find({
        $or: [
          { 'user.profile.firstName': { $regex: search, $options: 'i' } },
          { 'user.profile.lastName': { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      const searchedEmployeeIds = employeeUsers.map(e => e._id);
      query.employee = { $in: searchedEmployeeIds };
    }

    const skip = (page - 1) * limit;
    const total = await Leave.countDocuments(query);

 

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: 'employee',
        select: 'user employmentDetails',
        populate: [
          {
            path: 'user',
            select: 'profile email',
            populate: { path: 'profile', select: 'firstName lastName avatar designation' }
          },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: leaves.length,
      leaves
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


// Get leaves for Admin (after Manager approval)
export const getLeavesForAdmin = async (req, res) => {
  try {
    const {adminId }= req.params;
    const { status, page = 1, limit = 10, search, department } = req.query;

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


    if (department) {
      const employeesInDept = await Employee.find({
        'employmentDetails.department': department,
        company: adminUser.companyId
      }).select('_id');
      const employeeIds = employeesInDept.map(e => e._id);
      query.employee = { $in: employeeIds };
    }

    if (search) {
      const employeeUsers = await Employee.find({
        company: adminUser.companyId,
        $or: [
          { 'user.profile.firstName': { $regex: search, $options: 'i' } },
          { 'user.profile.lastName': { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      const searchedEmployeeIds = employeeUsers.map(e => e._id);
      query.employee = { $in: searchedEmployeeIds };
    }

    const skip = (page - 1) * limit;
    const total = await Leave.countDocuments(query);

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: 'employee',
        select: 'user employmentDetails',
        populate: [
          {
            path: 'user',
            select: 'profile email',
            populate: { path: 'profile', select: 'firstName lastName avatar designation' }
          },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: leaves.length,
      leaves
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


// Get leaves for Employee (their own)
export const getLeavesForEmployee = async (req, res) => {
  try {
    const {employeeId} = req.params;
    const { status, page = 1, limit = 10, year } = req.query;

    const employee = await Employee.findOne({ user: employeeId });
    if (!employee) {
      throw new Error("Employee not found");
    }

    let query = { employee: employee._id };

    if (status && status !== 'all') query.status = status;

    if (year) {
      const policy = await getCompanyPolicy(employee.company);
      const yearStartMonth = policy?.yearStartMonth || 1;
      const start = new Date(year, yearStartMonth - 1, 1);
      const end = new Date(parseInt(year) + 1, yearStartMonth - 1, 0);
      query.startDate = { $gte: start, $lte: end };
    }

    const skip = (page - 1) * limit;
    const total = await Leave.countDocuments(query);

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('company', 'name')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email')
      .populate('rejectedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: leaves.length,
      leaves
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get dashboard statistics for different roles
export const getLeaveDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const companyId = req.user.companyId;

    let stats = {};

    if (userRole === 'employee') {
      // Employee stats - only their leaves
      const employee = await Employee.findOne({ user: userId });
      if (!employee) throw new Error("Employee not found");

      const totalLeaves = await Leave.countDocuments({ employee: employee._id });
      const pendingLeaves = await Leave.countDocuments({ 
        employee: employee._id, 
        status: 'pending' 
      });
      const approvedLeaves = await Leave.countDocuments({ 
        employee: employee._id, 
        status: 'approved' 
      });
      const rejectedLeaves = await Leave.countDocuments({ 
        employee: employee._id, 
        status: 'rejected' 
      });

      stats = { totalLeaves, pendingLeaves, approvedLeaves, rejectedLeaves };

    } else if (userRole === 'manager') {
      // Manager stats - leaves from their department
      const managedDepartments = await Department.find({ manager: userId }).select('_id');
      const departmentIds = managedDepartments.map(d => d._id);
      
      const employees = await Employee.find({ 
        'employmentDetails.department': { $in: departmentIds } 
      }).select('_id');
      
      const employeeIds = employees.map(e => e._id);

      const totalLeaves = await Leave.countDocuments({ employee: { $in: employeeIds } });
      const pendingApproval = await Leave.countDocuments({ 
        employee: { $in: employeeIds },
        currentApprovalLevel: 'manager',
        'approvalFlow.manager.status': 'pending'
      });
      const approvedLeaves = await Leave.countDocuments({ 
        employee: { $in: employeeIds },
        status: 'approved'
      });
      const pendingHR = await Leave.countDocuments({ 
        employee: { $in: employeeIds },
        currentApprovalLevel: 'hr',
        'approvalFlow.hr.status': 'pending'
      });

      stats = { totalLeaves, pendingApproval, approvedLeaves, pendingHR };

    } else if (userRole === 'hr') {
      // HR stats - leaves from their department
      const hrDepartments = await Department.find({ hr: userId }).select('_id');
      const departmentIds = hrDepartments.map(d => d._id);
      
      const employees = await Employee.find({ 
        'employmentDetails.department': { $in: departmentIds } 
      }).select('_id');
      
      const employeeIds = employees.map(e => e._id);

      const totalLeaves = await Leave.countDocuments({ employee: { $in: employeeIds } });
      const pendingApproval = await Leave.countDocuments({ 
        employee: { $in: employeeIds },
        currentApprovalLevel: 'hr',
        'approvalFlow.hr.status': 'pending'
      });
      const approvedLeaves = await Leave.countDocuments({ 
        employee: { $in: employeeIds },
        status: 'approved'
      });
      const pendingAdmin = await Leave.countDocuments({ 
        employee: { $in: employeeIds },
        currentApprovalLevel: 'admin',
        'approvalFlow.admin.status': 'pending'
      });

      stats = { totalLeaves, pendingApproval, approvedLeaves, pendingAdmin };

    } else if (['admin', 'superadmin'].includes(userRole)) {
      // Admin stats - all company leaves
      const totalLeaves = await Leave.countDocuments({ company: companyId });
      const pendingManager = await Leave.countDocuments({ 
        company: companyId,
        currentApprovalLevel: 'manager',
        'approvalFlow.manager.status': 'pending'
      });
      const pendingHR = await Leave.countDocuments({ 
        company: companyId,
        currentApprovalLevel: 'hr',
        'approvalFlow.hr.status': 'pending'
      });
      const pendingAdmin = await Leave.countDocuments({ 
        company: companyId,
        currentApprovalLevel: 'admin',
        'approvalFlow.admin.status': 'pending'
      });
      const approvedLeaves = await Leave.countDocuments({ 
        company: companyId,
        status: 'approved'
      });

      stats = { totalLeaves, pendingManager, pendingHR, pendingAdmin, approvedLeaves };
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


// flow is hr manager admin
// Alternative version with approval level filtering
// export const getRestLeaveOfEmployee = async (req, res) => {
//   const { employeeId } = req.params;
//   const { year = new Date().getFullYear(), includePending = true } = req.query;

//   try {
//     const yearStart = new Date(year, 0, 1);
//     const yearEnd = new Date(year, 11, 31);

//     // Build query based on whether to include pending leaves
//     const query = {
//       employee: employeeId,
//       startDate: { $gte: yearStart, $lte: yearEnd }
//     };

//     if (!includePending) {
//       query.status = { $in: ['approved', 'rejected', 'cancelled'] };
//     }

//     const leaves = await Leave.find(query);

//     // Rest of the function remains the same...
//     const summary = {};

//     leaves.forEach((leave) => {
//       const status = leave.status;
      
//       leave.leaveBreakup.forEach((item) => {
//         const { leaveType, shortCode, days } = item;

//         if (!summary[leaveType]) {
//           summary[leaveType] = {
//             approved: { count: 0, days: 0 },
//             rejected: { count: 0, days: 0 },
//             pending: { count: 0, days: 0 },
//             cancelled: { count: 0, days: 0 },
//             totalDays: 0,
//             shortCode
//           };
//         }

//         summary[leaveType][status].count += 1;
//         summary[leaveType][status].days += days;
//         summary[leaveType].totalDays += days;
//       });
//     });

//     res.json({
//       success: true,
//       employeeId,
//       year: parseInt(year),
//       summary,
//       includePending: includePending === 'true'
//     });
//   } catch (error) {
//     console.error("getRestLeaveOfEmployee Error:", error);
//     res.status(500).json({
//       success: false,
//       message: error.message
//     });
//   }
// };


export const getRestLeaveOfEmployee = async (req, res) => {
  const { employeeId } = req.params;
  const { year = new Date().getFullYear() } = req.query;


  try {
    // Get all leaves for the year
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const leaves = await Leave.find({
      employee: employeeId,
      startDate: { $gte: yearStart, $lte: yearEnd }
    });



    // Summary object
    const summary = {};

    leaves.forEach((leave) => {
      const status = leave.status; // approved / rejected / pending / cancelled

      // Each leave can have multiple breakup items (e.g., 2 CL + 3 PL)
      leave.leaveBreakup.forEach((item) => {
        const { leaveType, shortCode, days } = item;

        if (!summary[leaveType]) {
          summary[leaveType] = {
            approved: { count: 0, days: 0 },
            rejected: { count: 0, days: 0 },
            pending: { count: 0, days: 0 },
            cancelled: { count: 0, days: 0 },
            totalDays: 0,
            shortCode
          };
        }

        // increment counts by status
        summary[leaveType][status].count += 1;
        summary[leaveType][status].days += days;

        // always add total days (irrespective of status)
        summary[leaveType].totalDays += days;

      });
    });


    res.json({
      success: true,
      employeeId,
      year: parseInt(year),
      summary
    });
  } catch (error) {
    console.error("getRestLeaveOfEmployee Error:", error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}; 