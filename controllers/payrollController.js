import Payroll from '../models/Payroll.js';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import LeavePolicy from '../models/LeavePolicy.js'; 
import { computePayroll } from '../utils/tax.js';
import { generatePayslipPDF, generatePayslipExcel } from '../utils/payslip.js';
import ExcelJS from 'exceljs';

export async function calculatePayroll(req, res) {
  try {
    const input = req.body;
    const result = computePayroll(input);

    console.log("Payroll calculation result:", result);
    console.log("Input data:", input);
    // If employeeId present, link and persist
    let employeeId = input.employeeId;
    const employeepayroll = await Payroll.findOne({month:input.month,year:input.year,employee:employeeId});
    if(employeepayroll){
      return res.status(400).json({ message: 'Payroll for this employee for the given month and year already exists' });
    }
    if (employeeId) {
      await Payroll.create({
        employee: employeeId,
        month: input?.month,
        year: input?.year,
        input_snapshot: input,
        ...result,
      });
    }

    res.json(result);
  } catch (error) {
    console.error("Calculate payroll error:", error);
    res.status(500).json({ message: 'Failed to calculate payroll' });
  }
}

export async function downloadPayslipPDF(req, res) {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Get latest payroll calculation for this employee
    const payroll = await Payroll.findOne({ employee: employeeId }).sort({ createdAt: -1 });
    if (!payroll) {
      return res.status(404).json({ message: 'No payroll calculation found for this employee' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${employee.name || 'employee'}-${new Date().toISOString().split('T')[0]}.pdf"`);

    // generatePayslipPDF writes directly to response
    await generatePayslipPDF(res, employee, payroll);
  } catch (error) {
    console.error("Download PDF error:", error);
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
}

export async function downloadPayslipExcel(req, res) {
  try {
    const { employeeId } = req.params;
    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Get latest payroll calculation for this employee
    const payroll = await Payroll.findOne({ employee: employeeId }).sort({ createdAt: -1 });
    if (!payroll) {
      return res.status(404).json({ message: 'No payroll calculation found for this employee' });
    }

    const workbook = new ExcelJS.Workbook();
    await generatePayslipExcel(workbook, employee, payroll);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payslip-${employee.name || 'employee'}-${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Download Excel error:", error);
    res.status(500).json({ message: 'Failed to generate Excel file' });
  }
}

export async function getPayrollHistory(req, res) {
  try {
    const { employeeId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    
    const payrollHistory = await Payroll.find({ employee: employeeId })
      .populate('employee', 'name email employeeId')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payroll.countDocuments({ employee: employeeId });

    res.json({
      payrollHistory,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error("Get payroll history error:", error);
    res.status(500).json({ message: 'Failed to fetch payroll history' });
  }
}

export async function generatePayrollReport(req, res) {
  try {
    const { companyId } = req.params;
    const { month, year } = req.query;
    
    // Build date filter
    const dateFilter = {};
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      dateFilter.createdAt = { $gte: startDate, $lte: endDate };
    }

    // Get all employees for the company
    const employees = await Employee.find({ company: companyId });
    const employeeIds = employees.map(emp => emp._id);

    // Get payroll data for all employees
    const payrollData = await Payroll.find({
      employee: { $in: employeeIds },
      ...dateFilter
    }).populate('employee', 'name email employeeId department');

    // Create Excel report
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Payroll Report');

    // Add headers
    worksheet.addRow([
      'Employee Name',
      'Employee ID',
      'Department',
      'Gross Salary',
      'PF Employee',
      'ESI Employee',
      'Tax (Old Regime)',
      'Tax (New Regime)',
      'Net Take Home',
      'Recommendation',
      'Generated Date'
    ]);

    // Style headers
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };

    // Add data rows
    payrollData.forEach(payroll => {
      worksheet.addRow([
        payroll.employee.name || 'N/A',
        payroll.employee.employeeId || 'N/A',
        payroll.employee.department || 'N/A',
        payroll.gross_salary,
        payroll.pf_employee,
        payroll.esic.employee,
        payroll.total_tax_old,
        payroll.total_tax_new,
        payroll.net_take_home,
        payroll.recommendation,
        new Date(payroll.createdAt).toLocaleDateString('en-IN')
      ]);
    });

    // Auto-fit columns
    worksheet.columns.forEach(column => {
      column.width = 15;
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-report-${month || 'all'}-${year || new Date().getFullYear()}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Generate payroll report error:", error);
    res.status(500).json({ message: 'Failed to generate payroll report' });
  }
}




// Calculate monthly salary based on attendance
export const getMonthlySalary = async (req, res) => {
  try {
    const { employeeId, year, month } = req.params;
    
    // Find employee with employment details
    const employee = await Employee.findById(employeeId).populate('company').populate('user', 'profile email');
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    // Get leave policy for the company
    const leavePolicy = await LeavePolicy.findOne({
      company: employee.company._id
    });
    
    if (!leavePolicy) {
      return res.status(404).json({ message: 'Leave policy not found for this company' });
    }
    
    // Calculate days in the requested month
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month - 1, daysInMonth);
    
    // Get all attendance records for the month
    const attendanceRecords = await Attendance.find({
      employee: employee._id,
      date: {
        $gte: monthStart,
        $lte: monthEnd
      }
    }).sort({ date: 1 });
    
    // Get base salary
    const baseSalary = employee.employmentDetails.salary?.base || 0;
    

    
    // Initialize counters
    let presentDays = 0;
    let absentDays = 0;
    let holidayDays = 0;
    let weekOffDays = 0;
    let halfDays = 0;
    
    // Create a map of attendance records by date for easy lookup
    const attendanceByDate = {};
    attendanceRecords.forEach(record => {
      const dateStr = record.date.toISOString().split('T')[0];
      attendanceByDate[dateStr] = record;
    });
    
    // Iterate through each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month - 1, day);
      const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
      const dateStr = currentDate.toISOString().split('T')[0];
      
      // Check if it's a holiday
      const isHoliday = leavePolicy.holidays.some(holiday => {
        const holidayDate = new Date(holiday.date);
        return holidayDate.getDate() === day && 
               holidayDate.getMonth() === (month - 1) && 
               holidayDate.getFullYear() === parseInt(year);
      });
      
      // Check if it's a week off
      const isWeekOff = leavePolicy.weekOff.includes(dayOfWeek);
      
      // Get attendance record for this day
      const attendance = attendanceByDate[dateStr];
      
      if (isHoliday) {
        holidayDays++;
      } else if (isWeekOff) {
        weekOffDays++;
      } else if (attendance) {
        switch (attendance.status) {
          case 'present':
            presentDays++;
            break;
          case 'half_day':
            halfDays++;
            break;
          case 'absent':
            absentDays++;
            break;
          case 'holiday':
            holidayDays++;
            break;
          case 'week_off':
            weekOffDays++;
            break;
          default:
            absentDays++;
        }
      } else {
        // No attendance record found, count as absent
        absentDays++;
      }
    }
    const perDaySalary = baseSalary / (daysInMonth-holidayDays-weekOffDays);
    const perHalfDaySalary = perDaySalary / 2;
    
    // Calculate amounts for each category
    const presentAmount = presentDays * perDaySalary;
    const weekOffAmount = weekOffDays * perDaySalary;
    const holidayAmount = holidayDays * perDaySalary;
    const halfDayAmount = halfDays * perHalfDaySalary;
    
    // Calculate total payable days and final salary
    const totalPayableDays = presentDays + weekOffDays + holidayDays + (halfDays * 0.5);
    const finalSalary = presentAmount + weekOffAmount + holidayAmount + halfDayAmount;
    
    // Prepare detailed response
    const salaryBreakdown = {
      baseSalary,
      perDaySalary: parseFloat(perDaySalary.toFixed(2)),
      perHalfDaySalary: parseFloat(perHalfDaySalary.toFixed(2)),
      daysInMonth,
      presentDays: {
        count: presentDays,
        amount: parseFloat(presentAmount.toFixed(2))
      },
      absentDays: {
        count: absentDays,
        amount: 0
      },
      holidayDays: {
        count: holidayDays,
        amount: parseFloat(holidayAmount.toFixed(2))
      },
      weekOffDays: {
        count: weekOffDays,
        amount: parseFloat(weekOffAmount.toFixed(2))
      },
      halfDays: {
        count: halfDays,
        amount: parseFloat(halfDayAmount.toFixed(2))
      },
      totalPayableDays: parseFloat(totalPayableDays.toFixed(2)),
      finalSalary: parseFloat(finalSalary.toFixed(2)),
      month: parseInt(month),
      year: parseInt(year),
      employee: {
        id: employee._id,
        employeeId: employee.employmentDetails.employeeId,
        name: `${employee.user?.profile?.firstName || ''} ${employee.user?.profile?.lastName || ''}`.trim()
      },
      breakdown: [
        {
          type: 'Present Days',
          days: presentDays,
          rate: parseFloat(perDaySalary.toFixed(2)),
          amount: parseFloat(presentAmount.toFixed(2))
        },
        {
          type: 'Week Off Days',
          days: weekOffDays,
          rate: parseFloat(perDaySalary.toFixed(2)),
          amount: parseFloat(weekOffAmount.toFixed(2))
        },
        {
          type: 'Holidays',
          days: holidayDays,
          rate: parseFloat(perDaySalary.toFixed(2)),
          amount: parseFloat(holidayAmount.toFixed(2))
        },
        {
          type: 'Half Days',
          days: halfDays,
          rate: parseFloat(perHalfDaySalary.toFixed(2)),
          amount: parseFloat(halfDayAmount.toFixed(2))
        }
      ]
    };
    
    res.status(200).json({
      success: true,
      data: salaryBreakdown
    });
    
  } catch (error) {
    console.error('Error calculating monthly salary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate monthly salary',
      error: error.message
    });
  }
};

// Get salary history for an employee
export const getSalaryHistory = async (req, res) => {
  try {
    const { employeeId } = req.params;
    
    // Find employee
    const employee = await Employee.findOne({
      'employmentDetails.employeeId': employeeId
    });
    
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    // In a real application, you might want to store calculated salaries
    // For now, we'll return the employment details with salary information
    res.status(200).json({
      success: true,
      data: {
        employeeId: employee.employmentDetails.employeeId,
        baseSalary: employee.employmentDetails.salary?.base || 0,
        employmentType: employee.employmentDetails.employmentType,
        joiningDate: employee.employmentDetails.joiningDate,
        salaryComponents: {
          base: employee.employmentDetails.salary?.base || 0,
          da: employee.employmentDetails.da || 0,
          hra: employee.employmentDetails.hra_received || 0,
          otherAllowances: employee.employmentDetails.other_allowances || 0,
          otherIncome: employee.employmentDetails.other_income || 0,
          deductions: employee.employmentDetails.deductions || {}
        }
      }
    });
    
  } catch (error) {
    console.error('Error fetching salary history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch salary history',
      error: error.message
    });
  }
};
