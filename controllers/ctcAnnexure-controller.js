import asyncHandler from 'express-async-handler';
import CTCAnnexure from '../models/CTCAnnexure.js';
import CTCTemplate from '../models/CTCTemplate.js';
import { FlexiDeclaration } from '../models/FlexiBasket.js';
import Employee from '../models/Employee.js';
//import { createAuditLog } from '../services/auditService.js';
import { calculateCTCFromTemplate, calculateHRAExemption } from '../utils/ctcCalculations.js';
import { calculateTotalFlexiAmount } from '../utils/flexiCalculations.js';


// @desc    Create CTC Annexure for employee using company template
// @route   POST /api/ctc/employee
// @access  Private/Admin/HR
export const createCTCAnnexure = asyncHandler(async (req, res) => {
  const { 
    employee, 
    annualCTC, 
    financialYear,  
    companyId,
    includeFlexiBenefits = false,
    useTemplate = true,
    customComponents = [] // 👈 New input: custom salary structure
  } = req.body;

  let template = null;
  if (useTemplate) {
    template = await CTCTemplate.findOne({ company: companyId, isActive: true });
  }

  // ✅ Validate employee
  const employeeRecord = await Employee.findOne({ _id: employee, company: companyId });
  if (!employeeRecord) {
    return res.status(404).json({
      success: false,
      message: 'Employee not found in the company'
    });
  }

  // ✅ Check for existing CTC
  const existingCTC = await CTCAnnexure.findOne({
    employee,
    financialYear: financialYear || template?.financialYear
  });

  if (existingCTC) {
    return res.status(400).json({
      success: false,
      message: 'CTC annexure already exists for this employee for the specified financial year'
    });
  }

  // ==============================================
  // CASE 1: Company uses a template
  // ==============================================
  let breakdown = [];
  let summary = {};

  if (template) {
    const result = calculateCTCFromTemplate(annualCTC, template);
    breakdown = result.breakdown;
    summary = result.summary;
  } else {
    // ==============================================
    // CASE 2: No template (use fallback or custom)
    // ==============================================
    if (customComponents.length > 0) {
      // ✅ Custom structure from client
      let totalAmount = 0;

      breakdown = customComponents.map(comp => {
        let annualAmount = 0;

        if (comp.percentage) {
          annualAmount = Math.round(annualCTC * (comp.percentage / 100));
        } else if (comp.fixed) {
          annualAmount = comp.fixed;
        }

        totalAmount += annualAmount;

        return {
          salaryHead: comp.name,
          annualAmount,
          monthlyAmount: Math.round(annualAmount / 12),
          calculationBasis: comp.percentage ? `${comp.percentage}% of CTC` : 'Fixed',
          exemptionLimit: comp.exemptionLimit || 'N/A',
          taxableAmount: comp.isTaxable ? annualAmount : 0,
          isFlexiComponent: false
        };
      });

      // Adjust if total < CTC (assign remainder to Special Allowance)
      if (totalAmount < annualCTC) {
        const remaining = annualCTC - totalAmount;
        breakdown.push({
          salaryHead: 'Special Allowance',
          annualAmount: remaining,
          monthlyAmount: Math.round(remaining / 12),
          calculationBasis: 'Remaining from CTC',
          exemptionLimit: 'N/A',
          taxableAmount: remaining,
          isFlexiComponent: false
        });
      }

    } else {
      // ✅ Default fallback if no custom structure provided
      const basic = Math.round(annualCTC * 0.4);
      const hra = Math.round(basic * 0.5);
      const pfEmployer = Math.round(basic * 0.12);
      const specialAllowance = Math.max(0, annualCTC - (basic + hra + pfEmployer));

      breakdown = [
        {
          salaryHead: 'Basic',
          annualAmount: basic,
          monthlyAmount: Math.round(basic / 12),
          calculationBasis: '40% of CTC',
          exemptionLimit: 'N/A',
          taxableAmount: basic,
          isFlexiComponent: false
        },
        {
          salaryHead: 'HRA',
          annualAmount: hra,
          monthlyAmount: Math.round(hra / 12),
          calculationBasis: '50% of Basic',
          exemptionLimit: 'As per Income Tax Rules',
          taxableAmount: hra,
          isFlexiComponent: false
        },
        {
          salaryHead: 'Employer PF Contribution',
          annualAmount: pfEmployer,
          monthlyAmount: Math.round(pfEmployer / 12),
          calculationBasis: '12% of Basic',
          exemptionLimit: 'As per PF Rules',
          taxableAmount: 0,
          isFlexiComponent: false
        },
        {
          salaryHead: 'Special Allowance',
          annualAmount: specialAllowance,
          monthlyAmount: Math.round(specialAllowance / 12),
          calculationBasis: 'Remaining from CTC',
          exemptionLimit: 'N/A',
          taxableAmount: specialAllowance,
          isFlexiComponent: false
        }
      ];
    }

    // ✅ Summary calculation
    const totalEarnings = breakdown.reduce((sum, item) => sum + item.annualAmount, 0);
    summary = {
      fixedSalary: totalEarnings,
      flexiBenefits: 0,
      reimbursement: 0,
      benefits: 0,
      totalGrossEarning: totalEarnings,
      totalDeductions: 0,
      netSalary: totalEarnings,
      difference: annualCTC - totalEarnings
    };
  }

  // ==============================================
  // Add Flexi Benefits (optional)
  // ==============================================
  let flexiData = { hasFlexiBenefits: false, totalFlexiAmount: 0 };

  if (includeFlexiBenefits) {
    const basicSalaryComponent = breakdown.find(item => item.salaryHead === 'Basic');
    const basicSalary = basicSalaryComponent ? basicSalaryComponent.annualAmount : 0;
    const flexiAmount = calculateTotalFlexiAmount(basicSalary, 'Basic Salary', 30, 0);

    flexiData = { hasFlexiBenefits: true, totalFlexiAmount: flexiAmount };

    breakdown.push({
      salaryHead: 'Flexi Benefits Basket',
      annualAmount: flexiAmount,
      monthlyAmount: Math.round(flexiAmount / 12),
      calculationBasis: '30% of Basic Salary',
      exemptionLimit: 'As per employee declaration and tax rules',
      taxableAmount: 0,
      isFlexiComponent: true
    });

    summary.flexiBenefits = flexiAmount;
  }

  // ==============================================
  // Save Annexure
  // ==============================================
  const ctcAnnexure = new CTCAnnexure({
    company: companyId,
    employee,
    template: template?._id || null,
    financialYear: financialYear || template?.financialYear || new Date().getFullYear(),
    annualCTC,
    monthlyBreakup: breakdown,
    summary,
    hasFlexiBenefits: flexiData.hasFlexiBenefits,
    totalFlexiAmount: flexiData.totalFlexiAmount,
    status: 'Active'
  });

  const savedAnnexure = await ctcAnnexure.save();

  res.status(201).json({
    success: true,
    message: template
      ? 'CTC annexure created using company template'
      : (customComponents.length > 0
          ? 'CTC annexure created using custom structure'
          : 'CTC annexure created with default structure'),
    data: savedAnnexure,
    flexiEligible: flexiData.hasFlexiBenefits
  });
});

