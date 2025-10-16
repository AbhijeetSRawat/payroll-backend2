// ... existing HRA calculation code ...

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

// Tax slabs for FY 2024-25
const TAX_SLABS = {
  old: [
    { min: 0, max: 250000, rate: 0 },
    { min: 250000, max: 500000, rate: 0.05 },
    { min: 500000, max: 1000000, rate: 0.20 },
    { min: 1000000, max: Infinity, rate: 0.30 }
  ],
  new: [
    { min: 0, max: 300000, rate: 0 },
    { min: 300000, max: 600000, rate: 0.05 },
    { min: 600000, max: 900000, rate: 0.10 },
    { min: 900000, max: 1200000, rate: 0.15 },
    { min: 1200000, max: 1500000, rate: 0.20 },
    { min: 1500000, max: Infinity, rate: 0.30 }
  ]
};

/**
 * Calculate income tax based on regime
 */
export const calculateTax = (taxableIncome, regime = 'old') => {
  const slabs = TAX_SLABS[regime];
  let remainingIncome = taxableIncome;
  let totalTax = 0;
  const taxSlabs = [];

  for (const slab of slabs) {
    if (remainingIncome <= 0) break;

    const slabIncome = Math.min(remainingIncome, slab.max - slab.min);
    if (slabIncome > 0) {
      const slabTax = slabIncome * slab.rate;
      totalTax += slabTax;
      
      taxSlabs.push({
        slab: `₹${slab.min.toLocaleString()} - ₹${slab.max === Infinity ? 'Above' : slab.max.toLocaleString()}`,
        income: slabIncome,
        rate: slab.rate * 100,
        tax: slabTax
      });
    }
    
    remainingIncome -= slabIncome;
  }

  // Apply rebate under section 87A
  if (regime === 'old' && taxableIncome <= 500000) {
    totalTax = Math.max(0, totalTax - Math.min(totalTax, 12500));
  } else if (regime === 'new' && taxableIncome <= 700000) {
    totalTax = Math.max(0, totalTax - Math.min(totalTax, 25000));
  }

  // Apply cess (4%)
  totalTax += totalTax * 0.04;

  return { totalTax: Math.round(totalTax), taxSlabs };
};

