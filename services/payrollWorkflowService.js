import Employee from '../models/Employee.js';
import CTCAnnexure from '../models/CTCAnnexure.js';
import { FlexiDeclaration } from '../models/FlexiBasket.js';
import Attendance from '../models/Attendance.js';
import { PayrollProcessing } from '../models/PayrollNew.js';
import { calculateTax } from '../utils/taxCalculations.js';
import { calculateHRAExemption } from '../utils/ctcCalculations.js';
import { PayrollValidationService } from './payrollValidationService.js';

/**
 * Complete payroll calculation workflow for individual employee
 */
export class PayrollWorkflowService {
  
  /**
   * Main payroll calculation method with comprehensive validation
   */
  static async calculateEmployeePayroll(employeeId, month, year, companyId) {
    try {
      console.log(`Starting payroll calculation for employee: ${employeeId}, period: ${month}/${year}`);
      
      // Step 1: Comprehensive validation
      const validation = await PayrollValidationService.validatePayrollProcessing(
        employeeId, month, year, companyId
      );
      
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Log warnings if any
      if (validation.warnings.length > 0) {
        console.warn(`Payroll warnings for employee ${employeeId}:`, validation.warnings);
      }
      
      // Step 2: Fetch validated data
      const employee = await this.fetchEmployeeData(employeeId, companyId);
      const ctcAnnexure = validation.validationDetails.ctc.ctcAnnexure;
      const flexiDeclaration = validation.validationDetails.flexi.flexiDeclaration;
      
      // Step 3: Calculate attendance and working days
      const attendanceData = await this.calculateAttendance(employeeId, month, year);
      
      // Step 4: Calculate monthly earnings
      const earnings = await this.calculateEarnings(ctcAnnexure, flexiDeclaration, attendanceData, employee);
      
      // Step 5: Calculate deductions
      const deductions = await this.calculateDeductions(earnings, employee, ctcAnnexure);
      
      // Step 6: Calculate net salary
      const netSalary = earnings.totalEarnings - deductions.totalDeductions;
      
      // Step 7: Create payroll record
      const payrollRecord = await this.createPayrollRecord({
        employee,
        ctcAnnexure,
        flexiDeclaration,
        attendanceData,
        earnings,
        deductions,
        netSalary,
        month,
        year,
        companyId
      });
      
      console.log(`Payroll calculation completed for employee: ${employeeId}`);
      
      return {
        success: true,
        data: payrollRecord,
        validation: {
          warnings: validation.warnings,
          validationDetails: validation.validationDetails
        },
        summary: {
          employeeId: employee.employmentDetails.employeeId,
          employeeName: `${employee.user?.profile?.firstName || ''} ${employee.user?.profile?.lastName || ''}`.trim(),
          period: `${month}/${year}`,
          totalEarnings: earnings.totalEarnings,
          totalDeductions: deductions.totalDeductions,
          netSalary: netSalary,
          workingDays: attendanceData.workingDays,
          presentDays: attendanceData.presentDays,
          attendancePercentage: attendanceData.attendancePercentage
        }
      };
      
    } catch (error) {
      console.error(`Payroll calculation failed for employee ${employeeId}:`, error);
      throw error;
    }
  }
  
  /**
   * Fetch employee data with validations
   */
  static async fetchEmployeeData(employeeId, companyId) {
    const employee = await Employee.findById(employeeId)
      .populate('user', 'profile email')
      .populate('company');
    
    if (!employee) {
      throw new Error('Employee not found');
    }
    
    if (employee.company._id.toString() !== companyId.toString()) {
      throw new Error('Employee does not belong to the specified company');
    }
    
    if (employee.employmentDetails.status !== 'active') {
      throw new Error('Employee is not active');
    }
    
    return employee;
  }
  
  /**
   * Fetch active CTC annexure
   */
  static async fetchCTCAnnexure(employeeId, year, companyId) {
    const financialYear = `${year}-${year + 1}`;
    
    const ctcAnnexure = await CTCAnnexure.findOne({
      employee: employeeId,
      company: companyId,
      financialYear: financialYear,
      status: 'Active'
    }).populate('template');
    
    if (!ctcAnnexure) {
      throw new Error(`No active CTC annexure found for financial year ${financialYear}`);
    }
    
    return ctcAnnexure;
  }
  
  /**
   * Fetch flexi declaration (optional)
   */
  static async fetchFlexiDeclaration(employeeId, year, companyId) {
    const financialYear = `${year}-${year + 1}`;
    
    const flexiDeclaration = await FlexiDeclaration.findOne({
      employee: employeeId,
      company: companyId,
      financialYear: financialYear,
      status: 'Approved'
    });
    
    return flexiDeclaration; // Can be null
  }
  
  /**
   * Calculate attendance and working days using AttendanceCalculationService
   */
  static async calculateAttendance(employeeId, month, year) {
    const { AttendanceCalculationService } = await import('./attendanceCalculationService.js');
    
    const attendanceData = await AttendanceCalculationService.getAttendanceForPayroll(
      employeeId, 
      month, 
      year
    );
    
    return attendanceData.summary;
  }
  
