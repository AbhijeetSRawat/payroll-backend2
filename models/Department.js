// models/Department.js
import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  description: String,
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  // Only used if this department is a SALES department
  salesConfig: {
    targetType: { type: String, enum: ['Monthly', 'Quarterly', 'Yearly'], default: 'Monthly' },
    targetAmount: { type: Number, default: 0 },       // total department goal
    achievedAmount: { type: Number, default: 0 },     // total sales done by team
  },

  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Department', departmentSchema);
