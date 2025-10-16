import mongoose from 'mongoose';
import { initResignationCronJob } from './cronJobs.js';


const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connected successfully');
      
      // Initialize cron jobs
      initResignationCronJob();
    })
    .catch((error) => {
      console.error('❌ MongoDB connection error:', error);
      process.exit(1);
    });
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  }
};

export default connectDB;

