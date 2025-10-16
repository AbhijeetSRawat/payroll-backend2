import asyncHandler from 'express-async-handler';
import { SalaryPayment, StatutoryDeduction, LoanAdvance, PaymentBatch } from '../models/PaymentDeduction.js';
import Reimbursement from '../models/Reimbursement.js';
import CTCAnnexure from '../models/CTCAnnexure.js';
import Employee from '../models/Employee.js';
import { createAuditLog } from '../services/auditService.js';


// @desc    Process monthly salary
// @route   POST /api/payments/salary/process
// @access  Private/Admin/HR
export const processMonthlySalary = asyncHandler(async (req, res) => {
  const { employeeId, month, year, workingDays, paidDays, lopDays, adjustments } = req.body;

  const employee = await Employee.findById(employeeId);
  if (!employee || employee.company.toString() !== req.user.company.toString()) {
    res.status(404);
    throw new Error('Employee not found');
  }

  const activeCTC = await CTCAnnexure.findOne({
    employee: employeeId,
    status: 'Active',
    company: req.user.company
  });

  if (!activeCTC) {
    res.status(404);
    throw new Error('No active CTC found for employee');
  }

  // Check if salary already processed
  const existingSalary = await SalaryPayment.findOne({
    employee: employeeId,
    'paymentPeriod.month': month,
    'paymentPeriod.year': year
  });

  if (existingSalary) {
    res.status(400);
    throw new Error(`Salary already processed for ${month}/${year}`);
  }

  // Calculate salary components
  const salaryData = await calculateSalary(activeCTC, month, year, workingDays, paidDays, lopDays, adjustments);

  const salaryPayment = new SalaryPayment({
    company: req.user.company,
    employee: employeeId,
    ctcAnnexure: activeCTC._id,
    paymentPeriod: { month, year },
    ...salaryData,
    processedBy: req.user._id,
    processedAt: new Date()
  });

  const savedSalary = await salaryPayment.save();

  await createAuditLog(
    req.user._id,
    req.user.company,
    'Salary Processed',
    {
      employee: employee.employeeId,
      period: `${month}/${year}`,
      netSalary: salaryData.netSalary
    }
  );

  res.status(201).json({
    success: true,
    message: 'Salary processed successfully',
    data: savedSalary
  });
});

// @desc    Get employee salary for period
// @route   GET /api/payments/salary/employee/:employeeId
// @access  Private/Admin/HR/Employee
export const getEmployeeSalary = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { month, year } = req.query;

  let query = { employee: employeeId, company: req.user.company };
  
  if (month && year) {
    query['paymentPeriod.month'] = parseInt(month);
    query['paymentPeriod.year'] = parseInt(year);
  }

  const salary = await SalaryPayment.findOne(query)
    .populate('employee', 'name employeeId department designation')
    .populate('processedBy', 'name')
    .populate('approvedBy', 'name')
    .populate('paidBy', 'name');

  if (!salary) {
    res.status(404);
    throw new Error('Salary record not found');
  }

  // Authorization check for employees
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee || employee._id.toString() !== employeeId) {
      res.status(403);
      throw new Error('Not authorized to access this salary data');
    }
  }

  res.json({
    success: true,
    data: salary
  });
});

// @desc    Approve salary payment
// @route   PUT /api/payments/salary/:id/approve
// @access  Private/Admin/HR
export const approveSalaryPayment = asyncHandler(async (req, res) => {
  const { remarks } = req.body;

  const salary = await SalaryPayment.findById(req.params.id)
    .populate('employee', 'name employeeId');

  if (!salary || salary.company.toString() !== req.user.company.toString()) {
    res.status(404);
    throw new Error('Salary record not found');
  }

  if (salary.status !== 'processed') {
    res.status(400);
    throw new Error('Only processed salaries can be approved');
  }

  salary.status = 'approved';
  salary.approvedBy = req.user._id;
  salary.approvedAt = new Date();
  salary.remarks = remarks;

  const approvedSalary = await salary.save();

  await createAuditLog(
    req.user._id,
    req.user.company,
    'Salary Approved',
    {
      salaryId: approvedSalary._id,
      employee: salary.employee.employeeId,
      netSalary: salary.netSalary
    }
  );

  res.json({
    success: true,
    message: 'Salary approved successfully',
    data: approvedSalary
  });
});

