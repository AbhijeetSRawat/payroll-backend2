import Shift from '../models/Shifts.js';
import Company from '../models/Company.js';

// Add a new shift
export const addShift = async (req, res) => {
  try {
    const { companyId, name, startTime, endTime, gracePeriod, halfDayThreshold, isNightShift, breakDuration } = req.body;

    // 0. Validate Company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    // 1. Check duplicate shift name within same company
    const existingShift = await Shift.findOne({ company: companyId, name });
    if (existingShift) {
      return res.status(400).json({ success: false, message: 'Shift with this name already exists for this company' });
    }

    // 2. Create shift with extra fields
    const newShift = new Shift({
      company: companyId,
      name,
      startTime,
      endTime,
      gracePeriod,
      halfDayThreshold,
      isNightShift,
      breakDuration,
      isActive: true
    });

    await newShift.save();

    return res.status(201).json({
      success: true,
      message: 'Shift added successfully',
      data: newShift
    });

  } catch (error) {
    console.error('Add Shift Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Update an existing shift
export const updateShift = async (req, res) => {
  try {
    const { shiftId } = req.params;
    const { name, startTime, endTime, gracePeriod, halfDayThreshold, isNightShift, breakDuration, isActive } = req.body;

    // 0. Find shift by ID
    const shift = await Shift.findById(shiftId);
    if (!shift) {
      return res.status(404).json({ success: false, message: 'Shift not found' });
    }

    // 1. Update fields only if provided
    if (name) shift.name = name;
    if (startTime) shift.startTime = startTime;
    if (endTime) shift.endTime = endTime;
    if (typeof gracePeriod !== 'undefined') shift.gracePeriod = gracePeriod;
    if (typeof halfDayThreshold !== 'undefined') shift.halfDayThreshold = halfDayThreshold;
    if (typeof isNightShift !== 'undefined') shift.isNightShift = isNightShift;
    if (typeof breakDuration !== 'undefined') shift.breakDuration = breakDuration;
    if (typeof isActive !== 'undefined') shift.isActive = isActive;

    await shift.save();

    return res.status(200).json({
      success: true,
      message: 'Shift updated successfully',
      data: shift
    });

  } catch (error) {
    console.error('Update Shift Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Get all shifts for a company
export const getAllShifts = async (req, res) => {
  try {
    const { companyId } = req.params;

    const shifts = await Shift.find({ company: companyId }).populate('company');
    if (!shifts || shifts.length === 0) {
      return res.status(404).json({ success: false, message: 'No shifts found for this company' });
    }

    res.status(200).json({
      success: true,
      message: 'Shifts retrieved successfully',
      data: shifts
    });
  } catch (error) {
    console.error('Get All Shifts Error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
