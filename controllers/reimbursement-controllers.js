// controllers/reimbursementController.js
import mongoose from 'mongoose';
import Reimbursement from '../models/Reimbursement.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import User from '../models/User.js';
import uploadFileToCloudinary from '../utils/fileUploader.js';

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

// Apply for reimbursement
export const applyReimbursement = async (req, res) => {
  try {
    const reimbursement = await withTransaction(async (session) => {
      const {
        employeeId,
        companyId,
        category,
        amount,
        description,
        date
      } = req.body;

      const { recipt } = req.files;

    const documentUrl = await uploadFileToCloudinary(
      recipt,
      process.env.FOLDER_NAME
    )

      if (!employeeId || !companyId || !category || !amount || !date) {
        throw new Error("Missing required fields");
      }

      if (amount <= 0) {
        throw new Error("Amount must be greater than 0");
      }

      // Get employee department to determine manager and HR
      const employee = await Employee.findById(employeeId)
        .populate('employmentDetails.department');
      
      if (!employee) throw new Error("Employee not found");
      
      const departmentId = employee.employmentDetails.department;
      const department = await Department.findById(departmentId)
        .populate('manager hr');
      
      if (!department) throw new Error("Department not found");

     
      // Create reimbursement with approval flow
      const reimbursementData = {
        employee: employeeId,
        company: companyId,
        category,
        amount: parseFloat(amount),
        description: description?.trim(),
        receiptUrl: documentUrl?.result?.secure_url,
        date: new Date(date),
        status: "pending",
        currentApprovalLevel: "manager",
        approvalFlow: {
          manager: { status: "pending" },
          hr: { status: "pending" },
          admin: { status: "pending" }
        }
      };

      const [newReimbursement] = await Reimbursement.create([reimbursementData], { session });
      
      await newReimbursement.populate([
        { path: 'employee', select: 'user', populate: { path: 'user', select: 'profile' } },
        { path: 'company', select: 'name' },
        { path: 'category', select: 'name' }
      ]);

      return newReimbursement;
    });

    res.status(201).json({
      success: true,
      message: "Reimbursement submitted for manager approval",
      reimbursement
    });
  } catch (err) {
    console.error("Apply Reimbursement Error:", err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// Manager approval
export const managerApproveReimbursement = async (req, res) => {
  try {
    const { id } = req.params;
    const managerId = req.user._id;
    const { comment } = req.body;

    const reimbursement = await withTransaction(async (session) => {
      const reimbursementDoc = await Reimbursement.findById(id).session(session);
      if (!reimbursementDoc) throw new Error("Reimbursement not found");
      
      if (reimbursementDoc.currentApprovalLevel !== "manager") {
        throw new Error("Reimbursement is not awaiting manager approval");
      }

      if (reimbursementDoc.approvalFlow.manager.status !== "pending") {
        throw new Error("Manager has already acted on this reimbursement");
      }

      // Update manager approval
      reimbursementDoc.approvalFlow.manager.status = "approved";
      reimbursementDoc.approvalFlow.manager.approvedBy = managerId;
      reimbursementDoc.approvalFlow.manager.approvedAt = new Date();
      reimbursementDoc.approvalFlow.manager.comment = comment || "";
      
      // Move to next level (HR)
      reimbursementDoc.currentApprovalLevel = "hr";
      
      await reimbursementDoc.save({ session });
      return reimbursementDoc;
    });

    res.json({
      success: true,
      message: "Reimbursement approved by manager and sent to HR",
      reimbursement
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// HR approval
export const hrApproveReimbursement = async (req, res) => {
  try {
    const { id } = req.params;
    const hrId = req.user._id;
    const { comment } = req.body;

    const reimbursement = await withTransaction(async (session) => {
      const reimbursementDoc = await Reimbursement.findById(id).session(session);
      if (!reimbursementDoc) throw new Error("Reimbursement not found");
      
      if (reimbursementDoc.currentApprovalLevel !== "hr") {
        throw new Error("Reimbursement is not awaiting HR approval");
      }

      if (reimbursementDoc.approvalFlow.hr.status !== "pending") {
        throw new Error("HR has already acted on this reimbursement");
      }

      // Update HR approval
      reimbursementDoc.approvalFlow.hr.status = "approved";
      reimbursementDoc.approvalFlow.hr.approvedBy = hrId;
      reimbursementDoc.approvalFlow.hr.approvedAt = new Date();
      reimbursementDoc.approvalFlow.hr.comment = comment || "";
      
      // Move to next level (Admin)
      reimbursementDoc.currentApprovalLevel = "admin";
      
      await reimbursementDoc.save({ session });
      return reimbursementDoc;
    });

    res.json({
      success: true,
      message: "Reimbursement approved by HR and sent to Admin",
      reimbursement
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Admin approval (final)
export const adminApproveReimbursement = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user._id;
    const { comment } = req.body;

    const reimbursement = await withTransaction(async (session) => {
      const reimbursementDoc = await Reimbursement.findById(id).session(session);
      if (!reimbursementDoc) throw new Error("Reimbursement not found");
      
      if (reimbursementDoc.currentApprovalLevel !== "admin") {
        throw new Error("Reimbursement is not awaiting admin approval");
      }

      if (reimbursementDoc.approvalFlow.admin.status !== "pending") {
        throw new Error("Admin has already acted on this reimbursement");
      }

      // Update admin approval
      reimbursementDoc.approvalFlow.admin.status = "approved";
      reimbursementDoc.approvalFlow.admin.approvedBy = adminId;
      reimbursementDoc.approvalFlow.admin.approvedAt = new Date();
      reimbursementDoc.approvalFlow.admin.comment = comment || "";
      
      // Complete the approval process
      reimbursementDoc.status = "approved";
      reimbursementDoc.currentApprovalLevel = "completed";
      
      await reimbursementDoc.save({ session });
      return reimbursementDoc;
    });

    res.json({
      success: true,
      message: "Reimbursement approved by Admin",
      reimbursement
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Reject at any level
export const rejectReimbursement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { reason, level } = req.body;

    if (!reason) throw new Error("Rejection reason is required");
    if (!["manager", "hr", "admin"].includes(level)) {
      throw new Error("Invalid approval level");
    }

    const reimbursement = await withTransaction(async (session) => {
      const reimbursementDoc = await Reimbursement.findById(id).session(session);
      if (!reimbursementDoc) throw new Error("Reimbursement not found");
      
      if (reimbursementDoc.currentApprovalLevel !== level) {
        throw new Error(`Reimbursement is not awaiting ${level} approval`);
      }

      if (reimbursementDoc.approvalFlow[level].status !== "pending") {
        throw new Error(`${level} has already acted on this reimbursement`);
      }

      // Update rejection at the current level
      reimbursementDoc.approvalFlow[level].status = "rejected";
      reimbursementDoc.approvalFlow[level].approvedBy = userId;
      reimbursementDoc.approvalFlow[level].approvedAt = new Date();
      reimbursementDoc.approvalFlow[level].comment = reason;
      
      // Set overall reimbursement status to rejected
      reimbursementDoc.status = "rejected";
      reimbursementDoc.rejectedBy = userId;
      reimbursementDoc.rejectionReason = reason;
      reimbursementDoc.currentApprovalLevel = "completed";
      
      await reimbursementDoc.save({ session });
      return reimbursementDoc;
    });

    res.json({
      success: true,
      message: `Reimbursement rejected by ${level}`,
      reimbursement
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get reimbursements pending at specific level
export const getPendingReimbursementsByLevel = async (req, res) => {
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

    const total = await Reimbursement.countDocuments(query);
    const reimbursements = await Reimbursement.find(query)
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
      .populate('category', 'name');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: reimbursements.length,
      reimbursements
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get reimbursements for manager
export const getReimbursementsForManager = async (req, res) => {
  try {
    const { managerId } = req.params;
    const { status, page = 1, limit = 10, search } = req.query;

    // Get departments managed by this user
    const managedDepartments = await Department.find({ manager: managerId }).select('_id');
    const departmentIds = managedDepartments.map(d => d._id);

    // Get employees in those departments
    const employees = await Employee.find({
      'employmentDetails.department': { $in: departmentIds }
    }).select('_id user');

    const employeeIds = employees.map(e => e._id);

    // Base query - only show reimbursements where HR has approved
  let query = {
  employee: { $in: employeeIds },
  status: { $ne: "cancelled" },
  $or: [
    // Waiting for manager approval (only if HR approved)
    { currentApprovalLevel: "manager"},

    // Already acted by manager
    { "approvalFlow.manager.status": { $in: ["approved", "rejected"] } }
  ]
};

// Handle filters
if (status && status !== "all") {
  if (status === "pending") {
    query = {
      employee: { $in: employeeIds },
      status: "pending",
      currentApprovalLevel: "manager",
      "approvalFlow.hr.status": "pending"
    };
  } else if (["approved", "rejected"].includes(status)) {
    query = {
      employee: { $in: employeeIds },
      status: { $ne: "cancelled" },
      "approvalFlow.manager.status": status
    };
  } else if (status === "paid") {
    query = {
      employee: { $in: employeeIds },
      status: "paid"
    };
  }
}



    const skip = (page - 1) * limit;
    const total = await Reimbursement.countDocuments(query);

    const reimbursements = await Reimbursement.find(query)
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
            populate: { path: 'profile', select: 'firstName lastName' }
          },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('category', 'name')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email'); // ✅ Also populate HR approval info

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: reimbursements.length,
      reimbursements
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
// Get reimbursements for HR
// Get reimbursements for HR
export const getReimbursementsForHR = async (req, res) => {
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
  
    const total = await Reimbursement.countDocuments(query);

    const reimbursements = await Reimbursement.find(query)
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
            populate: { path: "profile", select: "firstName lastName" },
          },
          { path: "employmentDetails.department", select: "name" },
        ],
      })
      .populate("company", "name")
      .populate("category", "name")
      .populate("approvalFlow.hr.approvedBy", "profile email")
      .populate("approvalFlow.manager.approvedBy", "profile email");

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: reimbursements.length,
      reimbursements,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};
// Get reimbursements for Admin
export const getReimbursementsForAdmin = async (req, res) => {
  try {
    const { adminId } = req.params;
    const { status, page = 1, limit = 10, search, department } = req.query;

    const adminUser = await User.findById(adminId).select('companyId');
    if (!adminUser || !adminUser.companyId) {
      throw new Error("Admin not associated with any company");
    }

    // Base query - only show reimbursements where both HR AND manager have approved
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
      { "approvalFlow.admin.status": "pending" }
    ];
  } else if (status === "paid") {
    query.$and = [
      { status: "paid" }, // ✅ top-level status check
      { "approvalFlow.hr.status": "approved" },
      { "approvalFlow.manager.status": "approved" },
      { "approvalFlow.admin.status": "approved" } // usually admin must approve before paid
    ];
  } else {
    query.$and = [
      { status: { $ne: "paid" } }, // exclude paid when fetching approved/rejected
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

    const skip = (page - 1) * limit;
    const total = await Reimbursement.countDocuments(query);

    const reimbursements = await Reimbursement.find(query)
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
            populate: { path: 'profile', select: 'firstName lastName' }
          },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name')
      .populate('category', 'name')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: reimbursements.length,
      reimbursements
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get reimbursements for Employee
export const getReimbursementsForEmployee = async (req, res) => {
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
    const total = await Reimbursement.countDocuments(query);

    const reimbursements = await Reimbursement.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('company', 'name')
      .populate('category', 'name')
      .populate('approvalFlow.manager.approvedBy', 'profile email')
      .populate('approvalFlow.hr.approvedBy', 'profile email')
      .populate('approvalFlow.admin.approvedBy', 'profile email')
      .populate('rejectedBy', 'profile email');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: reimbursements.length,
      reimbursements
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Bulk update reimbursements
export const bulkUpdateReimbursements = async (req, res) => {
  try {
    const { ids, action, level, comment, reason } = req.body;
    const userId = req.user._id;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: "Reimbursement IDs are required" });
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
      // Validate all reimbursements are at the correct level and pending
      const reimbursements = await Reimbursement.find({ 
        _id: { $in: ids },
        currentApprovalLevel: level,
        [`approvalFlow.${level}.status`]: 'pending'
      }).session(session);

      if (reimbursements.length !== ids.length) {
        const invalidReimbursements = ids.length - reimbursements.length;
        throw new Error(`${invalidReimbursements} reimbursements are not eligible for ${level} ${action}`);
      }

      let updatePromises = [];

      if (action === "approve") {
        if (level === 'admin') {
          // Final approval
          updatePromises = reimbursements.map(reimbursement => 
            Reimbursement.findByIdAndUpdate(
              reimbursement._id,
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
          // Intermediate approval
          const nextLevel = level === 'manager' ? 'hr' : 'admin';
          updatePromises = reimbursements.map(reimbursement => 
            Reimbursement.findByIdAndUpdate(
              reimbursement._id,
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
        updatePromises = reimbursements.map(reimbursement => 
          Reimbursement.findByIdAndUpdate(
            reimbursement._id,
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

      const updatedReimbursements = await Promise.all(updatePromises);

      await session.commitTransaction();
      session.endSession();

      res.json({
        success: true,
        message: `${reimbursements.length} reimbursements ${action}d successfully at ${level} level`,
        count: reimbursements.length,
        data: updatedReimbursements,
      });

    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw error;
    }

  } catch (error) {
    console.error("Bulk Update Reimbursements Error:", error);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

// Mark reimbursement as paid
export const markAsPaid = async (req, res) => {
  try {
    const { reimbursementId } = req.params;
    const userId = req.user._id;
    const { transactionId, note } = req.body;

    const { paidslip } = req.files || {}; // handle case when no files uploaded

    let paidslipUrl; // declare outside
    if (paidslip) {
      paidslipUrl = await uploadFileToCloudinary(
        paidslip,
        process.env.FOLDER_NAME
      );
    }

    const reimbursement = await withTransaction(async (session) => {
      const reimbursementDoc = await Reimbursement.findById(reimbursementId).session(session);
      if (!reimbursementDoc) throw new Error("Reimbursement not found");
      
      if (reimbursementDoc.status !== "approved") {
        throw new Error("Reimbursement must be approved before marking as paid");
      }

      reimbursementDoc.status = "paid";
      reimbursementDoc.paymentSlip = {
        transactionId,
        paidBy: userId,
        paidAt: new Date(),
        paidslipUrl: paidslipUrl?.result?.secure_url || null, // safe handling
        note: note || ""
      };

      await reimbursementDoc.save({ session });
      return reimbursementDoc;
    });

    res.json({
      success: true,
      message: "Reimbursement marked as paid",
      reimbursement
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};


// Get dashboard statistics
export const getReimbursementDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const userRole = req.user.role;
    const companyId = req.user.companyId;

    let stats = {};

    if (userRole === 'employee') {
      const employee = await Employee.findOne({ user: userId });
      if (!employee) throw new Error("Employee not found");

      const totalReimbursements = await Reimbursement.countDocuments({ employee: employee._id });
      const pendingReimbursements = await Reimbursement.countDocuments({ 
        employee: employee._id, 
        status: 'pending' 
      });
      const approvedReimbursements = await Reimbursement.countDocuments({ 
        employee: employee._id, 
        status: 'approved' 
      });
      const paidReimbursements = await Reimbursement.countDocuments({ 
        employee: employee._id, 
        status: 'paid' 
      });

      stats = { totalReimbursements, pendingReimbursements, approvedReimbursements, paidReimbursements };

    } else if (userRole === 'manager') {
      const managedDepartments = await Department.find({ manager: userId }).select('_id');
      const departmentIds = managedDepartments.map(d => d._id);
      
      const employees = await Employee.find({ 
        'employmentDetails.department': { $in: departmentIds } 
      }).select('_id');
      
      const employeeIds = employees.map(e => e._id);

      const totalReimbursements = await Reimbursement.countDocuments({ employee: { $in: employeeIds } });
      const pendingApproval = await Reimbursement.countDocuments({ 
        employee: { $in: employeeIds },
        currentApprovalLevel: 'manager',
        'approvalFlow.manager.status': 'pending'
      });
      const totalAmountPending = await Reimbursement.aggregate([
        { 
          $match: { 
            employee: { $in: employeeIds },
            currentApprovalLevel: 'manager',
            'approvalFlow.manager.status': 'pending'
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      stats = { 
        totalReimbursements, 
        pendingApproval, 
        totalAmountPending: totalAmountPending[0]?.total || 0 
      };

    } else if (userRole === 'hr') {
      const hrDepartments = await Department.find({ hr: userId }).select('_id');
      const departmentIds = hrDepartments.map(d => d._id);
      
      const employees = await Employee.find({ 
        'employmentDetails.department': { $in: departmentIds } 
      }).select('_id');
      
      const employeeIds = employees.map(e => e._id);

      const totalReimbursements = await Reimbursement.countDocuments({ employee: { $in: employeeIds } });
      const pendingApproval = await Reimbursement.countDocuments({ 
        employee: { $in: employeeIds },
        currentApprovalLevel: 'hr',
        'approvalFlow.hr.status': 'pending'
      });
      const totalAmountPending = await Reimbursement.aggregate([
        { 
          $match: { 
            employee: { $in: employeeIds },
            currentApprovalLevel: 'hr',
            'approvalFlow.hr.status': 'pending'
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      stats = { 
        totalReimbursements, 
        pendingApproval, 
        totalAmountPending: totalAmountPending[0]?.total || 0 
      };

    } else if (['admin', 'superadmin'].includes(userRole)) {
      const totalReimbursements = await Reimbursement.countDocuments({ company: companyId });
      const pendingManager = await Reimbursement.countDocuments({ 
        company: companyId,
        currentApprovalLevel: 'manager',
        'approvalFlow.manager.status': 'pending'
      });
      const pendingHR = await Reimbursement.countDocuments({ 
        company: companyId,
        currentApprovalLevel: 'hr',
        'approvalFlow.hr.status': 'pending'
      });
      const pendingAdmin = await Reimbursement.countDocuments({ 
        company: companyId,
        currentApprovalLevel: 'admin',
        'approvalFlow.admin.status': 'pending'
      });
      const approvedReimbursements = await Reimbursement.countDocuments({ 
        company: companyId,
        status: 'approved'
      });

      const totalAmountPending = await Reimbursement.aggregate([
        { 
          $match: { 
            company: companyId,
            status: 'pending'
          } 
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      stats = { 
        totalReimbursements, 
        pendingManager, 
        pendingHR, 
        pendingAdmin, 
        approvedReimbursements,
        totalAmountPending: totalAmountPending[0]?.total || 0 
      };
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};