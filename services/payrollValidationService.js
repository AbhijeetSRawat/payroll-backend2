import Employee from '../models/Employee.js';
import CTCAnnexure from '../models/CTCAnnexure.js';
import { FlexiDeclaration } from '../models/FlexiBasket.js';
import { PayrollProcessing } from '../models/PayrollNew.js';

/**
 * Service for validating payroll processing requirements
 */
export class PayrollValidationService {
  
  /**
   * Validate employee eligibility for payroll processing
   */
  static async validateEmployeeEligibility(employeeId, companyId) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };
    
    try {
      // Check if employee exists and is active
      const employee = await Employee.findById(employeeId).populate('company');
      
      if (!employee) {
        validationResult.isValid = false;
        validationResult.errors.push('Employee not found');
        return validationResult;
      }
      
      if (employee.company._id.toString() !== companyId.toString()) {
        validationResult.isValid = false;
        validationResult.errors.push('Employee does not belong to the specified company');
        return validationResult;
      }
      
      if (employee.employmentDetails.status !== 'active') {
        validationResult.isValid = false;
        validationResult.errors.push(`Employee status is ${employee.employmentDetails.status}, not active`);
        return validationResult;
      }
      
      // Check if employee has basic salary information
      if (!employee.employmentDetails.salary?.base || employee.employmentDetails.salary.base <= 0) {
        validationResult.warnings.push('Employee has no base salary configured');
      }
      
      // Check employment details completeness
      if (!employee.employmentDetails.employeeId) {
        validationResult.warnings.push('Employee ID is missing');
      }
      
      if (!employee.employmentDetails.joiningDate) {
        validationResult.warnings.push('Joining date is missing');
      }
      
      return validationResult;
      
    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push(`Validation error: ${error.message}`);
      return validationResult;
    }
  }
  
  /**
   * Validate CTC annexure for payroll processing
   */
  static async validateCTCAnnexure(employeeId, year, companyId) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      ctcAnnexure: null
    };
    
    try {
      const financialYear = `${year}-${year + 1}`;
      
      const ctcAnnexure = await CTCAnnexure.findOne({
        employee: employeeId,
        company: companyId,
        financialYear: financialYear,
        status: 'Active'
      }).populate('template');
      
      if (!ctcAnnexure) {
        validationResult.isValid = false;
        validationResult.errors.push(`No active CTC annexure found for financial year ${financialYear}`);
        return validationResult;
      }
      
      validationResult.ctcAnnexure = ctcAnnexure;
      
      // Validate CTC annexure completeness
      if (!ctcAnnexure.annualCTC || ctcAnnexure.annualCTC <= 0) {
        validationResult.isValid = false;
        validationResult.errors.push('Annual CTC is not configured or is zero');
      }
      
      if (!ctcAnnexure.monthlyBreakup || ctcAnnexure.monthlyBreakup.length === 0) {
        validationResult.isValid = false;
        validationResult.errors.push('Monthly salary breakup is not configured');
      }
      
      // Check for basic salary component
      const basicComponent = ctcAnnexure.monthlyBreakup.find(comp => comp.salaryHead === 'Basic');
      if (!basicComponent) {
        validationResult.isValid = false;
        validationResult.errors.push('Basic salary component is missing in CTC breakup');
      }
      
      // Validate summary calculations
      if (ctcAnnexure.summary) {
        const calculatedTotal = ctcAnnexure.summary.fixedSalary + 
                               ctcAnnexure.summary.flexiBenefits + 
                               ctcAnnexure.summary.reimbursement + 
                               ctcAnnexure.summary.benefits;
        
        const difference = Math.abs(calculatedTotal - ctcAnnexure.annualCTC);
        if (difference > 100) { // Allow small rounding differences
          validationResult.warnings.push(`CTC calculation mismatch: Expected ${ctcAnnexure.annualCTC}, Calculated ${calculatedTotal}`);
        }
      }
      
      return validationResult;
      
    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push(`CTC validation error: ${error.message}`);
      return validationResult;
    }
  }
  
  /**
   * Validate flexi declaration (if applicable)
   */
  static async validateFlexiDeclaration(employeeId, year, companyId) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      flexiDeclaration: null
    };
    
    try {
      const financialYear = `${year}-${year + 1}`;
      
      const flexiDeclaration = await FlexiDeclaration.findOne({
        employee: employeeId,
        company: companyId,
        financialYear: financialYear,
        status: 'Approved'
      });
      
      if (flexiDeclaration) {
        validationResult.flexiDeclaration = flexiDeclaration;
        
        // Validate flexi declaration completeness
        if (!flexiDeclaration.declarations || flexiDeclaration.declarations.length === 0) {
          validationResult.warnings.push('Flexi declaration exists but has no benefit declarations');
        }
        
        // Validate total flexi amount
        const totalDeclared = flexiDeclaration.declarations.reduce(
          (sum, decl) => sum + decl.declaredAmount, 0
        );
        
        if (Math.abs(totalDeclared - flexiDeclaration.totalFlexiAmount) > 10) {
          validationResult.warnings.push('Total declared flexi amount does not match available flexi amount');
        }
        
        // Check for invalid declarations
        flexiDeclaration.declarations.forEach((decl, index) => {
          if (!decl.declaredAmount || decl.declaredAmount < 0) {
            validationResult.warnings.push(`Invalid declared amount for benefit ${decl.headCode} at index ${index}`);
          }
          
          if (decl.declaredAmount > decl.limitAsPerCTC) {
            validationResult.warnings.push(`Declared amount exceeds limit for benefit ${decl.headCode}`);
          }
        });
      }
      
      return validationResult;
      
    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push(`Flexi validation error: ${error.message}`);
      return validationResult;
    }
  }
  
  /**
   * Check if payroll already processed for the period
   */
  static async validatePayrollPeriod(employeeId, month, year, companyId) {
    const validationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };
    
    try {
      const existingPayroll = await PayrollProcessing.findOne({
        employee: employeeId,
        company: companyId,
        'payrollPeriod.month': month,
        'payrollPeriod.year': year
      });
      
      if (existingPayroll) {
        validationResult.isValid = false;
        validationResult.errors.push(`Payroll already processed for ${month}/${year}. Status: ${existingPayroll.status}`);
      }
      
      // Check if the period is in the future
      const currentDate = new Date();
      const payrollDate = new Date(year, month - 1, 1);
      
      if (payrollDate > currentDate) {
        validationResult.warnings.push('Processing payroll for a future period');
      }
      
      // Check if the period is too old (more than 12 months)
      const monthsOld = (currentDate.getFullYear() - year) * 12 + (currentDate.getMonth() - (month - 1));
      if (monthsOld > 12) {
        validationResult.warnings.push(`Processing payroll for a period that is ${monthsOld} months old`);
      }
      
      return validationResult;
      
    } catch (error) {
      validationResult.isValid = false;
      validationResult.errors.push(`Period validation error: ${error.message}`);
      return validationResult;
    }
  }
  
  /**
   * Comprehensive validation for payroll processing
   */
  static async validatePayrollProcessing(employeeId, month, year, companyId) {
    const overallResult = {
      isValid: true,
      errors: [],
      warnings: [],
      validationDetails: {}
    };
    
    try {
      // Validate employee eligibility
      const employeeValidation = await this.validateEmployeeEligibility(employeeId, companyId);
      overallResult.validationDetails.employee = employeeValidation;
      
      if (!employeeValidation.isValid) {
        overallResult.isValid = false;
        overallResult.errors.push(...employeeValidation.errors);
      }
      overallResult.warnings.push(...employeeValidation.warnings);
      
      // Validate CTC annexure
      const ctcValidation = await this.validateCTCAnnexure(employeeId, year, companyId);
      overallResult.validationDetails.ctc = ctcValidation;
      
      if (!ctcValidation.isValid) {
        overallResult.isValid = false;
        overallResult.errors.push(...ctcValidation.errors);
      }
      overallResult.warnings.push(...ctcValidation.warnings);
      
      // Validate flexi declaration
      const flexiValidation = await this.validateFlexiDeclaration(employeeId, year, companyId);
      overallResult.validationDetails.flexi = flexiValidation;
      
      if (!flexiValidation.isValid) {
        overallResult.isValid = false;
        overallResult.errors.push(...flexiValidation.errors);
      }
      overallResult.warnings.push(...flexiValidation.warnings);
      
      // Validate payroll period
      const periodValidation = await this.validatePayrollPeriod(employeeId, month, year, companyId);
      overallResult.validationDetails.period = periodValidation;
      
      if (!periodValidation.isValid) {
        overallResult.isValid = false;
        overallResult.errors.push(...periodValidation.errors);
      }
      overallResult.warnings.push(...periodValidation.warnings);
      
      return overallResult;
      
    } catch (error) {
      overallResult.isValid = false;
      overallResult.errors.push(`Overall validation error: ${error.message}`);
      return overallResult;
    }
  }
  
  /**
   * Validate batch payroll processing
   */
  static async validateBatchPayrollProcessing(employeeIds, month, year, companyId) {
    const batchResult = {
      isValid: true,
      errors: [],
      warnings: [],
      employeeValidations: {},
      summary: {
        totalEmployees: employeeIds.length,
        validEmployees: 0,
        invalidEmployees: 0,
        employeesWithWarnings: 0
      }
    };
    
    for (const employeeId of employeeIds) {
      const validation = await this.validatePayrollProcessing(employeeId, month, year, companyId);
      batchResult.employeeValidations[employeeId] = validation;
      
      if (validation.isValid) {
        batchResult.summary.validEmployees++;
      } else {
        batchResult.summary.invalidEmployees++;
        batchResult.isValid = false;
        batchResult.errors.push(`Employee ${employeeId}: ${validation.errors.join(', ')}`);
      }
      
      if (validation.warnings.length > 0) {
        batchResult.summary.employeesWithWarnings++;
        batchResult.warnings.push(`Employee ${employeeId}: ${validation.warnings.join(', ')}`);
      }
    }
    
    return batchResult;
  }
}
