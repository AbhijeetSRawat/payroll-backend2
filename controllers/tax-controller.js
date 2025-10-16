import asyncHandler from 'express-async-handler';
import { TaxComputation, TaxDeclaration } from '../models/TaxCalculation.js';
import {
  getEmployeeIncomeData,
  calculateGrossSalary,
  calculateExemptions,
  calculateDeductions,
  calculateNetTaxableIncome,
} from '../services/taxCalculationService.js';
import { calculateTax } from '../utils/taxCalculations.js';
import { createAuditLog } from '../services/auditService.js';
import Employee from '../models/Employee.js';

// @desc    Calculate tax for employee
// @route   POST /api/tax/calculate/:employeeId/:companyId
// @access  Private/Admin/HR/Employee
const calculateEmployeeTax = asyncHandler(async (req, res) => {
  const { employeeId, companyId } = req.params;
  const { financialYear, rentDetails, otherIncome } = req.body;

  try {
    // Authorization check
    let targetEmployeeId = employeeId;
    if (req?.user?.role === 'Employee') {
      const employee = await Employee.findOne({ user: req.user._id });
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found' });
      }
      targetEmployeeId = employee._id;
    }

    // Get existing data
    const { ctcAnnexure, flexiDeclaration, employee } = await getEmployeeIncomeData(
      targetEmployeeId,
      financialYear,
      companyId
    );

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee details not found' });
    }

    if (!ctcAnnexure) {
      return res.status(404).json({ success: false, message: 'CTC Annexure not found for this employee' });
    }

    // Get tax declaration (optional)
    const taxDeclaration = await TaxDeclaration.findOne({
      employee: targetEmployeeId,
      financialYear,
      company: companyId,
    });

    // Perform all calculations
    const grossSalary = calculateGrossSalary(ctcAnnexure, flexiDeclaration);
    const basicSalary =
      ctcAnnexure.monthlyBreakup.find((item) => item.salaryHead === 'Basic')?.annualAmount || 0;

    const { totalExemptions, exemptionBreakdown } = calculateExemptions(
      flexiDeclaration,
      basicSalary,
      rentDetails
    );

    const { totalDeductions, deductionBreakdown } = calculateDeductions(taxDeclaration);

    const netTaxableIncome = calculateNetTaxableIncome(
      grossSalary,
      totalExemptions,
      totalDeductions,
      otherIncome || 0
    );

    // Calculate taxes under both regimes
    const oldRegimeTax = calculateTax(netTaxableIncome, 'old');
    const newRegimeTax = calculateTax(netTaxableIncome, 'new');

    const recommendedRegime =
      oldRegimeTax.totalTax <= newRegimeTax.totalTax ? 'old' : 'new';
    const finalTaxLiability =
      recommendedRegime === 'old' ? oldRegimeTax.totalTax : newRegimeTax.totalTax;

    // Create or update tax computation
    let taxComputation = await TaxComputation.findOne({
      employee: targetEmployeeId,
      financialYear,
      company: companyId,
    });

    const computationData = {
      company: companyId,
      employee: targetEmployeeId,
      ctcAnnexure: ctcAnnexure._id,
      flexiDeclaration: flexiDeclaration?._id,
      taxDeclaration: taxDeclaration?._id,
      financialYear,
      calculationSummary: {
        grossSalary,
        totalExemptions,
        totalDeductions,
        netTaxableIncome,
        oldRegimeTax: oldRegimeTax.totalTax,
        newRegimeTax: newRegimeTax.totalTax,
        recommendedRegime,
        finalTaxLiability,
      },
      calculatedBy: req?.user?._id,
      calculatedAt: new Date(),
      status: 'calculated',
    };

    if (taxComputation) {
      taxComputation = await TaxComputation.findByIdAndUpdate(
        taxComputation._id,
        computationData,
        { new: true }
      );
    } else {
      taxComputation = new TaxComputation(computationData);
      await taxComputation.save();
    }

    // Log audit
    await createAuditLog(req?.user?._id, req?.user?.company, 'Tax Calculation Completed', {
      employee: employee.employeeId,
      financialYear,
      grossSalary,
      netTaxableIncome,
      finalTaxLiability,
    });

    // Success response
    return res.json({
      success: true,
      message: 'Tax calculation completed successfully',
      data: {
        employee: {
          id: employee._id,
          name: employee.name,
          employeeId: employee.employeeId,
        },
        incomeSummary: {
          grossSalary,
          basicSalary,
          totalExemptions,
          totalDeductions,
          netTaxableIncome,
        },
        exemptionBreakdown,
        deductionBreakdown,
        taxComparison: {
          oldRegime: {
            tax: oldRegimeTax.totalTax,
            slabs: oldRegimeTax.taxSlabs,
          },
          newRegime: {
            tax: newRegimeTax.totalTax,
            slabs: newRegimeTax.taxSlabs,
          },
          recommendedRegime,
          finalTaxLiability,
        },
        computationId: taxComputation._id,
      },
    });
  } catch (error) {
    console.error('❌ Tax Calculation Error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to calculate tax. Please check employee data.',
    });
  }
});

