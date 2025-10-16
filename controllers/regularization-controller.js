// controllers/attendanceRegularizationController.js
import mongoose from 'mongoose';
import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import Shift from '../models/Shifts.js';
import Company from '../models/Company.js';
import AttendanceRegularization from '../models/AttendanceRegularization.js';
import User from '../models/User.js';
import Department from '../models/Department.js';

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



// Create a new regularization request
export const createRegularization = async (req, res) => {
  try {
    const regularization = await withTransaction(async (session) => {
      const {
        employee,
        user,
        company,
        from,
        to,
        shift,
        requestedInTime,
        requestedOutTime,
        reason,
        regularizationType
      } = req.body;

      // Check if employee exists
      const employeeExists = await Employee.findById(employee);
      if (!employeeExists) {
        throw new Error('Employee not found');
      }

      const userExists = await User.findById(user);
      if (!userExists) {
        throw new Error('User not found');
      }

      const companyExists = await Company.findById(company);
      if (!companyExists) {
        throw new Error('Company not found');
      }

      const shiftExists = await Shift.findById(shift);
      if (!shiftExists) {
        throw new Error('Shift not found');
      }

      // Check if regularization already exists
      const existingRegularization = await AttendanceRegularization.findOne({
        employee,
        from: { $gte: new Date(from), $lte: new Date(to) }
      });

      if (existingRegularization) {
        throw new Error('Regularization request already exists for this date range');
      }

      // Calculate total hours
      const calculateHours = (inTime, outTime) => {
        const [inHours, inMinutes] = inTime.split(':').map(Number);
        const [outHours, outMinutes] = outTime.split(':').map(Number);
        
        let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
        if (totalMinutes < 0) totalMinutes += 24 * 60;
        
        return totalMinutes / 60;
      };

      const totalHours = Math.round(calculateHours(requestedInTime, requestedOutTime));

      const regularizationData = {
        employee,
        user,
        company,
        from: new Date(from),
        to: new Date(to),
        shift,
        requestedInTime,
        requestedOutTime,
        reason,
        regularizationType,
        totalHours,
        createdBy: req.user._id,
        status: 'pending',
        currentApprovalLevel: 'manager',
        approvalFlow: {
          manager: { status: 'pending' },
          hr: { status: 'pending' },
          admin: { status: 'pending' }
        }
      };

      const [newRegularization] = await AttendanceRegularization.create([regularizationData], { session });
      
      await newRegularization.populate([
        { path: 'employee', select: 'employmentDetails personalDetails' },
        { path: 'user', select: 'email profile' },
        { path: 'company', select: 'name' },
        { path: 'shift', select: 'name startTime endTime' }
      ]);

      return newRegularization;
    });

    res.status(201).json({
      success: true,
      message: "Regularization submitted for manager approval",
      regularization
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update regularization details by user (before HR approval/rejection)
export const updateRegularizationByUser = async (req, res) => {
  try {
    const { regularizationId } = req.params;
    const userId = req.user._id;
    
    const {
      from,
      to,
      shift,
      requestedInTime,
      requestedOutTime,
      reason,
      regularizationType
    } = req.body;

    const regularization = await withTransaction(async (session) => {
      // Find the regularization request
      const regularizationDoc = await AttendanceRegularization.findById(regularizationId).session(session);
      if (!regularizationDoc) {
        throw new Error("Regularization request not found");
      }

      // Check if the user owns this regularization request
      if (regularizationDoc.user.toString() !== userId.toString()) {
        throw new Error("You can only update your own regularization requests");
      }

      // Check if the request is still editable (before HR approval/rejection)
      if (regularizationDoc.approvalFlow.hr.status !== 'pending') {
        throw new Error("Cannot update regularization request after HR has acted on it");
      }

      // Check if the request is already approved/rejected at any level
      if (regularizationDoc.status !== 'pending') {
        throw new Error("Cannot update regularization request that has been processed");
      }

      // Validate shift if provided
      if (shift) {
        const shiftExists = await Shift.findById(shift).session(session);
        if (!shiftExists) {
          throw new Error('Shift not found');
        }
        regularizationDoc.shift = shift;
      }

      // Update fields if provided
      if (from) regularizationDoc.from = new Date(from);
      if (to) regularizationDoc.to = new Date(to);
      if (requestedInTime) regularizationDoc.requestedInTime = requestedInTime;
      if (requestedOutTime) regularizationDoc.requestedOutTime = requestedOutTime;
      if (reason) regularizationDoc.reason = reason;
      if (regularizationType) regularizationDoc.regularizationType = regularizationType;

      // Recalculate total hours if times are updated
      if (requestedInTime || requestedOutTime) {
        const calculateHours = (inTime, outTime) => {
          const [inHours, inMinutes] = inTime.split(':').map(Number);
          const [outHours, outMinutes] = outTime.split(':').map(Number);
          
          let totalMinutes = (outHours * 60 + outMinutes) - (inHours * 60 + inMinutes);
          if (totalMinutes < 0) totalMinutes += 24 * 60;
          
          return totalMinutes / 60;
        };

        const finalInTime = requestedInTime || regularizationDoc.requestedInTime;
        const finalOutTime = requestedOutTime || regularizationDoc.requestedOutTime;
        regularizationDoc.totalHours = calculateHours(finalInTime, finalOutTime);
      }

      // Reset approval flow to initial state since details have changed
      regularizationDoc.currentApprovalLevel = 'manager';
      regularizationDoc.approvalFlow.manager.status = 'pending';
      regularizationDoc.approvalFlow.manager.approvedBy = null;
      regularizationDoc.approvalFlow.manager.approvedAt = null;
      regularizationDoc.approvalFlow.manager.comment = '';
      
      regularizationDoc.approvalFlow.hr.status = 'pending';
      regularizationDoc.approvalFlow.hr.approvedBy = null;
      regularizationDoc.approvalFlow.hr.approvedAt = null;
      regularizationDoc.approvalFlow.hr.comment = '';
      
      regularizationDoc.approvalFlow.admin.status = 'pending';
      regularizationDoc.approvalFlow.admin.approvedBy = null;
      regularizationDoc.approvalFlow.admin.approvedAt = null;
      regularizationDoc.approvalFlow.admin.comment = '';

      // Check for date conflicts with other regularization requests (excluding current one)
      if (from || to) {
        const finalFrom = from ? new Date(from) : regularizationDoc.from;
        const finalTo = to ? new Date(to) : regularizationDoc.to;

        const existingRegularization = await AttendanceRegularization.findOne({
          employee: regularizationDoc.employee,
          _id: { $ne: id },
          $or: [
            { from: { $lte: finalTo, $gte: finalFrom } },
            { to: { $lte: finalTo, $gte: finalFrom } },
            { from: { $lte: finalFrom }, to: { $gte: finalTo } }
          ]
        }).session(session);

        if (existingRegularization) {
          throw new Error('Regularization request already exists for this date range');
        }
      }

      await regularizationDoc.save({ session });

      // Populate the updated document
      await regularizationDoc.populate([
        { path: 'employee', select: 'employmentDetails personalDetails' },
        { path: 'user', select: 'email profile' },
        { path: 'company', select: 'name' },
        { path: 'shift', select: 'name startTime endTime' },
        { path: 'approvalFlow.manager.approvedBy', select: 'profile email' },
        { path: 'approvalFlow.hr.approvedBy', select: 'profile email' },
        { path: 'approvalFlow.admin.approvedBy', select: 'profile email' }
      ]);

      return regularizationDoc;
    });

    res.json({
      success: true,
      message: "Regularization request updated successfully and sent for re-approval",
      regularization
    });

  } catch (error) {
    console.error("Update Regularization Error:", error);
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
};


// Manager approval
export const managerApproveRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const managerId = req.user._id;
    const { comment } = req.body;

    const regularization = await withTransaction(async (session) => {
      const regularizationDoc = await AttendanceRegularization.findById(id).session(session);
      if (!regularizationDoc) throw new Error("Regularization request not found");
      
      if (regularizationDoc.currentApprovalLevel !== "manager") {
        throw new Error("Regularization is not awaiting manager approval");
      }

      if (regularizationDoc.approvalFlow.manager.status !== "pending") {
        throw new Error("Manager has already acted on this regularization");
      }

      // Update manager approval
      regularizationDoc.approvalFlow.manager.status = "approved";
      regularizationDoc.approvalFlow.manager.approvedBy = managerId;
      regularizationDoc.approvalFlow.manager.approvedAt = new Date();
      regularizationDoc.approvalFlow.manager.comment = comment || "";
      
      // Move to next level (HR)
      regularizationDoc.currentApprovalLevel = "hr";
      
      await regularizationDoc.save({ session });
      return regularizationDoc;
    });

    res.json({
      success: true,
      message: "Regularization approved by manager and sent to HR",
      regularization
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// HR approval
export const hrApproveRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const hrId = req.user._id;
    const { comment } = req.body;

    const regularization = await withTransaction(async (session) => {
      const regularizationDoc = await AttendanceRegularization.findById(id).session(session);
      if (!regularizationDoc) throw new Error("Regularization request not found");
      
      if (regularizationDoc.currentApprovalLevel !== "hr") {
        throw new Error("Regularization is not awaiting HR approval");
      }

      if (regularizationDoc.approvalFlow.hr.status !== "pending") {
        throw new Error("HR has already acted on this regularization");
      }

      // Update HR approval
      regularizationDoc.approvalFlow.hr.status = "approved";
      regularizationDoc.approvalFlow.hr.approvedBy = hrId;
      regularizationDoc.approvalFlow.hr.approvedAt = new Date();
      regularizationDoc.approvalFlow.hr.comment = comment || "";
      
      // Move to next level (Admin)
      regularizationDoc.currentApprovalLevel = "admin";
      
      await regularizationDoc.save({ session });
      return regularizationDoc;
    });

    res.json({
      success: true,
      message: "Regularization approved by HR and sent to Admin",
      regularization
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Admin approval (final)
export const adminApproveRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;
    const { comment } = req.body;

    const regularization = await withTransaction(async (session) => {
      const regularizationDoc = await AttendanceRegularization.findById(id).session(session);
      if (!regularizationDoc) throw new Error("Regularization request not found");
      
      if (regularizationDoc.currentApprovalLevel !== "admin") {
        throw new Error("Regularization is not awaiting admin approval");
      }

      if (regularizationDoc.approvalFlow.admin.status !== "pending") {
        throw new Error("Admin has already acted on this regularization");
      }

      // Update admin approval
      regularizationDoc.approvalFlow.admin.status = "approved";
      regularizationDoc.approvalFlow.admin.approvedBy = adminId;
      regularizationDoc.approvalFlow.admin.approvedAt = new Date();
      regularizationDoc.approvalFlow.admin.comment = comment || "";
      
      // Complete the approval process
      regularizationDoc.status = "approved";
      regularizationDoc.currentApprovalLevel = "completed";
      
      await regularizationDoc.save({ session });
      return regularizationDoc;
    });

    res.json({
      success: true,
      message: "Regularization approved by Admin",
      regularization
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Reject at any level
export const rejectRegularization = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { reason, level } = req.body;

    if (!reason) throw new Error("Rejection reason is required");
    if (!["manager", "hr", "admin"].includes(level)) {
      throw new Error("Invalid approval level");
    }

    const regularization = await withTransaction(async (session) => {
      const regularizationDoc = await AttendanceRegularization.findById(id).session(session);
      if (!regularizationDoc) throw new Error("Regularization request not found");
      
      if (regularizationDoc.currentApprovalLevel !== level) {
        throw new Error(`Regularization is not awaiting ${level} approval`);
      }

      if (regularizationDoc.approvalFlow[level].status !== "pending") {
        throw new Error(`${level} has already acted on this regularization`);
      }

      // Update rejection at the current level
      regularizationDoc.approvalFlow[level].status = "rejected";
      regularizationDoc.approvalFlow[level].approvedBy = userId;
      regularizationDoc.approvalFlow[level].approvedAt = new Date();
      regularizationDoc.approvalFlow[level].comment = reason;
      
      // Set overall status to rejected
      regularizationDoc.status = "rejected";
      regularizationDoc.rejectedBy = userId;
      regularizationDoc.rejectionReason = reason;
      regularizationDoc.currentApprovalLevel = "completed";
      
      await regularizationDoc.save({ session });
      return regularizationDoc;
    });

    res.json({
      success: true,
      message: `Regularization rejected by ${level}`,
      regularization
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get regularizations pending at specific level
export const getPendingRegularizationsByLevel = async (req, res) => {
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

    const total = await AttendanceRegularization.countDocuments(query);
    const regularizations = await AttendanceRegularization.find(query)
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
      .populate('company', 'name')
      .populate('shift', 'name');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: regularizations.length,
      regularizations
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get regularizations for manager
export const getRegularizationsForManager = async (req, res) => {
  try {
    const { managerId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    const managedDepartments = await Department.find({ manager: managerId }).select('_id');
    const departmentIds = managedDepartments.map(d => d._id);

    const employees = await Employee.find({
      'employmentDetails.department': { $in: departmentIds }
    }).select('_id user');

    const employeeIds = employees.map(e => e._id);

     let query = {
  employee: { $in: employeeIds },
  $or: [
    // Waiting for manager approval (only if HR approved)
    { currentApprovalLevel: "manager"},

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
      { "approvalFlow.hr.status": "pending" }
    ];
    delete query.$or;
  } else {
    query.$or = [
      { "approvalFlow.manager.status": status }
    ];
  }
}

    const skip = (page - 1) * limit;
    const total = await AttendanceRegularization.countDocuments(query);

    const regularizations = await AttendanceRegularization.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: 'employee',
        select: 'user employmentDetails',
        populate: [
          { path: 'user', select: 'profile email' },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('shift')
      .populate('approvalFlow.manager.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: regularizations.length,
      regularizations
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get regularizations for HR
export const getRegularizationsForHR = async (req, res) => {
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
    const total = await AttendanceRegularization.countDocuments(query);

    const regularizations = await AttendanceRegularization.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: 'employee',
        select: 'user employmentDetails',
        populate: [
          { path: 'user', select: 'profile email' },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('shift')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.manager.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: regularizations.length,
      regularizations
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get regularizations for Admin
export const getRegularizationsForAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

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


    const skip = (page - 1) * limit;
    const total = await AttendanceRegularization.countDocuments(query);

    const regularizations = await AttendanceRegularization.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate({
        path: 'employee',
        select: 'user employmentDetails',
        populate: [
          { path: 'user', select: 'profile email' },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('shift')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: regularizations.length,
      regularizations
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Bulk update regularizations
export const bulkUpdateRegularizations = async (req, res) => {
  try {
    const { ids, action, level, comment, reason } = req.body;
    const userId = req.user._id;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Regularization IDs are required" });
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
      const regularizations = await AttendanceRegularization.find({ 
        _id: { $in: ids },
        currentApprovalLevel: level,
        [`approvalFlow.${level}.status`]: 'pending'
      }).session(session);

      if (regularizations.length !== ids.length) {
        const invalidRegularizations = ids.length - regularizations.length;
        throw new Error(`${invalidRegularizations} regularizations are not eligible for ${level} ${action}`);
      }

      let updatePromises = [];

      if (action === "approve") {
        if (level === 'admin') {
          updatePromises = regularizations.map(regularization => 
            AttendanceRegularization.findByIdAndUpdate(
              regularization._id,
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
          const nextLevel = level ===  'manager' ? 'hr' : 'admin';
          updatePromises = regularizations.map(regularization => 
            AttendanceRegularization.findByIdAndUpdate(
              regularization._id,
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
        updatePromises = regularizations.map(regularization => 
          AttendanceRegularization.findByIdAndUpdate(
            regularization._id,
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
      }

      const updatedRegularizations = await Promise.all(updatePromises);

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: `${regularizations.length} regularizations ${action}d successfully at ${level} level`,
        count: regularizations.length,
        data: updatedRegularizations,
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error("Bulk Update Regularizations Error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Get all regularizations (existing function, updated with new fields)
export const getRegularizations = async (req, res) => {
  try {
    const { companyId, status, employeeId, startDate, endDate, page = 1, limit = 10 } = req.query;

    let filter = {};
    if (companyId) filter.company = companyId;
    if (status) filter.status = status;
    if (employeeId) filter.employee = employeeId;

    if (startDate && endDate) {
      filter.from = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await AttendanceRegularization.countDocuments(filter);

    const regularizations = await AttendanceRegularization.find(filter)
      .populate('employee', 'employmentDetails personalDetails')
      .populate('user', 'email profile')
      .populate('createdBy', 'email profile')
      .populate('company', 'name registrationNumber email contactPhone')
      .populate('shift', 'name startTime endTime')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email')
      .populate('rejectedBy', 'profile email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    res.json({
      success: true,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      count: regularizations.length,
      data: regularizations
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single regularization (existing function, updated with new fields)
export const getRegularization = async (req, res) => {
  try {
    const regularization = await AttendanceRegularization.findById(req.params.id)
      .populate('employee', 'employmentDetails personalDetails')
      .populate('user', 'email profile')
      .populate('createdBy', 'email profile')
      .populate('company', 'name registrationNumber email contactPhone')
      .populate('shift', 'name startTime endTime')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email')
      .populate('rejectedBy', 'profile email');
    
    if (!regularization) {
      return res.status(404).json({ success: false, message: 'Regularization request not found' });
    }
    
    res.json({ success: true, data: regularization });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete regularization (existing function)
export const deleteRegularization = async (req, res) => {
  try {
    const regularization = await AttendanceRegularization.findById(req.params.id);
    if (!regularization) {
      return res.status(404).json({ success: false, message: 'Regularization request not found' });
    }
    
    if (regularization.status === 'approved') {
      return res.status(400).json({ success: false, message: 'Cannot delete an approved regularization request' });
    }
    
    await AttendanceRegularization.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Regularization request deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
