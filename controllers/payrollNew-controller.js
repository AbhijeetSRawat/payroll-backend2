

import mongoose from 'mongoose'
import asyncHandler from 'express-async-handler';
import { PayrollProcessing, PayrollBatch } from '../models/PayrollNew.js';
import { 
  getEmployeePayrollData, 
  calculateMonthlyEarnings, 
  calculateDeductions, 
  calculateNetSalary 
} from '../services/payrollCalculationService.js';
import { createAuditLog } from '../services/auditService.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import LeavePolicy from '../models/LeavePolicy.js';
import Leave from '../models/Leave.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';


// ================================
// @desc    Process payroll for single employee
// @route   POST /api/payroll/process
// @access  Private/Admin/HR
// ================================
const processPayroll = asyncHandler(async (req, res) => {
  const { employeeId, month, year, adjustments, financialYear } = req.body;

  // Fetch employee
  const employee = await Employee.findById(employeeId).populate('company').populate('user', 'profile email');
  if (!employee) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found'
    });
  }



  const { ctcAnnexure, flexiDeclaration } = await getEmployeePayrollData(
    employeeId,
    financialYear,
    employee?.company?._id
  );

  if (!ctcAnnexure) {
    return res.status(404).json({
      success: false,
      message: 'Active CTC annexure not found'
    });
  }

  // Check if payroll already processed
  const existingPayroll = await PayrollProcessing.findOne({
    employee: employeeId,
    'payrollPeriod.month': month,
    'payrollPeriod.year': year,
    company: employee?.company?._id
  });

  if (existingPayroll) {
    return res.status(400).json({
      success: false,
      message: `Payroll already processed for ${month}/${year}`
    });
  }

  // ===============================
  // 🔹 Calculate attendance-based salary details with sandwich leave
  // ===============================
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth);

  const leavePolicy = await LeavePolicy.findOne({ company: employee.company._id });
  if (!leavePolicy) {
    return res.status(404).json({ message: 'Leave policy not found for this company' });
  }

  const attendanceRecords = await Attendance.find({
    employee: employee._id,
    date: { $gte: monthStart, $lte: monthEnd }
  });

  // Get leave records for sandwich leave calculation
  const leaveRecords = await Leave.find({
    employee: employee._id,
    status: 'approved',
    $or: [
      { 
        startDate: { $gte: monthStart, $lte: monthEnd } 
      },
      { 
        endDate: { $gte: monthStart, $lte: monthEnd } 
      },
      {
        $and: [
          { startDate: { $lte: monthStart } },
          { endDate: { $gte: monthEnd } }
        ]
      }
    ]
  }).populate('leaveType');

  // Prepare counters
  let presentDays = 0, absentDays = 0, halfDays = 0, weekOffDays = 0, holidayDays = 0;
  let sandwichLeaveDays = 0;
  const attendanceByDate = {};
  const leaveDaysByDate = new Set();
  const sandwichLeaveDates = [];

  // Mark leave days
  leaveRecords.forEach(leave => {
    const start = new Date(leave.startDate);
    const end = new Date(leave.endDate);
    
    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      if (date >= monthStart && date <= monthEnd) {
        const dateStr = date.toISOString().split('T')[0];
        leaveDaysByDate.add(dateStr);
      }
    }
  });

  attendanceRecords.forEach(record => {
    const dateStr = record.date.toISOString().split('T')[0];
    attendanceByDate[dateStr] = record;
  });

  // Calculate sandwich leave
