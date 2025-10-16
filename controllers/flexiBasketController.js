import asyncHandler from 'express-async-handler';
import { FlexiBasket, FlexiDeclaration } from '../models/FlexiBasket.js';
import CTCAnnexure from '../models/CTCAnnexure.js';
import Employee from '../models/Employee.js';
import Company from '../models/Company.js';
//import { createAuditLog } from '../services/auditService.js';
import { 
  calculateTotalFlexiAmount, 
  calculateBenefitLimits, 
  calculateTaxBenefit,
  validateFlexiDeclaration,
  getDefaultFlexiBasket 
} from '../utils/flexiCalculations.js';


// @desc    Get company flexi basket template
// @route   GET /api/flexi/basket
// @access  Private/Admin/HR
export const getFlexiBasket = asyncHandler(async (req, res) => {
  // Find active flexi basket for the company
  const  { companyId } = req.params;
  if(!companyId){
    return res.status(400).json({
      success: false,
      message: 'Company ID is required'
    });
  }
  const flexiBasket = await FlexiBasket.findOne({ 
    company: companyId,
    isActive: true 
  });

  if (!flexiBasket) {
    return res.status(404).json({
      success: false,
      message: 'Flexi basket not found for your company. Please contact admin to set it up.'
    });
  }

  res.json({
    success: true,
    data: flexiBasket
  });
});

// @desc    Create or update company flexi basket template
// @route   POST /api/flexi/basket
// @access  Private/Admin/HR
export const createOrUpdateFlexiBasket = asyncHandler(async (req, res) => {
  const { 
    name, 
    totalFlexiAmount, 
    calculationBasis, 
    calculationPercentage,
    options, 
    financialYear 
  } = req.body;

  const { companyId } = req.params;

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'Company ID is required'
    });
  }

  // Check if flexi basket already exists
  let flexiBasket = await FlexiBasket.findOne({ company: companyId });

  if (flexiBasket) {
    // Update existing basket
    flexiBasket.name = name || flexiBasket.name;
    flexiBasket.totalFlexiAmount = totalFlexiAmount || flexiBasket.totalFlexiAmount;
    flexiBasket.calculationBasis = calculationBasis || flexiBasket.calculationBasis;
    flexiBasket.calculationPercentage = calculationPercentage || flexiBasket.calculationPercentage;
    flexiBasket.options = options || flexiBasket.options;
    flexiBasket.financialYear = financialYear || flexiBasket.financialYear;
  } else {
    // Create new basket with defaults
    const defaultBasket = getDefaultFlexiBasket();
    flexiBasket = new FlexiBasket({
      company: companyId,
      name: name || defaultBasket.name,
      totalFlexiAmount: totalFlexiAmount || defaultBasket.totalFlexiAmount,
      calculationBasis: calculationBasis || defaultBasket.calculationBasis,
      calculationPercentage: calculationPercentage || defaultBasket.calculationPercentage,
      options: options || defaultBasket.options,
      financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
    });
  }

  const savedBasket = await flexiBasket.save();

//   await createAuditLog(
//     req.user._id,
//     req.user.company,
//     'Flexi Basket Updated',
//     { basketId: savedBasket._id, name: savedBasket.name }
//   );

  res.status(200).json({
    success: true,
    message: 'Flexi basket saved successfully',
    data: savedBasket
  });
});

// @desc    Get employee's flexi declaration
// @route   GET /api/flexi/declaration
// @access  Private/Admin/HR/Employee
export const getFlexiDeclaration = asyncHandler(async (req, res) => {
  const { financialYear } = req.query;

  // For employees, they can only access their own declaration
  let employeeId = req.query.employeeId;

 const employee = await Employee.findById(employeeId);
 
 if(!employee)
     return res.json({
        success: true,
        data: null,
        message: 'Employee not found'
      });

  if (!employeeId) {
   return res.status(400).json({
      success: false,
      message: 'Employee ID is required'
    });
  }

  const query = { 
    employee: employeeId,
    company: employee?.company 
  };

  if (financialYear) {
    query.financialYear = financialYear;
  }

  const declaration = await FlexiDeclaration.findOne(query)
    .populate({
      path: 'employee',
      populate: { path: 'user', select: 'profile email' },
    })
    .populate('flexiBasket', 'name options totalFlexiAmount');

  if (!declaration) {
      return res.json({
        success: true,
        data: null,
        message: 'No flexi declaration found for this employee'
      });
 
  }

  res.json({
    success: true,
    data: declaration
  });
});


