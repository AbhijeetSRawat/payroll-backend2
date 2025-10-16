import express from "express"
import { AssignHRorManager, createDepartment, editDepartment, getAllHRs,  getAllManagers, getDepartmentsByCompany, getHRAndManagerByDepartment, updateDetailsHRorManager, updateHRorManager } from "../controllers/department-controller.js";
import { protect, restrictTo } from "../middleware/authMiddleware.js";


const router = express.Router()

router.post("/create", createDepartment)
router.put("/edit/:departmentId", editDepartment) // Assuming editDepartment is also handled by createDepartment for simplicity
router.get("/getAll/:companyId", getDepartmentsByCompany) // Uncomment and implement if needed


//Assigning HR and Manager to department
router.post("/assignHrManager",protect, restrictTo("admin","superadmin","subadmin"), AssignHRorManager);
router.put("/updateHrManager",protect,restrictTo("admin","superadmin","subadmin"), updateHRorManager);
router.patch("/updateHRManagerDetails",protect,restrictTo("admin","superadmin","subadmin","hr","manager"), updateDetailsHRorManager);
router.get("/getAllHRs/:companyId",protect,restrictTo("admin","superadmin","subadmin","hr","manager"), getAllHRs);
router.get("/getAllManagers/:companyId",protect,restrictTo("admin","superadmin","subadmin","hr","manager","employee"), getAllManagers);
router.get("/getHRAndManager/:departmentId", protect, restrictTo("admin","superadmin","subadmin","hr","manager","employee"), getHRAndManagerByDepartment);

export default router;
