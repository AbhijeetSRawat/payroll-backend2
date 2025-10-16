// controllers/perkController.js

import EmployeePerk from '../models/EmployeePerk.js';
import Employee from '../models/Employee.js';
import Department from '../models/Department.js';
import Perk from '../models/Perk.js';

// Create a new perk
export const createPerk = async (req, res) => {
  try {
    const {
      name,
      category,
      ownership,
      engineCapacity,
      usage,
      driverProvided,
      perkValue,
      specialConditions,
      taxable,
      calculationMethod,
      fixedAmount,
      formula,
      companyId
    } = req.body;



    const perk = new Perk({
      name,
      category,
      ownership,
      engineCapacity: engineCapacity || 'na',
      usage,
      driverProvided,
      perkValue,
      specialConditions,
      taxable,
      calculationMethod,
      fixedAmount,
      formula,
      company: companyId,
      createdBy: req.user._id
    });

    await perk.save();

    res.status(201).json({
      success: true,
      message: 'Perk created successfully',
      perk
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Bulk create perks
export const bulkCreatePerks = async (req, res) => {
  try {
    const { perks } = req.body;
    const companyId = req.user.companyId;

    if (!Array.isArray(perks) || perks.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Perks array is required' 
      });
    }

    const perksWithCompany = perks.map(perk => ({
      ...perk,
      company: companyId,
      createdBy: req.user._id,
      engineCapacity: perk.engineCapacity || 'na'
    }));

    const createdPerks = await Perk.insertMany(perksWithCompany);

    res.status(201).json({
      success: true,
      message: `${createdPerks.length} perks created successfully`,
      perks: createdPerks
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get all perks for a company
export const getCompanyPerks = async (req, res) => {
  try {
    const { companyId } = req.params;
    const { category, isActive, page = 1, limit = 10 } = req.query;

    const query = { company: companyId };
    if (category) query.category = category;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    const skip = (page - 1) * limit;
    const total = await Perk.countDocuments(query);

    const perks = await Perk.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('createdBy', 'profile');

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: perks.length,
      perks
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get perks by department
export const getPerksByDepartment = async (req, res) => {
  try {
    const { departmentId } = req.params;
    const { category, page = 1, limit = 10 } = req.query;

    // Get employees in the department
    const employees = await Employee.find({
      'employmentDetails.department': departmentId,
      'employmentDetails.status': 'active'
    }).select('_id');

    const employeeIds = employees.map(e => e._id);

    const query = { 
      employee: { $in: employeeIds },
      status: 'active'
    };

    if (category) {
      const perks = await Perk.find({ category, isActive: true }).select('_id');
      const perkIds = perks.map(p => p._id);
      query.perk = { $in: perkIds };
    }

    const skip = (page - 1) * limit;
    const total = await EmployeePerk.countDocuments(query);

    const employeePerks = await EmployeePerk.find(query)
      .populate('employee', 'employmentDetails personalDetails')
      .populate('perk')
      .sort({ effectiveDate: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: employeePerks.length,
      employeePerks
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Assign perk to employee
export const assignPerkToEmployee = async (req, res) => {
  try {
    const { employeeId, perkId, effectiveDate, notes } = req.body;
    const companyId = req.user.companyId;

    const employee = await Employee.findById(employeeId);
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const perk = await Perk.findById(perkId);
    if (!perk) {
      return res.status(404).json({ success: false, message: 'Perk not found' });
    }

    // Check if perk is already assigned and active
    const existingPerk = await EmployeePerk.findOne({
      employee: employeeId,
      perk: perkId,
      status: 'active'
    });

    if (existingPerk) {
      return res.status(400).json({ 
        success: false, 
        message: 'Perk is already assigned to this employee' 
      });
    }

    // Calculate amount based on perk configuration
    let calculatedAmount = 0;
    if (perk.calculationMethod === 'fixed') {
      calculatedAmount = perk.fixedAmount;
    } else if (perk.calculationMethod === 'formula' && perk.formula) {
      // Implement formula calculation logic here
      calculatedAmount = calculatePerkAmount(perk.formula, employee);
    }

    const employeePerk = new EmployeePerk({
      employee: employeeId,
      perk: perkId,
      company: companyId,
      effectiveDate: effectiveDate || new Date(),
      calculatedAmount,
      taxableAmount: perk.taxable ? calculatedAmount : 0,
      notes,
      approvedBy: req.user._id,
      approvedDate: new Date()
    });

    await employeePerk.save();

    // Populate the response
    await employeePerk.populate('employee', 'employmentDetails personalDetails');
    await employeePerk.populate('perk');

    res.status(201).json({
      success: true,
      message: 'Perk assigned successfully',
      employeePerk
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Bulk assign perks to employees
export const bulkAssignPerks = async (req, res) => {
  try {
    const { assignments } = req.body;
    const companyId = req.user.companyId;

    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Assignments array is required' 
      });
    }

    const results = [];
    const errors = [];

    for (const assignment of assignments) {
      try {
        const { employeeId, perkId, effectiveDate, notes } = assignment;

        const employee = await Employee.findById(employeeId);
        const perk = await Perk.findById(perkId);

        if (!employee || !perk) {
          errors.push({ assignment, error: 'Employee or Perk not found' });
          continue;
        }

        // Check if already assigned
        const existing = await EmployeePerk.findOne({
          employee: employeeId,
          perk: perkId,
          status: 'active'
        });

        if (existing) {
          errors.push({ assignment, error: 'Perk already assigned' });
          continue;
        }

        let calculatedAmount = perk.fixedAmount || 0;

        const employeePerk = new EmployeePerk({
          employee: employeeId,
          perk: perkId,
          company: companyId,
          effectiveDate: effectiveDate || new Date(),
          calculatedAmount,
          taxableAmount: perk.taxable ? calculatedAmount : 0,
          notes,
          approvedBy: req.user._id,
          approvedDate: new Date()
        });

        await employeePerk.save();
        results.push(employeePerk);
      } catch (error) {
        errors.push({ assignment, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Processed ${assignments.length} assignments`,
      successful: results.length,
      failed: errors.length,
      results,
      errors
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get employee perks
export const getEmployeePerks = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;

    const query = { employee: employeeId };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const total = await EmployeePerk.countDocuments(query);

    const employeePerks = await EmployeePerk.find(query)
      .populate('perk')
      .populate('approvedBy', 'profile firstName lastName')
      .sort({ effectiveDate: -1 })
      .skip(skip)
      .limit(Number(limit));

    res.json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      count: employeePerks.length,
      employeePerks
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Update perk status
export const updatePerkStatus = async (req, res) => {
  try {
    const { perkId } = req.params;
    const { isActive } = req.body;

    const perk = await Perk.findByIdAndUpdate(
      perkId,
      { isActive },
      { new: true }
    );

    if (!perk) {
      return res.status(404).json({ success: false, message: 'Perk not found' });
    }

    res.json({
      success: true,
      message: 'Perk status updated successfully',
      perk
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Remove perk from employee
export const removeEmployeePerk = async (req, res) => {
  try {
    const { employeePerkId } = req.params;
    const { endDate, notes } = req.body;

    const employeePerk = await EmployeePerk.findByIdAndUpdate(
      employeePerkId,
      {
        status: 'inactive',
        endDate: endDate || new Date(),
        notes: notes || 'Removed by admin'
      },
      { new: true }
    );

    if (!employeePerk) {
      return res.status(404).json({ success: false, message: 'Employee perk not found' });
    }

    res.json({
      success: true,
      message: 'Perk removed from employee successfully',
      employeePerk
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Helper function for formula calculation
const calculatePerkAmount = (formula, employee) => {
  // Implement your specific formula calculation logic here
  // This is a placeholder implementation
  try {
    // Example: "baseSalary * 0.1" or "fixed(2400)"
    if (formula.includes('fixed')) {
      const amount = formula.match(/\d+/);
      return amount ? parseInt(amount[0]) : 0;
    }
    return 0;
  } catch (error) {
    console.error('Formula calculation error:', error);
    return 0;
  }
};