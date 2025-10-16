import Attendance from '../models/Attendance.js';
import Employee from '../models/Employee.js';
import LeavePolicy from '../models/LeavePolicy.js';
import Leave from '../models/Leave.js';

/**
 * Service for calculating attendance-based salary components
 */
export class AttendanceCalculationService {
  
  /**
   * Get comprehensive attendance data for payroll calculation
   */
  static async getAttendanceForPayroll(employeeId, month, year) {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      const totalDays = endDate.getDate();
      
      // Get employee and company leave policy
      const employee = await Employee.findById(employeeId).populate('company');
      const leavePolicy = await LeavePolicy.findOne({ company: employee.company._id });
      
      // Get attendance records
      const attendanceRecords = await Attendance.find({
        employee: employeeId,
        date: { $gte: startDate, $lte: endDate }
      }).sort({ date: 1 });
      
      // Get approved leaves for the period
      const approvedLeaves = await Leave.find({
        employee: employeeId,
        status: 'approved',
        $or: [
          { startDate: { $gte: startDate, $lte: endDate } },
          { endDate: { $gte: startDate, $lte: endDate } },
          { 
            startDate: { $lte: startDate }, 
            endDate: { $gte: endDate } 
          }
        ]
      });
      
      // Calculate attendance summary
      const attendanceSummary = this.calculateAttendanceSummary(
        attendanceRecords, 
        approvedLeaves, 
        leavePolicy, 
        startDate, 
        endDate
      );
      
      return {
        period: { month, year, totalDays },
        attendanceRecords,
        approvedLeaves,
        summary: attendanceSummary,
        leavePolicy
      };
      
    } catch (error) {
      console.error('Error getting attendance for payroll:', error);
      throw error;
    }
  }
  
  /**
   * Calculate detailed attendance summary
   */
  static calculateAttendanceSummary(attendanceRecords, approvedLeaves, leavePolicy, startDate, endDate) {
    const totalDays = endDate.getDate();
    const summary = {
      totalDays,
      workingDays: 0,
      presentDays: 0,
      absentDays: 0,
      halfDays: 0,
      lateDays: 0,
      earlyDepartureDays: 0,
      overtimeDays: 0,
      holidayDays: 0,
      weekOffDays: 0,
      casualLeaves: 0,
      sickLeaves: 0,
      earnedLeaves: 0,
      unpaidLeaves: 0,
      lopDays: 0,
      payableDays: 0,
      totalHours: 0,
      overtimeHours: 0,
      attendancePercentage: 0
    };
    
    // Create maps for easy lookup
    const attendanceMap = {};
    attendanceRecords.forEach(record => {
      const dateKey = record.date.toISOString().split('T')[0];
      attendanceMap[dateKey] = record;
    });
    
    const leaveMap = {};
    approvedLeaves.forEach(leave => {
      const current = new Date(Math.max(leave.startDate, startDate));
      const end = new Date(Math.min(leave.endDate, endDate));
      
      while (current <= end) {
        const dateKey = current.toISOString().split('T')[0];
        leaveMap[dateKey] = leave;
        current.setDate(current.getDate() + 1);
      }
    });
    
    // Process each day of the month
    for (let day = 1; day <= totalDays; day++) {
      const currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), day);
      const dateKey = currentDate.toISOString().split('T')[0];
      const dayOfWeek = currentDate.getDay();
      
      // Check if it's a holiday
      const isHoliday = this.isHoliday(currentDate, leavePolicy);
      const isWeekOff = this.isWeekOff(dayOfWeek, leavePolicy);
      
      if (isHoliday) {
        summary.holidayDays++;
        summary.payableDays++; // Holidays are paid
      } else if (isWeekOff) {
        summary.weekOffDays++;
        summary.payableDays++; // Week offs are paid
      } else {
        summary.workingDays++;
        
        // Check for approved leave
        const leave = leaveMap[dateKey];
        if (leave) {
          switch (leave.leaveType) {
            case 'casual':
              summary.casualLeaves++;
              summary.payableDays++;
              break;
            case 'sick':
              summary.sickLeaves++;
              summary.payableDays++;
              break;
            case 'earned':
              summary.earnedLeaves++;
              summary.payableDays++;
              break;
            case 'unpaid':
              summary.unpaidLeaves++;
              summary.lopDays++;
              break;
            default:
              summary.payableDays++;
          }
        } else {
          // Check attendance record
          const attendance = attendanceMap[dateKey];
          if (attendance) {
            switch (attendance.status) {
              case 'present':
                summary.presentDays++;
                summary.payableDays++;
                summary.totalHours += attendance.totalHours || 8;
                
                if (attendance.lateMinutes > 0) {
                  summary.lateDays++;
                }
                if (attendance.earlyDepartureMinutes > 0) {
                  summary.earlyDepartureDays++;
                }
                if (attendance.overtime > 0) {
                  summary.overtimeDays++;
                  summary.overtimeHours += attendance.overtime;
                }
                break;
                
              case 'half_day':
                summary.halfDays++;
                summary.payableDays += 0.5;
                summary.totalHours += (attendance.totalHours || 4);
                break;
                
              case 'late':
                summary.presentDays++;
                summary.lateDays++;
                summary.payableDays++;
                summary.totalHours += attendance.totalHours || 8;
                break;
                
              case 'early_departure':
                summary.presentDays++;
                summary.earlyDepartureDays++;
                summary.payableDays++;
                summary.totalHours += attendance.totalHours || 8;
                break;
                
              case 'absent':
              default:
                summary.absentDays++;
                summary.lopDays++;
                break;
            }
          } else {
            // No attendance record - mark as absent
            summary.absentDays++;
            summary.lopDays++;
          }
        }
      }
    }
    
    // Calculate attendance percentage
    if (summary.workingDays > 0) {
      summary.attendancePercentage = Math.round(
        ((summary.presentDays + (summary.halfDays * 0.5)) / summary.workingDays) * 100
      );
    }
    
    return summary;
  }
  
  /**
   * Check if a date is a holiday
   */
  static isHoliday(date, leavePolicy) {
    if (!leavePolicy || !leavePolicy.holidays) return false;
    
    return leavePolicy.holidays.some(holiday => {
      const holidayDate = new Date(holiday.date);
      return holidayDate.getDate() === date.getDate() &&
             holidayDate.getMonth() === date.getMonth() &&
             holidayDate.getFullYear() === date.getFullYear();
    });
  }
  
  /**
   * Check if a day is a week off
   */
  static isWeekOff(dayOfWeek, leavePolicy) {
    if (!leavePolicy || !leavePolicy.weekOff) return false;
    return leavePolicy.weekOff.includes(dayOfWeek);
  }
  
  /**
   * Calculate pro-rata salary based on attendance
   */
  static calculateProRataSalary(baseSalary, attendanceSummary) {
    const { workingDays, payableDays } = attendanceSummary;
    
    if (workingDays === 0) return baseSalary;
    
    const proRataFactor = payableDays / workingDays;
    return Math.round(baseSalary * proRataFactor);
  }
  
  /**
   * Calculate overtime amount
   */
  static calculateOvertimeAmount(overtimeHours, hourlyRate, overtimeMultiplier = 1.5) {
    return Math.round(overtimeHours * hourlyRate * overtimeMultiplier);
  }
  
  /**
   * Calculate LOP (Loss of Pay) deduction
   */
  static calculateLOPDeduction(baseSalary, lopDays, workingDays) {
    if (workingDays === 0 || lopDays === 0) return 0;
    
    const perDayDeduction = baseSalary / workingDays;
    return Math.round(perDayDeduction * lopDays);
  }
  
  /**
   * Get attendance report for multiple employees
   */
  static async getAttendanceReport(companyId, month, year, employeeIds = null) {
    try {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      
      // Build employee filter
      const employeeFilter = { company: companyId };
      if (employeeIds && employeeIds.length > 0) {
        employeeFilter._id = { $in: employeeIds };
      }
      
      const employees = await Employee.find(employeeFilter)
        .populate('user', 'profile email')
        .select('employmentDetails user');
      
      const report = [];
      
      for (const employee of employees) {
        const attendanceData = await this.getAttendanceForPayroll(
          employee._id, 
          month, 
          year
        );
        
        report.push({
          employee: {
            _id: employee._id,
            employeeId: employee.employmentDetails.employeeId,
            name: `${employee.user?.profile?.firstName || ''} ${employee.user?.profile?.lastName || ''}`.trim(),
            email: employee.user?.email,
            department: employee.employmentDetails.department,
            designation: employee.employmentDetails.designation
          },
          attendance: attendanceData.summary,
          baseSalary: employee.employmentDetails.salary?.base || 0,
          proRataSalary: this.calculateProRataSalary(
            employee.employmentDetails.salary?.base || 0,
            attendanceData.summary
          )
        });
      }
      
      return {
        period: { month, year },
        totalEmployees: report.length,
        report
      };
      
    } catch (error) {
      console.error('Error generating attendance report:', error);
      throw error;
    }
  }
}