// ===============================
// 🔹 Improved Sandwich Leave Calculation
// ===============================
if (leavePolicy.sandwichLeave) {
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month - 1, day);
    const dateStr = currentDate.toISOString().split('T')[0];

    const isHoliday = leavePolicy.holidays.some(holiday => {
      const hDate = new Date(holiday.date);
      return hDate.toISOString().split('T')[0] === dateStr;
    });

    const dayOfWeek = currentDate.getDay();
    const isWeekOff = leavePolicy.weekOff.includes(dayOfWeek);

    // Apply sandwich leave *only for holidays or weekoffs*
    if (isHoliday || isWeekOff) {
      const prevDay = new Date(currentDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const nextDay = new Date(currentDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const prevDayStr = prevDay.toISOString().split('T')[0];
      const nextDayStr = nextDay.toISOString().split('T')[0];

      // Check if both previous and next days are leave or absent
      const prevIsLeaveOrAbsent =
        leaveDaysByDate.has(prevDayStr) ||
        (!attendanceByDate[prevDayStr] || attendanceByDate[prevDayStr]?.status === 'absent');

      const nextIsLeaveOrAbsent =
        leaveDaysByDate.has(nextDayStr) ||
        (!attendanceByDate[nextDayStr] || attendanceByDate[nextDayStr]?.status === 'absent');

      if (prevIsLeaveOrAbsent && nextIsLeaveOrAbsent) {
        // Mark this holiday/weekoff as sandwich leave (absent)
        sandwichLeaveDays++;
        sandwichLeaveDates.push(dateStr);
      }
    }
  }
}

  // Calculate regular attendance
  for (let day = 1; day <= daysInMonth; day++) {
    const currentDate = new Date(year, month - 1, day);
    const dayOfWeek = currentDate.getDay();
    const dateStr = currentDate.toISOString().split('T')[0];

    // Skip if already counted as sandwich leave
    if (sandwichLeaveDates.includes(dateStr)) {
      continue;
    }

    const isHoliday = leavePolicy.holidays.some(holiday => {
      const hDate = new Date(holiday.date);
      return hDate.toISOString().split('T')[0] === dateStr;
    });

    const isWeekOff = leavePolicy.weekOff.includes(dayOfWeek);
    const attendance = attendanceByDate[dateStr];
    const isLeaveDay = leaveDaysByDate.has(dateStr);

    if (isHoliday) {
      holidayDays++;
    } else if (isWeekOff) {
      weekOffDays++;
    } else if (isLeaveDay) {
      absentDays++; // Count approved leaves as absent for payroll
    } else if (attendance) {
      switch (attendance.status) {
        case 'present': presentDays++; break;
        case 'half_day': halfDays++; break;
        case 'absent': absentDays++; break;
        default: absentDays++;
      }
    } else {
      absentDays++; // No record found
    }
  }

   // If no attendance record found for entire month => No pay for the month
if (attendanceRecords.length === 0) {
  presentDays = 0;
  halfDays = 0;
  weekOffDays = 0;
  holidayDays = 0;
  absentDays = daysInMonth;
  sandwichLeaveDays = 0;
}


  const payDays = presentDays + weekOffDays + holidayDays + (halfDays * 0.5);
  const lopDays = daysInMonth - (weekOffDays + holidayDays + payDays);

 

  // ===============================
  // 🔹 Calculate Payroll
  // ===============================
  const earnings = calculateMonthlyEarnings(ctcAnnexure, flexiDeclaration, payDays, lopDays);
  const deductions = calculateDeductions(earnings, employee.employeeType);

  // Apply adjustments if any
  if (adjustments) {
    Object.keys(adjustments.earnings || {}).forEach(key => {
      if (earnings[key] !== undefined) earnings[key] += adjustments.earnings[key];
    });
    Object.keys(adjustments.deductions || {}).forEach(key => {
      if (deductions[key] !== undefined) deductions[key] += adjustments.deductions[key];
    });

    earnings.totalEarnings = Object.values(earnings).reduce((sum, val) => sum + val, 0);
    deductions.totalDeductions = Object.values(deductions).reduce((sum, val) => sum + val, 0);
  }

  const netSalary = calculateNetSalary(earnings, deductions);

  // ===============================
  // 🔹 Save Payroll Record
  // ===============================
  const payroll = new PayrollProcessing({
    company: employee.company?._id,
    employee: employeeId,
    ctcAnnexure: ctcAnnexure._id,
    flexiDeclaration: flexiDeclaration?._id,
    payrollPeriod: { month, year, payDays, lopDays },
    attendanceSummary: {
      presentDays,
      halfDays,
      weekOffDays,
      holidayDays,
      absentDays,
      sandwichLeaveDays,
      totalWorkingDays: daysInMonth,
      regularLeaves: leaveDaysByDate.size - sandwichLeaveDays
    },
    earnings,
    deductions,
    netSalary,
    processedBy: req.user._id,
    processedAt: new Date(),
    status: 'processed'
  });

  const savedPayroll = await payroll.save();

  // Audit log
  await createAuditLog(req.user._id, req.user.company, 'Payroll Processed', {
    employee: employee.employeeId,
    period: `${month}/${year}`,
    netSalary,
    sandwichLeaveApplied: leavePolicy.sandwichLeave,
    sandwichLeaveDays
  });

  // Response
  return res.status(201).json({
    success: true,
    message: `✅ Payroll processed successfully${leavePolicy.sandwichLeave ? ' (Sandwich Leave Applied)' : ''}`,
    data: {
      employee: employee.user?.profile?.firstName + ' ' + employee.user?.profile?.lastName,
      month,
      year,
      payDays,
      lopDays,
      sandwichLeaveDays,
      netSalary,
      payrollId: savedPayroll._id,
      attendanceSummary: {
        presentDays,
        halfDays,
        weekOffDays,
        holidayDays,
        absentDays,
        sandwichLeaveDays
      }
    }
  });
});





