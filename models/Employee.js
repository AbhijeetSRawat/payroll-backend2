import mongoose from 'mongoose';


const customFieldSchema = new mongoose.Schema({
  label: { type: String },
  name: { type: String },
  type: { type: String, enum: ['text', 'number', 'date', 'boolean'] },
  required: { type: Boolean, default: false },
  defaultValue: mongoose.Schema.Types.Mixed
}, { _id: false });



const employmentSchema = new mongoose.Schema({
  employeeId: { type: String, required: true, unique: true },
  joiningDate: { type: Date, required: true },
  resignationDate: { type: Date },
  lastWorkingDate: { type: Date },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },  // You already have department in profile, but can keep for employment history
  designation: { type: String },
  employmentType: { 
    type: String, 
    enum: ['full-time', 'part-time', 'contract', 'intern'],
    default: 'full-time'
  },
  salesPerformance: {
    targetAmount: { type: Number, default: 0 },  
    achievedAmount: { type: Number, default: 0 },
    incentivesEarned: { type: Number, default: 0 },
    deductionsPercentage: { type: Number, default: 0 },
    additionalIncentives: { type: Number, default: 0 }
  },
  workLocation: String,
  costCenter: String,
  businessArea: String,
  pfFlag: { type: Boolean, default: false },
  esicFlag: { type: Boolean, default: false },
  ptFlag: { type: Boolean, default: false },
  salary: {
    base: { type: Number,  },
    bonus: Number,
    taxDeductions: Number
  },
        da: { type: Number, default: 0 },
        hra_received: { type: Number, default: 0 },
        other_allowances: { type: Number, default: 0 },
        other_income: { type: Number, default: 0 },
        deductions: {
            type: Object,
            default: {},
        },
        rent_paid: { type: Number, default: 0 },
  shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
  reportingTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  skills: [String],
  documents: [
    {
      name: { type: String }, // e.g. "aadharCard"
      files: [
        {
          type: { type: String }, // mime type
          url: { type: String },
          uploadedAt: { type: Date, default: Date.now },
        },
      ],
        isValid: { type: Boolean, default: false },
        validatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
  ],
  status: {
    type: String,
    enum: ['active', 'inactive', 'terminated', 'resigned', 'notice-period'],
    default: 'active'
  },
  noticePeriod: {
    type: Number, // in days
    default: 30
  },
  resignation: {
    applied: { type: Boolean, default: false },
    appliedDate: Date,
    approvedDate: Date,
    lastWorkingDate: Date
  }
}, { _id: false });

const personalDetailsSchema = new mongoose.Schema({
  gender: { type: String, enum: ['male', 'female', 'other','null'], default: 'null' },
  dateOfBirth: { type: Date },
  city: String,
  state: String,
  panNo: String,
  aadharNo: String,
  uanNo: String,
  esicNo: String,
  bankAccountNo: String,
  ifscCode: String,
  personalEmail: String,
  officialMobile: String,
  personalMobile: String
}, { _id: false });

const employeeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  personalDetails: personalDetailsSchema,
  employmentDetails: { type: employmentSchema, required: true },
  leaveBalance: {
    casual: { type: Number, default: 0 },
    sick: { type: Number, default: 0 },
    earned: { type: Number, default: 0 }
  },
  attendance: [{
    date: Date,
    status: { type: String, enum: ['present', 'absent', 'half-day', 'holiday'] },
    checkIn: Date,
    checkOut: Date,
    notes: String
  }],
    customFields: [customFieldSchema],
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

employeeSchema.index({ company: 1, 'employmentDetails.employeeId': 1 }, { unique: true });

export default mongoose.model('Employee', employeeSchema);
