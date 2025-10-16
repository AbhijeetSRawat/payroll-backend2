import CTCAnnexure from '../models/CTCAnnexure.js';
import { FlexiDeclaration } from '../models/FlexiBasket.js';
import Employee from '../models/Employee.js';

/**
 * Get employee payroll data from existing models
 */
export const getEmployeePayrollData = async (employeeId, financialYear, companyId) => {

  console.log("Company ID:", companyId, financialYear);
  const ctcAnnexure = await CTCAnnexure.findOne({
    employee: employeeId,
    financialYear,
    company: companyId,
    status: 'Active'
  });

  const flexiDeclaration = await FlexiDeclaration.findOne({
    employee: employeeId,
    financialYear,
    company: companyId,
    status: 'Approved'
  });

  const employee = await Employee.findById(employeeId);

  return { ctcAnnexure, flexiDeclaration, employee };
};

/**
 * Calculate monthly earnings from CTC and Flexi
 */
export const calculateMonthlyEarnings = (ctcAnnexure, flexiDeclaration, payDays, lopDays = 0) => {
  const monthlyBreakup = ctcAnnexure.monthlyBreakup;
  const totalWorkingDays = payDays + lopDays;
  
  const earnings = {
    basic: 0,
    hra: 0,
    conveyance: 0,
    specialAllowance: 0,
    washingAllowance: 0,
    educationAllowance: 0,
    medicalAllowance: 0,
    adhocAllowance: 0,
    canteenAllowance: 0,
    petrolAllowance: 0,
    bookPeriodical: 0,
    telephoneReimb: 0,
    ltaAdvance: 0,
    bonus: 0,
    overtime: 0,
    otherEarnings: 0
  };

  // Calculate pro-rata amounts from CTC
  monthlyBreakup.forEach(component => {
    const monthlyAmount = component.monthlyAmount || (component.annualAmount / 12);
    const proRataAmount = (monthlyAmount / totalWorkingDays) * payDays;
    
    switch (component.salaryHead) {
      case 'Basic':
        earnings.basic = Math.round(proRataAmount);
        break;
      case 'HRA':
        earnings.hra = Math.round(proRataAmount);
        break;
      case 'Special City Allowance':
        earnings.specialAllowance = Math.round(proRataAmount);
        break;
      case 'Education Allowance':
        earnings.educationAllowance = Math.round(proRataAmount);
        break;
      case 'Other Allowance':
        earnings.adhocAllowance = Math.round(proRataAmount);
        break;
      default:
        if (component.salaryHead.includes('Allowance')) {
          earnings.otherEarnings += Math.round(proRataAmount);
        }
    }
  });

  // Add flexi declared amounts
  if (flexiDeclaration) {
    flexiDeclaration.declarations.forEach(declaration => {
      const monthlyFlexiAmount = declaration.monthlyAmount || (declaration.declaredAmount / 12);
      const proRataFlexi = (monthlyFlexiAmount / totalWorkingDays) * payDays;
      
      switch (declaration.headCode) {
        case 'HRA':
          earnings.hra += Math.round(proRataFlexi);
          break;
        case 'FUEL':
          earnings.petrolAllowance = Math.round(proRataFlexi);
          break;
        case 'TELECOM':
          earnings.telephoneReimb = Math.round(proRataFlexi);
          break;
        case 'LTA':
          earnings.ltaAdvance = Math.round(proRataFlexi);
          break;
        case 'MEAL':
          earnings.canteenAllowance = Math.round(proRataFlexi);
          break;
        default:
          earnings.otherEarnings += Math.round(proRataFlexi);
      }
    });
  }

  // Calculate total earnings
  earnings.totalEarnings = Object.values(earnings).reduce((sum, val) => sum + val, 0);

  return earnings;
};

/**
 * Calculate statutory deductions
 */
export const calculateDeductions = (earnings, employeeType = 'Staff') => {
  const deductions = {
    incomeTax: 0, // Will be calculated separately
    providentFund: 0,
    professionalTax: 0,
    esic: 0,
    loanRecovery: 0,
    insurance: 0,
    nps: 0,
    otherDeductions: 0
  };

  // Provident Fund (12% of basic)
  deductions.providentFund = Math.round(earnings.basic * 0.12);

  // Professional Tax (as per state rules)
  if (earnings.totalEarnings > 7500) {
    deductions.professionalTax = earnings.totalEarnings > 10000 ? 200 : 175;
  }

  // ESIC (0.75% of gross for employees)
  if (employeeType === 'Worker' && earnings.totalEarnings <= 21000) {
    deductions.esic = Math.round(earnings.totalEarnings * 0.0075);
  }

  // Calculate total deductions
  deductions.totalDeductions = Object.values(deductions).reduce((sum, val) => sum + val, 0);

  return deductions;
};

/**
 * Calculate income tax (simplified monthly calculation)
 */
export const calculateMonthlyIncomeTax = (annualTaxableIncome, month) => {
  // This is a simplified calculation - in real scenario, use proper tax calculation
  const monthlyTax = Math.round(annualTaxableIncome / 12 * 0.1); // Approximate 10%
  return monthlyTax;
};

/**
 * Calculate net salary
 */
export const calculateNetSalary = (earnings, deductions) => {
  return earnings.totalEarnings - deductions.totalDeductions;
};