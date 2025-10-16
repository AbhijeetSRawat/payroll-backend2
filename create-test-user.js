import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const createTestUser = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/masu-consultancy');
    console.log('Connected to MongoDB');
    
    const hashedPassword = await bcrypt.hash('test123', 12);
    
    const testUser = {
      email: 'testuser@masu.com',
      password: hashedPassword,
      role: 'admin',
      company: '6863c9fd36a3e24a3218d887', // Using existing company ID
      isFirstLogin: false,
      profile: {
        firstName: 'Test',
        lastName: 'User'
      },
      permissions: ['payroll:create', 'payroll:read', 'payroll:approve', 'admin']
    };
    
    // Check if user already exists
    const existingUser = await mongoose.connection.db.collection('users').findOne({
      email: testUser.email
    });
    
    if (existingUser) {
      console.log('Test user already exists, updating password...');
      await mongoose.connection.db.collection('users').updateOne(
        { email: testUser.email },
        { $set: { password: hashedPassword, isFirstLogin: false } }
      );
    } else {
      console.log('Creating new test user...');
      await mongoose.connection.db.collection('users').insertOne(testUser);
    }
    
    console.log('✅ Test user created/updated successfully');
    console.log('Email: testuser@masu.com');
    console.log('Password: test123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createTestUser();
