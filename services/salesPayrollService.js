/**
 * Sales-specific payroll calculations
 */

// Check if employee is a sales person
export const isSalesEmployee = (employee) => {
  const salesPerformance = employee.employmentDetails?.salesPerformance;
  return salesPerformance && salesPerformance.targetAmount > 0;
};

export const calculateSalesIncentives = (employee, month, year) => {
  if (!isSalesEmployee(employee)) {
    return { incentives: 0, deductions: 0 };
  }
  
  const salesPerformance = employee.employmentDetails.salesPerformance;
  const achievementRatio = salesPerformance.achievedAmount / salesPerformance.targetAmount;
  
  // Calculate incentives based on achievement
  let incentives = salesPerformance.incentivesEarned || 0;
  
  // Add additional incentives for over-achievement
  if (achievementRatio > 1) {
    incentives += salesPerformance.additionalIncentives || 0;
  }
  
  // Calculate deductions for under-achievement
  let deductions = 0;
  if (achievementRatio < 0.8 && salesPerformance.deductionsPercentage > 0) {
    deductions = (salesPerformance.targetAmount * salesPerformance.deductionsPercentage) / 100;
  }
  
  return { incentives: Math.round(incentives), deductions: Math.round(deductions) };
};
