import mongoose from 'mongoose';

// Monthly payroll processing
const PayrollProcessingSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employee',
    required: true
  },
  // References to existing data
  ctcAnnexure: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CTCAnnexure',
    required: true
  },
  flexiDeclaration: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FlexiDeclaration'
  },
  // Payroll period
  payrollPeriod: {
    month: { type: Number, required: true },
    year: { type: Number, required: true },
    payDays: { type: Number, required: true },
    lopDays: { type: Number, default: 0 }
  },
  // Earnings (calculated from CTC and Flexi)
  earnings: {
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    conveyance: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    washingAllowance: { type: Number, default: 0 },
    educationAllowance: { type: Number, default: 0 },
    medicalAllowance: { type: Number, default: 0 },
    adhocAllowance: { type: Number, default: 0 },
    canteenAllowance: { type: Number, default: 0 },
    petrolAllowance: { type: Number, default: 0 },
    bookPeriodical: { type: Number, default: 0 },
    telephoneReimb: { type: Number, default: 0 },
    ltaAdvance: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    otherEarnings: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 }
  },
  // Deductions
  deductions: {
    incomeTax: { type: Number, default: 0 },
    providentFund: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    loanRecovery: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    nps: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 }
  },
  // Summary
  netSalary: { type: Number, required: true },
  // Status
  status: {
    type: String,
    enum: ['draft', 'processed', 'approved', 'paid'],
    default: 'draft'
  },
  // Processing info
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  paidAt: Date
}, {
  timestamps: true
});

// Payroll batch for bulk processing
const PayrollBatchSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  batchName: { type: String, required: true },
  payrollPeriod: {
    month: { type: Number, required: true },
    year: { type: Number, required: true }
  },
  employees: [{
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    payroll: { type: mongoose.Schema.Types.ObjectId, ref: 'PayrollProcessing' },
    status: { type: String, enum: ['pending', 'processed', 'paid'] }
  }],
  totalEarnings: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  totalNetSalary: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'processing', 'completed', 'cancelled'],
    default: 'draft'
  },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date
}, {
  timestamps: true
});

const PayrollProcessing = mongoose.model('PayrollProcessing', PayrollProcessingSchema);
const PayrollBatch = mongoose.model('PayrollBatch', PayrollBatchSchema);

export { PayrollProcessing, PayrollBatch };