  /**
   * Calculate monthly earnings
   */
  static async calculateEarnings(ctcAnnexure, flexiDeclaration, attendanceData, employee) {
    const earnings = {
      basic: 0,
      hra: 0,
      specialAllowance: 0,
      educationAllowance: 0,
      otherAllowance: 0,
      conveyanceAllowance: 0,
      medicalAllowance: 0,
      lta: 0,
      fuelAllowance: 0,
      telephoneAllowance: 0,
      mealAllowance: 0,
      washingAllowance: 0,
      bonus: 0,
      overtime: 0,
      salesIncentives: 0,
      totalEarnings: 0
    };
    
    // Calculate pro-rata earnings based on attendance
    const proRataFactor = attendanceData.payableDays / attendanceData.workingDays;
    
    // Process CTC components
    ctcAnnexure.monthlyBreakup.forEach(component => {
      const monthlyAmount = component.monthlyAmount || (component.annualAmount / 12);
      const proRataAmount = Math.round(monthlyAmount * proRataFactor);
      
      switch (component.salaryHead) {
        case 'Basic':
          earnings.basic = proRataAmount;
          break;
        case 'HRA':
          earnings.hra = proRataAmount;
          break;
        case 'Special City Allowance':
          earnings.specialAllowance = proRataAmount;
          break;
        case 'Education Allowance':
          earnings.educationAllowance = proRataAmount;
          break;
        case 'Other Allowance':
          earnings.otherAllowance = proRataAmount;
          break;
        case 'Leave Travel Assistance':
          earnings.lta = proRataAmount;
          break;
        case 'Fuel & Maintenance Reimbursement':
          earnings.fuelAllowance = proRataAmount;
          break;
        case 'Telephone Allowance':
          earnings.telephoneAllowance = proRataAmount;
          break;
        case 'Meal Allowance':
          earnings.mealAllowance = proRataAmount;
          break;
        case 'Washing Allowance':
          earnings.washingAllowance = proRataAmount;
          break;
        case 'Bonus':
          earnings.bonus = proRataAmount;
          break;
      }
    });
    
    // Add flexi benefits if declared
    if (flexiDeclaration) {
      flexiDeclaration.declarations.forEach(declaration => {
        const monthlyFlexiAmount = declaration.monthlyAmount;
        const proRataFlexi = Math.round(monthlyFlexiAmount * proRataFactor);
        
        switch (declaration.headCode) {
          case 'HRA':
            earnings.hra += proRataFlexi;
            break;
          case 'FUEL':
            earnings.fuelAllowance += proRataFlexi;
            break;
          case 'TELECOM':
            earnings.telephoneAllowance += proRataFlexi;
            break;
          case 'LTA':
            earnings.lta += proRataFlexi;
            break;
          case 'MEAL':
            earnings.mealAllowance += proRataFlexi;
            break;
          case 'CONVEYANCE':
            earnings.conveyanceAllowance += proRataFlexi;
            break;
          case 'MEDICAL':
            earnings.medicalAllowance += proRataFlexi;
            break;
        }
      });
    }
    
    // Add sales incentives for sales employees
    const { isSalesEmployee, calculateSalesIncentives } = await import('./salesPayrollService.js');
    if (isSalesEmployee(employee)) {
      const salesData = calculateSalesIncentives(employee);
      earnings.salesIncentives = salesData.incentives;
    }
    
    // Calculate total earnings
    earnings.totalEarnings = Object.values(earnings).reduce((sum, val) => sum + val, 0) - earnings.totalEarnings;
    
    return earnings;
  }
  
  /**
   * Calculate deductions
   */
  static async calculateDeductions(earnings, employee, ctcAnnexure) {
    const deductions = {
      providentFund: 0,
      esic: 0,
      professionalTax: 0,
      incomeTax: 0,
      loanRecovery: 0,
      otherDeductions: 0,
      salesDeductions: 0,
      totalDeductions: 0
    };
    
    // Provident Fund (12% of basic)
    if (employee.employmentDetails.pfFlag) {
      deductions.providentFund = Math.round(earnings.basic * 0.12);
    }
    
    // ESIC (0.75% of gross, applicable if gross <= 21000)
    if (employee.employmentDetails.esicFlag && earnings.totalEarnings <= 21000) {
      deductions.esic = Math.round(earnings.totalEarnings * 0.0075);
    }
    
    // Professional Tax (state-wise calculation)
    if (employee.employmentDetails.ptFlag) {
      if (earnings.totalEarnings > 10000) {
        deductions.professionalTax = 200;
      } else if (earnings.totalEarnings > 7500) {
        deductions.professionalTax = 175;
      }
    }
    
    // Income Tax (simplified monthly calculation)
    const annualTaxableIncome = this.calculateAnnualTaxableIncome(earnings, ctcAnnexure);
    const { totalTax } = calculateTax(annualTaxableIncome, 'new');
    deductions.incomeTax = Math.round(totalTax / 12);
    
    // Sales-specific deductions
    const { isSalesEmployee, calculateSalesIncentives } = await import('./salesPayrollService.js');
    if (isSalesEmployee(employee)) {
      const salesData = calculateSalesIncentives(employee);
      deductions.salesDeductions = salesData.deductions;
    }
    
    // Calculate total deductions
    deductions.totalDeductions = Object.values(deductions).reduce((sum, val) => sum + val, 0) - deductions.totalDeductions;
    
    return deductions;
  }
  
