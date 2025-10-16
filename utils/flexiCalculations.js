/**
 * Calculate flexi benefit amounts based on declarations and rules
 */

/**
 * Calculate total flexi amount based on basic salary and company policy
 * @param {number} basicSalary - Employee's basic salary
 * @param {string} calculationBasis - Basis for calculation ('Basic Salary', 'Fixed Amount')
 * @param {number} calculationPercentage - Percentage to apply
 * @param {number} fixedAmount - Fixed amount if applicable
 * @returns {number} Total flexi amount available
 */
export const calculateTotalFlexiAmount = (basicSalary, calculationBasis, calculationPercentage, fixedAmount = 0) => {
  console.log('🧮 Flexi Calculation Input:', {
    basicSalary,
    calculationBasis,
    calculationPercentage,
    fixedAmount
  });

  let calculatedAmount = 0;
  
  switch (calculationBasis) {
    case 'Basic Salary':
      calculatedAmount = Math.round(basicSalary * (calculationPercentage / 100));
      console.log(`📊 Flexi Calculation: ${basicSalary} × ${calculationPercentage}% = ${calculatedAmount}`);
      break;
    
    case 'Annual':
    case 'Fixed Amount':
      calculatedAmount = fixedAmount;
      console.log(`📊 Flexi Calculation: Fixed amount = ${calculatedAmount}`);
      break;
    
    case 'Percentage of CTC':
      // This would require CTC amount
      calculatedAmount = Math.round(basicSalary * (calculationPercentage / 100));
      console.log(`📊 Flexi Calculation: Using basic as proxy = ${calculatedAmount}`);
      break;
    
    default:
      calculatedAmount = fixedAmount;
      console.log(`📊 Flexi Calculation: Default fixed amount = ${calculatedAmount}`);
  }

  console.log('✅ Final Flexi Amount:', calculatedAmount);
  return calculatedAmount;
};

/**
 * Calculate individual benefit limits based on CTC slabs and rules
 */
export const calculateBenefitLimits = (headCode, basicSalary, annualCTC, slabs) => {
  const limits = {
    monthlyLimit: 0,
    annualLimit: 0,
    calculationBasis: ''
  };

  switch (headCode) {
    case 'HRA':
      limits.monthlyLimit = Math.round(basicSalary / 12 * 0.4);
      limits.annualLimit = limits.monthlyLimit * 12;
      limits.calculationBasis = '40% of Basic Salary (Non-Metro)';
      break;

    case 'LTA':
      const ltaSlab = slabs.find(s => s.slabType === 'LTA' && annualCTC >= s.salaryMin && annualCTC <= s.salaryMax);
      limits.annualLimit = ltaSlab ? ltaSlab.value : 100000;
      limits.monthlyLimit = Math.round(limits.annualLimit / 12);
      limits.calculationBasis = ltaSlab
        ? `As per CTC slab (${ltaSlab.salaryMin}-${ltaSlab.salaryMax})`
        : 'Fixed limit of ₹1,00,000';
      break;

    case 'FUEL':
      const fuelSlab = slabs.find(s => s.slabType === 'Fuel' && annualCTC >= s.salaryMin && annualCTC <= s.salaryMax);
      limits.annualLimit = fuelSlab ? fuelSlab.value : 0;
      limits.monthlyLimit = Math.round(limits.annualLimit / 12);
      limits.calculationBasis = fuelSlab
        ? `As per CTC slab (${fuelSlab.salaryMin}-${fuelSlab.salaryMax})`
        : 'Not applicable';
      break;

    case 'CHILD_EDU':
      limits.monthlyLimit = 200;
      limits.annualLimit = limits.monthlyLimit * 12;
      limits.calculationBasis = '₹100 per child per month (max 2 children)';
      break;

    case 'CHILD_HOSTEL':
      limits.monthlyLimit = 600;
      limits.annualLimit = limits.monthlyLimit * 12;
      limits.calculationBasis = '₹300 per child per month (max 2 children)';
      break;

    case 'VOICE_DATA':
      const telephoneSlab = slabs.find(s => s.slabType === 'Telephone' && annualCTC >= s.salaryMin && annualCTC <= s.salaryMax);
      limits.annualLimit = telephoneSlab ? telephoneSlab.value : 0;
      limits.monthlyLimit = Math.round(limits.annualLimit / 12);
      limits.calculationBasis = telephoneSlab
        ? `As per CTC slab (${telephoneSlab.salaryMin}-${telephoneSlab.salaryMax})`
        : 'Not applicable';
      break;

    case 'HEALTH_CLUB':
      limits.annualLimit = 15000;
      limits.monthlyLimit = Math.round(limits.annualLimit / 12);
      limits.calculationBasis = 'Fixed annual limit of ₹15,000';
      break;

    default:
      limits.monthlyLimit = 0;
      limits.annualLimit = 0;
      limits.calculationBasis = 'Not defined';
  }

  return limits;
};

/**
 * Calculate tax benefit amount for a declared benefit
 */
export const calculateTaxBenefit = (headCode, declaredAmount, limitAmount) => {
  const eligibleAmount = Math.min(declaredAmount, limitAmount);
  
  switch (headCode) {
    case 'HRA':
      return eligibleAmount;
    case 'LTA':
      return eligibleAmount;
    case 'CHILD_EDU':
    case 'CHILD_HOSTEL':
      return eligibleAmount;
    case 'FUEL':
      return Math.min(eligibleAmount, 28800);
    default:
      return eligibleAmount;
  }
};

