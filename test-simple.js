import axios from 'axios';

const BASE_URL = 'http://localhost:4000';

// Test server health
const testServerHealth = async () => {
  try {
    const response = await axios.get(BASE_URL);
    console.log('✅ Server is running:', response.data);
    return true;
  } catch (error) {
    console.log('❌ Server not running:', error.message);
    return false;
  }
};

// Test without auth to see route structure
const testRouteAccess = async () => {
  try {
    const response = await axios.get(`${BASE_URL}/api/payroll-workflow/eligible-employees`);
    console.log('✅ Route accessible:', response.status);
  } catch (error) {
    console.log('Route response:', error.response?.status, error.response?.data?.message || error.message);
  }
};

const runTests = async () => {
  console.log('🔍 Testing server and routes...');
  await testServerHealth();
  await testRouteAccess();
};

runTests();
