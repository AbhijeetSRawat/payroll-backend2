import CTCAnnexure from '../models/CTCAnnexure.js';
import { FlexiDeclaration } from '../models/FlexiBasket.js';
import Employee from '../models/Employee.js';
import { calculateHRAExemption } from '../utils/taxCalculations.js';

/**
 * Get employee income data from existing models
 */
export const getEmployeeIncomeData = async (employeeId, financialYear, companyId) => {
  // Get CTC data
  const ctcAnnexure = await CTCAnnexure.findOne({
    employee: employeeId,
    financialYear,
    company: companyId,
  }).populate('template');

  if (!ctcAnnexure) {
    throw new Error('CTC Annexure not found for the employee for the given financial year');
  }

  // Get Flexi declaration
  const flexiDeclaration = await FlexiDeclaration.findOne({
    employee: employeeId,
    financialYear,
    company: companyId,
    status: 'Approved'
  }).populate('flexiBasket');

  // Get Employee basic info
  const employee = await Employee.findById(employeeId);

  return { ctcAnnexure, flexiDeclaration, employee };
};

/**
 * Calculate gross salary from CTC breakdown
 */
export const calculateGrossSalary = (ctcAnnexure, flexiDeclaration) => {
  const monthlyBreakup = ctcAnnexure.monthlyBreakup;
  
  // Sum all taxable components (excluding benefits and flexi components)
  let grossSalary = monthlyBreakup
    .filter(component => 
      !component.salaryHead.includes('Contribution') && 
      !component.salaryHead.includes('Gratuity') &&
      !component.isFlexiComponent
    )
    .reduce((sum, component) => sum + component.annualAmount, 0);

  // Add flexi declared amounts (taxable portions)
  if (flexiDeclaration) {
    flexiDeclaration.declarations.forEach(declaration => {
      // Only add taxable portion of flexi benefits
      const taxableAmount = declaration.declaredAmount - declaration.taxBenefitAmount;
      grossSalary += taxableAmount;
    });
  }

  return grossSalary;
};

/**
 * Calculate exemptions from flexi declarations
 */
export const calculateExemptions = (flexiDeclaration, basicSalary, rentDetails = {}) => {
  let totalExemptions = 0;
  const exemptionBreakdown = {};

  if (!flexiDeclaration) {
    return { totalExemptions, exemptionBreakdown };
  }

  flexiDeclaration.declarations.forEach(declaration => {
    if (declaration.headCode === 'HRA' && rentDetails.monthlyRent) {
      // Calculate HRA exemption
      const hraExemption = calculateHRAExemption(
        basicSalary,
        declaration.declaredAmount,
        rentDetails.monthlyRent,
        rentDetails.isMetroCity || false
      );
      exemptionBreakdown.hra = hraExemption.exemptionAmount;
      totalExemptions += hraExemption.exemptionAmount;
    } else {
      // Other exemptions (LTA, etc.)
      exemptionBreakdown[declaration.headCode] = declaration.taxBenefitAmount;
      totalExemptions += declaration.taxBenefitAmount;
    }
  });

  return { totalExemptions, exemptionBreakdown };
};

/**
 * Calculate deductions from tax declaration
 */
export const calculateDeductions = (taxDeclaration) => {
  if (!taxDeclaration) {
    return { totalDeductions: 0, deductionBreakdown: {} };
  }

  const { investments } = taxDeclaration;
  const deductionBreakdown = {};
  let totalDeductions = 0;

  // Section 80C (Max ₹1,50,000)
  const section80C = Math.min(
    Object.values(investments.section80C).reduce((sum, val) => sum + val, 0),
    150000
  );
  deductionBreakdown.section80C = section80C;
  totalDeductions += section80C;

  // Section 80D - Medical Insurance
  let section80D = investments.section80D.self;
  if (investments.section80D.parents > 0) {
    const limit = investments.section80D.seniorCitizen ? 50000 : 25000;
    section80D += Math.min(investments.section80D.parents, limit);
  }
  section80D = Math.min(section80D, 100000); // Overall limit
  deductionBreakdown.section80D = section80D;
  totalDeductions += section80D;

  // Section 80CCD - NPS
  const section80CCD = Math.min(
    investments.section80CCD.employeeContribution + 
    investments.section80CCD.additionalContribution,
    50000
  );
  deductionBreakdown.section80CCD = section80CCD;
  totalDeductions += section80CCD;

  // Other sections
  deductionBreakdown.section80E = investments.section80E;
  deductionBreakdown.section80G = investments.section80G;
  totalDeductions += investments.section80E + investments.section80G;

  return { totalDeductions, deductionBreakdown };
};

/**
 * Calculate net taxable income
 */
export const calculateNetTaxableIncome = (grossSalary, exemptions, deductions, otherIncome = 0) => {
  const standardDeduction = 50000; // Fixed as per tax rules
  const professionalTax = 2500; // Approximate annual
  
  const netTaxableIncome = grossSalary + otherIncome - exemptions - deductions - standardDeduction - professionalTax;
  
  return Math.max(0, netTaxableIncome);
};