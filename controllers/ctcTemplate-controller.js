import asyncHandler from "express-async-handler";
import CTCTemplate from "../models/CTCTemplate.js";
//import { createAuditLog } from "../services/auditService.js";


// @desc    Get company CTC template
// @route   GET /api/ctc/template
// @access  Private/Admin/HR
export const getCTCTemplate = asyncHandler(async (req, res) => {
  const template = await CTCTemplate.findOne({ 
    company: req.params.companyId,
    isActive: true 
  });

  if (!template) {
    res.status(404);
    throw new Error('CTC template not found for your company');
  }

  res.json(template);
});

// @desc    Create or Update company CTC template
// @route   POST /api/ctc/template
// @access  Private/Admin/HR
export const createOrUpdateCTCTemplate = asyncHandler(async (req, res) => {
  const { templateName, salaryHeads, slabs, financialYear, companyId } = req.body;

  // Check if template already exists
  let template = await CTCTemplate.findOne({ company: companyId });

  const defaultSalaryHeads = [
    { name: 'Basic', calculationType: 'percentage', calculationValue: 40, calculationBasis: '40% of CTC', exemptionLimit: 'Nil', isTaxable: true, order: 1 },
    { name: 'HRA', calculationType: 'percentage', calculationValue: 20, calculationBasis: '20% of CTC', exemptionLimit: 'Actual Basic, 40%/50% of Basic, Rent Paid-10% of Basic - Whichever is lower', isTaxable: true, order: 2 },
    { name: 'Special City Allowance', calculationType: 'percentage', calculationValue: 16, calculationBasis: '16% of CTC', exemptionLimit: 'Fully Taxable', isTaxable: true, order: 3 },
    { name: 'Education Allowance', calculationType: 'fixed', calculationValue: 200, calculationBasis: 'Fixed', exemptionLimit: '10000', isTaxable: true, order: 4 },
    { name: 'Other Allowance', calculationType: 'formula', calculationBasis: 'Balancing Figure', exemptionLimit: 'Fully Taxable', isTaxable: true, order: 5 },
    { name: 'Leave Travel Assistance', calculationType: 'slab', calculationBasis: 'As per slab', exemptionLimit: 'Exempt twice in a block of 4 years', isTaxable: false, order: 6 },
    { name: 'Fuel & Maintenance Reimbursement', calculationType: 'slab', calculationBasis: 'As per slab', exemptionLimit: 'Rs 1800/- for <1600cc, Rs 2400/- for >1600cc', isTaxable: false, order: 7 },
    { name: 'Bonus', calculationType: 'formula', calculationBasis: 'MIN(25000,BASIC PM)', exemptionLimit: 'Non payable head', isTaxable: false, order: 8 },
    { name: 'Company Contribution to PF', calculationType: 'fixed', calculationValue: 21600, calculationBasis: 'Rs 1800/- per month', exemptionLimit: '', isTaxable: false, order: 9 },
    { name: 'Gratuity', calculationType: 'percentage', calculationValue: 4.81, calculationBasis: '4.81% of Basic', exemptionLimit: '', isTaxable: false, order: 10 },
    { name: 'Company Contribution to ESIC', calculationType: 'percentage', calculationValue: 3.25, calculationBasis: '3.25% of Gross salary', exemptionLimit: '', isTaxable: false, order: 11 },
    { name: 'Employee Contribution to PF', calculationType: 'fixed', calculationValue: 21600, calculationBasis: 'Rs 1800/- per month', exemptionLimit: '', isTaxable: false, order: 12 },
    { name: 'Employee Contribution to ESIC', calculationType: 'percentage', calculationValue: 0.75, calculationBasis: '0.75% of Gross salary', exemptionLimit: '', isTaxable: false, order: 13 },
    { name: 'Professional Tax', calculationType: 'fixed', calculationValue: 0, calculationBasis: 'As per State PT Slab', exemptionLimit: '', isTaxable: false, order: 14 }
  ];

  const defaultSlabs = [
    // LTA Slabs
    { slabType: 'LTA', salaryMin: 700000, salaryMax: 1000000, value: 30000, description: 'Leave Travel Assistance' },
    { slabType: 'LTA', salaryMin: 1000000, salaryMax: 1500000, value: 40000, description: 'Leave Travel Assistance' },
    { slabType: 'LTA', salaryMin: 1500000, salaryMax: 3000000, value: 50000, description: 'Leave Travel Assistance' },
    { slabType: 'LTA', salaryMin: 3000000, salaryMax: 999999999, value: 60000, description: 'Leave Travel Assistance' },

    // Fuel Slabs
    { slabType: 'Fuel', salaryMin: 0, salaryMax: 700000, value: 25000, description: 'Fuel & Maintenance' },
    { slabType: 'Fuel', salaryMin: 700000, salaryMax: 1000000, value: 24000, description: 'Fuel & Maintenance' },
    { slabType: 'Fuel', salaryMin: 1000000, salaryMax: 1500000, value: 24000, description: 'Fuel & Maintenance' },
    { slabType: 'Fuel', salaryMin: 1500000, salaryMax: 3000000, value: 24000, description: 'Fuel & Maintenance' },
    { slabType: 'Fuel', salaryMin: 3000000, salaryMax: 999999999, value: 39600, description: 'Fuel & Maintenance' },

    // Add other default slabs...
  ];

  if (template) {
    // Update existing template
    template.templateName = templateName || template.templateName;
    template.salaryHeads = salaryHeads || template.salaryHeads;
    template.slabs = slabs || template.slabs;
    template.financialYear = financialYear || template.financialYear;
  } else {
    // Create new template with defaults
    template = new CTCTemplate({
      company: companyId,
      templateName: templateName || 'Standard CTC Template',
      salaryHeads: salaryHeads || defaultSalaryHeads,
      slabs: slabs || defaultSlabs,
      financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`
    });
  }

  const savedTemplate = await template.save();

  // await createAuditLog(
  //   req.user._id,
  //   req.user.company,
  //   'CTC Template Updated',
  //   { templateId: savedTemplate._id }
  // );

  res.status(200).json(savedTemplate);
});

