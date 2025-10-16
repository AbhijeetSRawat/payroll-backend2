// models/EmployeeLeaveBalance.js
import mongoose from 'mongoose';

const employeeLeaveBalanceSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  year:     { type: Number, required: true },

  balances: [{
    leaveType: { type: String, required: true },  // use shortCode (e.g., "SL")
    available: { type: Number, default: 0 },
    used:      { type: Number, default: 0 },
    carryForwarded: { type: Number, default: 0 }
  }]
}, { timestamps: true });

employeeLeaveBalanceSchema.index({ employee: 1, company: 1, year: 1 }, { unique: true });

export default mongoose.model('EmployeeLeaveBalance', employeeLeaveBalanceSchema);