// @desc    Get CTC annexure for employee with flexi details
// @route   GET /api/ctc/employee/:employeeId
// @access  Private/Admin/HR/Employee
export const getCTCByEmployee = asyncHandler(async (req, res) => {
  const { employeeId, companyId } = req.params;
  const { financialYear } = req.query;
  

  let query = { 
    employee: employeeId,
    company: companyId 
  };

  if (financialYear) {
    query.financialYear = financialYear;
  }

  const annexure = await CTCAnnexure.findOne(query)
   .populate({
  path: 'employee',
  populate: [
    { path: 'user', select: 'email profile' },
    { path: 'employmentDetails.department' }
  ]
})
    .populate('template', 'templateName financialYear')
    .populate('flexiDeclaration')
    .sort({ createdAt: -1 });

  if (!annexure) {
    return res.status(404).json({
      success: false,
      message: 'CTC annexure not found for the employee'
    });
  }

  // Authorization check for employees
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this CTC data'
      });
    }
  }

  // Get flexi declaration details if exists
  let flexiDetails = null;
  if (annexure.flexiDeclaration) {
    flexiDetails = await FlexiDeclaration.findById(annexure.flexiDeclaration)
      .populate('flexiBasket', 'name options');
  }

  res.json({
    success: true,
    data: {
      ...annexure.toObject(),
      flexiDetails
    }
  });
});