const processBulkPayroll = asyncHandler(async (req, res) => {
  const { employeeIds, month, year, adjustments, financialYear } = req.body;

  if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Employee IDs array is required",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const results = [];

    for (const employeeId of employeeIds) {
      try {
        // ---------------------------
        // 🔹 Fetch employee details
        // ---------------------------
        const employee = await Employee.findById(employeeId)
          .populate("company")
          .populate("user", "profile email")
          .session(session);

        if (!employee) throw new Error("Employee not found");

        const fullName = `${employee?.user?.profile?.firstName || ""} ${employee?.user?.profile?.lastName || ""}`.trim();

        // ---------------------------
        // 🔹 Get CTC & Flexi details
        // ---------------------------
        const { ctcAnnexure, flexiDeclaration } = await getEmployeePayrollData(
          employeeId,
          financialYear,
          employee?.company?._id,
        );

        if (!ctcAnnexure)
          throw new Error(`Active CTC annexure not found for employee ${fullName}`);

        // ---------------------------
        // 🔹 Check existing payroll
        // ---------------------------
        const existingPayroll = await PayrollProcessing.findOne({
          employee: employeeId,
          "payrollPeriod.month": month,
          "payrollPeriod.year": year,
          company: employee?.company?._id,
        }).session(session);

        if (existingPayroll)
          throw new Error(`Payroll already processed for this month and year for employee ${fullName}`);

        // ---------------------------
        // 🔹 Fetch Leave Policy
        // ---------------------------
        const leavePolicy = await LeavePolicy.findOne({
          company: employee.company._id,
        }).session(session);

        if (!leavePolicy)
          throw new Error(`Leave policy not found for this company ${employee?.company?.name}`);

        // ---------------------------
        // 🔹 Attendance & Leave data
        // ---------------------------
        const daysInMonth = new Date(year, month, 0).getDate();
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month - 1, daysInMonth);

        const attendanceRecords = await Attendance.find({
          employee: employee._id,
          date: { $gte: monthStart, $lte: monthEnd },
        }).session(session);

        const leaveRecords = await Leave.find({
          employee: employee._id,
          status: "approved",
          $or: [
            { startDate: { $gte: monthStart, $lte: monthEnd } },
            { endDate: { $gte: monthStart, $lte: monthEnd } },
            {
              $and: [
                { startDate: { $lte: monthStart } },
                { endDate: { $gte: monthEnd } },
              ],
            },
          ],
        })
          // ✅ Fix populate issue
          .populate({ path: "leaveType", strictPopulate: false })
          .session(session);

        // ---------------------------
        // 🔹 Attendance calculations
        // ---------------------------
        let presentDays = 0,
          absentDays = 0,
          halfDays = 0,
          weekOffDays = 0,
          holidayDays = 0,
          sandwichLeaveDays = 0;

        const attendanceByDate = {};
        const leaveDaysByDate = new Set();
        const sandwichLeaveDates = [];

        leaveRecords.forEach((leave) => {
          const start = new Date(leave.startDate);
          const end = new Date(leave.endDate);
          for (
            let date = new Date(start);
            date <= end;
            date.setDate(date.getDate() + 1)
          ) {
            if (date >= monthStart && date <= monthEnd) {
              leaveDaysByDate.add(date.toISOString().split("T")[0]);
            }
          }
        });

        attendanceRecords.forEach((record) => {
          const dateStr = record.date.toISOString().split("T")[0];
          attendanceByDate[dateStr] = record;
        });

        // --- Sandwich Leave ---
        if (leavePolicy.sandwichLeave) {
          for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month - 1, day);
            const dateStr = currentDate.toISOString().split("T")[0];
            const isHoliday = leavePolicy.holidays.some(
              (holiday) =>
                new Date(holiday.date).toISOString().split("T")[0] === dateStr
            );
            const isWeekOff = leavePolicy.weekOff.includes(currentDate.getDay());

            if (isHoliday || isWeekOff) {
              const prev = new Date(currentDate);
              const next = new Date(currentDate);
              prev.setDate(prev.getDate() - 1);
              next.setDate(next.getDate() + 1);

              const prevStr = prev.toISOString().split("T")[0];
              const nextStr = next.toISOString().split("T")[0];

              const prevAbsent =
                leaveDaysByDate.has(prevStr) ||
                (!attendanceByDate[prevStr] ||
                  attendanceByDate[prevStr]?.status === "absent");

              const nextAbsent =
                leaveDaysByDate.has(nextStr) ||
                (!attendanceByDate[nextStr] ||
                  attendanceByDate[nextStr]?.status === "absent");

              if (prevAbsent && nextAbsent) {
                sandwichLeaveDays++;
                sandwichLeaveDates.push(dateStr);
              }
            }
          }
        }

        // --- Count attendance ---
        for (let day = 1; day <= daysInMonth; day++) {
          const currentDate = new Date(year, month - 1, day);
          const dateStr = currentDate.toISOString().split("T")[0];
          if (sandwichLeaveDates.includes(dateStr)) continue;

          const isHoliday = leavePolicy.holidays.some(
            (holiday) =>
              new Date(holiday.date).toISOString().split("T")[0] === dateStr
          );
          const isWeekOff = leavePolicy.weekOff.includes(currentDate.getDay());
          const attendance = attendanceByDate[dateStr];
          const isLeaveDay = leaveDaysByDate.has(dateStr);

          if (isHoliday) holidayDays++;
          else if (isWeekOff) weekOffDays++;
          else if (isLeaveDay) absentDays++;
          else if (attendance) {
            switch (attendance.status) {
              case "present":
                presentDays++;
                break;
              case "half_day":
                halfDays++;
                break;
              default:
                absentDays++;
            }
          } else absentDays++;
        }

        const payDays = presentDays + weekOffDays + holidayDays + halfDays * 0.5;
        const lopDays = daysInMonth - (weekOffDays + holidayDays + payDays);

        // ---------------------------
        // 🔹 Salary Calculations
        // ---------------------------
        const earnings = calculateMonthlyEarnings(
          ctcAnnexure,
          flexiDeclaration,
          payDays,
          lopDays
        );
        const deductions = calculateDeductions(earnings, employee.employeeType);

        if (adjustments) {
          Object.keys(adjustments.earnings || {}).forEach((key) => {
            if (earnings[key] !== undefined) earnings[key] += adjustments.earnings[key];
          });
          Object.keys(adjustments.deductions || {}).forEach((key) => {
            if (deductions[key] !== undefined) deductions[key] += adjustments.deductions[key];
          });
        }

        earnings.totalEarnings = Object.values(earnings).reduce((a, b) => a + b, 0);
        deductions.totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);
        const netSalary = calculateNetSalary(earnings, deductions);

        // ---------------------------
        // 🔹 Save Payroll
        // ---------------------------
        const payroll = new PayrollProcessing({
          company: employee.company?._id,
          employee: employeeId,
          ctcAnnexure: ctcAnnexure._id,
          flexiDeclaration: flexiDeclaration?._id,
          payrollPeriod: { month, year, payDays, lopDays },
          attendanceSummary: {
            presentDays,
            halfDays,
            weekOffDays,
            holidayDays,
            absentDays,
            sandwichLeaveDays,
            totalWorkingDays: daysInMonth,
            regularLeaves: leaveDaysByDate.size - sandwichLeaveDays,
          },
          earnings,
          deductions,
          netSalary,
          processedBy: req.user._id,
          processedAt: new Date(),
          status: "processed",
        });

        await payroll.save({ session });

        results.push({
          employee: fullName,
          netSalary,
          month,
          year,
        });

      } catch (innerError) {
        // ❌ Add employee name to error and stop all processing
        throw new Error(`❌ Failed : ${innerError.message}`);
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "✅ All payrolls processed successfully",
      processedCount: results.length,
      results,
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    // 🧠 Clean error message for frontend
    const cleanMessage = error.message.replace(/ObjectId\('[^']+'\)/, "");

    res.status(500).json({
      success: false,
      message: cleanMessage,
    });
  }
});




