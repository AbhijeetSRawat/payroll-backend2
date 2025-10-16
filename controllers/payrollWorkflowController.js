import asyncHandler from 'express-async-handler';
import { PayrollWorkflowService } from '../services/payrollWorkflowService.js';
import { PayrollProcessing, PayrollBatch } from '../models/PayrollNew.js';
import Employee from '../models/Employee.js';
import { createAuditLog } from '../services/auditService.js';

/**
 * @desc    Calculate payroll for individual employee
 * @route   POST /api/payroll/calculate
 * @access  Private/Admin/HR
 */
export const calculateIndividualPayroll = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.body;
  const companyId = req.user.company || req.body.companyId;
  
  // Validation
  if (!employeeId || !month || !year) {
    return res.status(400).json({
      success: false,
      message: 'Employee ID, month, and year are required'
    });
  }
  
  if (month < 1 || month > 12) {
    return res.status(400).json({
      success: false,
      message: 'Month must be between 1 and 12'
    });
  }
  
  try {
    const result = await PayrollWorkflowService.calculateEmployeePayroll(
      employeeId, 
      month, 
      year, 
      companyId
    );
    
    // Create audit log
    await createAuditLog({
      user: req.user._id,
      action: 'PAYROLL_CALCULATED',
      resource: 'Payroll',
      resourceId: result.data._id,
      details: {
        employeeId,
        period: `${month}/${year}`,
        netSalary: result.data.netSalary
      }
    });
    
    res.status(200).json({
      success: true,
      message: 'Payroll calculated successfully',
      data: result.data,
      summary: result.summary
    });
    
  } catch (error) {
    console.error('Payroll calculation error:', error);
    res.status(400).json({
      success: false,
      message: error.message || 'Failed to calculate payroll'
    });
  }
});

/**
 * @desc    Batch process payroll for multiple employees
 * @route   POST /api/payroll/batch-calculate
 * @access  Private/Admin/HR
 */
export const batchCalculatePayroll = asyncHandler(async (req, res) => {
  const { employeeIds, month, year, batchName } = req.body;
  const companyId = req.user.company || req.body.companyId;
  
  // Validation
  if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Employee IDs array is required'
    });
  }
  
  if (!month || !year) {
    return res.status(400).json({
      success: false,
      message: 'Month and year are required'
    });
  }
  
  try {
    // Create batch record
    const batch = await PayrollBatch.create({
      company: companyId,
      batchName: batchName || `Payroll Batch ${month}/${year}`,
      payrollPeriod: { month, year },
      employees: employeeIds.map(id => ({ employee: id, status: 'pending' })),
      status: 'processing',
      processedBy: req.user._id,
      processedAt: new Date()
    });
    
    // Process payroll for all employees
    const result = await PayrollWorkflowService.batchProcessPayroll(
      employeeIds, 
      month, 
      year, 
      companyId
    );
    
    // Update batch with results
    let totalEarnings = 0;
    let totalDeductions = 0;
    let totalNetSalary = 0;
    
    const updatedEmployees = batch.employees.map(emp => {
      const processedResult = result.results.find(r => 
        r.data.employee.toString() === emp.employee.toString()
      );
      
      if (processedResult) {
        totalEarnings += processedResult.data.earnings.totalEarnings;
        totalDeductions += processedResult.data.deductions.totalDeductions;
        totalNetSalary += processedResult.data.netSalary;
        
        return {
          ...emp.toObject(),
          payroll: processedResult.data._id,
          status: 'processed'
        };
      } else {
        return {
          ...emp.toObject(),
          status: 'failed'
        };
      }
    });
    
    await PayrollBatch.findByIdAndUpdate(batch._id, {
      employees: updatedEmployees,
      totalEarnings,
      totalDeductions,
      totalNetSalary,
      status: result.success ? 'completed' : 'cancelled'
    });
    
    // Create audit log
    await createAuditLog({
      user: req.user._id,
      action: 'BATCH_PAYROLL_PROCESSED',
      resource: 'PayrollBatch',
      resourceId: batch._id,
      details: {
        employeeCount: employeeIds.length,
        processed: result.processed,
        failed: result.failed,
        period: `${month}/${year}`
      }
    });
    
    res.status(200).json({
      success: true,
      message: `Batch payroll processing completed. ${result.processed} processed, ${result.failed} failed.`,
      data: {
        batchId: batch._id,
        processed: result.processed,
        failed: result.failed,
        totalEarnings,
        totalDeductions,
        totalNetSalary,
        results: result.results,
        errors: result.errors
      }
    });
    
  } catch (error) {
    console.error('Batch payroll calculation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to process batch payroll'
    });
  }
});

/**
 * @desc    Get payroll details for an employee
 * @route   GET /api/payroll/:employeeId/:month/:year
 * @access  Private
 */
export const getPayrollDetails = asyncHandler(async (req, res) => {
  const { employeeId, month, year } = req.params;
  const companyId = req.user.company || req.query.companyId;
  
  const payroll = await PayrollProcessing.findOne({
    employee: employeeId,
    company: companyId,
    'payrollPeriod.month': parseInt(month),
    'payrollPeriod.year': parseInt(year)
  })
  .populate('employee', 'employmentDetails user')
  .populate('ctcAnnexure')
  .populate('flexiDeclaration');
  
  if (!payroll) {
    return res.status(404).json({
      success: false,
      message: 'Payroll record not found'
    });
  }
  
  res.status(200).json({
    success: true,
    data: payroll
  });
});

