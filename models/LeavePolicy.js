import mongoose from 'mongoose';

const leavePolicySchema = new mongoose.Schema({
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true, 
    unique: true 
  },
  sandwichLeave: {
    type: Boolean,
    default: false
  },
  yearStartMonth: { 
    type: Number, 
    min: 1, 
    max: 12, 
    default: 1 
  }, // 1=Jan, 4=Apr (India FY)
  holidays: [{
    date: Date,
    name: String,
    recurring: Boolean,
    description: String
  }],
  weekOff: { 
    type: [Number], 
    default: [0, 6] 
  }, // 0=Sun, 6=Sat
  includeWeekOff: {
    type: Boolean,
    default: false
  },
  leaveTypes: [{
    name: { 
      type: String, 
      required: true 
    },
    shortCode: { 
      type: String, 
      required: true,
      uppercase: true
    },
    maxPerRequest: { 
      type: Number, 
      default: 30 
    },
    minPerRequest: { 
      type: Number, 
      default: 1 
    },
    requiresApproval: { 
      type: Boolean, 
      default: true 
    },
    requiresDocs: { 
      type: Boolean, 
      default: false 
    },
     docsRequiredAfterDays: { 
      type: Number, 
      default: null // e.g., 3 → require docs if leave > 3 days
    },
    documentTypes: [String],
    unpaid: { 
      type: Boolean, 
      default: false 
    },
    isActive: { 
      type: Boolean, 
      default: true 
    },
    applicableFor: {
      type: String,
      enum: ['all', 'male', 'female', 'others'],
      default: 'all'
    },
    maxInstancesPerYear: {
      type: Number,
      default: null // null means unlimited
    },
    maxInstancesPerMonth: {
      type: Number,
      default: null // null means unlimited
    },
    coolingPeriod: {
      type: Number,
      default: 0 // days between consecutive leaves of this type
    },
    carryForward:{
      type: Boolean,
      default: false
    },
    encashment:{
      type: Boolean,
      default: false
    },
    lapse:{
      type: Boolean,
      default: false
    },
  }]
}, { 
  timestamps: true 
});

export default mongoose.model('LeavePolicy', leavePolicySchema);