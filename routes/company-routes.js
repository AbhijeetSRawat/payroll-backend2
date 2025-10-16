import express from "express"
import { changeStatus, downloadCompanyData, getAllCompanies, getCompanyDetails, registerCompany, updateCompanyDetails, updateCompanyPermissions } from "../controllers/company-controllers.js"
import { addHrEmployee,   getAllHrOrManagers,   updateHrEmployee } from "../controllers/employee-controller.js"
import { protect, restrictTo } from "../middleware/authMiddleware.js"

const router = express.Router()

router.post("/create", protect, restrictTo("superadmin"), registerCompany)
router.get("/getAllCompanies", protect, restrictTo("superadmin"), getAllCompanies)
router.post("/updatePermissions", protect, restrictTo("superadmin"), updateCompanyPermissions)
router.get("/getCompanyDetails/:companyId", protect, restrictTo("superadmin", "admin", "employee", "subadmin"), getCompanyDetails) // Assuming this is to get company details by companyId
router.post("/updateCompanyDetails/:companyId", protect, restrictTo("superadmin", "admin"), updateCompanyDetails)



router.post("/addHR", protect, restrictTo("superadmin", "admin"), addHrEmployee)
router.put("/editHR/:hrEmployeeId", protect, restrictTo("superadmin", "admin"), updateHrEmployee)
router.get("/getManager/:companyId", protect, restrictTo("superadmin", "admin"), getAllHrOrManagers)


router.get('/:companyId', protect, restrictTo("superadmin", "admin", "subadmin"), downloadCompanyData);

router.patch('/changesStatus/:companyId', protect, restrictTo("superadmin", "admin"), changeStatus);

export default router;