// @desc    Get CTC with flexi breakdown
// @route   GET /api/ctc/:id/breakdown
// @access  Private/Admin/HR/Employee
export const getCTCBreakdown = asyncHandler(async (req, res) => {
  const annexure = await CTCAnnexure.findById(req.params.id)
    .populate('employee', 'name employeeId department designation')
    .populate('flexiDeclaration');

  const { companyId } = req.params;

  if (!annexure ) {
    return res.status(404).json({
      success: false,
      message: 'CTC annexure not found'
    });
  }

  // Authorization check
  if (req.user.role === 'Employee') {
    const employee = await Employee.findOne({ user: req.user._id });
    if (!employee ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this CTC data'
      });
    }
  }

  // Calculate detailed breakdown with flexi components
  const breakdown = {
    fixedComponents: annexure.monthlyBreakup.filter(item => !item.isFlexiComponent),
    flexiComponents: [],
    totalFlexiAllocated: annexure.totalFlexiAmount,
    totalFlexiUtilized: 0
  };

  // If flexi declaration exists, add detailed flexi breakdown
  if (annexure.flexiDeclaration) {
    const flexiDeclaration = await FlexiDeclaration.findById(annexure.flexiDeclaration)
      .populate('flexiBasket', 'name');
    
    if (flexiDeclaration) {
      breakdown.flexiComponents = flexiDeclaration.declarations;
      breakdown.totalFlexiUtilized = flexiDeclaration.totalDeclaredAmount;
      breakdown.flexiBalance = flexiDeclaration.remainingBalance;
    }
  }

  res.json({
    success: true,
    data: {
      annexure,
      breakdown
    }
  });
});

// @desc    Update CTC with flexi integration
// @route   PUT /api/ctc/:id
// @access  Private/Admin/HR
export const updateCTCAnnexure = asyncHandler(async (req, res) => {
  const { annualCTC, financialYear, includeFlexiBenefits } = req.body;
 const { companyId } = req.params;
  const annexure = await CTCAnnexure.findById(req.params.ctcAnnexureId)
    .populate('template')
    .populate('flexiDeclaration');

  if (!annexure ) {
    return res.status(404).json({
      success: false,
      message: 'CTC annexure not found'
    });
  }

  const oldData = {
    annualCTC: annexure.annualCTC,
    hasFlexiBenefits: annexure.hasFlexiBenefits,
    totalFlexiAmount: annexure.totalFlexiAmount
  };

  // Recalculate if CTC changed or flexi benefits option changed
  if (annualCTC !== annexure.annualCTC || includeFlexiBenefits !== annexure.hasFlexiBenefits) {
    const template = await CTCTemplate.findById(annexure.template);
    const { breakdown, summary } = calculateCTCFromTemplate(annualCTC, template);

    // Update flexi benefits if changed
    let flexiData = {
      hasFlexiBenefits: annexure.hasFlexiBenefits,
      totalFlexiAmount: annexure.totalFlexiAmount
    };

    if (includeFlexiBenefits !== undefined && includeFlexiBenefits !== annexure.hasFlexiBenefits) {
      if (includeFlexiBenefits) {
        const basicSalaryComponent = breakdown.find(item => item.salaryHead === 'Basic');
        const basicSalary = basicSalaryComponent ? basicSalaryComponent.annualAmount : 0;
        const flexiAmount = calculateTotalFlexiAmount(basicSalary, 'Basic Salary', 30, 0);
        
        flexiData = {
          hasFlexiBenefits: true,
          totalFlexiAmount: flexiAmount
        };

        // Add flexi component
        breakdown.push({
          salaryHead: 'Flexi Benefits Basket',
          annualAmount: flexiAmount,
          monthlyAmount: Math.round(flexiAmount / 12),
          calculationBasis: '30% of Basic Salary',
          exemptionLimit: 'As per employee declaration and tax rules',
          taxableAmount: 0,
          isFlexiComponent: true
        });
      } else {
        // Remove flexi component
        const filteredBreakdown = breakdown.filter(item => !item.isFlexiComponent);
        breakdown.length = 0;
        breakdown.push(...filteredBreakdown);
        flexiData = {
          hasFlexiBenefits: false,
          totalFlexiAmount: 0
        };
      }
    }

    annexure.annualCTC = annualCTC;
    annexure.monthlyBreakup = breakdown;
    annexure.summary = {
      ...summary,
      flexiBenefits: flexiData.totalFlexiAmount
    };
    annexure.hasFlexiBenefits = flexiData.hasFlexiBenefits;
    annexure.totalFlexiAmount = flexiData.totalFlexiAmount;
  }

  if (financialYear) {
    annexure.financialYear = financialYear;
  }

  const updatedAnnexure = await annexure.save();

  // await createAuditLog(
  //   req.user._id,
  //   companyId,
  //   'CTC Annexure Updated',
  //   {
  //     annexureId: updatedAnnexure._id,
  //     oldData: oldData,
  //     newData: {
  //       annualCTC: updatedAnnexure.annualCTC,
  //       hasFlexiBenefits: updatedAnnexure.hasFlexiBenefits,
  //       totalFlexiAmount: updatedAnnexure.totalFlexiAmount
  //     }
  //   }
  // );

  res.json({
    success: true,
    message: 'CTC annexure updated successfully',
    data: updatedAnnexure
  });
});