// @desc    Mark salary as paid
// @route   PUT /api/payments/salary/:id/pay
// @access  Private/Admin/HR
export const markSalaryPaid = asyncHandler(async (req, res) => {
  const { paymentReference, bankAccountNumber, bankName, ifscCode } = req.body;

  const salary = await SalaryPayment.findById(req.params.id)
    .populate('employee', 'name employeeId');

  if (!salary || salary.company.toString() !== req.user.company.toString()) {
    res.status(404);
    throw new Error('Salary record not found');
  }

  if (salary.status !== 'approved') {
    res.status(400);
    throw new Error('Only approved salaries can be marked as paid');
  }

  salary.status = 'paid';
  salary.paidBy = req.user._id;
  salary.paidAt = new Date();
  salary.paymentReference = paymentReference;
  salary.bankAccountNumber = bankAccountNumber;
  salary.bankName = bankName;
  salary.ifscCode = ifscCode;

  const paidSalary = await salary.save();

  await createAuditLog(
    req.user._id,
    req.user.company,
    'Salary Paid',
    {
      salaryId: paidSalary._id,
      employee: salary.employee.employeeId,
      netSalary: salary.netSalary,
      paymentReference: paymentReference
    }
  );

  res.json({
    success: true,
    message: 'Salary marked as paid',
    data: paidSalary
  });
});

// @desc    Apply for loan/advance
// @route   POST /api/payments/loan-advance/apply
// @access  Private/Admin/HR/Employee
export const applyLoanAdvance = asyncHandler(async (req, res) => {
  const { type, purpose, amount, tenureMonths, emiAmount, startDate, documents } = req.body;

  let employeeId = req.body.employeeId;
  
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee) {
      res.status(404);
      throw new Error('Employee record not found');
    }
    employeeId = employee._id;
  }

  const employee = await Employee.findById(employeeId);
  if (!employee || employee.company.toString() !== req.user.company.toString()) {
    res.status(404);
    throw new Error('Employee not found');
  }

  const loanAdvance = new LoanAdvance({
    company: req.user.company,
    employee: employeeId,
    type,
    purpose,
    sanctionAmount: amount,
    emiAmount,
    tenureMonths,
    startDate,
    remainingBalance: amount,
    emisRemaining: tenureMonths,
    documents: documents || []
  });

  const savedApplication = await loanAdvance.save();

  await createAuditLog(
    req.user._id,
    req.user.company,
    'Loan/Advance Applied',
    {
      applicationId: savedApplication._id,
      employee: employee.employeeId,
      type: type,
      amount: amount
    }
  );

  res.status(201).json({
    success: true,
    message: 'Loan/Advance application submitted successfully',
    data: savedApplication
  });
});

// @desc    Approve loan/advance
// @route   PUT /api/payments/loan-advance/:id/approve
// @access  Private/Admin/HR
export const approveLoanAdvance = asyncHandler(async (req, res) => {
  const { remarks } = req.body;

  const loanAdvance = await LoanAdvance.findById(req.params.id)
    .populate('employee', 'name employeeId');

  if (!loanAdvance || loanAdvance.company.toString() !== req.user.company.toString()) {
    res.status(404);
    throw new Error('Loan/Advance application not found');
  }

  if (loanAdvance.status !== 'applied') {
    res.status(400);
    throw new Error('Only applied applications can be approved');
  }

  loanAdvance.status = 'approved';
  loanAdvance.approvedBy = req.user._id;
  loanAdvance.approvedAt = new Date();

  const approvedApplication = await loanAdvance.save();

  await createAuditLog(
    req.user._id,
    req.user.company,
    'Loan/Advance Approved',
    {
      applicationId: approvedApplication._id,
      employee: loanAdvance.employee.employeeId,
      amount: loanAdvance.sanctionAmount
    }
  );

  res.json({
    success: true,
    message: 'Loan/Advance approved successfully',
    data: approvedApplication
  });
});