  /**
   * Calculate annual taxable income for tax computation
   */
  static calculateAnnualTaxableIncome(monthlyEarnings, ctcAnnexure) {
    const annualGross = monthlyEarnings.totalEarnings * 12;
    
    // Calculate HRA exemption
    const hraExemption = calculateHRAExemption(
      monthlyEarnings.basic * 12,
      monthlyEarnings.hra * 12,
      0, // Monthly rent - would need to be fetched from employee data
      false // Metro city flag - would need to be determined
    );
    
    // Standard deduction
    const standardDeduction = 50000;
    
    // Calculate taxable income
    const taxableIncome = annualGross - hraExemption.exemptionAmount - standardDeduction;
    
    return Math.max(0, taxableIncome);
  }
  
  /**
   * Create payroll record
   */
  static async createPayrollRecord(data) {
    const {
      employee,
      ctcAnnexure,
      flexiDeclaration,
      attendanceData,
      earnings,
      deductions,
      netSalary,
      month,
      year,
      companyId
    } = data;
    
    // Check if payroll already exists
    const existingPayroll = await PayrollProcessing.findOne({
      employee: employee._id,
      company: companyId,
      'payrollPeriod.month': month,
      'payrollPeriod.year': year
    });
    
    if (existingPayroll) {
      throw new Error(`Payroll already processed for ${month}/${year}`);
    }
    
    const payrollData = {
      company: companyId,
      employee: employee._id,
      ctcAnnexure: ctcAnnexure._id,
      flexiDeclaration: flexiDeclaration?._id,
      payrollPeriod: {
        month: month,
        year: year,
        payDays: attendanceData.payableDays,
        lopDays: attendanceData.lopDays
      },
      earnings: earnings,
      deductions: deductions,
      netSalary: netSalary,
      status: 'processed'
    };
    
    const payrollRecord = await PayrollProcessing.create(payrollData);
    
    return payrollRecord;
  }
  
  /**
   * Batch process payroll for multiple employees with validation
   */
  static async batchProcessPayroll(employeeIds, month, year, companyId) {
    console.log(`Starting batch payroll processing for ${employeeIds.length} employees`);
    
    // Step 1: Validate all employees first
    const batchValidation = await PayrollValidationService.validateBatchPayrollProcessing(
      employeeIds, month, year, companyId
    );
    
    console.log(`Batch validation completed: ${batchValidation.summary.validEmployees} valid, ${batchValidation.summary.invalidEmployees} invalid`);
    
    const results = [];
    const errors = [];
    
    // Step 2: Process only valid employees
    for (const employeeId of employeeIds) {
      const employeeValidation = batchValidation.employeeValidations[employeeId];
      
      if (employeeValidation.isValid) {
        try {
          const result = await this.calculateEmployeePayroll(employeeId, month, year, companyId);
          results.push(result);
          console.log(`✓ Processed payroll for employee: ${employeeId}`);
        } catch (error) {
          console.error(`✗ Failed to process payroll for employee ${employeeId}:`, error.message);
          errors.push({
            employeeId,
            error: error.message,
            type: 'processing_error'
          });
        }
      } else {
        console.warn(`✗ Skipped employee ${employeeId} due to validation errors`);
        errors.push({
          employeeId,
          error: employeeValidation.errors.join(', '),
          type: 'validation_error'
        });
      }
    }
    
    // Step 3: Compile batch summary
    const batchSummary = {
      totalEmployees: employeeIds.length,
      validEmployees: batchValidation.summary.validEmployees,
      processedSuccessfully: results.length,
      processingErrors: errors.filter(e => e.type === 'processing_error').length,
      validationErrors: errors.filter(e => e.type === 'validation_error').length,
      employeesWithWarnings: batchValidation.summary.employeesWithWarnings,
      totalEarnings: results.reduce((sum, r) => sum + r.data.earnings.totalEarnings, 0),
      totalDeductions: results.reduce((sum, r) => sum + r.data.deductions.totalDeductions, 0),
      totalNetSalary: results.reduce((sum, r) => sum + r.data.netSalary, 0)
    };
    
    console.log(`Batch payroll processing completed:`, batchSummary);
    
    return {
      success: results.length > 0,
      batchValidation,
      summary: batchSummary,
      results,
      errors
    };
  }
}
