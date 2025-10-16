// routes/auth-routes.js
// routes/auth-routes.js
import express from 'express';
import { bulkCreateEmployees, createEmployee, editEmployee, getAllEmployeesByCompanyId, getEmployee, updateBasicEmployeeInfo, uploadDocument, getAllEmployeesByCompanyIdPagination, getEmployeesByMonth, getEmployeeDocuments, getAllNewJoinerByCompanyId, makeUserActive, makeuserinactive, updateDocumentFields, makedocumentInValid, makedocumentValid, updateSalesAchievement } from '../controllers/employee-controller.js';
import { protect, restrictTo } from '../middleware/authMiddleware.js';


const router = express.Router();

router.post('/addEmployee', createEmployee);
router.get('/getall/:companyId', getAllEmployeesByCompanyId);
router.put('/edit/:userId', editEmployee);
router.post("/bulk-create", bulkCreateEmployees);
router.get('/getemployee/:employeeId', getEmployee);
router.put('/update/:employeeId', updateBasicEmployeeInfo);
router.put('/uploadDocument/:employeeId', protect, restrictTo("admin", "superadmin","newjoiner","employee","subadmin","hr","manager"), uploadDocument);
router.get('/getEmployeeDocument/:employeeId', protect, restrictTo("admin", "superadmin","employee","newjoiner","subadmin","hr","manager"), getEmployeeDocuments);
 router.get('/getallpagination/:companyId', getAllEmployeesByCompanyIdPagination);
router.get('/monthWiseEmployees/:year/:month/:companyId', protect, restrictTo("superadmin", "admin","subadmin","hr","manager"), getEmployeesByMonth);
router.get('/getallnewjoiners/:companyId', protect, restrictTo("superadmin", "admin","subadmin","hr","manager"), getAllNewJoinerByCompanyId);
router.patch('/makeUserInActive/:employeeId', protect, restrictTo("superadmin", "admin","subadmin","hr","manager"), makeuserinactive);
router.patch('/makeUserActive/:employeeId', protect, restrictTo("superadmin", "admin","subadmin","hr","manager"), makeUserActive);
router.patch('/updateDocumentsFields/:employeeId', protect, restrictTo("superadmin", "admin","subadmin","hr","manager"), updateDocumentFields);
router.patch('/makeDocumentInValid/:employeeId', protect, restrictTo("superadmin", "admin","subadmin","hr","manager"), makedocumentInValid);
router.patch('/makeDocumentValid/:employeeId', protect, restrictTo("superadmin", "admin","subadmin","hr","manager"), makedocumentValid);


router.patch('/update-achievement/:employeeId',protect, restrictTo("superadmin", "admin","subadmin","hr","manager"), updateSalesAchievement);




export default router;