// @desc    Get tax computation for employee
// @route   GET /api/tax/computation/:employeeId/:companyId
// @access  Private/Admin/HR/Employee
const getTaxComputation = asyncHandler(async (req, res) => {
  const { employeeId, companyId } = req.params;
  const { financialYear } = req.query;

  try {
    let targetEmployeeId = employeeId;

    if (req?.user?.role === 'Employee') {
      const employee = await Employee.findOne({ user: req?.user?._id });
      if (!employee || employee._id.toString() !== employeeId) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this tax data',
        });
      }
    }

    const taxComputation = await TaxComputation.findOne({
      employee: targetEmployeeId,
      financialYear: financialYear || `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
      company: companyId,
    })
      .populate('ctcAnnexure')
      .populate('flexiDeclaration')
      .populate('taxDeclaration')
      .populate('calculatedBy', 'name')
      .populate('approvedBy', 'name');

    if (!taxComputation) {
      return res.status(404).json({
        success: false,
        message: 'Tax computation not found for this employee or financial year',
      });
    }

    res.json({
      success: true,
      data: taxComputation,
    });
  } catch (error) {
    console.error('❌ Get Tax Computation Error:', error.message);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch tax computation',
    });
  }
});

// @desc    Submit tax declaration
// @route   POST /api/tax/declaration
// @access  Private/Admin/HR/Employee
const submitTaxDeclaration = asyncHandler(async (req, res) => {
  const { employeeId, financialYear, houseProperty, otherIncome, investments, companyId } = req.body;

  try {
    let targetEmployeeId = employeeId;
    if (req?.user?.role === 'Employee') {
      const employee = await Employee.findOne({ user: req?.user?._id });
      if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee record not found' });
      }
      targetEmployeeId = employee._id;
    }

    let taxDeclaration = await TaxDeclaration.findOne({
      employee: targetEmployeeId,
      financialYear,
      company: companyId,
    });

    const declarationData = {
      company: companyId,
      employee: targetEmployeeId,
      financialYear,
      houseProperty,
      otherIncome,
      investments,
      status: 'submitted',
      submittedAt: new Date(),
    };

    if (taxDeclaration) {
      taxDeclaration = await TaxDeclaration.findByIdAndUpdate(taxDeclaration._id, declarationData, {
        new: true,
      });
    } else {
      taxDeclaration = new TaxDeclaration(declarationData);
      await taxDeclaration.save();
    }

    await createAuditLog(req?.user?._id, req?.user?.company, 'Tax Declaration Submitted', {
      employee: targetEmployeeId,
      financialYear,
    });

    return res.json({
      success: true,
      message: 'Tax declaration submitted successfully',
      data: taxDeclaration,
    });
  } catch (error) {
    console.error('❌ Submit Tax Declaration Error:', error.message);
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to submit tax declaration',
    });
  }
});

export { calculateEmployeeTax, getTaxComputation, submitTaxDeclaration };