/**
 * Validate flexi declaration against rules and limits
 */
export const validateFlexiDeclaration = (declarations, totalFlexiAmount, flexiBasket, basicSalary, annualCTC, ctcSlabs) => {
  const errors = [];
  const warnings = [];
  let totalDeclared = 0;

  declarations.forEach(declaration => {
    const option = flexiBasket.options.find(opt => opt.headCode === declaration.headCode);
    
    if (!option) {
      errors.push(`Invalid benefit head: ${declaration.headCode}`);
      return;
    }

    // 🚀 FIX: Calculate dynamic limit if maxLimit is 0
    let maxLimit = option.maxLimit;
    
    if (maxLimit === 0) {
      // Calculate limit dynamically based on head code and CTC
      const limits = calculateBenefitLimits(declaration.headCode, basicSalary, annualCTC, ctcSlabs);
      maxLimit = limits.annualLimit;
    }

    // Check if declared amount exceeds individual limit
    if (declaration.declaredAmount > maxLimit) {
      errors.push(`${option.name}: Declared amount (${declaration.declaredAmount}) exceeds maximum limit (${maxLimit})`);
    }

    // Check if declared amount is below minimum
    if (declaration.declaredAmount < option.minLimit) {
      warnings.push(`${option.name}: Declared amount is below minimum recommended`);
    }

    totalDeclared += declaration.declaredAmount;
  });

  // Check if total declared exceeds available flexi amount
  if (totalDeclared > totalFlexiAmount) {
    errors.push(`Total declared amount (${totalDeclared}) exceeds available flexi balance (${totalFlexiAmount})`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalDeclared,
    remainingBalance: totalFlexiAmount - totalDeclared
  };
};

/**
 * Create default flexi basket template for a company
 */
export const getDefaultFlexiBasket = () => {
  return {
    name: 'Standard Flexi Benefits Basket',
    totalFlexiAmount: 0,
    calculationBasis: 'Basic Salary',
    calculationPercentage: 0,
    options: [
      {
        headCode: 'HRA',
        name: 'House Rent Allowance',
        description: 'Allowance for house rent accommodation',
        optionType: 'amount',
        minLimit: 0,
        maxLimit: 0,
        calculationBasis: '40% of Basic Salary for Non-Metro, 50% for Metro',
        taxBenefit: 'Tax exemption on actual rent paid subject to limits',
        conditions: 'Rent receipt and PAN of landlord required for tax exemption',
        order: 1,
        isActive: true
      },
      {
        headCode: 'LTA',
        name: 'Leave Travel Assistance',
        description: 'Allowance for leave travel with family',
        optionType: 'amount',
        minLimit: 0,
        maxLimit: 100000,
        calculationBasis: 'As per CTC slab or max ₹1,00,000',
        taxBenefit: 'Tax exempt on actual travel expenditure with bills',
        conditions: 'Only for travel within India with family, twice in a block of 4 years',
        order: 2,
        isActive: true
      },
      {
        headCode: 'FUEL',
        name: 'Fuel Reimbursement',
        description: 'Reimbursement for fuel expenses',
        optionType: 'amount',
        minLimit: 0,
        maxLimit: 0,
        calculationBasis: 'As per CTC slab',
        taxBenefit: '2W: ₹300 PM, 4W < 1600cc: ₹1800 PM, 4W > 1600cc: ₹2400 PM',
        conditions: 'Vehicle must be in employee name, bills required',
        order: 3,
        isActive: true
      },
      {
        headCode: 'CHILD_EDU',
        name: 'Child Education Allowance',
        description: 'Allowance for child education expenses',
        optionType: 'unit',
        unitValue: 100,
        minLimit: 0,
        maxLimit: 2400,
        calculationBasis: '₹100 per child per month (max 2 children)',
        taxBenefit: '₹100 per month per child (max 2 children)',
        conditions: 'For children studying in recognized institutions',
        order: 4,
        isActive: true
      },
      {
        headCode: 'CHILD_HOSTEL',
        name: 'Child Hostel Allowance',
        description: 'Allowance for child hostel expenses',
        optionType: 'unit',
        unitValue: 300,
        minLimit: 0,
        maxLimit: 7200,
        calculationBasis: '₹300 per child per month (max 2 children)',
        taxBenefit: '₹300 per month per child (max 2 children)',
        conditions: 'For children staying in hostel away from home',
        order: 5,
        isActive: true
      },
      {
        headCode: 'VOICE_DATA',
        name: 'Voice & Data Reimbursement',
        description: 'Reimbursement for mobile and internet expenses',
        optionType: 'amount',
        minLimit: 0,
        maxLimit: 0,
        calculationBasis: 'As per CTC slab',
        taxBenefit: 'Tax exempt on submission of bills',
        conditions: 'Only for post-paid connections in employee name',
        order: 6,
        isActive: true
      },
      {
        headCode: 'HEALTH_CLUB',
        name: 'Health Club Facility',
        description: 'Reimbursement for health club membership',
        optionType: 'amount',
        minLimit: 0,
        maxLimit: 15000,
        calculationBasis: 'Fixed annual limit of ₹15,000',
        taxBenefit: 'Tax exempt on submission of bills',
        conditions: 'Membership must be in employee name',
        order: 7,
        isActive: true
      }
    ]
  };
};