export const getFlexiDeclarationForCompany = asyncHandler(async (req, res) => {
  const { financialYear } = req.query;

  // For employees, they can only access their own declaration
  let companyId = req.query.companyId;

 const company = await Company.findById(companyId);

 if(!company)
     return res.json({
        success: true,
        data: null,
        message: 'Company not found'
      });

  if (!companyId) {
    return res.status(400).json({
      success: false,
      message: 'Company ID is required'
    });
  }

 const query = { 
  company: companyId,
  status: { $ne: 'Draft' }
};


  if (financialYear) {
    query.financialYear = financialYear;
  }

  const declaration = await FlexiDeclaration.find(query)
    .populate({
      path: 'employee',
      populate: [{ path: 'user', select: 'profile email' },
        { path: 'employmentDetails.department' }
      ]
    })
    .populate('flexiBasket', 'name options totalFlexiAmount');

  if (!declaration) {
      return res.json({
        success: true,
        data: null,
        message: 'No flexi declaration found for this employee'
      });
 
  }

  res.json({
    success: true,
    data: declaration
  });
});

// @desc    Create or update flexi benefit declaration
// @route   POST /api/flexi/declaration
// @access  Private/Admin/HR/Employee
export const createOrUpdateFlexiDeclaration = asyncHandler(async (req, res) => {
  const { declarations, financialYear } = req.body;

  // For employees, they can only create/update their own declaration
  let employeeId = req.body.employeeId;
  
  if (req?.user?.role === 'Employee') {
    const employee = await Employee.findOne({ user: req?.user?._id });
    if (!employee) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create/update declaration'
      });
    }
    employeeId = employee._id;
  }

  if (!employeeId) {
    res.status(400);
    throw new Error('Employee ID is required');
  }

  // Get employee details and CTC information
  const employee = await Employee.findById(employeeId);
  if (!employee ) {
    res.status(404);
    throw new Error('Employee not found in your company');
  }

  // Get current CTC annexure to calculate flexi amounts
  const ctcAnnexure = await CTCAnnexure.findOne({
    employee: employeeId,
    financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
  }).populate('template');

  if (!ctcAnnexure) {
    res.status(404);
    throw new Error('CTC annexure not found. Please create CTC first.');
  }

  // Get flexi basket template
  const flexiBasket = await FlexiBasket.findOne({
    company: employee.company,
    isActive: true
  });

  if (!flexiBasket) {
    res.status(404);
    throw new Error('Flexi basket template not found. Please contact admin.');
  }

  
// Calculate total flexi amount available
const basicSalaryComponent = ctcAnnexure.monthlyBreakup.find(
  item => item.salaryHead === 'Basic'
);
const basicSalary = basicSalaryComponent ? basicSalaryComponent.annualAmount : 0;

// 🐛 BUG FIX: Use dynamic calculation, NOT fixed amount from template
const totalFlexiAmount = calculateTotalFlexiAmount(
  basicSalary,
  flexiBasket.calculationBasis,
  flexiBasket.calculationPercentage,
  flexiBasket.totalFlexiAmount // This should be 0 if using percentage calculation
);

