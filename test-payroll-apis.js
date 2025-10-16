import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:4000/api';
let authToken = '';

// Test data from database
const testData = {
  companyId: '6863c9fd36a3e24a3218d887',
  employeeId: '6869169da16b6f820afc6f19', // Employee with CTC annexure
  employeeId2: '68691922a16b6f820afc6f56', // Another employee
  month: 10,
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

// Test functions
const testLogin = async () => {
  console.log('\n🔐 Testing Login...');
  const result = await apiCall('POST', '/auth/login', {
    email: testData.adminEmail,
    password: testData.adminPassword
  });
  
  if (result.success && result.data.token) {
    authToken = result.data.token;
    console.log('✅ Login successful');
    return true;
  } else {
    console.log('❌ Login failed:', result.error);
    return false;
  }
};

const testIndividualPayrollCalculation = async () => {
  console.log('\n📊 Testing Individual Payroll Calculation...');
  const result = await apiCall('POST', '/payroll-workflow/calculate', {
    employeeId: testData.employeeId,
    month: testData.month,
    year: testData.year,
    companyId: testData.companyId
  });
  
  if (result.success) {
    console.log('✅ Individual payroll calculation successful');
    console.log('Net Salary:', result.data.data?.netSalary);
    return result.data.data?._id; // Return payroll ID for approval test
  } else {
    console.log('❌ Individual payroll calculation failed:', result.error);
    return null;
  }
};

const testBatchPayrollCalculation = async () => {
  console.log('\n📊 Testing Batch Payroll Calculation...');
  const result = await apiCall('POST', '/payroll-workflow/batch-calculate', {
    employeeIds: [testData.employeeId, testData.employeeId2],
    month: testData.month,
    year: testData.year,
    batchName: 'Test Batch October 2024',
    companyId: testData.companyId
  });
  
  if (result.success) {
    console.log('✅ Batch payroll calculation successful');
    console.log('Processed:', result.data.data?.processed || 0);
    console.log('Failed:', result.data.data?.failed || 0);
    return true;
  } else {
    console.log('❌ Batch payroll calculation failed:', result.error);
    return false;
  }
};

const testGetPayrollDetails = async () => {
  console.log('\n📋 Testing Get Payroll Details...');
  const result = await apiCall('GET', `/payroll-workflow/${testData.employeeId}/${testData.month}/${testData.year}`);
  
  if (result.success) {
    console.log('✅ Get payroll details successful');
    console.log('Employee ID:', result.data.data?.employee);
    console.log('Net Salary:', result.data.data?.netSalary);
    return true;
  } else {
    console.log('❌ Get payroll details failed:', result.error);
    return false;
  }
};

const testGetPayrollHistory = async () => {
  console.log('\n📚 Testing Get Payroll History...');
  const result = await apiCall('GET', `/payroll-workflow/history/${testData.employeeId}?page=1&limit=10`);
  
  if (result.success) {
    console.log('✅ Get payroll history successful');
    console.log('Records found:', result.data.data?.length || 0);
    return true;
  } else {
    console.log('❌ Get payroll history failed:', result.error);
    return false;
  }
};

const testGetCompanySummary = async () => {
  console.log('\n🏢 Testing Get Company Payroll Summary...');
  const result = await apiCall('GET', `/payroll-workflow/company-summary?month=${testData.month}&year=${testData.year}&companyId=${testData.companyId}`);
  
  if (result.success) {
    console.log('✅ Get company summary successful');
    console.log('Total Employees:', result.data.data?.totalEmployees || 0);
    console.log('Total Net Salary:', result.data.data?.totalNetSalary || 0);
    return true;
  } else {
    console.log('❌ Get company summary failed:', result.error);
    return false;
  }
};

const testApprovePayroll = async (payrollId) => {
  if (!payrollId) {
    console.log('\n⚠️ Skipping payroll approval test - no payroll ID available');
    return false;
  }
  
  console.log('\n✅ Testing Approve Payroll...');
  const result = await apiCall('PUT', `/payroll-workflow/approve/${payrollId}`);
  
  if (result.success) {
    console.log('✅ Payroll approval successful');
    return true;
  } else {
    console.log('❌ Payroll approval failed:', result.error);
    return false;
  }
};

const testGetEligibleEmployees = async () => {
  console.log('\n👥 Testing Get Eligible Employees...');
  const result = await apiCall('GET', `/payroll-workflow/eligible-employees?month=${testData.month}&year=${testData.year}&companyId=${testData.companyId}`);
  
  if (result.success) {
    console.log('✅ Get eligible employees successful');
    console.log('Eligible employees:', result.data.data?.length || 0);
    return true;
  } else {
    console.log('❌ Get eligible employees failed:', result.error);
    return false;
  }
};

// Main test runner
const runAllTests = async () => {
  console.log('🚀 Starting Payroll Workflow API Tests...');
  console.log('=====================================');
  
  // Test login first
  const loginSuccess = await testLogin();
  if (!loginSuccess) {
    console.log('\n❌ Cannot proceed without authentication');
    return;
  }
  
  // Test all APIs
  const results = {
    login: loginSuccess,
    eligibleEmployees: await testGetEligibleEmployees(),
    individualCalculation: await testIndividualPayrollCalculation(),
    batchCalculation: await testBatchPayrollCalculation(),
    payrollDetails: await testGetPayrollDetails(),
    payrollHistory: await testGetPayrollHistory(),
    companySummary: await testGetCompanySummary(),
    // approval: await testApprovePayroll(payrollId)
  };
  
  // Summary
  console.log('\n📊 TEST RESULTS SUMMARY');
  console.log('========================');
  Object.entries(results).forEach(([test, success]) => {
    console.log(`${success ? '✅' : '❌'} ${test}: ${success ? 'PASSED' : 'FAILED'}`);
  });
  
  const passedTests = Object.values(results).filter(Boolean).length;
  const totalTests = Object.keys(results).length;
  console.log(`\n🎯 Overall: ${passedTests}/${totalTests} tests passed`);
};

// Run tests
runAllTests().catch(console.error);
