import cron from 'node-cron';
import Resignation from '../models/Resignation.js';
import Employee from '../models/Employee.js';

export const initResignationCronJob = () => {
  // Run daily at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('🔄 Running resignation cron job...');
      const today = new Date();
      
      // Update completed resignations
      const completedResignations = await Resignation.find({
        status: 'approved',
        actualLastWorkingDate: { $lte: today }
      });
      
      let processedCount = 0;
      
      for (const resignation of completedResignations) {
        try {
          resignation.status = 'completed';
          await resignation.save();
          
          // Deactivate employee account
          await Employee.findByIdAndUpdate(resignation.employee, {
            isActive: false,
            'employmentDetails.status': 'resigned'
          });
          
          processedCount++;
        } catch (error) {
          console.error(`Error processing resignation ${resignation._id}:`, error);
        }
      }
      
      console.log(`✅ Resignation cron job completed. Processed ${processedCount} resignations.`);
    } catch (error) {
      console.error('❌ Error in resignation cron job:', error);
    }
  });
  
  console.log('✅ Resignation cron job scheduled to run daily at midnight');
};