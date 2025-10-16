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
  month: 10,
  year: 2024,
  adminEmail: 'testuser@masu.com',
  adminPassword: 'test123',
  payrollId: '68e8d6b3a36304a58f4030db' // From the created record
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

const testGetPayrollDetails = async () => {
  console.log('\n📋 Testing Get Payroll Details...');
  const result = await apiCall('GET', `/payroll-workflow/${testData.employeeId}/${testData.month}/${testData.year}?companyId=${testData.companyId}`);
  
  if (result.success) {
    console.log('✅ Get payroll details successful');
    console.log('Employee ID:', result.data.data?.employee);
    console.log('Net Salary:', result.data.data?.netSalary);
    console.log('Status:', result.data.data?.status);
    return result.data.data?._id;
  } else {
    console.log('❌ Get payroll details failed:', result.error);
    return null;
  }
};

const testApprovePayroll = async (payrollId) => {
  console.log('\n✅ Testing Approve Payroll...');
  const result = await apiCall('PUT', `/payroll-workflow/approve/${payrollId}`);
  
  if (result.success) {
    console.log('✅ Payroll approval successful');
    console.log('New Status:', result.data.data?.status);
    return true;
  } else {
    console.log('❌ Payroll approval failed:', result.error);
    return false;
  }
};

const testGetPayrollHistory = async () => {
  console.log('\n📚 Testing Get Payroll History...');
  const result = await apiCall('GET', `/payroll-workflow/history/${testData.employeeId}?page=1&limit=10`);
  
  if (result.success) {
    console.log('✅ Get payroll history successful');
    console.log('Records found:', result.data.data?.length || 0);
    if (result.data.data && result.data.data.length > 0) {
      console.log('Latest record status:', result.data.data[0].status);
      console.log('Latest record net salary:', result.data.data[0].netSalary);
    }
    return true;
  } else {
    console.log('❌ Get payroll history failed:', result.error);
    return false;
  }
};

const testCreateNewPayrollForDifferentMonth = async () => {
  console.log('\n📊 Testing Create Payroll for Different Month...');
  const result = await apiCall('POST', '/payroll-workflow/calculate', {
    employeeId: testData.employeeId,
    month: 11, // November
    year: 2024,
    companyId: testData.companyId
  });
  
  if (result.success) {
    console.log('✅ New payroll calculation successful');
    console.log('Net Salary:', result.data.data?.netSalary);
    console.log('Month:', result.data.data?.payrollPeriod?.month);
    return result.data.data?._id;
  } else {
    console.log('❌ New payroll calculation failed:', result.error);
    return null;
  }
};

const testGetCompanySummary = async () => {
  console.log('\n🏢 Testing Get Company Payroll Summary...');
  const result = await apiCall('GET', `/payroll-workflow/company-summary?month=${testData.month}&year=${testData.year}&companyId=${testData.companyId}`);
  
  if (result.success) {
    console.log('✅ Get company summary successful');
    console.log('Total Employees:', result.data.data?.totalEmployees || 0);
    console.log('Total Net Salary:', result.data.data?.totalNetSalary || 0);
    console.log('Status Breakdown:', result.data.data?.statusWise || {});
    return true;
  } else {
    console.log('❌ Get company summary failed:', result.error);
    return false;
  }
};

// Main test runner
const runCompleteTests = async () => {
  console.log('🚀 Starting Complete Payroll Workflow API Tests...');
  console.log('==================================================');
  
  // Test login first
  const loginSuccess = await testLogin();
  if (!loginSuccess) {
    console.log('\n❌ Cannot proceed without authentication');
    return;
  }
  
  // Test all APIs in logical order
  const payrollId = await testGetPayrollDetails();
  const approvalSuccess = payrollId ? await testApprovePayroll(payrollId) : false;
  const historySuccess = await testGetPayrollHistory();
  const newPayrollId = await testCreateNewPayrollForDifferentMonth();
  const summarySuccess = await testGetCompanySummary();
  
  // Summary
  console.log('\n📊 COMPLETE TEST RESULTS SUMMARY');
  console.log('=================================');
  console.log(`✅ Login: PASSED`);
  console.log(`${payrollId ? '✅' : '❌'} Get Payroll Details: ${payrollId ? 'PASSED' : 'FAILED'}`);
  console.log(`${approvalSuccess ? '✅' : '❌'} Approve Payroll: ${approvalSuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`${historySuccess ? '✅' : '❌'} Get Payroll History: ${historySuccess ? 'PASSED' : 'FAILED'}`);
  console.log(`${newPayrollId ? '✅' : '❌'} Create New Payroll: ${newPayrollId ? 'PASSED' : 'FAILED'}`);
  console.log(`${summarySuccess ? '✅' : '❌'} Company Summary: ${summarySuccess ? 'PASSED' : 'FAILED'}`);
  
  const passedTests = [loginSuccess, !!payrollId, approvalSuccess, historySuccess, !!newPayrollId, summarySuccess].filter(Boolean).length;
  console.log(`\n🎯 Overall: ${passedTests}/6 tests passed`);
  
  if (passedTests === 6) {
    console.log('\n🎉 ALL TESTS PASSED! Payroll workflow is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Check the logs above for details.');
  }
};

// Run tests
runCompleteTests().catch(console.error);
