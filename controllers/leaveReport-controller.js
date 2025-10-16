import Leave from '../models/Leave.js';
import { getCompanyPolicy, toYearFromPolicy } from '../services/leaveUtils.js';
import mongoose from 'mongoose';
import { ObjectId } from "mongodb";


export const getLeaveStatistics = async (req, res) => {
  try {
    const { companyId, year } = req.params;
    
    // Get policy to determine fiscal year
    const policy = await getCompanyPolicy(companyId);
    const yearStartMonth = policy?.yearStartMonth || 1;
    
    // Calculate date range for the requested year
    const startYear = parseInt(year);
    const startDate = new Date(startYear, yearStartMonth - 1, 1);
    const endDate = new Date(startYear + 1, yearStartMonth - 1, 0);
    
    // Aggregate leave statistics
    const stats = await Leave.aggregate([
      {
        $match: {
          company: new mongoose.Types.ObjectId(companyId),
          startDate: { $gte: startDate, $lte: endDate },
          status: 'approved'
        }
      },
      {
        $group: {
          _id: '$leaveType',
          totalDays: { $sum: '$days' },
          count: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'leavepolicies',
          localField: '_id',
          foreignField: 'leaveTypes.shortCode',
          as: 'leaveTypeInfo'
        }
      },
      {
        $unwind: '$leaveTypeInfo'
      },
      {
        $unwind: '$leaveTypeInfo.leaveTypes'
      },
      {
        $match: {
          $expr: { $eq: ['$leaveTypeInfo.leaveTypes.shortCode', '$_id'] }
        }
      },
      {
        $project: {
          leaveType: '$_id',
          name: '$leaveTypeInfo.leaveTypes.name',
          totalDays: 1,
          count: 1,
          unpaid: '$leaveTypeInfo.leaveTypes.unpaid',
          _id: 0
        }
      },
      {
        $sort: { totalDays: -1 }
      }
    ]);
    
    res.json({ 
      success: true, 
      year: startYear,
      yearStartMonth,
      stats 
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
};

export const getEmployeeLeaveSummary = async (req, res) => {
  try {
    const { companyId, employeeId } = req.params;
    const { year } = req.query;
    
      // Convert to ObjectId properly
    const match = { 
    company: new ObjectId(companyId),   // companyId should be string
  employee: new ObjectId(employeeId),
      status: 'approved'
    };
    
    if (year) {
      const policy = await getCompanyPolicy(companyId);
      const yearStartMonth = policy?.yearStartMonth || 1;
      const startDate = new Date(year, yearStartMonth - 1, 1);
      const endDate = new Date(parseInt(year) + 1, yearStartMonth - 1, 0);
      
      match.startDate = { $gte: startDate, $lte: endDate };
    }

const summary = await Leave.aggregate([
  { $match: match },
  {
    $group: {
      _id: "$type",
      totalDays: { $sum: "$days" },
      count: { $sum: 1 },
      lastDate: { $max: "$endDate" }
    }
  },
  {
    $lookup: {
      from: "leavepolicies",
      let: { leaveTypeCode: { $toUpper: "$_id" } }, // convert to uppercase
      pipeline: [
        { $unwind: "$leaveTypes" },
        { $match: { $expr: { $eq: ["$leaveTypes.shortCode", "$$leaveTypeCode"] } } },
        {
          $project: {
            name: "$leaveTypes.name",
            maxPerRequest: "$leaveTypes.maxPerRequest",
            unpaid: "$leaveTypes.unpaid"
          }
        }
      ],
      as: "leaveTypeInfo"
    }
  },
  { $unwind: { path: "$leaveTypeInfo", preserveNullAndEmptyArrays: true } },
  {
    $project: {
      leaveType: "$_id",
      name: "$leaveTypeInfo.name",
      totalDays: 1,
      count: 1,
      lastDate: 1,
      maxPerRequest: "$leaveTypeInfo.maxPerRequest",
      unpaid: "$leaveTypeInfo.unpaid",
      _id: 0
    }
  }
]);


    
    res.json({ 
      success: true, 
      summary 
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
};

export const getDepartmentLeaveReport = async (req, res) => {
  try {
    const { companyId, departmentId } = req.params;
    const { year, month } = req.query;
    
    const match = { 
      company: mongoose.Types.ObjectId(companyId),
      status: 'approved'
    };
    
    // Add department filter if provided
    if (departmentId) {
      match['employee.department'] = mongoose.Types.ObjectId(departmentId);
    }
    
    // Add date filters if provided
    if (year) {
      const policy = await getCompanyPolicy(companyId);
      const yearStartMonth = policy?.yearStartMonth || 1;
      const startDate = new Date(year, yearStartMonth - 1, 1);
      const endDate = new Date(parseInt(year) + 1, yearStartMonth - 1, 0);
      
      match.startDate = { $gte: startDate, $lte: endDate };
    }
    
    if (month) {
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0);
      
      match.startDate = { $gte: monthStart, $lte: monthEnd };
    }
    
    const report = await Leave.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: 'employee',
          foreignField: '_id',
          as: 'employee'
        }
      },
      { $unwind: '$employee' },
      { $match: match },
      {
        $group: {
          _id: {
            department: '$employee.department',
            leaveType: '$leaveType'
          },
          totalDays: { $sum: '$days' },
          employeeCount: { $addToSet: '$employee' }
        }
      },
      {
        $lookup: {
          from: 'departments',
          localField: '_id.department',
          foreignField: '_id',
          as: 'department'
        }
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'leavepolicies',
          localField: '_id.leaveType',
          foreignField: 'leaveTypes.shortCode',
          as: 'leaveTypeInfo'
        }
      },
      { $unwind: '$leaveTypeInfo' },
      { $unwind: '$leaveTypeInfo.leaveTypes' },
      {
        $match: {
          $expr: { $eq: ['$leaveTypeInfo.leaveTypes.shortCode', '$_id.leaveType'] }
        }
      },
      {
        $project: {
          department: {
            _id: '$department._id',
            name: '$department.name'
          },
          leaveType: {
            shortCode: '$_id.leaveType',
            name: '$leaveTypeInfo.leaveTypes.name'
          },
          totalDays: 1,
          employeeCount: { $size: '$employeeCount' },
          _id: 0
        }
      },
      { $sort: { 'department.name': 1, 'leaveType.name': 1 } }
    ]);
    
    res.json({ 
      success: true, 
      report 
    });
  } catch (error) {
    res.status(400).json({ 
      success: false, 
      message: error.message 
    });
  }
};