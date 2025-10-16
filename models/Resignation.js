import mongoose from 'mongoose';

const resignationSchema = new mongoose.Schema({
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
  resignationDate: {
    type: Date,
    required: true
  },
  proposedLastWorkingDate: {
    type: Date,
    required: true
  },
  actualLastWorkingDate: {
    type: Date
  },
  reason: {
    type: String,
    required: true
  },
  feedback: String,
  
  // Three-level approval system
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'withdrawn', 'completed'],
    default: 'pending'
  },
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
  
  rejectionReason: String,
  
  exitInterview: {
    conducted: { type: Boolean, default: false },
    conductedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    conductedDate: Date,
    notes: String
  },
  
  handoverNotes: String,
  
  assetsReturned: [{
    name: String,
    returned: { type: Boolean, default: false },
    returnedDate: Date,
    condition: String
  }],
  
  documents: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }]
}, { 
  timestamps: true 
});

export default mongoose.model('Resignation', resignationSchema);