// models/AttendanceRegularization.js
import mongoose from "mongoose";

const attendanceRegularizationSchema = new mongoose.Schema({
  employee: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  company: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  from: { 
    type: Date,
    required: true
  },
  to: {
    type: Date,
    required: true
  },
  shift: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    required: true
  },
  requestedInTime: {
    type: String,
    required: true
  },
  requestedOutTime: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  supportingDocuments: [{
    filename: String,
    originalName: String,
    mimeType: String,
    size: Number,
    uploadDate: { type: Date, default: Date.now }
  }],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  // Three-level approval system
  currentApprovalLevel: {
    type: String,
    enum: ['manager', 'hr', 'admin', 'completed'],
    default: 'manager'
  },
  approvalFlow: {
    manager: {
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
      comment: String
    },
    hr: {
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
      comment: String
    },
    admin: {
      status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: Date,
      comment: String
    }
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewDate: {
    type: Date
  },
  reviewComments: {
    type: String,
    trim: true
  },
  regularizationType: {
    type: String,
    enum: [
      'work_from_home',
      'outdoor',
      'missing_punch',
      'short_leave',
      'other'
    ],
    required: true
  },
  totalHours: {
    type: Number,
    default: 0
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: String
}, { timestamps: true });

// Indexes
attendanceRegularizationSchema.index({ employee: 1, from: 1 });
attendanceRegularizationSchema.index({ company: 1, status: 1 });
attendanceRegularizationSchema.index({ from: 1, status: 1 });

export default mongoose.model('AttendanceRegularization', attendanceRegularizationSchema);