/**
 * @desc    Get payroll history for an employee
 * @route   GET /api/payroll/history/:employeeId
 * @access  Private
 */
export const getPayrollHistory = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { page = 1, limit = 10, year } = req.query;
  const companyId = req.user.company || req.query.companyId;
  
  const filter = {
    employee: employeeId,
    company: companyId
  };
  
  if (year) {
    filter['payrollPeriod.year'] = parseInt(year);
  }
  
  const payrollHistory = await PayrollProcessing.find(filter)
    .populate('employee', 'employmentDetails user')
    .sort({ 'payrollPeriod.year': -1, 'payrollPeriod.month': -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
  
  const total = await PayrollProcessing.countDocuments(filter);
  
  res.status(200).json({
    success: true,
    data: payrollHistory,
    pagination: {
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  });
});

/**
 * @desc    Get company payroll summary
 * @route   GET /api/payroll/company-summary
 * @access  Private/Admin/HR
 */
export const getCompanyPayrollSummary = asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  const companyId = req.user.company || req.query.companyId;
  
  const filter = { company: companyId };
  
  if (month && year) {
    filter['payrollPeriod.month'] = parseInt(month);
    filter['payrollPeriod.year'] = parseInt(year);
  }
  
  const payrollRecords = await PayrollProcessing.find(filter)
    .populate('employee', 'employmentDetails user');
  
  // Calculate summary statistics
  const summary = {
    totalEmployees: payrollRecords.length,
    totalEarnings: 0,
    totalDeductions: 0,
    totalNetSalary: 0,
    averageNetSalary: 0,
    departmentWise: {},
    statusWise: {
      draft: 0,
      processed: 0,
      approved: 0,
      paid: 0
    }
  };
  
  payrollRecords.forEach(record => {
    summary.totalEarnings += record.earnings.totalEarnings;
    summary.totalDeductions += record.deductions.totalDeductions;
    summary.totalNetSalary += record.netSalary;
    summary.statusWise[record.status]++;
    
    // Department-wise summary (if department info available)
    const dept = record.employee.employmentDetails.department || 'Unknown';
    if (!summary.departmentWise[dept]) {
      summary.departmentWise[dept] = {
        count: 0,
        totalNetSalary: 0
      };
    }
    summary.departmentWise[dept].count++;
    summary.departmentWise[dept].totalNetSalary += record.netSalary;
  });
  
  summary.averageNetSalary = summary.totalEmployees > 0 
    ? Math.round(summary.totalNetSalary / summary.totalEmployees) 
    : 0;
  
  res.status(200).json({
    success: true,
    data: summary,
    period: month && year ? `${month}/${year}` : 'All periods'
  });
});

/**
 * @desc    Approve payroll
 * @route   PUT /api/payroll/approve/:payrollId
 * @access  Private/Admin/HR
 */
export const approvePayroll = asyncHandler(async (req, res) => {
  const { payrollId } = req.params;
  
  const payroll = await PayrollProcessing.findById(payrollId);
  
  if (!payroll) {
    return res.status(404).json({
      success: false,
      message: 'Payroll record not found'
    });
  }
  
  if (payroll.status !== 'processed') {
    return res.status(400).json({
      success: false,
      message: 'Only processed payroll can be approved'
    });
  }
  
  payroll.status = 'approved';
  payroll.approvedBy = req.user._id;
  payroll.approvedAt = new Date();
  
  await payroll.save();
  
  // Create audit log
  await createAuditLog({
    user: req.user._id,
    action: 'PAYROLL_APPROVED',
    resource: 'PayrollProcessing',
    resourceId: payroll._id,
    details: {
      employeeId: payroll.employee,
      period: `${payroll.payrollPeriod.month}/${payroll.payrollPeriod.year}`,
      netSalary: payroll.netSalary
    }
  });
  
  res.status(200).json({
    success: true,
    message: 'Payroll approved successfully',
    data: payroll
  });
});

/**
 * @desc    Get employees eligible for payroll processing
 * @route   GET /api/payroll/eligible-employees
 * @access  Private/Admin/HR
 */
export const getEligibleEmployees = asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  const companyId = req.user.company || req.query.companyId;
  
  // Get all active employees
  const employees = await Employee.find({
    company: companyId,
    'employmentDetails.status': 'active'
  })
  .populate('user', 'profile email')
  .select('employmentDetails user');
  
  // Filter out employees who already have payroll processed for the period
  let eligibleEmployees = employees;
  
  if (month && year) {
    const processedEmployeeIds = await PayrollProcessing.distinct('employee', {
      company: companyId,
      'payrollPeriod.month': parseInt(month),
      'payrollPeriod.year': parseInt(year)
    });
    
    eligibleEmployees = employees.filter(emp => 
      !processedEmployeeIds.includes(emp._id)
    );
  }
  
  const formattedEmployees = eligibleEmployees.map(emp => ({
    _id: emp._id,
    employeeId: emp.employmentDetails.employeeId,
    name: `${emp.user?.profile?.firstName || ''} ${emp.user?.profile?.lastName || ''}`.trim(),
    email: emp.user?.email,
    department: emp.employmentDetails.department,
    designation: emp.employmentDetails.designation,
    joiningDate: emp.employmentDetails.joiningDate
  }));
  
  res.status(200).json({
    success: true,
    data: formattedEmployees,
    count: formattedEmployees.length,
    period: month && year ? `${month}/${year}` : 'All periods'
  });
});