// @desc    Get employees eligible for flexi benefits
// @route   GET /api/ctc/flexi/eligible
// @access  Private/Admin/HR
export const getFlexiEligibleEmployees = asyncHandler(async (req, res) => {
  const { department, pageSize = 20, pageNumber = 1 } = req.query;
 const { companyId } = req.params;
  let query = { 
    company: companyId,
    hasFlexiBenefits: true 
  };

  if (department) {
    const employeesInDept = await Employee.find({ 
      department, 
      company: companyId 
    }).select('_id');
    query.employee = { $in: employeesInDept.map(emp => emp._id) };
  }

  const count = await CTCAnnexure.countDocuments(query);
  const annexures = await CTCAnnexure.find(query)
     .populate({
  path: 'employee',
  populate: [
    { path: 'user', select: 'email profile' },
    { path: 'employmentDetails.department' }
  ]
})
    .populate('flexiDeclaration')
    .limit(parseInt(pageSize))
    .skip(parseInt(pageSize) * (parseInt(pageNumber) - 1))
    .sort({ createdAt: -1 });

  // Enhance with flexi declaration status
  const enhancedData = annexures.map(annexure => ({
    ...annexure.toObject(),
    flexiStatus: annexure.flexiDeclaration ? 
      (annexure.flexiDeclaration.status || 'Declared') : 'Not Declared',
    flexiUtilized: annexure.flexiDeclaration ? 
      annexure.flexiDeclaration.totalDeclaredAmount : 0,
    flexiBalance: annexure.flexiDeclaration ? 
      annexure.flexiDeclaration.remainingBalance : annexure.totalFlexiAmount
  }));

  res.json({
    success: true,
    data: {
      employees: enhancedData,
      totalCount: count,
      page: parseInt(pageNumber),
      pages: Math.ceil(count / parseInt(pageSize)),
      summary: {
        totalEligible: count,
        declared: enhancedData.filter(item => item.flexiDeclaration).length,
        pending: enhancedData.filter(item => !item.flexiDeclaration).length
      }
    }
  });
});


// @desc    Bulk create CTC for multiple employees
// @route   POST /api/ctc/bulk
// @access  Private/Admin/HR
export const bulkCreateCTC = asyncHandler(async (req, res) => {
  const { employees } = req.body; // Array of { employeeId, annualCTC }

  const template = await CTCTemplate.findOne({ 
    company: req.params.companyId,
    isActive: true 
  });

  if (!template) {
   return res.status(404).json({
      success: false,
      message: 'Please setup CTC template for your company first'
    });
  }

  const results = {
    success: [],
    failed: []
  };

  for (const item of employees) {
    try {
      const employeeRecord = await Employee.findOne({
        'employmentDetails.employeeId': item.employeeId,
        company: req.params.companyId
      });

      if (!employeeRecord) {
        results.failed.push({
          employeeId: item.employeeId,
          error: 'Employee not found'
        });
        continue;
      }

      // Check if CTC already exists
      const existingCTC = await CTCAnnexure.findOne({
        employee: employeeRecord._id,
        financialYear: template.financialYear
      });

      if (existingCTC) {
        results.failed.push({
          employeeId: item.employeeId,
          error: 'CTC already exists'
        });
        continue;
      }

      // Calculate CTC breakdown
      const { breakdown, summary } = calculateCTCFromTemplate(item.annualCTC, template);

      // Create CTC annexure
      const ctcAnnexure = new CTCAnnexure({
        company: req.params.companyId,
        employee: employeeRecord._id,
        template: template._id,
        financialYear: template.financialYear,
        annualCTC: item.annualCTC,
        monthlyBreakup: breakdown,
        summary,
        status: 'Approved'
      });

      const savedAnnexure = await ctcAnnexure.save();
      results.success.push({
        employeeId: item.employeeId,
        annexureId: savedAnnexure._id
      });

    } catch (error) {
      results.failed.push({
        employeeId: item.employeeId,
        error: error.message
      });
    }
  }

  // await createAuditLog(
  //   req.user._id,
  //   req.user.company,
  //   'Bulk CTC Creation',
  //   { 
  //     successCount: results.success.length,
  //     failedCount: results.failed.length 
  //   }
  // );

  res.json(results);
});



