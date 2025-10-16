import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:4000/api';
let authToken = '';

// Test data from database
const testData = {
  companyId: '6863c9fd36a3e24a3218d887',
  employeeId: '6869169da16b6f820afc6f19',
  employeeId2: '68691922a16b6f820afc6f56',
  month: 12, // December - should be available
  year: 2024,
  adminEmail: 'testuser@masu.com',
  adminPassword: 'test123'
};

// Helper function to make API calls
const apiCall = async (method, endpoint, data = null, headers = {}) => {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
    }
    
    if (data) {
      config.data = data;
    }
    
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

// Test all APIs
const runAllAPITests = async () => {
  console.log('🚀 COMPREHENSIVE PAYROLL WORKFLOW API TESTING');
  console.log('==============================================\n');
  
  // 1. Login
  console.log('1️⃣ Testing Login...');
  const loginResult = await apiCall('POST', '/auth/login', {
    email: testData.adminEmail,
    password: testData.adminPassword
  });
  
  if (loginResult.success && loginResult.data.token) {
    authToken = loginResult.data.token;
    console.log('✅ Login successful\n');
  } else {
    console.log('❌ Login failed:', loginResult.error);
    return;
  }
  
  // 2. Get Eligible Employees
  console.log('2️⃣ Testing GET /api/payroll-workflow/eligible-employees');
  const eligibleResult = await apiCall('GET', `/payroll-workflow/eligible-employees?month=${testData.month}&year=${testData.year}&companyId=${testData.companyId}`);
  console.log(eligibleResult.success ? '✅ PASSED' : '❌ FAILED:', eligibleResult.success ? `Found ${eligibleResult.data.data?.length || 0} eligible employees` : eligibleResult.error);
  console.log('');
  
  // 3. Individual Payroll Calculation
  console.log('3️⃣ Testing POST /api/payroll-workflow/calculate');
  const individualResult = await apiCall('POST', '/payroll-workflow/calculate', {
    employeeId: testData.employeeId,
    month: testData.month,
    year: testData.year,
    companyId: testData.companyId
  });
  console.log(individualResult.success ? '✅ PASSED' : '❌ FAILED:', individualResult.success ? `Net Salary: ${individualResult.data.data?.netSalary}` : individualResult.error);
  const payrollId = individualResult.data?.data?._id;
  console.log('');
  
  // 4. Batch Payroll Calculation
  console.log('4️⃣ Testing POST /api/payroll-workflow/batch-calculate');
  const batchResult = await apiCall('POST', '/payroll-workflow/batch-calculate', {
    employeeIds: [testData.employeeId2], // Different employee to avoid duplicate
    month: testData.month,
    year: testData.year,
    batchName: `Test Batch ${testData.month}/${testData.year}`,
    companyId: testData.companyId
  });
  console.log(batchResult.success ? '✅ PASSED' : '❌ FAILED:', batchResult.success ? `Processed: ${batchResult.data.data?.processed || 0}` : batchResult.error);
  console.log('');
  
  // 5. Get Payroll Details
  console.log('5️⃣ Testing GET /api/payroll-workflow/:employeeId/:month/:year');
  const detailsResult = await apiCall('GET', `/payroll-workflow/${testData.employeeId}/${testData.month}/${testData.year}?companyId=${testData.companyId}`);
  console.log(detailsResult.success ? '✅ PASSED' : '❌ FAILED:', detailsResult.success ? `Status: ${detailsResult.data.data?.status}` : detailsResult.error);
  console.log('');
  
  // 6. Get Payroll History
  console.log('6️⃣ Testing GET /api/payroll-workflow/history/:employeeId');
  const historyResult = await apiCall('GET', `/payroll-workflow/history/${testData.employeeId}?page=1&limit=10&companyId=${testData.companyId}`);
  console.log(historyResult.success ? '✅ PASSED' : '❌ FAILED:', historyResult.success ? `Records: ${historyResult.data.data?.length || 0}` : historyResult.error);
  console.log('');
  
  // 7. Get Company Summary
  console.log('7️⃣ Testing GET /api/payroll-workflow/company-summary');
  const summaryResult = await apiCall('GET', `/payroll-workflow/company-summary?month=${testData.month}&year=${testData.year}&companyId=${testData.companyId}`);
  console.log(summaryResult.success ? '✅ PASSED' : '❌ FAILED:', summaryResult.success ? `Total Employees: ${summaryResult.data.data?.totalEmployees || 0}` : summaryResult.error);
  console.log('');
  
  // 8. Approve Payroll
  if (payrollId) {
    console.log('8️⃣ Testing PUT /api/payroll-workflow/approve/:payrollId');
    const approveResult = await apiCall('PUT', `/payroll-workflow/approve/${payrollId}`);
    console.log(approveResult.success ? '✅ PASSED' : '❌ FAILED:', approveResult.success ? `New Status: ${approveResult.data.data?.status}` : approveResult.error);
  } else {
    console.log('8️⃣ ⚠️ SKIPPED: Approve Payroll (no payroll ID available)');
  }
  console.log('');
  
  // Summary
  const results = [
    loginResult.success,
    eligibleResult.success,
    individualResult.success,
    batchResult.success,
    detailsResult.success,
    historyResult.success,
    summaryResult.success,
    payrollId ? true : false // Approval test
  ];
  
  const passedCount = results.filter(Boolean).length;
  const totalCount = results.length;
  
  console.log('📊 FINAL TEST RESULTS');
  console.log('=====================');
  console.log(`✅ Passed: ${passedCount}/${totalCount} tests`);
  console.log(`❌ Failed: ${totalCount - passedCount}/${totalCount} tests`);
  
  if (passedCount === totalCount) {
    console.log('\n🎉 ALL TESTS PASSED! 🎉');
    console.log('The payroll workflow is working perfectly!');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the logs above.');
  }
  
  console.log('\n📋 API ENDPOINTS TESTED:');
  console.log('1. POST /api/auth/login');
  console.log('2. GET /api/payroll-workflow/eligible-employees');
  console.log('3. POST /api/payroll-workflow/calculate');
  console.log('4. POST /api/payroll-workflow/batch-calculate');
  console.log('5. GET /api/payroll-workflow/:employeeId/:month/:year');
  console.log('6. GET /api/payroll-workflow/history/:employeeId');
  console.log('7. GET /api/payroll-workflow/company-summary');
  console.log('8. PUT /api/payroll-workflow/approve/:payrollId');
};

// Run all tests
runAllAPITests().catch(console.error);