// ================================
// @desc    Get payroll details for employee
// @route   GET /api/payroll/employee/:employeeId
// @access  Private/Admin/HR/Employee
// ================================
const getEmployeePayroll = asyncHandler(async (req, res) => {
  const { employeeId, companyId } = req.params;
  const { month, year } = req.query;

  let query = { employee: employeeId, company: companyId };

  if (month && year) {
    query['payrollPeriod.month'] = parseInt(month);
    query['payrollPeriod.year'] = parseInt(year);
  }

  const payroll = await PayrollProcessing.findOne(query)
    .populate({
      path: 'employee',
      populate: { path: 'user', select: 'email profile' }
    })
    .populate('processedBy', 'name')
    .populate('approvedBy', 'name')
    .sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1 });

  if (!payroll) {
    return res.status(404).json({
      success: false,
      message: 'Payroll record not found'
    });
  }

  // Authorization check
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee || employee._id.toString() !== employeeId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You can view only your own payroll data'
      });
    }
  }

  return res.status(200).json({
    success: true,
    message: '✅ Payroll record fetched successfully',
    data: payroll
  });
});



// ================================
// @desc    Generate payroll report
// @route   GET /api/payroll/report
// @access  Private/Admin/HR
// ================================
const generatePayrollReport = asyncHandler(async (req, res) => {
  const { month, year, department, companyId } = req.query;

  let query = { 
    company: companyId,
    'payrollPeriod.month': parseInt(month),
    'payrollPeriod.year': parseInt(year),
    status: { $in: ['processed', 'paid'] }
  };

  if (department) {
    const employeesInDept = await Employee.find({ 
      department, 
      company: companyId 
    }).select('_id');
    query.employee = { $in: employeesInDept.map(emp => emp._id) };
  }

  const payrolls = await PayrollProcessing.find(query)
    .populate('employee', 'name employeeId department designation')
    .select('earnings deductions netSalary payrollPeriod')
    .lean();

  if (payrolls.length === 0) {
    return res.status(404).json({
      success: false,
      message: 'No payroll data found for the selected filters'
    });
  }

  const report = {
    period: `${month}/${year}`,
    totalEmployees: payrolls.length,
    summary: {
      totalEarnings: payrolls.reduce((sum, p) => sum + p.earnings.totalEarnings, 0),
      totalDeductions: payrolls.reduce((sum, p) => sum + p.deductions.totalDeductions, 0),
      totalNetSalary: payrolls.reduce((sum, p) => sum + p.netSalary, 0)
    },
    departmentBreakdown: payrolls.reduce((acc, payroll) => {
      const dept = payroll.employee.department;
      if (!acc[dept]) {
        acc[dept] = { employees: 0, totalSalary: 0 };
      }
      acc[dept].employees++;
      acc[dept].totalSalary += payroll.netSalary;
      return acc;
    }, {}),
    payrollDetails: payrolls
  };

  return res.status(200).json({
    success: true,
    message: '📊 Payroll report generated successfully',
    data: report
  });
});