console.log('🔍 Flexi Calculation Debug:', {
  basicSalary,
  calculationBasis: flexiBasket.calculationBasis,
  calculationPercentage: flexiBasket.calculationPercentage,
  fixedAmount: flexiBasket.totalFlexiAmount,
  calculatedFlexi: totalFlexiAmount
});
  // Validate declarations
  const validation = validateFlexiDeclaration(
  declarations, 
  totalFlexiAmount, 
  flexiBasket,
  basicSalary,
  ctcAnnexure.annualCTC,
  ctcAnnexure.template?.slabs || []
);
  
  if (!validation.isValid) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for flexi declaration',
      errors: validation.errors
    });
  }

  // Process declarations with limits and tax benefits
  const processedDeclarations = declarations.map(declaration => {
    const option = flexiBasket.options.find(opt => opt.headCode === declaration.headCode);
    const limits = calculateBenefitLimits(
      declaration.headCode,
      basicSalary,
      ctcAnnexure.annualCTC,
      ctcAnnexure.template.slabs || []
    );

    const monthlyAmount = Math.round(declaration.declaredAmount / 12);
    const taxBenefitAmount = calculateTaxBenefit(
      declaration.headCode,
      declaration.declaredAmount,
      limits.annualLimit
    );

    return {
      headCode: declaration.headCode,
      optionType: option.optionType,
      declaredUnits: declaration.declaredUnits || 0,
      declaredAmount: declaration.declaredAmount,
      monthlyAmount: monthlyAmount,
      limitPerMonth: limits.monthlyLimit,
      limitAsPerCTC: limits.annualLimit,
      taxBenefitAmount: taxBenefitAmount,
      isWithinLimit: declaration.declaredAmount <= limits.annualLimit,
      remark: declaration.remark || ''
    };
  });

  // Check if declaration already exists
  let flexiDeclaration = await FlexiDeclaration.findOne({
    employee: employeeId,
    financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
  });

  if (flexiDeclaration) {
    // Update existing declaration
    flexiDeclaration.declarations = processedDeclarations;
    flexiDeclaration.totalDeclaredAmount = validation.totalDeclared;
    flexiDeclaration.remainingBalance = validation.remainingBalance;
    flexiDeclaration.totalTaxBenefit = processedDeclarations.reduce(
      (sum, decl) => sum + decl.taxBenefitAmount, 0
    );
    flexiDeclaration.status = 'Draft'; // Reset to draft when updated
  } else {
    // Create new declaration
    flexiDeclaration = new FlexiDeclaration({
      company: employee.company,
      employee: employeeId,
      flexiBasket: flexiBasket._id,
      financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      basicSalary: basicSalary,
      totalFlexiAmount: totalFlexiAmount,
      declarations: processedDeclarations,
      totalDeclaredAmount: validation.totalDeclared,
      remainingBalance: validation.remainingBalance,
      totalTaxBenefit: processedDeclarations.reduce((sum, decl) => sum + decl.taxBenefitAmount, 0),
      status: 'Draft'
    });
  }

  const savedDeclaration = await flexiDeclaration.save();

  // Update CTC annexure with flexi declaration reference
  ctcAnnexure.flexiDeclaration = savedDeclaration._id;
  ctcAnnexure.hasFlexiBenefits = true;
  ctcAnnexure.totalFlexiAmount = validation.totalDeclared;
  await ctcAnnexure.save();

//   await createAuditLog(
//     req.user._id,
//     req.user.company,
//     'Flexi Declaration Updated',
//     { 
//       declarationId: savedDeclaration._id,
//       employee: employee.employeeId,
//       totalDeclared: validation.totalDeclared
//     }
//   );

  res.status(200).json({
    success: true,
    message: 'Flexi benefit declaration saved successfully',
    data: savedDeclaration,
    validation: {
      warnings: validation.warnings,
      remainingBalance: validation.remainingBalance
    }
  });
});

// @desc    Submit flexi declaration for approval
// @route   POST /api/flexi/declaration/:id/submit
// @access  Private/Admin/HR/Employee

export const submitFlexiDeclaration = asyncHandler(async (req, res) => {
  const declaration = await FlexiDeclaration.findById(req.params.id)
    .populate({
      path: 'employee',
      populate: { path: 'user', select: 'profile email' },
    });

  if (!declaration ) {
    res.status(404);
    throw new Error('Flexi declaration not found');
  }

  // Authorization check for employees
  if (req?.user?.role === 'Employee') {
    const employee = await Employee.findOne({ user: req?.user?._id });
    if (!employee) {
      res.status(403);
      throw new Error('Not authorized to submit this declaration');
    }
  }

  if (declaration.status !== 'Draft') {
    return res.status(400).json({
      success: false,
      message: 'Only draft declarations can be submitted for approval',
    });
    
  }

  declaration.status = 'Submitted';
  declaration.submittedAt = new Date();

  const savedDeclaration = await declaration.save();

//   await createAuditLog(
//     req.user._id,
//     req.user.company,
//     'Flexi Declaration Submitted',
//     { 
//       declarationId: savedDeclaration._id,
//       employee: declaration.employee.employeeId
//     }
//   );

  res.json({
    success: true,
    message: 'Flexi declaration submitted for approval',
    data: savedDeclaration
  });
});

