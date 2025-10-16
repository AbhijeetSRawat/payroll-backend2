import axios from 'axios';

const BASE_URL = 'http://localhost:4000/api';

const testPasswords = [
  'password123',
  'admin123',
  'superadmin',
  '123456',
  'password',
  'admin',
  'masu123',
  'test123'
];

const testEmails = [
  'superadmin@mail.com',
  'technovasolutions2066@masu.com',
  'abhijeet8070@masu.com'
];

const testLogin = async (email, password) => {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email,
      password
    });
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, error: error.response?.data?.message || error.message };
  }
};

const findWorkingCredentials = async () => {
  console.log('🔍 Testing different email/password combinations...\n');
  
  for (const email of testEmails) {
    for (const password of testPasswords) {
      console.log(`Testing: ${email} / ${password}`);
      const result = await testLogin(email, password);
      
      if (result.success) {
        console.log(`✅ SUCCESS! Email: ${email}, Password: ${password}`);
        console.log('Token:', result.data.token);
        return { email, password, token: result.data.token };
      } else {
        console.log(`❌ Failed: ${result.error}`);
      }
    }
    console.log('---');
  }
  
  return null;
};

findWorkingCredentials().then(result => {
  if (result) {
    console.log('\n🎉 Found working credentials!');
    console.log('Email:', result.email);
    console.log('Password:', result.password);
  } else {
    console.log('\n❌ No working credentials found');
  }
});