// ================================
// @desc    Download payslip PDF
// @route   GET /api/payroll/payslip/pdf/:payrollId
// @access  Private/Admin/HR/Employee
// ================================
const downloadPayslipPDF = asyncHandler(async (req, res) => {
  try {
    const { payrollId } = req.params;

    const payroll = await PayrollProcessing.findById(payrollId)
      .populate({
        path: 'employee',
        populate: [
          { path: 'user', select: 'profile email' },
          { path: 'employmentDetails.department', select: 'name' },
          { path: 'company', select: 'name address phoneNumber email' }
        ]
      })
      .populate('processedBy', 'name');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Authorization check for employees
    if (req?.user?.role === 'Employee') {
      const employee = await Employee.findOne({ user: req.user._id });
      if (!employee || employee._id.toString() !== payroll.employee._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only download your own payslip'
        });
      }
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 
      `attachment; filename="payslip-${payroll.employee.employmentDetails.employeeId}-${payroll.payrollPeriod.month}-${payroll.payrollPeriod.year}.pdf"`
    );

    // Generate PDF using simple approach like your existing function
    generatePayrollPDF(res, payroll.employee, payroll);

  } catch (error) {
    console.error('PDF Generation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF payslip',
      error: error.message
    });
  }
});

// ================================
// @desc    Download payslip Excel
// @route   GET /api/payroll/payslip/excel/:payrollId
// @access  Private/Admin/HR/Employee
// ================================
const downloadPayslipExcel = asyncHandler(async (req, res) => {
  try {
    const { payrollId } = req.params;

    const payroll = await PayrollProcessing.findById(payrollId)
      .populate({
        path: 'employee',
        populate: [
          { path: 'user', select: 'profile email' },
          { path: 'employmentDetails.department', select: 'name' },
          { path: 'company', select: 'name address phoneNumber email' }
        ]
      })
      .populate('processedBy', 'name');

    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll record not found'
      });
    }

    // Authorization check for employees
    if (req?.user?.role === 'Employee') {
      const employee = await Employee.findOne({ user: req.user._id });
      if (!employee || employee._id.toString() !== payroll.employee._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You can only download your own payslip'
        });
      }
    }

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 
      `attachment; filename="payslip-${payroll.employee.employmentDetails.employeeId}-${payroll.payrollPeriod.month}-${payroll.payrollPeriod.year}.xlsx"`
    );

    // Generate Excel
    const workbook = new ExcelJS.Workbook();
    await generatePayrollExcel(workbook, payroll.employee, payroll);
    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Excel Generation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Excel payslip',
      error: error.message
    });
  }
});

