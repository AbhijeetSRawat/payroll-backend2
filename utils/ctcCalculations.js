import { calculateTotalFlexiAmount } from "./flexiCalculations.js";

/**
 * Calculate CTC breakdown from template with flexi support
 */
const calculateCTCFromTemplate = (annualCTC, template, includeFlexi = false) => {
  const breakdown = [];
  let fixedSalary = 0;
  let reimbursement = 0;
  let benefits = 0;
  let flexiBenefits = 0;

  // Process fixed components first
  template.salaryHeads
    .filter((head) => head.calculationType !== "flexi")
    .sort((a, b) => a.order - b.order)
    .forEach((head) => {
      let annualAmount = calculateComponentAmount(head, annualCTC, breakdown);

      const component = createComponentObject(head, annualAmount);
      breakdown.push(component);

      // Categorize for summary
      if (isFixedComponent(head.name)) {
        fixedSalary += annualAmount;
      } else if (isBenefitComponent(head.name)) {
        benefits += annualAmount;
      } else {
        reimbursement += annualAmount;
      }
    });

  // Add flexi benefits if included
  if (includeFlexi) {
    const basicSalary =
      breakdown.find((item) => item.salaryHead === "Basic")?.annualAmount || 0;
    const flexiAmount = calculateTotalFlexiAmount(
      basicSalary,
      "Basic Salary",
      30,
      0
    );

    if (flexiAmount > 0) {
      breakdown.push({
        salaryHead: "Flexi Benefits Basket",
        annualAmount: flexiAmount,
        monthlyAmount: Math.round(flexiAmount / 12),
        calculationBasis: "30% of Basic Salary",
        exemptionLimit: "As per employee declaration",
        taxableAmount: 0,
        isFlexiComponent: true,
      });
      flexiBenefits = flexiAmount;
    }
  }

  // Calculate summary
  const totalGrossEarning = fixedSalary + reimbursement + flexiBenefits;
  const totalDeductions = calculateTotalDeductions(breakdown);
  const netSalary = totalGrossEarning - totalDeductions;
  const difference = annualCTC - (totalGrossEarning + benefits);

  return {
    breakdown,
    summary: {
      fixedSalary: Math.round(fixedSalary),
      flexiBenefits: Math.round(flexiBenefits),
      reimbursement: Math.round(reimbursement),
      benefits: Math.round(benefits),
      totalGrossEarning: Math.round(totalGrossEarning),
      totalDeductions: Math.round(totalDeductions),
      netSalary: Math.round(netSalary),
      difference: Math.round(difference),
    },
  };
};

// Helper functions
const calculateComponentAmount = (head, annualCTC, breakdown) => {
  switch (head.calculationType) {
    case "percentage":
      return Math.round(annualCTC * (head.calculationValue / 100));
    case "fixed":
      return head.calculationValue;
    case "formula":
      return calculateFormula(head.name, breakdown, annualCTC);
    default:
      return 0;
  }
};

const createComponentObject = (head, annualAmount) => ({
  salaryHead: head.name,
  annualAmount: annualAmount,
  monthlyAmount: Math.round(annualAmount / 12),
  calculationBasis: head.calculationBasis,
  exemptionLimit: head.exemptionLimit,
  taxableAmount: head.isTaxable ? annualAmount : 0,
  isFlexiComponent: false,
});

const isFixedComponent = (salaryHead) =>
  ["Basic", "HRA", "Special City Allowance"].includes(salaryHead);

const isBenefitComponent = (salaryHead) =>
  salaryHead.includes("Contribution") || salaryHead === "Gratuity";

const calculateFormula = (salaryHead, breakdown, annualCTC) => {
  switch (salaryHead) {
    case "Other Allowance":
      const currentTotal = breakdown.reduce(
        (sum, item) => sum + item.annualAmount,
        0
      );
      return Math.max(0, annualCTC - currentTotal);
    default:
      return 0;
  }
};

const calculateTotalDeductions = (breakdown) => {
  return breakdown
    .filter((item) => item.salaryHead.includes("Employee Contribution"))
    .reduce((sum, item) => sum + item.annualAmount, 0);
};



export const calculateHRAExemption = (basicSalary, declaredHRA, monthlyRent, isMetroCity, dearnessAllowance = 0) => {
  // Step 1: Calculate total salary for HRA calculation
  const salary = basicSalary + dearnessAllowance;
  
  // Step 2: Calculate annual rent
  const annualRent = monthlyRent * 12;
  
  // Step 3: Calculate three values for comparison
  const value1 = declaredHRA; // Actual HRA received
  
  const value2 = salary * (isMetroCity ? 0.5 : 0.4); // 50% or 40% of salary
  
  const value3 = Math.max(0, annualRent - (salary * 0.1)); // Rent - 10% of salary
  
  // Step 4: Find minimum of three values
  const hraExemption = Math.min(value1, value2, value3);
  
  // Step 5: Calculate taxable HRA
  const taxableHRA = declaredHRA - hraExemption;
  
  return {
    exemptionAmount: hraExemption,
    taxableAmount: taxableHRA,
    calculationBreakdown: {
      actualHRAReceived: value1,
      statutoryLimit: value2,
      rentBasedCalculation: value3,
      salaryForCalculation: salary,
      annualRent: annualRent,
      isMetroCity: isMetroCity
    },
    explanation: `HRA Exemption = MIN(Actual HRA: ${value1}, Statutory Limit: ${value2}, Rent-10%: ${value3}) = ${hraExemption}`
  };
};

/**
 * Calculate HRA exemption for multiple employees (batch processing)
 */
export const calculateHRAExemptionBulk = (employeesData) => {
  return employeesData.map(employee => {
    const exemption = calculateHRAExemption(
      employee.basicSalary,
      employee.declaredHRA, 
      employee.monthlyRent,
      employee.isMetroCity,
      employee.dearnessAllowance || 0
    );
    
    return {
      employeeId: employee.employeeId,
      ...exemption
    };
  });
};


export { calculateCTCFromTemplate };
