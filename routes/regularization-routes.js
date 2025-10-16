import express from "express";
import {
  createRegularization,
  getRegularizations,
  getRegularization,
  deleteRegularization,
  bulkUpdateRegularizations,
  managerApproveRegularization,
  hrApproveRegularization,
  adminApproveRegularization,
  rejectRegularization,
  getPendingRegularizationsByLevel,
  getRegularizationsForManager,
  getRegularizationsForHR,
  getRegularizationsForAdmin,
  updateRegularizationByUser
} from "../controllers/regularization-controller.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";


const router = express.Router();

/**
 * ✅ Regular CRUD routes
 */
router.get(
  "/",
  protect,
  restrictTo("superadmin", "admin", "employee", "subadmin"),
  getRegularizations
);

router.get(
  "/:id",
  protect,
  restrictTo("superadmin", "admin", "employee", "subadmin"),
  getRegularization
);

router.post(
  "/",
  protect,
  restrictTo("superadmin", "admin", "employee", "subadmin"),
  createRegularization
);

router.patch(
  "/:regularizationId",
  protect,
  restrictTo("superadmin", "admin", "employee", "subadmin"),
  updateRegularizationByUser
);

router.delete(
  "/:id",
  protect,
  restrictTo("superadmin", "admin", "employee", "subadmin"),
  deleteRegularization
);

router.patch(
  "/bulk/update",
  protect,
  bulkUpdateRegularizations
);

/**
 * ✅ Approval Routes
 */
router.patch(
  "/:id/approve/manager",
  protect,
  restrictTo("manager","admin","superadmin"),
  managerApproveRegularization
);

router.patch(
  "/:id/approve/hr",
  protect,
  restrictTo("hr","admin","superadmin"),
  hrApproveRegularization
);

router.patch(
  "/:id/approve/admin",
  protect,
  restrictTo("admin", "superadmin"),
  adminApproveRegularization
);

router.patch(
  "/:id/reject",
  protect,
  restrictTo("manager", "hr", "admin", "superadmin"),
  rejectRegularization
);

/**
 * ✅ Pending Regularizations by level
 */
router.get(
  "/pending/:level",
  protect,
  restrictTo("manager", "hr", "admin", "superadmin"),
  getPendingRegularizationsByLevel
);

/**
 * ✅ Role-based fetching
 */
router.get(
  "/manager/:managerId",
  protect,
  restrictTo("manager", "superadmin","admin"),
  getRegularizationsForManager
);

router.get(
  "/hr/:hrId",
  protect,
  restrictTo("hr", "superadmin","admin"),
  getRegularizationsForHR
);

router.get(
  "/admin/:adminId",
  protect,
  restrictTo("admin", "superadmin"),
  getRegularizationsForAdmin
);

export default router;