// @desc    Get all CTC annexures
// @route   GET /api/ctc
// @access  Private/Admin/HR
export const getAllCTCAnnexures = asyncHandler(async (req, res) => {
  const pageSize = parseInt(req.query.pageSize) || 10;
  const page = parseInt(req.query.pageNumber) || 1;
  const { department, status, financialYear, employeeId } = req.query;

  let query = { company: req.params.companyId };

  if (employeeId) {
    const employee = await Employee.findOne({ 
      employeeId, 
      company: req.params.companyId 
    });
    if (employee) {
      query.employee = employee._id;
    }
  }

  if (department) {
    const employeesInDept = await Employee.find({ 
      department, 
      company: req.params.companyId 
    }).select('_id');
    query.employee = { $in: employeesInDept.map(emp => emp._id) };
  }

  if (status) {
    query.status = status;
  }

  if (financialYear) {
    query.financialYear = financialYear;
  }

  const count = await CTCAnnexure.countDocuments(query);
  const annexures = await CTCAnnexure.find(query)
   .populate({
  path: 'employee',
  populate: [
    { path: 'user', select: 'email profile' },
    { path: 'employmentDetails.department' }
  ]
})

    .populate('template', 'templateName')
    .limit(pageSize)
    .skip(pageSize * (page - 1))
    .sort({ createdAt: -1 });

  res.json({
    annexures,
    page,
    pages: Math.ceil(count / pageSize),
    total: count
  });
});

// Other controller functions (approve, delete, summary) remain similar...