// ================================
// PDF Generation Function (Simple like your existing one)
// ================================
function generatePayrollPDF(stream, employee, payroll) {
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(stream);

  // Header
  doc.fontSize(18).text('PAYSLIP', { align: 'center' });
  doc.moveDown();

  // Employee Details
  const employeeName = `${employee.user?.profile?.firstName || ''} ${employee.user?.profile?.lastName || ''}`.trim();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const period = `${monthNames[payroll.payrollPeriod.month - 1]} ${payroll.payrollPeriod.year}`;
  const generatedDate = new Date().toLocaleDateString('en-IN');

  doc.fontSize(12)
     .text(`Employee: ${employeeName}`)
     .text(`Employee ID: ${employee.employmentDetails.employeeId}`)
     .text(`Department: ${employee.employmentDetails.department?.name || 'N/A'}`)
     .text(`Period: ${period}`)
     .text(`Generated: ${generatedDate}`);
  doc.moveDown();

  // Earnings Section
  doc.fontSize(14).text('EARNINGS', { underline: true });
  doc.moveDown(0.5);
  
  const earningsLines = [
    ['Basic Salary', payroll.earnings.basic],
    ['HRA', payroll.earnings.hra],
    ['Conveyance', payroll.earnings.conveyance],
    ['Special Allowance', payroll.earnings.specialAllowance],
    ['Medical Allowance', payroll.earnings.medicalAllowance],
    ['Other Allowances', payroll.earnings.otherAllowances],
    ['Bonus', payroll.earnings.bonus],
    ['Overtime', payroll.earnings.overtime]
  ];

  earningsLines.forEach(([label, value]) => {
    if (value > 0) {
      const valFormatted = `₹ ${Number(value).toLocaleString('en-IN')}`;
      doc.fontSize(10).text(`${label}: ${valFormatted}`);
    }
  });

  doc.moveDown();
  doc.fontSize(12).text(`Total Earnings: ₹ ${Number(payroll.earnings.totalEarnings).toLocaleString('en-IN')}`, { bold: true });
  doc.moveDown();

  // Deductions Section
  doc.fontSize(14).text('DEDUCTIONS', { underline: true });
  doc.moveDown(0.5);
  
  const deductionsLines = [
    ['Provident Fund', payroll.deductions.providentFund],
    ['Income Tax', payroll.deductions.incomeTax],
    ['Professional Tax', payroll.deductions.professionalTax],
    ['ESIC', payroll.deductions.esic],
    ['Loan Recovery', payroll.deductions.loanRecovery],
    ['Insurance', payroll.deductions.insurance],
    ['Other Deductions', payroll.deductions.otherDeductions]
  ];

  deductionsLines.forEach(([label, value]) => {
    if (value > 0) {
      const valFormatted = `₹ ${Number(value).toLocaleString('en-IN')}`;
      doc.fontSize(10).text(`${label}: ${valFormatted}`);
    }
  });

  doc.moveDown();
  doc.fontSize(12).text(`Total Deductions: ₹ ${Number(payroll.deductions.totalDeductions).toLocaleString('en-IN')}`, { bold: true });
  doc.moveDown();

  // Net Salary
  doc.fontSize(16).text(`NET SALARY: ₹ ${Number(payroll.netSalary).toLocaleString('en-IN')}`, { align: 'center', bold: true });
  doc.moveDown();

  // Attendance Summary
  doc.fontSize(12).text('ATTENDANCE SUMMARY');
  doc.fontSize(10)
     .text(`Present Days: ${payroll.attendanceSummary?.presentDays || 0}`)
     .text(`Half Days: ${payroll.attendanceSummary?.halfDays || 0}`)
     .text(`Absent Days: ${payroll.attendanceSummary?.absentDays || 0}`)
     .text(`Payable Days: ${payroll.payrollPeriod.payDays}`);

  // Footer
  doc.moveDown();
  doc.fontSize(8).text('This is a computer generated payslip and does not require signature.', { align: 'center' });

  doc.end();
}

// ================================
// Excel Generation Function (Simple like your existing one)
// ================================
async function generatePayrollExcel(workbook, employee, payroll) {
  const sheet = workbook.addWorksheet('Payslip');
  
  // Header
  sheet.addRow(['PAYSLIP']).font = { size: 16, bold: true };
  sheet.addRow([]);

  // Employee Details
  const employeeName = `${employee.user?.profile?.firstName || ''} ${employee.user?.profile?.lastName || ''}`.trim();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const period = `${monthNames[payroll.payrollPeriod.month - 1]} ${payroll.payrollPeriod.year}`;

  sheet.addRow(['Employee:', employeeName]);
  sheet.addRow(['Employee ID:', employee.employmentDetails.employeeId]);
  sheet.addRow(['Department:', employee.employmentDetails.department?.name || 'N/A']);
  sheet.addRow(['Period:', period]);
  sheet.addRow(['Generated:', new Date().toLocaleDateString('en-IN')]);
  sheet.addRow([]);

  // Earnings
  sheet.addRow(['EARNINGS']).font = { bold: true };
  sheet.addRow(['Description', 'Amount (₹)']);
  
  const earningsData = [
    ['Basic Salary', payroll.earnings.basic],
    ['HRA', payroll.earnings.hra],
    ['Conveyance', payroll.earnings.conveyance],
    ['Special Allowance', payroll.earnings.specialAllowance],
    ['Medical Allowance', payroll.earnings.medicalAllowance],
    ['Other Allowances', payroll.earnings.otherAllowances],
    ['Bonus', payroll.earnings.bonus],
    ['Overtime', payroll.earnings.overtime]
  ];

  earningsData.forEach(([label, value]) => {
    if (value > 0) {
      sheet.addRow([label, value]);
    }
  });

  sheet.addRow(['Total Earnings', payroll.earnings.totalEarnings]).font = { bold: true };
  sheet.addRow([]);

  // Deductions
  sheet.addRow(['DEDUCTIONS']).font = { bold: true };
  sheet.addRow(['Description', 'Amount (₹)']);
  
  const deductionsData = [
    ['Provident Fund', payroll.deductions.providentFund],
    ['Income Tax', payroll.deductions.incomeTax],
    ['Professional Tax', payroll.deductions.professionalTax],
    ['ESIC', payroll.deductions.esic],
    ['Loan Recovery', payroll.deductions.loanRecovery],
    ['Insurance', payroll.deductions.insurance],
    ['Other Deductions', payroll.deductions.otherDeductions]
  ];

  deductionsData.forEach(([label, value]) => {
    if (value > 0) {
      sheet.addRow([label, value]);
    }
  });

  sheet.addRow(['Total Deductions', payroll.deductions.totalDeductions]).font = { bold: true };
  sheet.addRow([]);

  // Net Salary
  sheet.addRow(['NET SALARY', payroll.netSalary]).font = { size: 14, bold: true };
  sheet.addRow([]);

  // Attendance Summary
  sheet.addRow(['ATTENDANCE SUMMARY']).font = { bold: true };
  sheet.addRow(['Present Days', payroll.attendanceSummary?.presentDays || 0]);
  sheet.addRow(['Half Days', payroll.attendanceSummary?.halfDays || 0]);
  sheet.addRow(['Absent Days', payroll.attendanceSummary?.absentDays || 0]);
  sheet.addRow(['Payable Days', payroll.payrollPeriod.payDays]);

  // Format columns
  sheet.columns = [
    { width: 25 },
    { width: 15 }
  ];

  // Format currency columns
  sheet.getColumn(2).numFmt = '#,##0.00';
}



