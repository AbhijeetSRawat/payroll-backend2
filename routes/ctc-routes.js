import express from "express";
import {
  getCTCTemplate,
  createOrUpdateCTCTemplate,
} from "../controllers/ctcTemplate-controller.js";
import {
  createCTCAnnexure,
  getCTCByEmployee,
  getAllCTCAnnexures,
  bulkCreateCTC,
  updateCTCAnnexure,
  getFlexiEligibleEmployees,
  getCTCBreakdown,
  calculateHRAExemptionAPI,
} from "../controllers/ctcAnnexure-controller.js";
import { protect,  restrictTo } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes (none)
 router.use(protect);

// CTC Template routes (Admin/HR only)
router.get("/template/:companyId", restrictTo("superadmin", "admin", "hr", "manager"), getCTCTemplate);
router.post("/template", restrictTo("superadmin", "admin", "hr", "manager"), createOrUpdateCTCTemplate);

// CTC Annexure routes
router.post("/employee", restrictTo("superadmin", "admin", "hr", "manager"), createCTCAnnexure);
router.post("/bulk/:companyId", restrictTo("superadmin", "admin", "hr", "manager"), bulkCreateCTC);
router.get(
  "/employee/:employeeId/:companyId",
  
  getCTCByEmployee
);
router.get("/:companyId", restrictTo("superadmin", "admin", "hr", "manager"), getAllCTCAnnexures);



// Get CTC breakdown (Admin/HR/Employee)
router.get(
  "/:id/breakdown/:companyId",
  restrictTo("superadmin", "admin", "hr", "manager", "employee"),
  getCTCBreakdown
);

// Update CTC Annexure with flexi integration (Admin/HR only)
router.put(
  "/:ctcAnnexureId/:companyId",
  restrictTo("superadmin", "admin", "hr", "manager"),
  updateCTCAnnexure
);

// Get employees eligible for flexi benefits (Admin/HR only)
router.get(
  "/flexi/eligible/:companyId",
  restrictTo("superadmin", "admin", "hr", "manager"),
  getFlexiEligibleEmployees
);


router.post('/hra/calculate/:employeeId', restrictTo('superadmin', 'admin', 'hr', 'manager', 'employee'), calculateHRAExemptionAPI);

export default router;