// @desc    Disburse loan/advance
// @route   PUT /api/payments/loan-advance/:id/disburse
// @access  Private/Admin/HR
export const disburseLoanAdvance = asyncHandler(async (req, res) => {
  const { disbursedAmount, paymentReference } = req.body;

  const loanAdvance = await LoanAdvance.findById(req.params.id)
    .populate('employee', 'name employeeId');

  if (!loanAdvance || loanAdvance.company.toString() !== req.user.company.toString()) {
    res.status(404);
    throw new Error('Loan/Advance application not found');
  }

  if (loanAdvance.status !== 'approved') {
    res.status(400);
    throw new Error('Only approved applications can be disbursed');
  }

  loanAdvance.status = 'disbursed';
  loanAdvance.disbursedAmount = disbursedAmount;
  loanAdvance.disbursedBy = req.user._id;
  loanAdvance.disbursedAt = new Date();
  loanAdvance.paymentReference = paymentReference;

  const disbursedApplication = await loanAdvance.save();

  await createAuditLog(
    req.user._id,
    req.user.company,
    'Loan/Advance Disbursed',
    {
      applicationId: disbursedApplication._id,
      employee: loanAdvance.employee.employeeId,
      disbursedAmount: disbursedAmount
    }
  );

  res.json({
    success: true,
    message: 'Loan/Advance disbursed successfully',
    data: disbursedApplication
  });
});

// @desc    Get payment dashboard
// @route   GET /api/payments/dashboard
// @access  Private/Admin/HR
export const getPaymentDashboard = asyncHandler(async (req, res) => {
  const { month, year } = req.query;
  const currentMonth = month || new Date().getMonth() + 1;
  const currentYear = year || new Date().getFullYear();

  // Salary statistics
  const salaryStats = await SalaryPayment.aggregate([
    {
      $match: {
        company: req.user.company,
        'paymentPeriod.month': parseInt(currentMonth),
        'paymentPeriod.year': parseInt(currentYear)
      }
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$netSalary' }
      }
    }
  ]);

  // Pending reimbursements
  const pendingReimbursements = await Reimbursement.countDocuments({
    company: req.user.company,
    status: { $in: ['pending', 'approved'] }
  });

  // Active loans
  const activeLoans = await LoanAdvance.countDocuments({
    company: req.user.company,
    status: { $in: ['active', 'disbursed'] }
  });

  // Monthly payment summary
  const monthlySummary = await SalaryPayment.aggregate([
    {
      $match: {
        company: req.user.company,
        'paymentPeriod.month': parseInt(currentMonth),
        'paymentPeriod.year': parseInt(currentYear),
        status: 'paid'
      }
    },
    {
      $group: {
        _id: null,
        totalEmployees: { $sum: 1 },
        totalSalary: { $sum: '$netSalary' },
        totalEarnings: { $sum: '$totalEarnings' },
        totalDeductions: { $sum: '$totalDeductions' }
      }
    }
  ]);

  res.json({
    success: true,
    data: {
      salaryStats,
      pendingReimbursements,
      activeLoans,
      monthlySummary: monthlySummary[0] || {},
      currentPeriod: {
        month: currentMonth,
        year: currentYear
      }
    }
  });
});