// ================================
// @desc    Download bulk payslips as Excel report
// @route   GET /api/payroll/payslip/bulk
// @access  Private/Admin/HR
// ================================
const downloadBulkPayslips = asyncHandler(async (req, res) => {
  try {
    const { month, year, department, companyId } = req.query;

    let query = { 
      company: companyId,
      'payrollPeriod.month': parseInt(month),
      'payrollPeriod.year': parseInt(year),
      status: { $in: ['processed', 'paid'] }
    };

    if (department) {
      const employeesInDept = await Employee.find({ 
        department, 
        company: companyId 
      }).select('_id');
      query.employee = { $in: employeesInDept.map(emp => emp._id) };
    }

    const payrolls = await PayrollProcessing.find(query)
      .populate({
        path: 'employee',
        populate: [
          { path: 'user', select: 'profile email' },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      });

    if (payrolls.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No payroll records found for the selected criteria'
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payroll Summary');

    // Company Header
    worksheet.mergeCells('A1:J1');
    worksheet.getCell('A1').value = 'PAYROLL SUMMARY REPORT';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A2:J2');
    worksheet.getCell('A2').value = `Period: ${month}/${year}`;
    worksheet.getCell('A2').font = { bold: true };
    worksheet.getCell('A2').alignment = { horizontal: 'center' };

    worksheet.mergeCells('A3:J3');
    worksheet.getCell('A3').value = `Generated: ${new Date().toLocaleDateString()}`;
    worksheet.getCell('A3').alignment = { horizontal: 'center' };

    // Headers
    worksheet.addRow([]);
    const headerRow = worksheet.addRow([
      'Employee ID',
      'Employee Name',
      'Department',
      'Present Days',
      'Basic Salary',
      'HRA',
      'Special Allowance',
      'Total Earnings',
      'Total Deductions',
      'Net Salary'
    ]);

    headerRow.font = { bold: true };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data
    payrolls.forEach(payroll => {
      worksheet.addRow([
        payroll.employee.employmentDetails.employeeId,
        `${payroll.employee.user.profile.firstName} ${payroll.employee.user.profile.lastName}`,
        payroll.employee.employmentDetails.department?.name || 'N/A',
        payroll.attendanceSummary?.presentDays || 0,
        payroll.earnings.basic || 0,
        payroll.earnings.hra || 0,
        payroll.earnings.specialAllowance || 0,
        payroll.earnings.totalEarnings,
        payroll.deductions.totalDeductions,
        payroll.netSalary
      ]);
    });

    // Add summary row
    worksheet.addRow([]);
    const summaryRow = worksheet.addRow([
      'TOTAL',
      '',
      '',
      '',
      '',
      '',
      '',
      payrolls.reduce((sum, p) => sum + p.earnings.totalEarnings, 0),
      payrolls.reduce((sum, p) => sum + p.deductions.totalDeductions, 0),
      payrolls.reduce((sum, p) => sum + p.netSalary, 0)
    ]);

    summaryRow.font = { bold: true };
    summaryRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };

    // Auto-fit columns
    worksheet.columns = [
      { width: 15 }, { width: 25 }, { width: 20 },
      { width: 15 }, { width: 15 }, { width: 15 },
      { width: 18 }, { width: 15 }, { width: 15 },
      { width: 15 }
    ];

    // Format currency columns
    [4, 5, 6, 7, 8, 9].forEach(colIndex => {
      worksheet.getColumn(colIndex + 1).numFmt = '#,##0.00';
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 
      `attachment; filename="payroll-summary-${month}-${year}.xlsx"`
    );

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Bulk Payslip Download Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate bulk payslips',
      error: error.message
    });
  }
});

