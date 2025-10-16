import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  // User who performed the action
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    comment: "User who performed the action"
  },
  // Company context
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    comment: "Company where action was performed"
  },
  // Action details
  action: {
    type: String,
    required: true,
    comment: "Action performed (e.g., 'CTC Created', 'Salary Paid')"
  },
  module: {
    type: String,
    required: true,
    enum: [
      'CTC', 'Flexi', 'Payment', 'Reimbursement', 'Employee', 
      'User', 'Company', 'System', 'Attendance', 'Leave'
    ],
    comment: "Module where action was performed"
  },
  actionType: {
    type: String,
    required: true,
    enum: ['create', 'read', 'update', 'delete', 'approve', 'reject', 'login', 'logout', 'export'],
    comment: "Type of action performed"
  },
  // Resource being acted upon
  resource: {
    type: String,
    comment: "Resource type (e.g., 'CTCAnnexure', 'SalaryPayment')"
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    comment: "ID of the resource being acted upon"
  },
  // Detailed description
  description: {
    type: String,
    comment: "Human readable description of the action"
  },
  // Changes made (for update actions)
  changes: {
    oldData: { type: mongoose.Schema.Types.Mixed },
    newData: { type: mongoose.Schema.Types.Mixed },
    changedFields: [String]
  },
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    comment: "Additional context data (IP address, user agent, etc.)"
  },
  // Status of the action
  status: {
    type: String,
    enum: ['success', 'failure', 'pending'],
    default: 'success',
    comment: "Status of the action"
  },
  errorMessage: {
    type: String,
    comment: "Error message if action failed"
  },
  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now,
    comment: "When the action occurred"
  },
  // Session information
  sessionId: {
    type: String,
    comment: "User session ID"
  },
  ipAddress: {
    type: String,
    comment: "IP address of the user"
  },
  userAgent: {
    type: String,
    comment: "User agent/browser information"
  }
}, {
  timestamps: true,
  comment: "Comprehensive audit trail for all system actions"
});

// Indexes for efficient querying
AuditLogSchema.index({ company: 1, timestamp: -1 });
AuditLogSchema.index({ user: 1, timestamp: -1 });
AuditLogSchema.index({ module: 1, action: 1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ actionType: 1, timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;