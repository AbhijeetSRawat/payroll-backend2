# Payroll Calculation Workflow Documentation

## Overview

This document describes the comprehensive payroll calculation workflow implemented for the MASU Consultancy backend system. The workflow integrates company CTC structures, individual employee annexures, attendance tracking, flexi benefits, and tax computations to generate accurate monthly payroll.

## Architecture

### Core Components

1. **PayrollWorkflowService** - Main orchestrator for payroll calculations
2. **PayrollValidationService** - Comprehensive validation before processing
3. **AttendanceCalculationService** - Attendance-based salary calculations
4. **PayrollWorkflowController** - API endpoints for payroll operations

### Data Models Integration

- **Company** - Company configuration and policies
- **CTCTemplate** - Salary structure templates
- **Employee** - Employee master data
- **CTCAnnexure** - Individual employee CTC breakdown
- **FlexiDeclaration** - Employee flexi benefits declarations
- **Attendance** - Daily attendance records
- **PayrollProcessing** - Monthly payroll calculations

## Workflow Steps

### 1. Validation Phase

Before any payroll calculation, the system performs comprehensive validation:

#### Employee Validation
- Employee exists and belongs to the company
- Employee status is 'active'
- Basic employment details are complete
- Base salary is configured

#### CTC Validation
- Active CTC annexure exists for the financial year
- Annual CTC is properly configured
- Monthly breakup is complete
- Basic salary component exists
- CTC calculations are consistent

#### Flexi Benefits Validation
- Flexi declaration status (if applicable)
- Declared amounts within limits
- Total flexi amount consistency

#### Period Validation
- Payroll not already processed for the period
- Period is not in the future (with warnings)
- Period is not too old (with warnings)

### 2. Data Fetching Phase

Once validation passes, the system fetches:
- Employee details with user profile
- Active CTC annexure with template
- Approved flexi declaration (if any)
- Attendance records for the period
- Leave policy and approved leaves

### 3. Attendance Calculation

The `AttendanceCalculationService` calculates:
- Working days vs. total days
- Present, absent, half-day counts
- Holiday and week-off days
- Leave days (casual, sick, earned, unpaid)
- LOP (Loss of Pay) days
- Overtime hours
- Attendance percentage

### 4. Earnings Calculation

Based on CTC annexure and attendance:

#### Fixed Components (from CTC)
- Basic Salary (pro-rated based on attendance)
- HRA (House Rent Allowance)
- Special Allowances
- Education Allowance
- Other fixed allowances

#### Variable Components
- Flexi benefits (from declarations)
- Overtime payments
- Bonus (if applicable)

#### Pro-rata Calculation
```javascript
proRataFactor = payableDays / workingDays
proRataAmount = monthlyAmount * proRataFactor
```

### 5. Deductions Calculation

#### Statutory Deductions
- **Provident Fund**: 12% of basic salary (if PF flag enabled)
- **ESIC**: 0.75% of gross (if ESIC flag enabled and gross ≤ ₹21,000)
- **Professional Tax**: State-wise calculation
- **Income Tax**: Monthly TDS calculation

#### Other Deductions
- Loan recovery
- Insurance premiums
- Other deductions

### 6. Tax Calculation

The system calculates income tax using:
- Annual taxable income projection
- HRA exemption calculation
- Standard deduction (₹50,000)
- Tax slabs (old vs. new regime)
- Monthly TDS computation

### 7. Net Salary Calculation

```javascript
netSalary = totalEarnings - totalDeductions
```

### 8. Record Creation

Finally, a `PayrollProcessing` record is created with:
- All earnings and deductions breakdown
- Attendance summary
- References to CTC and flexi declarations
- Processing metadata

## API Endpoints

### Individual Payroll Calculation
```
POST /api/payroll-workflow/calculate
{
  "employeeId": "employee_id",
  "month": 10,
  "year": 2024,
  "companyId": "company_id"
}
```

### Batch Payroll Processing
```
POST /api/payroll-workflow/batch-calculate
{
  "employeeIds": ["emp1", "emp2", "emp3"],
  "month": 10,
  "year": 2024,
  "batchName": "October 2024 Payroll"
}
```

### Get Payroll Details
```
GET /api/payroll-workflow/:employeeId/:month/:year
```

### Get Payroll History
```
GET /api/payroll-workflow/history/:employeeId?page=1&limit=10&year=2024
```

### Company Payroll Summary
```
GET /api/payroll-workflow/company-summary?month=10&year=2024
```

### Approve Payroll
```
PUT /api/payroll-workflow/approve/:payrollId
```

### Get Eligible Employees
```
GET /api/payroll-workflow/eligible-employees?month=10&year=2024
```

## Error Handling

The system provides comprehensive error handling:

### Validation Errors
- Missing or invalid employee data
- Inactive CTC annexure
- Period already processed
- Incomplete salary configuration

### Processing Errors
- Calculation failures
- Database errors
- Service unavailability

### Response Format
```javascript
{
  "success": false,
  "message": "Error description",
  "errors": ["Detailed error 1", "Detailed error 2"],
  "validationDetails": {
    // Detailed validation results
  }
}
```

## Logging and Audit

All payroll operations are logged with:
- User who initiated the process
- Employee(s) processed
- Processing timestamp
- Calculation results
- Any errors or warnings

Audit logs are created for:
- Individual payroll calculations
- Batch processing
- Payroll approvals
- Status changes

## Security and Permissions

Access control is implemented through:
- Authentication middleware
- Permission-based authorization
- Company-level data isolation
- Role-based access (Admin, HR, Employee)

Required permissions:
- `payroll:create` - Calculate payroll
- `payroll:read` - View payroll data
- `payroll:approve` - Approve payroll
- `admin` - Full access

## Performance Considerations

### Batch Processing
- Processes employees sequentially to avoid database overload
- Provides detailed progress tracking
- Continues processing even if individual employees fail

### Database Optimization
- Proper indexing on frequently queried fields
- Efficient population of related documents
- Minimal data fetching for calculations

### Caching
- Employee data caching during batch processing
- CTC template caching
- Leave policy caching

## Future Enhancements

1. **Parallel Processing**: Implement worker queues for large batch processing
2. **Real-time Updates**: WebSocket integration for live processing status
3. **Advanced Tax Calculations**: Integration with external tax calculation services
4. **Payroll Analytics**: Advanced reporting and analytics dashboard
5. **Integration**: Integration with banking systems for salary disbursement
6. **Mobile Support**: Mobile-optimized payroll approval workflows

## Testing

The system includes comprehensive testing for:
- Unit tests for calculation logic
- Integration tests for workflow
- Validation tests for edge cases
- Performance tests for batch processing

## Deployment

The payroll workflow is deployed as part of the main application with:
- Environment-specific configurations
- Database migrations for new models
- Monitoring and alerting setup
- Backup and recovery procedures

## Support and Maintenance

For support and maintenance:
1. Check application logs for errors
2. Verify database connectivity
3. Validate employee and CTC data
4. Review attendance records
5. Check flexi benefit configurations

## Conclusion

This payroll workflow provides a comprehensive, scalable, and maintainable solution for automated payroll processing. It ensures accuracy through extensive validation, provides detailed audit trails, and supports both individual and batch processing scenarios.