// ================================
// @desc    Get payroll history for employee
// @route   GET /api/payroll/history/:employeeId
// @access  Private/Admin/HR/Employee
// ================================
const getPayrollHistory = asyncHandler(async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { page = 1, limit = 12, year } = req.query;

    let query = { employee: employeeId };

    if (year) {
      query['payrollPeriod.year'] = parseInt(year);
    }

    const payrollHistory = await PayrollProcessing.find(query)
      .populate({
        path: 'employee',
        populate: { path: 'user', select: 'profile email' }
      })
      .select('payrollPeriod earnings deductions netSalary status processedAt')
      .sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await PayrollProcessing.countDocuments(query);

    // Calculate summary statistics
    const summary = {
      totalRecords: total,
      totalEarnings: payrollHistory.reduce((sum, p) => sum + p.earnings.totalEarnings, 0),
      totalDeductions: payrollHistory.reduce((sum, p) => sum + p.deductions.totalDeductions, 0),
      totalNetSalary: payrollHistory.reduce((sum, p) => sum + p.netSalary, 0),
      averageSalary: total > 0 ? payrollHistory.reduce((sum, p) => sum + p.netSalary, 0) / payrollHistory.length : 0
    };

    return res.status(200).json({
      success: true,
      message: 'Payroll history fetched successfully',
      data: {
        payrollHistory,
        summary,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        }
      }
    });

  } catch (error) {
    console.error('Payroll History Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payroll history',
      error: error.message
    });
  }
});

export const getPayrollsByStatus = asyncHandler(async (req, res) => {
  try {
    const { status, year, month, page = 1, limit = 12, companyId } = req.query;

    // Build dynamic query
    const query = {};

    if (status) query.status = status; // e.g. "processed", "approved", "paid"
    if (year) query['payrollPeriod.year'] = parseInt(year);
    if (month) query['payrollPeriod.month'] = parseInt(month);
    if (companyId) query.company = companyId;

    // Fetch payrolls with pagination
    const payrolls = await PayrollProcessing.find(query)
      .populate({
        path: 'employee',
        select: 'employeeCode designation',
        populate: { path: 'user', select: 'profile email' }
      })
      .populate('company', 'name')
      .select('payrollPeriod earnings deductions netSalary status processedAt createdAt')
      .sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Count total documents for pagination
    const total = await PayrollProcessing.countDocuments(query);

    // Compute summary
    const summary = {
      totalRecords: total,
      totalEarnings: payrolls.reduce((sum, p) => sum + (p.earnings?.totalEarnings || 0), 0),
      totalDeductions: payrolls.reduce((sum, p) => sum + (p.deductions?.totalDeductions || 0), 0),
      totalNetSalary: payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0),
      averageNetSalary:
        payrolls.length > 0
          ? payrolls.reduce((sum, p) => sum + (p.netSalary || 0), 0) / payrolls.length
          : 0
    };

    return res.status(200).json({
      success: true,
      message: 'Payrolls fetched successfully',
      data: {
        payrolls,
        summary,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get Payrolls By Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payrolls',
      error: error.message
    });
  }
});



 const changeStatus = asyncHandler(async (req, res) => {
  try {
    const { status, payrollIds } = req.body; // for bulk updates
    const validStatuses = ['approved', 'paid'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value. Must be "approved" or "paid".'
      });
    }

    // =============================
    // 🔹 CASE 1: Bulk Update
    // =============================
    if (Array.isArray(payrollIds) && payrollIds.length > 0) {
      const result = await PayrollProcessing.updateMany(
        { _id: { $in: payrollIds } },
        { $set: { status } },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: `Status updated to '${status}' for ${result.modifiedCount} payrolls.`,
      });
    }

   

    // =============================
    // 🔹 CASE 3: No IDs Provided
    // =============================
    return res.status(400).json({
      success: false,
      message: 'Please provide either payrollId in params or payrollIds array in body.'
    });

  } catch (error) {
    console.error('Change Status Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change payroll status',
      error: error.message
    });
  }
});

export {
  processPayroll,
  getEmployeePayroll,
  processBulkPayroll,
  generatePayrollReport,
  downloadPayslipPDF,
  downloadPayslipExcel,
  downloadBulkPayslips,
  getPayrollHistory,
  changeStatus
};