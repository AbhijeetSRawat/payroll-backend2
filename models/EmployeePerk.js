// models/EmployeePerk.js
import mongoose from 'mongoose';

const employeePerkSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  perk: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Perk',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  effectiveDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date
  },
  calculatedAmount: {
    type: Number,
    required: true
  },
  taxableAmount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedDate: {
    type: Date
  },
  notes: {
    type: String,
    default: ''
  },
  documents: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Index for efficient queries
employeePerkSchema.index({ employee: 1, status: 1 });
employeePerkSchema.index({ company: 1, effectiveDate: 1 });
employeePerkSchema.index({ perk: 1, status: 1 });

export default mongoose.model('EmployeePerk', employeePerkSchema);