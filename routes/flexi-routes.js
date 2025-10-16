import express from "express";
import {
  getFlexiBasket,
  createOrUpdateFlexiBasket,
  getFlexiDeclaration,
  createOrUpdateFlexiDeclaration,
  submitFlexiDeclaration,
  approveFlexiDeclaration,
  calculateFlexiBalance,
  getFlexiDeclarationForCompany,
} from "../controllers/flexiBasketController.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(protect);

// Flexi Basket Template Routes (Admin/HR only)
router.get("/basket/:companyId", restrictTo("superadmin","admin","hr","manager"), getFlexiBasket);
router.post("/basket/:companyId", restrictTo("superadmin","admin","hr","manager"), createOrUpdateFlexiBasket);

// Flexi Declaration Routes
router.get(
  "/declaration",
  restrictTo("superadmin", "admin", "hr", "manager", "employee"),
  getFlexiDeclaration
);

router.get(
  "/declarationForCompany",
  restrictTo("superadmin", "admin", "hr", "manager"),
  getFlexiDeclarationForCompany
);

router.post(
  "/declaration",
  restrictTo("superadmin", "admin", "hr", "manager", "employee"),
  createOrUpdateFlexiDeclaration
);
router.post(
  "/declaration/:id/submit",
  restrictTo("superadmin", "admin", "hr", "manager", "employee"),
  submitFlexiDeclaration
);
router.post(
  "/declaration/:id/approve",
  restrictTo("superadmin", "admin", "hr", "manager"),
  approveFlexiDeclaration
);

// Calculation Routes
router.post(
  "/calculate",
  restrictTo("superadmin", "admin", "hr", "manager", "employee"),
  calculateFlexiBalance
);

export default router;
