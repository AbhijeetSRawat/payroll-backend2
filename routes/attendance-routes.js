import express from "express";
import {
  getAttendances,
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getEmployeesUnderHRorManager,
  bulkCreateAttendance,
  getAttendanceByDate,
  bulkUpdateAttendance,
  getEmployeeAttendanceSummary,
  getDepartmentAttendanceSummary,
  getEmployeeAttendanceByDateRange,
  getEmployeeAttendanceAnalytics
} from "../controllers/attendance-controller.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply protection to all routes
router.use(protect);

// ==============================
// ATTENDANCE CRUD ROUTES
// ==============================

// Get all attendances with filtering
router.get("/", getAttendances);

// Get specific attendance
router.get("/record/:id", getAttendance);

// Create attendance
router.post("/", createAttendance);

// ==============================
// BULK OPERATIONS
// ==============================

router.post("/bulk/create", bulkCreateAttendance);

// ==============================
// SUMMARY & ANALYTICS ROUTES
// ==============================

router.get("/summary/employee", getEmployeeAttendanceSummary);
router.get("/summary/department", getDepartmentAttendanceSummary);

// ==============================
// HR/MANAGER SPECIFIC ROUTES
// ==============================

// Get team employees
router.get("/hr-manager/employees/:userId", getEmployeesUnderHRorManager);

// Date-based filtering
router.get("/date/filter/:userId", getAttendanceByDate);

// ==============================
// RESTRICTED ADMIN ROUTES
// ==============================

// Update operations (HR/Manager/Admin only)
router.put("/:id", restrictTo("superadmin", "admin", "hr", "manager","employee"), updateAttendance);
router.put("/bulk/update", restrictTo("superadmin", "admin", "hr", "manager"), bulkUpdateAttendance);

// Delete operations (HR/Admin only - managers typically can't delete)
router.delete("/:id", restrictTo("superadmin", "admin", "hr"), deleteAttendance);

// Get employee attendance by date range
router.get('/employee/:employeeId/attendance', getEmployeeAttendanceByDateRange);



export default router;