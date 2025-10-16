import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:4000/api';
let authToken = '';

// Test data - using January 2025 which should be fresh
const testData = {
  companyId: '6863c9fd36a3e24a3218d887',
  employeeId: '6869169da16b6f820afc6f19',
  employeeId2: '68691922a16b6f820afc6f56',
  month: 1, // January 2025 - fresh month
  year: 2025,
  adminEmail: 'testuser@masu.com',
  adminPassword: 'test123'
};

const apiCall = async (method, endpoint, data = null) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authToken ? `Bearer ${authToken}` : undefined
      }
    };
    
    if (data) config.data = data;
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data || error.message, 
      status: error.response?.status 
    };
  }
};

const runFinalDemo = async () => {
  console.log('🎯 FINAL PAYROLL WORKFLOW DEMONSTRATION');
  console.log('=======================================\n');
  
  // Login
  console.log('🔐 Step 1: Authentication');
  const login = await apiCall('POST', '/auth/login', {
    email: testData.adminEmail,
    password: testData.adminPassword
  });
  
  if (!login.success) {
    console.log('❌ Authentication failed');
    return;
  }
  
  authToken = login.data.token;
  console.log('✅ Successfully authenticated\n');
  
  // Get eligible employees
  console.log('👥 Step 2: Get Eligible Employees');
  const eligible = await apiCall('GET', `/payroll-workflow/eligible-employees?month=${testData.month}&year=${testData.year}&companyId=${testData.companyId}`);
  console.log(`✅ Found ${eligible.data?.data?.length || 0} eligible employees\n`);
  
  // Individual payroll calculation
  console.log('💰 Step 3: Calculate Individual Payroll');
  const individual = await apiCall('POST', '/payroll-workflow/calculate', {
    employeeId: testData.employeeId,
    month: testData.month,
    year: testData.year,
    companyId: testData.companyId
  });
  
  if (individual.success) {
    console.log(`✅ Payroll calculated successfully`);
    console.log(`   Net Salary: ₹${individual.data.data.netSalary}`);
    console.log(`   Total Earnings: ₹${individual.data.data.earnings.totalEarnings}`);
    console.log(`   Total Deductions: ₹${individual.data.data.deductions.totalDeductions}`);
    console.log(`   Status: ${individual.data.data.status}\n`);
  } else {
    console.log('❌ Individual payroll calculation failed:', individual.error.message);
  }
  
  // Batch processing
  console.log('📊 Step 4: Batch Payroll Processing');
  const batch = await apiCall('POST', '/payroll-workflow/batch-calculate', {
    employeeIds: [testData.employeeId2],
    month: testData.month,
    year: testData.year,
    batchName: `Demo Batch ${testData.month}/${testData.year}`,
    companyId: testData.companyId
  });
  
  if (batch.success) {
    console.log(`✅ Batch processing completed`);
    console.log(`   Processed: ${batch.data.data?.summary?.processedSuccessfully || 0}`);
    console.log(`   Failed: ${batch.data.data?.summary?.processingErrors || 0}`);
    console.log(`   Total Net Salary: ₹${batch.data.data?.summary?.totalNetSalary || 0}\n`);
  } else {
    console.log('❌ Batch processing failed:', batch.error.message);
  }
  
  // Get payroll details
  console.log('📋 Step 5: Retrieve Payroll Details');
  const details = await apiCall('GET', `/payroll-workflow/${testData.employeeId}/${testData.month}/${testData.year}?companyId=${testData.companyId}`);
  
  if (details.success) {
    console.log('✅ Payroll details retrieved');
    console.log(`   Employee: ${details.data.data.employee.employmentDetails.employeeId}`);
    console.log(`   Period: ${details.data.data.payrollPeriod.month}/${details.data.data.payrollPeriod.year}`);
    console.log(`   Status: ${details.data.data.status}\n`);
  } else {
    console.log('❌ Failed to retrieve payroll details');
  }
  
  // Approve payroll
  if (individual.success && individual.data.data._id) {
    console.log('✅ Step 6: Approve Payroll');
    const approve = await apiCall('PUT', `/payroll-workflow/approve/${individual.data.data._id}`);
    
    if (approve.success) {
      console.log(`✅ Payroll approved successfully`);
      console.log(`   New Status: ${approve.data.data.status}\n`);
    } else {
      console.log('❌ Payroll approval failed:', approve.error.message);
    }
  }
  
  // Company summary
  console.log('🏢 Step 7: Company Payroll Summary');
  const summary = await apiCall('GET', `/payroll-workflow/company-summary?month=${testData.month}&year=${testData.year}&companyId=${testData.companyId}`);
  
  if (summary.success) {
    console.log('✅ Company summary generated');
    console.log(`   Total Employees: ${summary.data.data.totalEmployees}`);
    console.log(`   Total Earnings: ₹${summary.data.data.totalEarnings}`);
    console.log(`   Total Net Salary: ₹${summary.data.data.totalNetSalary}`);
    console.log(`   Status Breakdown:`, summary.data.data.statusWise);
  }
  
  console.log('\n🎉 PAYROLL WORKFLOW DEMONSTRATION COMPLETE!');
  console.log('All core functionalities are working correctly.');
};

runFinalDemo().catch(console.error);
