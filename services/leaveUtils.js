import Leave from '../models/Leave.js';
import LeavePolicy from '../models/LeavePolicy.js';

// Calculate business days between two dates (excluding weekends and holidays)
// export const businessDaysBetween = async ({ companyId, start, end, excludeHolidays }) => {
//   // Convert dates to Date objects if they aren't already
//   const startDate = new Date(start);
//   const endDate = new Date(end);
  
//   // Validate dates
//   if (endDate < startDate) return 0;
  
//   // Get company policy for weekOff days
//   const policy = await getCompanyPolicy(companyId);
//   const weekOffDays = policy?.weekOff || [0, 6]; // Default to Sunday and Saturday
  
//   // Get holidays if needed
//   let holidays = [];
//   if (excludeHolidays && policy?.holidays) {
//     holidays = policy.holidays
//       .filter(h => {
//         const holidayDate = new Date(h.date);
//         return holidayDate >= startDate && holidayDate <= endDate;
//       })
//       .map(h => new Date(h.date).setHours(0, 0, 0, 0));
//   }
  
//   // Calculate business days
//   let count = 0;
//   const current = new Date(startDate);
  
//   while (current <= endDate) {
//     const day = current.getDay();
//     const dateKey = current.setHours(0, 0, 0, 0);
    
//     if (!weekOffDays.includes(day) && !holidays.includes(dateKey)) {
//       count++;
//     }
    
//     current.setDate(current.getDate() + 1);
//   }
  
//   return count;
// };

// Calculate business days between two dates (excluding weekends and holidays)
// Calculate business days between two dates 
// (optionally excluding weekends and holidays)
export const businessDaysBetween = async ({
  companyId,
  start,
  end,
  excludeHolidays = false,
  includeWeekOff = false
}) => {
  // Convert to Date objects
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Validate dates
  if (endDate < startDate) return 0;

  // Get company policy (weekends + holidays)
  const policy = await getCompanyPolicy(companyId);
  const weekOffDays = policy?.weekOff || []; // Default: Sunday(0), Saturday(6)

  // Get holidays if excludeHolidays = true
  let holidays = new Set();
  if (excludeHolidays && policy?.holidays) {
    holidays = new Set(
      policy.holidays
        .map(h => new Date(h.date).setHours(0, 0, 0, 0)) // normalize
        .filter(
          d =>
            d >= new Date(startDate).setHours(0, 0, 0, 0) &&
            d <= new Date(endDate).setHours(0, 0, 0, 0)
        )
    );
  }

  // Count business days
  let businessDays = 0;
  let current = new Date(startDate);

  while (current <= endDate) {
    const dayOfWeek = current.getDay();
    const currentDay = new Date(current).setHours(0, 0, 0, 0);

    // If includeWeekOff = false → skip weekends
    if (includeWeekOff || !weekOffDays.includes(dayOfWeek)) {
      // Skip holidays if excludeHolidays = true
      if (!holidays.has(currentDay)) {
        businessDays++;
      }
    }

    // Move to next day
    current.setDate(current.getDate() + 1);
  }

  return businessDays;
};

// Get fiscal year based on policy
export const toYearFromPolicy = (date, yearStartMonth = 1) => {
  const d = new Date(date);
  return d.getMonth() + 1 >= yearStartMonth 
    ? d.getFullYear() 
    : d.getFullYear() - 1;
};

// Check for overlapping leaves
export const hasOverlappingLeaves = async (employeeId, companyId, startDate, endDate, excludeLeaveId = null) => {
  const query = {
    employee: employeeId,
    company: companyId,
    status: { $in: ['pending', 'approved'] },
    $or: [
      { startDate: { $lte: endDate }, endDate: { $gte: startDate } }
    ]
  };
  
  if (excludeLeaveId) {
    query._id = { $ne: excludeLeaveId };
  }
  
  return await Leave.exists(query);
};

// Get company leave policy with caching
const policyCache = new Map();
export const getCompanyPolicy = async (companyId) => {
  if (policyCache.has(companyId)) {
    return policyCache.get(companyId);
  }
  
  const policy = await LeavePolicy.findOne({ company: companyId }).lean();
  if (policy) {
    policyCache.set(companyId, policy);
    setTimeout(() => policyCache.delete(companyId), 60 * 60 * 1000); // Cache for 1 hour
  }
  
  return policy;
};

// Validate leave type against policy
export const validateLeaveType = (policy, leaveType) => {
  const typeDef = policy.leaveTypes.find(t => 
    t.shortCode === leaveType || t.name === leaveType
  );
  
  if (!typeDef || !typeDef.isActive) {
    throw new Error('Leave type not allowed or inactive');
  }
  
  return typeDef;
};

// Check leave type limits
export const checkLeaveTypeLimits = async (employeeId, companyId, leaveType, startDate) => {
  const policy = await getCompanyPolicy(companyId);
  const typeDef = validateLeaveType(policy, leaveType);
  
  // Check max instances per year
  if (typeDef.maxInstancesPerYear) {
    const year = toYearFromPolicy(startDate, policy.yearStartMonth);
    const yearStart = new Date(year, policy.yearStartMonth - 1, 1);
    const yearEnd = new Date(year + 1, policy.yearStartMonth - 1, 0);
    
    const count = await Leave.countDocuments({
      employee: employeeId,
      company: companyId,
      leaveType: typeDef.shortCode,
      startDate: { $gte: yearStart, $lte: yearEnd },
      status: 'approved'
    });
    
    if (count >= typeDef.maxInstancesPerYear) {
      throw new Error(`Maximum ${typeDef.maxInstancesPerYear} instances per year reached for this leave type`);
    }
  }
  
  // Check cooling period
  if (typeDef.coolingPeriod > 0) {
    const lastLeave = await Leave.findOne({
      employee: employeeId,
      company: companyId,
      leaveType: typeDef.shortCode,
      status: 'approved'
    }).sort({ endDate: -1 });
    
    if (lastLeave) {
      const coolingEnd = new Date(lastLeave.endDate);
      coolingEnd.setDate(coolingEnd.getDate() + typeDef.coolingPeriod);
      
      if (new Date(startDate) <= coolingEnd) {
        throw new Error(`Must wait ${typeDef.coolingPeriod} days after previous ${typeDef.name} leave`);
      }
    }
  }
  
  return true;
};

// helper functions
// leaveUtils.js
export function getPolicyYearStart(yearStartMonth) {
  const now = new Date();
  let startYear = now.getMonth() + 1 < yearStartMonth ? now.getFullYear() - 1 : now.getFullYear();
  return new Date(startYear, yearStartMonth - 1, 1); // policy year start
}

export function getPolicyYearEnd(yearStartMonth) {
  const now = new Date();
  let endYear = now.getMonth() + 1 < yearStartMonth ? now.getFullYear() : now.getFullYear() + 1;
  return new Date(endYear, yearStartMonth - 1, 0, 23, 59, 59, 999); // policy year end
}

export function getPolicyYearRange(yearStartMonth) {
  return {
    startDate: getPolicyYearStart(yearStartMonth),
    endDate: getPolicyYearEnd(yearStartMonth)
  };
}

