import Attendance from '../models/Attendance.js';
import Company from '../models/Company.js';
import Department from '../models/Department.js';
import Employee from '../models/Employee.js';
import Shifts from '../models/Shifts.js';
import User from '../models/User.js';

// Helper function to calculate time difference in minutes
function calculateTimeDifference(startTime, endTime) {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  
  let totalMinutes = (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // Handle overnight shifts
  
  return totalMinutes;
}

// Helper function to calculate all attendance metrics
async function calculateAttendanceMetrics(attendance, shiftDetails = null) {
  const metrics = {
    totalHours: 0,
    overtime: 0,
    lateMinutes: 0,
    earlyDepartureMinutes: 0,
    status: 'absent',
    regularized: false
  };

  if (!attendance.inTime || !attendance.outTime) {
    return metrics;
  }

  // Calculate total hours
  const totalMinutes = calculateTimeDifference(attendance.inTime, attendance.outTime);
  metrics.totalHours = parseFloat((totalMinutes / 60).toFixed(2));

  if (shiftDetails) {
    const [shiftStartHours, shiftStartMinutes] = shiftDetails.startTime.split(':').map(Number);
    const [shiftEndHours, shiftEndMinutes] = shiftDetails.endTime.split(':').map(Number);
    const [inHours, inMinutes] = attendance.inTime.split(':').map(Number);
    const [outHours, outMinutes] = attendance.outTime.split(':').map(Number);

    const shiftStartTotalMinutes = shiftStartHours * 60 + shiftStartMinutes;
    const shiftEndTotalMinutes = shiftEndHours * 60 + shiftEndMinutes;
    const inTotalMinutes = inHours * 60 + inMinutes;
    const outTotalMinutes = outHours * 60 + outMinutes;

    // Calculate late minutes
    if (inTotalMinutes > shiftStartTotalMinutes + shiftDetails.gracePeriod) {
      metrics.lateMinutes = inTotalMinutes - shiftStartTotalMinutes;
    }

    // Calculate early departure minutes
    if (outTotalMinutes < shiftEndTotalMinutes - shiftDetails.gracePeriod) {
      metrics.earlyDepartureMinutes = shiftEndTotalMinutes - outTotalMinutes;
    }

    // Calculate overtime
    const shiftDuration = shiftEndTotalMinutes - shiftStartTotalMinutes;
    if (totalMinutes > shiftDuration) {
      metrics.overtime = parseFloat(((totalMinutes - shiftDuration) / 60).toFixed(2));
    }

    // Determine status
    if (metrics.lateMinutes > 0 && metrics.earlyDepartureMinutes > 0) {
      metrics.status = 'late_early';
    } else if (metrics.lateMinutes > 0) {
      metrics.status = 'late';
    } else if (metrics.earlyDepartureMinutes > 0) {
      metrics.status = 'early_departure';
    } else if (totalMinutes >= shiftDetails?.halfDayThreshold * 60) {
      metrics.status = 'present';
    } else if (totalMinutes > 0) {
      metrics.status = 'half_day';
    }
  } else {
    // If no shift details, use basic status calculation
    metrics.status = metrics.totalHours >= 4 ? 'present' : 'half_day';
  }

  return metrics;
}

// Get all attendance records with comprehensive calculations
export const getAttendances = async (req, res) => {
  try {
    const { companyId, employeeId, startDate, endDate, status, departmentId, calculateStats = false } = req.query;
    
    let filter = {};
    if (companyId) filter.company = companyId;
    if (employeeId) filter.employee = employeeId;
    if (status) filter.status = status;
    if (departmentId) {
      const employeesInDept = await Employee.find({ 
        "employmentDetails.department": departmentId 
      }).select('_id');
      filter.employee = { $in: employeesInDept.map(emp => emp._id) };
    }
    
    if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    const attendances = await Attendance.find(filter)
      .populate({
        path: 'employee',
        populate: [
          { path: 'user', select: 'profile email' },
          { path: 'employmentDetails.department', select: 'name' }
        ]
      })
      .populate('company', 'name email')
      .populate('shift', 'name startTime endTime gracePeriod halfDayThreshold overtimeThreshold')
      .populate('regularizationRequest')
      .sort({ date: -1 });

    // Calculate comprehensive statistics if requested
    let statistics = null;
    if (calculateStats === 'true') {
      statistics = await calculateAttendanceStatistics(filter);
    }
    
    res.json({
      attendances,
      statistics,
      totalRecords: attendances.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Calculate comprehensive attendance statistics
async function calculateAttendanceStatistics(filter) {
  const attendances = await Attendance.find(filter)
    .populate('shift', 'startTime endTime gracePeriod halfDayThreshold overtimeThreshold');

  const stats = {
    totalRecords: attendances.length,
    present: 0,
    absent: 0,
    late: 0,
    halfDay: 0,
    earlyDeparture: 0,
    overtime: 0,
    totalWorkingHours: 0,
    averageWorkingHours: 0,
    totalOvertime: 0,
    totalLateMinutes: 0,
    totalEarlyDepartureMinutes: 0
  };

  attendances.forEach(attendance => {
    stats[attendance.status] = (stats[attendance.status] || 0) + 1;
    stats.totalWorkingHours += attendance.totalHours || 0;
    stats.totalOvertime += attendance.overtime || 0;
    stats.totalLateMinutes += attendance.lateMinutes || 0;
    stats.totalEarlyDepartureMinutes += attendance.earlyDepartureMinutes || 0;
  });

  stats.averageWorkingHours = stats.totalRecords > 0 ? 
    parseFloat((stats.totalWorkingHours / stats.totalRecords).toFixed(2)) : 0;

  return stats;
}

// Get a single attendance record with detailed calculations
export const getAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id)
      .populate('employee', 'firstName lastName employeeId department designation employmentDetails')
      .populate('company', 'name code')
      .populate('shift', 'name startTime endTime gracePeriod halfDayThreshold overtimeThreshold breakTime')
      .populate('regularizationRequest');

    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    // Recalculate metrics for accuracy
    const shiftDetails = attendance.shift;
    const metrics = await calculateAttendanceMetrics(attendance, shiftDetails);
    
    const detailedAttendance = {
      ...attendance.toObject(),
      calculatedMetrics: metrics
    };
    
    res.json(detailedAttendance);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Create a new attendance record with comprehensive calculations
export const createAttendance = async (req, res) => {
  try {
    const { inTime, outTime, employee, company, date, shift, notes, status } = req.body;
    
   
    // Check if employee exists
    const employeeExists = await Employee.findById(employee);
    if (!employeeExists) {
      return res.status(404).json({ message: 'Employee not found' });
    }
    
    // Check if company exists
    const companyExists = await Company.findById(company);
    if (!companyExists) {
      return res.status(404).json({ message: 'Company not found' });
    }
    
    // Check if shift exists (if provided)
    let shiftDetails = null;
    if (shift) {
      shiftDetails = await Shifts.findOne({ _id: shift, company: company });
      if (!shiftDetails) {
        return res.status(404).json({ message: 'Shift not found' });
      }
    } else if (employeeExists?.employmentDetails?.shift) {
      shiftDetails = await Shifts.findById(employeeExists?.employmentDetails?.shift);
    }
    
    // Check if attendance already exists for this date and employee
    const existingAttendance = await Attendance.findOne({
      employee,
      date: new Date(date)
    });
    
    if (existingAttendance) {
      return res.status(400).json({ message: 'Attendance record already exists for this date' });
    }
    
    const attendance = new Attendance({
      employee,
      company,
      date: new Date(date),
      shift: shift || employeeExists.shift,
      inTime,
      outTime,
      status: status || 'absent',
      notes
    });

  
    
    // Calculate all metrics if both inTime and outTime are provided
    if (inTime && outTime) {
      const metrics = await calculateAttendanceMetrics({ inTime, outTime }, shiftDetails);
      
      attendance.totalHours = metrics.totalHours;
      attendance.overtime = metrics.overtime;
      attendance.lateMinutes = metrics.lateMinutes;
      attendance.earlyDepartureMinutes = metrics.earlyDepartureMinutes;
      attendance.status = metrics.status;
    } 
    // else  {
    //   attendance.status = 'absent';
    // }
    
    const newAttendance = await attendance.save();
 
    // Populate the response
    const populatedAttendance = await Attendance.findById(newAttendance._id)
      .populate({
        path: 'employee',
        populate: {
          path: 'user', select: 'profile email'
        }
      })
      .populate('company', 'name email')
      .populate('shift', 'name startTime endTime gracePeriod halfDayThreshold overtimeThreshold');
    
    res.status(201).json(populatedAttendance);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Bulk create attendance records with calculations
export const bulkCreateAttendance = async (req, res) => {
  try {
    const { attendances, company } = req.body;

    if (!Array.isArray(attendances) || attendances.length === 0) {
      return res.status(400).json({ message: 'No attendance data provided' });
    }

    // Check if company exists
    const companyExists = await Company.findById(company);
    if (!companyExists) {
      return res.status(404).json({ message: 'Company not found' });
    }

    let results = [];
    for (const record of attendances) {
      const { employee, date, shift, notes, status, inTime, outTime } = record;

      // Validate employee
      const employeeExists = await Employee.findById(employee);
      if (!employeeExists) {
        results.push({ employee, success: false, message: 'Employee not found' });
        continue;
      }

      // Validate shift if provided
      let shiftDetails = null;
      if (shift) {
        shiftDetails = await Shifts.findOne({ _id: shift, company });
        if (!shiftDetails) {
          results.push({ employee, success: false, message: 'Shift not found' });
          continue;
        }
      } else if (employeeExists?.employmentDetails?.shift) {
        shiftDetails = await Shifts.findById(employeeExists.employmentDetails.shift);
      }

      // Check for existing attendance
      const existingAttendance = await Attendance.findOne({
        employee,
        date: new Date(date)
      });

      if (existingAttendance) {
        results.push({ employee, success: false, message: 'Attendance already exists' });
        continue;
      }

      const attendance = new Attendance({
        employee,
        company,
        date: new Date(date),
        shift: shift || employeeExists.shift,
        status: status || 'absent',
        inTime,
        outTime,
        notes
      });

      // Calculate metrics if times are provided
      if (inTime && outTime) {
        const metrics = await calculateAttendanceMetrics({ inTime, outTime }, shiftDetails);
        attendance.totalHours = metrics.totalHours;
        attendance.overtime = metrics.overtime;
        attendance.lateMinutes = metrics.lateMinutes;
        attendance.earlyDepartureMinutes = metrics.earlyDepartureMinutes;
        attendance.status = metrics.status;
      }

      const saved = await attendance.save();
      results.push({ employee, success: true, attendanceId: saved._id });
    }

    return res.status(201).json({
      message: 'Bulk attendance process completed',
      results
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update attendance record with recalculated metrics
export const updateAttendance = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req?.user?._id;
    const { status, notes, shift, date, inTime, outTime } = req.body;

    // Verify if user has permission
    const currentUser = await User.findById(userId);

    

    const attendance = await Attendance.findById(id).populate('shift');
    if (!attendance) {
      return res.status(404).json({ message: "Attendance record not found" });
    }
if(attendance?.status != 'present')
    if (!currentUser || !["admin", "superadmin"].includes(currentUser?.role)) {
      return res.status(403).json({
        message: "Access denied. Only Admin or Superadmin can update attendance."
      });
    }

    // Update basic fields
    if (status) attendance.status = status;
    if (notes !== undefined) attendance.notes = notes;
    if (shift) attendance.shift = shift;
    if (date) attendance.date = new Date(date);
    if (inTime !== undefined) attendance.inTime = inTime;
    if (outTime !== undefined) attendance.outTime = outTime;

    // Recalculate all metrics if times are modified
    if ((inTime !== undefined || outTime !== undefined) && attendance.inTime && attendance.outTime) {
      const shiftDetails = attendance.shift;
      const metrics = await calculateAttendanceMetrics(attendance, shiftDetails);
      
      attendance.totalHours = metrics.totalHours;
      attendance.overtime = metrics.overtime;
      attendance.lateMinutes = metrics.lateMinutes;
      attendance.earlyDepartureMinutes = metrics.earlyDepartureMinutes;
      
      // Only update status if not explicitly set in request
      if (!status) {
        attendance.status = metrics.status;
      }
    }

    const updatedAttendance = await attendance.save();

    const populatedAttendance = await Attendance.findById(updatedAttendance._id)
      .populate({ path: "employee", populate: { path: "user", select: "profile email" } })
      .populate("company", "name email")
      .populate("shift", "name startTime endTime gracePeriod halfDayThreshold overtimeThreshold");

    return res.status(200).json({
      message: "Attendance updated successfully",
      attendance: populatedAttendance,
    });
  } catch (error) {
    console.error("[UPDATE_ATTENDANCE_ERROR]", error);
    return res.status(500).json({ message: error.message });
  }
};

// Get employee attendance summary
export const getEmployeeAttendanceSummary = async (req, res) => {
  try {
    const { employeeId, startDate, endDate } = req.query;

    if (!employeeId || !startDate || !endDate) {
      return res.status(400).json({ 
        message: "Employee ID, start date, and end date are required" 
      });
    }

    const filter = {
      employee: employeeId,
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    const attendances = await Attendance.find(filter)
      .populate('shift', 'name startTime endTime')
      .sort({ date: 1 });

    const summary = {
      employee: employeeId,
      period: { startDate, endDate },
      totalDays: attendances.length,
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      earlyDeparture: 0,
      totalWorkingHours: 0,
      totalOvertime: 0,
      totalLateMinutes: 0,
      totalEarlyDepartureMinutes: 0,
      averageWorkingHours: 0,
      attendanceRate: 0,
      detailedRecords: []
    };

    attendances.forEach(attendance => {
      summary[attendance.status] = (summary[attendance.status] || 0) + 1;
      summary.totalWorkingHours += attendance.totalHours || 0;
      summary.totalOvertime += attendance.overtime || 0;
      summary.totalLateMinutes += attendance.lateMinutes || 0;
      summary.totalEarlyDepartureMinutes += attendance.earlyDepartureMinutes || 0;
      
      summary.detailedRecords.push({
        date: attendance.date,
        status: attendance.status,
        totalHours: attendance.totalHours,
        overtime: attendance.overtime,
        lateMinutes: attendance.lateMinutes,
        earlyDepartureMinutes: attendance.earlyDepartureMinutes
      });
    });

    summary.averageWorkingHours = summary.totalDays > 0 ? 
      parseFloat((summary.totalWorkingHours / summary.totalDays).toFixed(2)) : 0;
    
    summary.attendanceRate = summary.totalDays > 0 ? 
      parseFloat(((summary.present + summary.halfDay * 0.5) / summary.totalDays * 100).toFixed(2)) : 0;

    // Get employee details
    const employee = await Employee.findById(employeeId)
      .populate('user', 'profile email')
      .populate('employmentDetails.department', 'name');

    res.json({
      employee,
      summary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get department attendance summary
export const getDepartmentAttendanceSummary = async (req, res) => {
  try {
    const { departmentId, startDate, endDate } = req.query;

    if (!departmentId || !startDate || !endDate) {
      return res.status(400).json({ 
        message: "Department ID, start date, and end date are required" 
      });
    }

    // Get all employees in the department
    const employees = await Employee.find({ 
      "employmentDetails.department": departmentId,
      isActive: true 
    }).select('_id');

    const employeeIds = employees.map(emp => emp._id);

    const attendances = await Attendance.find({
      employee: { $in: employeeIds },
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).populate('employee', 'firstName lastName employeeId');

    // Calculate department summary
    const departmentSummary = {
      departmentId,
      period: { startDate, endDate },
      totalEmployees: employeeIds.length,
      totalAttendanceRecords: attendances.length,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      halfDayCount: 0,
      totalWorkingHours: 0,
      totalOvertime: 0,
      averageAttendanceRate: 0
    };

    const employeeStats = {};

    // Initialize employee stats
    employeeIds.forEach(empId => {
      employeeStats[empId] = {
        present: 0,
        totalRecords: 0,
        workingHours: 0
      };
    });

    // Calculate stats
    attendances.forEach(attendance => {
      const empId = attendance.employee._id.toString();
      
      if (!employeeStats[empId]) {
        employeeStats[empId] = { present: 0, totalRecords: 0, workingHours: 0 };
      }

      employeeStats[empId].totalRecords++;
      departmentSummary[attendance.status + 'Count'] = 
        (departmentSummary[attendance.status + 'Count'] || 0) + 1;

      if (attendance.status === 'present' || attendance.status === 'half_day') {
        employeeStats[empId].present++;
        if (attendance.status === 'present') {
          departmentSummary.presentCount++;
        } else {
          departmentSummary.halfDayCount++;
        }
      }

      departmentSummary.totalWorkingHours += attendance.totalHours || 0;
      departmentSummary.totalOvertime += attendance.overtime || 0;
    });

    // Calculate average attendance rate
    let totalAttendanceRate = 0;
    Object.values(employeeStats).forEach(stat => {
      if (stat.totalRecords > 0) {
        totalAttendanceRate += (stat.present / stat.totalRecords) * 100;
      }
    });

    departmentSummary.averageAttendanceRate = employeeIds.length > 0 ?
      parseFloat((totalAttendanceRate / employeeIds.length).toFixed(2)) : 0;

    res.json({
      departmentSummary,
      period: { startDate, endDate }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete an attendance record
export const deleteAttendance = async (req, res) => {
  try {
    const attendance = await Attendance.findById(req.params.id);
    if (!attendance) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }
    
    await Attendance.findByIdAndDelete(req.params.id);
    res.json({ message: 'Attendance record deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get employees under HR or Manager (existing function)
export const getEmployeesUnderHRorManager = async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const employee = await Employee.findOne({ user: userId });
    if (!employee) {
      return res.status(404).json({ message: "Employee not found for this user" });
    }

    const department = await Department.findOne({
      $or: [{ hr: employee._id }, { manager: employee._id }],
    });
    if (!department) {
      return res.status(404).json({ message: "No department found for this HR/Manager" });
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [employees, total] = await Promise.all([
      Employee.find({
        "employmentDetails.department": department._id,
        isActive: true,
      })
       .populate({
          path: "employmentDetails.department",
        })
        .populate({
          path: "user",
          select: "email profile role",
        })
        .skip(skip)
        .limit(Number(limit)),

      Employee.countDocuments({
        "employmentDetails.department": department._id,
        isActive: true,
      }),
    ]);

    return res.status(200).json({
      message: "Employees fetched successfully",
      department: {
        id: department._id,
        name: department.name,
      },
      page: Number(page),
      limit: Number(limit),
      totalEmployees: total,
      totalPages: Math.ceil(total / limit),
      employees,
    });
  } catch (error) {
    console.error("[GET_EMPLOYEES_UNDER_HR_MANAGER_ERROR]", error);
    return res.status(500).json({
      message: "Internal server error while fetching employees",
      error: error.message,
    });
  }
};

// Get attendance by date (existing function)
export const getAttendanceByDate = async (req, res) => {
  try {
    const { date, startDate, endDate, companyId, page = 1, limit = 10 } = req.query;
    const { userId } = req.params; // logged-in HR/Manager's userId

    let filter = {};

    // 🏢 Company filter
    if (companyId) filter.company = companyId;

    // 📅 Date filter
    if (date) {
      const startOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setUTCHours(23, 59, 59, 999);

      filter.date = { $gte: startOfDay, $lte: endOfDay };
    } else if (startDate && endDate) {
      filter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    // 👤 Verify user & role
    const currentEmployee = await Employee.findOne({ user: userId })
      .populate("user", "role")
      .populate("company", "name");

    if (!currentEmployee) {
      return res.status(403).json({ message: "Not an employee of this company" });
    }

    // 🧠 Role-based access
    if (currentEmployee.user.role === "hr") {
      // HR can see all employees in their company
      filter.company = currentEmployee.company._id;
    } else if (currentEmployee.user.role === "manager") {
      // Manager can see all employees in their company (customize later for team)
      filter.company = currentEmployee.company._id;
      // Optionally: filter.employee = { $in: managerTeamEmployeeIds }
    } else {
      return res
        .status(403)
        .json({ message: "Access denied. Only HR or Manager can view this." });
    }

    // 🧾 Pagination
    const skip = (Number(page) - 1) * Number(limit);

  

    // 📦 Fetch attendance records
    const [attendances, total] = await Promise.all([
      Attendance.find(filter)
        .populate({
          path: "employee",
          populate: { path: "user", select: "profile email" },
        })
        .populate("company", "name email")
        .populate("shift", "name startTime endTime")
        .populate("regularizationRequest")
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Attendance.countDocuments(filter),
    ]);

    // 📤 Response
    return res.status(200).json({
      message: "Attendances fetched successfully",
      page: Number(page),
      limit: Number(limit),
      totalRecords: total,
      totalPages: Math.ceil(total / limit),
      attendances,
    });
  } catch (error) {
    console.error("[GET_ATTENDANCE_BY_DATE_ERROR]", error);
    res.status(500).json({ message: error.message });
  }
};



// Bulk update attendance (existing function)
export const bulkUpdateAttendance = async (req, res) => {
  try {
    const userId = req?.user?._id;
    const { updates } = req.body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }

    const currentUser = await User.findById(userId);
    if (!currentUser || !["hr", "admin", "superadmin","manager"].includes(currentUser?.role)) {
      return res.status(403).json({
        message: "Access denied. Only HR, Manager, Admin or Superadmin can update attendance."
      });
    }

    let results = [];
    for (const record of updates) {
      const { attendanceId, status, notes, shift, date, inTime, outTime } = record;

      const attendance = await Attendance.findById(attendanceId).populate('shift');
      if (!attendance) {
        results.push({ attendanceId, success: false, message: "Attendance not found" });
        continue;
      }

      // Update fields
      if (status) attendance.status = status;
      if (notes !== undefined) attendance.notes = notes;
      if (shift) attendance.shift = shift;
      if (date) attendance.date = new Date(date);
      if (inTime !== undefined) attendance.inTime = inTime;
      if (outTime !== undefined) attendance.outTime = outTime;

      // Recalculate metrics if times are modified
      if ((inTime !== undefined || outTime !== undefined) && attendance.inTime && attendance.outTime) {
        const shiftDetails = attendance.shift;
        const metrics = await calculateAttendanceMetrics(attendance, shiftDetails);
        
        attendance.totalHours = metrics.totalHours;
        attendance.overtime = metrics.overtime;
        attendance.lateMinutes = metrics.lateMinutes;
        attendance.earlyDepartureMinutes = metrics.earlyDepartureMinutes;
        
        if (!status) {
          attendance.status = metrics.status;
        }
      }

      await attendance.save();
      results.push({ attendanceId, success: true, message: "Updated successfully" });
    }

    return res.status(200).json({
      message: "Bulk update process completed",
      results,
    });
  } catch (error) {
    console.error("[BULK_UPDATE_ATTENDANCE_ERROR]", error);
    return res.status(500).json({ message: error.message });
  }
};

// Get attendance records for a single employee within a date range
export const getEmployeeAttendanceByDateRange = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, page = 1, limit = 50, includeMetrics = false } = req.query;

    // Validate required parameters
    if (!employeeId || !startDate || !endDate) {
      return res.status(400).json({ 
        message: "Employee ID, start date, and end date are required" 
      });
    }

    // Validate date format and range
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ 
        message: "Invalid date format. Please use YYYY-MM-DD format" 
      });
    }

    if (start > end) {
      return res.status(400).json({ 
        message: "Start date cannot be after end date" 
      });
    }

    // Check if employee exists and is active
    const employee = await Employee.findById(employeeId)
      .populate('user', 'profile email')
      .populate('employmentDetails.department', 'name')
      .populate('employmentDetails.shift', 'name startTime endTime gracePeriod halfDayThreshold');

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (!employee.isActive) {
      return res.status(400).json({ message: "Employee is not active" });
    }

    // Build filter
    const filter = {
      employee: employeeId,
      date: {
        $gte: start,
        $lte: end
      }
    };

    // Calculate pagination
    const skip = (Number(page) - 1) * Number(limit);

    // Get total count and attendance records
    const [total, attendances] = await Promise.all([
      Attendance.countDocuments(filter),
      Attendance.find(filter)
        .populate('shift', 'name startTime endTime gracePeriod halfDayThreshold overtimeThreshold')
        .populate('regularizationRequest', 'status reason')
        .sort({ date: -1 })
        .skip(skip)
        .limit(Number(limit))
    ]);

    // Calculate summary statistics
    const summary = {
      totalRecords: total,
      present: 0,
      absent: 0,
      late: 0,
      halfDay: 0,
      earlyDeparture: 0,
      lateEarly: 0,
      totalWorkingHours: 0,
      totalOvertime: 0,
      totalLateMinutes: 0,
      totalEarlyDepartureMinutes: 0,
      averageWorkingHours: 0,
      attendanceRate: 0
    };

    // Calculate detailed metrics if requested
    let detailedRecords = [];
    
    attendances.forEach(attendance => {
      // Count statuses
      summary[attendance.status] = (summary[attendance.status] || 0) + 1;
      
      // Sum up metrics
      summary.totalWorkingHours += attendance.totalHours || 0;
      summary.totalOvertime += attendance.overtime || 0;
      summary.totalLateMinutes += attendance.lateMinutes || 0;
      summary.totalEarlyDepartureMinutes += attendance.earlyDepartureMinutes || 0;

      // Prepare detailed record
      const record = {
        _id: attendance._id,
        date: attendance.date,
        inTime: attendance.inTime,
        outTime: attendance.outTime,
        status: attendance.status,
        totalHours: attendance.totalHours,
        overtime: attendance.overtime,
        lateMinutes: attendance.lateMinutes,
        earlyDepartureMinutes: attendance.earlyDepartureMinutes,
        notes: attendance.notes,
        shift: attendance.shift,
        regularizationRequest: attendance.regularizationRequest
      };

      // Add calculated metrics if requested
      if (includeMetrics === 'true') {
        record.calculatedMetrics = {
          totalHours: attendance.totalHours,
          overtime: attendance.overtime,
          lateMinutes: attendance.lateMinutes,
          earlyDepartureMinutes: attendance.earlyDepartureMinutes,
          status: attendance.status
        };
      }

      detailedRecords.push(record);
    });

    // Calculate derived statistics
    summary.averageWorkingHours = summary.totalRecords > 0 ? 
      parseFloat((summary.totalWorkingHours / summary.totalRecords).toFixed(2)) : 0;
    
    // Attendance rate: present = 1, half_day = 0.5, others = 0
    const effectiveDays = summary.present + (summary.halfDay * 0.5);
    summary.attendanceRate = summary.totalRecords > 0 ? 
      parseFloat((effectiveDays / summary.totalRecords * 100).toFixed(2)) : 0;

    // Calculate working days in the period (excluding weekends - you can customize this)
    const workingDays = calculateWorkingDays(start, end);
    summary.workingDaysInPeriod = workingDays;
    summary.expectedAttendanceRate = summary.totalRecords > 0 ?
      parseFloat((summary.totalRecords / workingDays * 100).toFixed(2)) : 0;

    // Prepare response
    const response = {
      employee: {
        _id: employee._id,
        employeeId: employee.employeeId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        designation: employee.designation,
        department: employee.employmentDetails.department,
        shift: employee.employmentDetails.shift,
        user: employee.user
      },
      period: {
        startDate: start,
        endDate: end,
        totalDays: Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1,
        workingDays: workingDays
      },
      summary,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        totalRecords: total,
        totalPages: Math.ceil(total / limit)
      },
      records: detailedRecords
    };

    res.json({
      success: true,
      message: `Attendance records retrieved successfully for ${employee.firstName} ${employee.lastName}`,
      data: response
    });

  } catch (error) {
    console.error('[GET_EMPLOYEE_ATTENDANCE_BY_DATE_RANGE_ERROR]', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve attendance records',
      error: error.message 
    });
  }
};

// Helper function to calculate working days (excluding weekends)
function calculateWorkingDays(startDate, endDate) {
  let count = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Skip Saturday (6) and Sunday (0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

// Alternative version with more detailed analytics
export const getEmployeeAttendanceAnalytics = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { startDate, endDate, groupBy = 'day' } = req.query;

    if (!employeeId || !startDate || !endDate) {
      return res.status(400).json({ 
        message: "Employee ID, start date, and end date are required" 
      });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    const attendances = await Attendance.find({
      employee: employeeId,
      date: { $gte: start, $lte: end }
    })
    .populate('shift', 'name startTime endTime')
    .sort({ date: 1 });

    // Group by time period
    const groupedData = groupAttendanceByPeriod(attendances, groupBy);

    // Calculate trends
    const trends = calculateAttendanceTrends(attendances);

    res.json({
      success: true,
      employee: await Employee.findById(employeeId).select('firstName lastName employeeId designation'),
      period: { startDate: start, endDate: end },
      analytics: {
        groupedData,
        trends,
        summary: {
          totalDays: attendances.length,
          presentDays: attendances.filter(a => a.status === 'present').length,
          absentDays: attendances.filter(a => a.status === 'absent').length,
          lateDays: attendances.filter(a => a.status === 'late').length,
          averageHours: attendances.reduce((sum, a) => sum + (a.totalHours || 0), 0) / attendances.length || 0
        }
      }
    });

  } catch (error) {
    console.error('[GET_EMPLOYEE_ATTENDANCE_ANALYTICS_ERROR]', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to retrieve attendance analytics',
      error: error.message 
    });
  }
};

// Helper function to group attendance by time period
function groupAttendanceByPeriod(attendances, period) {
  const grouped = {};

  attendances.forEach(attendance => {
    let key;
    const date = new Date(attendance.date);

    switch (period) {
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        break;
      case 'month':
        key = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        break;
      default: // day
        key = date.toISOString().split('T')[0];
    }

    if (!grouped[key]) {
      grouped[key] = {
        period: key,
        records: [],
        totalHours: 0,
        present: 0,
        absent: 0,
        late: 0
      };
    }

    grouped[key].records.push(attendance);
    grouped[key].totalHours += attendance.totalHours || 0;
    grouped[key][attendance.status] = (grouped[key][attendance.status] || 0) + 1;
  });

  return Object.values(grouped);
}

// Helper function to calculate attendance trends
function calculateAttendanceTrends(attendances) {
  if (attendances.length < 2) return {};

  const sorted = attendances.sort((a, b) => new Date(a.date) - new Date(b.date));
  const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
  const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

  const calculateStats = (arr) => ({
    present: arr.filter(a => a.status === 'present').length,
    total: arr.length,
    avgHours: arr.reduce((sum, a) => sum + (a.totalHours || 0), 0) / arr.length || 0
  });

  const firstStats = calculateStats(firstHalf);
  const secondStats = calculateStats(secondHalf);

  return {
    attendanceTrend: ((secondStats.present / secondStats.total) - (firstStats.present / firstStats.total)) * 100,
    hoursTrend: secondStats.avgHours - firstStats.avgHours,
    consistency: calculateConsistency(attendances)
  };
}

// Helper function to calculate attendance consistency
function calculateConsistency(attendances) {
  const presentDays = attendances.filter(a => a.status === 'present').length;
  const totalDays = attendances.length;
  
  return totalDays > 0 ? (presentDays / totalDays) * 100 : 0;
}