// @desc    Generate payslip
// @route   GET /api/payments/payslip/:id
// @access  Private/Admin/HR/Employee
export const generatePayslip = asyncHandler(async (req, res) => {
  const salary = await SalaryPayment.findById(req.params.id)
    .populate('employee', 'name employeeId department designation joiningDate')
    .populate('ctcAnnexure');

  if (!salary || salary.company.toString() !== req.user.company.toString()) {
    res.status(404);
    throw new Error('Salary record not found');
  }

  // Authorization check for employees
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee || employee._id.toString() !== salary.employee._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to access this payslip');
    }
  }

  const payslip = {
    employee: salary.employee,
    paymentPeriod: salary.paymentPeriod,
    earnings: salary.earnings,
    deductions: salary.deductions,
    summary: {
      totalEarnings: salary.totalEarnings,
      totalDeductions: salary.totalDeductions,
      netSalary: salary.netSalary
    },
    attendance: salary.attendance,
    paymentDetails: {
      status: salary.status,
      paidAt: salary.paidAt,
      paymentReference: salary.paymentReference
    }
  };

  res.json({
    success: true,
    data: payslip
  });
});

// Helper function to calculate salary
export const calculateSalary = async (ctcAnnexure, month, year, workingDays, paidDays, lopDays, adjustments = {}) => {
  const monthlyBreakup = ctcAnnexure.monthlyBreakup;
  
  // Calculate pro-rata amounts based on paid days
  const basic = calculateProRataAmount(monthlyBreakup, 'Basic', paidDays, workingDays);
  const hra = calculateProRataAmount(monthlyBreakup, 'HRA', paidDays, workingDays);
  const specialAllowance = calculateProRataAmount(monthlyBreakup, 'Special City Allowance', paidDays, workingDays);
  
  // Calculate other components
  const otherAllowances = calculateProRataAmount(monthlyBreakup, 'Other Allowance', paidDays, workingDays);
  
  // Calculate statutory deductions
  const professionalTax = calculateProfessionalTax(basic + hra + specialAllowance);
  const providentFund = calculateProvidentFund(basic);
  const incomeTax = calculateIncomeTax(basic + hra + specialAllowance + otherAllowances, month, year);

  const totalEarnings = basic + hra + specialAllowance + otherAllowances;
  const totalDeductions = professionalTax + providentFund + incomeTax;
  const netSalary = totalEarnings - totalDeductions;

  return {
    earnings: {
      basic,
      hra,
      specialAllowance,
      otherAllowances,
      overtime: adjustments.overtime || 0,
      bonus: adjustments.bonus || 0,
      arrears: adjustments.arrears || 0,
      flexiBenefits: adjustments.flexiBenefits || 0
    },
    deductions: {
      professionalTax,
      incomeTax,
      providentFund,
      esic: 0, // Calculate based on salary
      loanEmi: adjustments.loanEmi || 0,
      advanceRecovery: adjustments.advanceRecovery || 0,
      otherDeductions: adjustments.otherDeductions || 0
    },
    attendance: {
      workingDays,
      paidDays,
      lopDays,
      overtimeHours: adjustments.overtimeHours || 0
    },
    totalEarnings,
    totalDeductions,
    netSalary
  };
};

const calculateProRataAmount = (breakup, salaryHead, paidDays, workingDays) => {
  const component = breakup.find(item => item.salaryHead === salaryHead);
  if (!component) return 0;
  
  const monthlyAmount = component.monthlyAmount || (component.annualAmount / 12);
  return Math.round((monthlyAmount / workingDays) * paidDays);
};

const calculateProfessionalTax = (grossSalary) => {
  // Simplified professional tax calculation
  if (grossSalary <= 7500) return 0;
  if (grossSalary <= 10000) return 175;
  return 200;
};

const calculateProvidentFund = (basicSalary) => {
  // 12% of basic salary
  return Math.round(basicSalary * 0.12);
};

const calculateIncomeTax = (taxableIncome, month, year) => {
  // Simplified tax calculation - in real scenario, use proper tax slabs
  const annualTaxable = taxableIncome * 12;
  let tax = 0;
  
  if (annualTaxable > 1000000) tax = annualTaxable * 0.30;
  else if (annualTaxable > 500000) tax = annualTaxable * 0.20;
  else if (annualTaxable > 250000) tax = annualTaxable * 0.05;
  
  return Math.round(tax / 12); // Monthly tax
};
