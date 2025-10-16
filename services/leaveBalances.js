
// services/leaveBalances.js
import EmployeeLeaveBalance from '../models/EmployeeLeaveBalance.js';
import { getCompanyPolicy, toYearFromPolicy } from './leaveUtils.js';

export const initEmployeeBalances = async ({ employeeId, companyId, asOfDate = new Date() }) => {
  const policy = await getCompanyPolicy(companyId);
  const year = toYearFromPolicy(asOfDate, policy.yearStartMonth);

  const balances = policy.leaveTypes.map(t => ({
    leaveType: t.shortCode,
    available: t.totalPerYear,
    used: 0,
    carryForwarded: 0
  }));

  // upsert
  return EmployeeLeaveBalance.findOneAndUpdate(
    { employee: employeeId, company: companyId, year },
    { $setOnInsert: { employee: employeeId, company: companyId, year, balances } },
    { new: true, upsert: true }
  );
};