// @desc    Approve flexi declaration
// @route   POST /api/flexi/declaration/:id/approve
// @access  Private/Admin/HR
 export const approveFlexiDeclaration = asyncHandler(async (req, res) => {
  const declaration = await FlexiDeclaration.findById(req.params.id)
     .populate({
      path: 'employee',
      populate: { path: 'user', select: 'profile email' },
    })
    .populate('flexiBasket');

  if (!declaration) {
    res.status(404);
    throw new Error('Flexi declaration not found');
  }

  if (declaration.status !== 'Submitted') {
    res.status(400);
    throw new Error('Only submitted declarations can be approved');
  }

  declaration.status = 'Approved';
  declaration.approvedAt = new Date();
  declaration.approvedBy = req.user._id;

  const savedDeclaration = await declaration.save();

//   await createAuditLog(
//     req.user._id,
//     req.user.company,
//     'Flexi Declaration Approved',
//     { 
//       declarationId: savedDeclaration._id,
//       employee: declaration.employee.employeeId
//     }
//   );

  res.json({
    success: true,
    message: 'Flexi declaration approved successfully',
    data: savedDeclaration
  });
});

// @desc    Calculate flexi balance and limits
// @route   POST /api/flexi/calculate
// @access  Private/Admin/HR/Employee
export const calculateFlexiBalance = asyncHandler(async (req, res) => {
  const { employeeId, declarations, financialYear } = req.body;

  // Get employee and CTC details
  const employee = await Employee.findById(employeeId);
  if (!employee ) {
    res.status(404);
    throw new Error('Employee not found');
  }

  const ctcAnnexure = await CTCAnnexure.findOne({
    employee: employeeId,
    financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
  }).populate('template');

  if (!ctcAnnexure) {
    res.status(404);
    throw new Error('CTC annexure not found');
  }

  const flexiBasket = await FlexiBasket.findOne({
    company: req.user.company,
    isActive: true
  });

  if (!flexiBasket) {
    res.status(404);
    throw new Error('Flexi basket template not found');
  }

  // Calculate basic salary and total flexi amount
  const basicSalaryComponent = ctcAnnexure.monthlyBreakup.find(
    item => item.salaryHead === 'Basic'
  );
  const basicSalary = basicSalaryComponent ? basicSalaryComponent.annualAmount : 0;

  const totalFlexiAmount = calculateTotalFlexiAmount(
    basicSalary,
    flexiBasket.calculationBasis,
    flexiBasket.calculationPercentage,
    flexiBasket.totalFlexiAmount
  );

  // Calculate declared total
  const totalDeclared = declarations.reduce((sum, decl) => sum + decl.declaredAmount, 0);
  const remainingBalance = totalFlexiAmount - totalDeclared;

  // Calculate limits for each declaration
  const declarationsWithLimits = declarations.map(declaration => {
    const limits = calculateBenefitLimits(
      declaration.headCode,
      basicSalary,
      ctcAnnexure.annualCTC,
      ctcAnnexure.template.slabs || []
    );

    return {
      ...declaration,
      limitPerMonth: limits.monthlyLimit,
      limitAsPerCTC: limits.annualLimit,
      isWithinLimit: declaration.declaredAmount <= limits.annualLimit,
      calculationBasis: limits.calculationBasis
    };
  });

  res.json({
    success: true,
    data: {
      basicSalary,
      totalFlexiAmount,
      totalDeclared,
      remainingBalance,
      declarations: declarationsWithLimits,
      statutoryBonus: 0, // This would be calculated based on company policy
      flexiBalance: remainingBalance
    }
  });
});