// @desc    Calculate HRA exemption for employee using their CTC data
// @route   POST /api/flexi/hra/calculate/:employeeId
// @access  Private/Admin/HR/Employee
export const calculateHRAExemptionAPI = asyncHandler(async (req, res) => {
  const { employeeId } = req.params;
  const { monthlyRent, isMetroCity, financialYear } = req.body;

  // For employees, they can only calculate their own HRA
  let targetEmployeeId = employeeId;
  
  if (req?.user?.role === 'employee') {
    const employee = await Employee.findOne({ user: req?.user?._id });
    if (!employee) {
      res.status(404);
      throw new Error('Employee record not found for this user');
    }
    targetEmployeeId = employee?._id;
  }

  // Get employee details
  const employee = await Employee.findById(targetEmployeeId)
    .select('name employeeId department designation');

  if (!employee ) {
    res.status(404);
    throw new Error('Employee not found in your company');
  }

  // Get active CTC annexure for the employee
  const ctcAnnexure = await CTCAnnexure.findOne({
    employee: targetEmployeeId,
    status: 'Active',
    financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    
  });

  if (!ctcAnnexure) {
    res.status(404);
    throw new Error('Active CTC annexure not found for this employee');
  }

  // Get basic salary from CTC breakdown
  const basicSalaryComponent = ctcAnnexure.monthlyBreakup.find(
    item => item.salaryHead === 'Basic'
  );
  
  const basicSalary = basicSalaryComponent ? basicSalaryComponent.annualAmount : 0;

  if (!basicSalary) {
    res.status(400);
    throw new Error('Basic salary not found in CTC breakdown');
  }

  // Get declared HRA from flexi declaration (if exists)
  let declaredHRA = 0;
  const flexiDeclaration = await FlexiDeclaration.findOne({
    employee: targetEmployeeId,
    financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    company: employee?.company
  });

  if (flexiDeclaration) {
    const hraDeclaration = flexiDeclaration.declarations.find(
      decl => decl.headCode === 'HRA'
    );
    declaredHRA = hraDeclaration ? hraDeclaration.declaredAmount : 0;
  }

  // If no HRA declared, check CTC for HRA component
  if (!declaredHRA) {
    const hraComponent = ctcAnnexure.monthlyBreakup.find(
      item => item.salaryHead === 'HRA'
    );
    declaredHRA = hraComponent ? hraComponent.annualAmount : 0;
  }

  // Validate required parameters
  if (!monthlyRent) {
    res.status(400);
    throw new Error('Monthly rent amount is required for HRA calculation');
  }

  if (isMetroCity === undefined) {
    res.status(400);
    throw new Error('isMetroCity field is required (true for metro, false for non-metro)');
  }

  // Calculate HRA exemption
  const exemption = calculateHRAExemption(
    basicSalary,
    declaredHRA,
    monthlyRent,
    isMetroCity,
    0 // dearness allowance - aap add kar sakte hain agar company mein hai
  );

  ctcAnnexure.hraExemption = exemption?.exemptionAmount;
  await ctcAnnexure.save();

  // Prepare response with all details
  const response = {
    employee: {
      id: employee._id,
      name: employee.name,
      employeeId: employee.employeeId,
      department: employee.department
    },
    ctcDetails: {
      annualCTC: ctcAnnexure.annualCTC,
      basicSalary: basicSalary,
      declaredHRA: declaredHRA,
      financialYear: ctcAnnexure.financialYear
    },
    rentDetails: {
      monthlyRent: monthlyRent,
      annualRent: monthlyRent * 12,
      isMetroCity: isMetroCity,
      cityType: isMetroCity ? 'Metro City' : 'Non-Metro City'
    },
    exemptionCalculation: exemption,
    recommendations: generateHRARecommendations(basicSalary, declaredHRA, monthlyRent, isMetroCity)
  };

  // Audit log
  // await createAuditLog(
  //   req.user._id,
  //   req.user.company,
  //   'HRA Exemption Calculated',
  //   {
  //     employee: employee.employeeId,
  //     monthlyRent: monthlyRent,
  //     isMetroCity: isMetroCity,
  //     exemptionAmount: exemption.exemptionAmount
  //   }
  // );

  res.json({
    success: true,
    message: 'HRA exemption calculated successfully',
    data: response
  });
});

/**
 * Generate HRA optimization recommendations
 */
const generateHRARecommendations = (basicSalary, declaredHRA, monthlyRent, isMetroCity) => {
  const recommendations = [];
  const annualRent = monthlyRent * 12;
  const statutoryLimit = basicSalary * (isMetroCity ? 0.5 : 0.4);
  const rentMinusTenPercent = annualRent - (basicSalary * 0.1);

  // Check if declared HRA is optimal
  if (declaredHRA < statutoryLimit && declaredHRA < rentMinusTenPercent) {
    recommendations.push({
      type: 'INCREASE_HRA',
      message: `You can increase HRA declaration up to ₹${Math.min(statutoryLimit, rentMinusTenPercent).toLocaleString()} for better tax savings`,
      current: declaredHRA,
      suggested: Math.min(statutoryLimit, rentMinusTenPercent),
      potentialSavings: Math.min(statutoryLimit, rentMinusTenPercent) - declaredHRA
    });
  }

  if (declaredHRA > Math.min(statutoryLimit, rentMinusTenPercent)) {
    recommendations.push({
      type: 'DECREASE_HRA',
      message: `You have declared more HRA than exemptible amount. Consider reducing to ₹${Math.min(statutoryLimit, rentMinusTenPercent).toLocaleString()}`,
      current: declaredHRA,
      suggested: Math.min(statutoryLimit, rentMinusTenPercent),
      excess: declaredHRA - Math.min(statutoryLimit, rentMinusTenPercent)
    });
  }

  // Check rent payment
  if (annualRent < basicSalary * 0.1) {
    recommendations.push({
      type: 'RENT_TOO_LOW',
      message: 'Your rent is less than 10% of basic salary. No HRA exemption available under rent calculation.',
      impact: 'Limited to statutory limit only'
    });
  }

  return recommendations;
};
