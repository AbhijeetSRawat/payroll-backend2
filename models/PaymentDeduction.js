import mongoose from 'mongoose';

// Schema for salary payments
const SalaryPaymentSchema = new mongoose.Schema({
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
  ctcAnnexure: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CTCAnnexure',
    required: true
  },
  paymentPeriod: {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true }
  },
  // Earnings Breakdown
  earnings: {
    basic: { type: Number, required: true },
    hra: { type: Number, default: 0 },
    specialAllowance: { type: Number, default: 0 },
    otherAllowances: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    arrears: { type: Number, default: 0 },
    flexiBenefits: { type: Number, default: 0 }
  },
  // Deductions Breakdown
  deductions: {
    professionalTax: { type: Number, default: 0 },
    incomeTax: { type: Number, default: 0 },
    providentFund: { type: Number, default: 0 },
    esic: { type: Number, default: 0 },
    loanEmi: { type: Number, default: 0 },
    advanceRecovery: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 }
  },
  // Attendance Details
  attendance: {
    workingDays: { type: Number, required: true },
    paidDays: { type: Number, required: true },
    lopDays: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 }
  },
  // Summary
  totalEarnings: { type: Number, required: true },
  totalDeductions: { type: Number, required: true },
  netSalary: { type: Number, required: true },
  // Payment Status
  status: {
    type: String,
    enum: ['draft', 'processed', 'approved', 'paid', 'cancelled'],
    default: 'draft'
  },
  // Approval Workflow
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidAt: Date,
  // Bank Details
  bankAccountNumber: String,
  bankName: String,
  ifscCode: String,
  paymentReference: String,
  // Audit
  remarks: String
}, {
  timestamps: true
});

// Schema for statutory deductions tracking
const StatutoryDeductionSchema = new mongoose.Schema({
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
  deductionType: {
    type: String,
    enum: ['professional_tax', 'income_tax', 'provident_fund', 'esic'],
    required: true
  },
  financialYear: {
    type: String,
    required: true
  },
  // Monthly breakdown
  monthlyDetails: [{
    month: Number,
    year: Number,
    amount: Number,
    paymentReference: String,
    paidAt: Date
  }],
  // Yearly totals
  totalAmount: { type: Number, default: 0 },
  paidAmount: { type: Number, default: 0 },
  balanceAmount: { type: Number, default: 0 },
  // Due dates
  dueDate: Date,
  paidDate: Date,
  status: {
    type: String,
    enum: ['pending', 'partially_paid', 'paid', 'overdue'],
    default: 'pending'
  }
}, {
  timestamps: true
});

// Schema for loans and advances
const LoanAdvanceSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['loan', 'advance'],
    required: true
  },
  purpose: {
    type: String,
    required: true
  },
  sanctionAmount: {
    type: Number,
    required: true
  },
  disbursedAmount: {
    type: Number,
    default: 0
  },
  emiAmount: {
    type: Number,
    required: true
  },
  tenureMonths: {
    type: Number,
    required: true
  },
  interestRate: {
    type: Number,
    default: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: Date,
  // Status
  status: {
    type: String,
    enum: ['applied', 'approved', 'disbursed', 'active', 'closed', 'cancelled'],
    default: 'applied'
  },
  // Deduction tracking
  totalPaid: { type: Number, default: 0 },
  remainingBalance: { type: Number },
  emisPaid: { type: Number, default: 0 },
  emisRemaining: { type: Number },
  // Approval
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date,
  disbursedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  disbursedAt: Date,
  // Documents
  documents: [{
    name: String,
    fileUrl: String,
    uploadedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Schema for payment batches (bulk payments)
const PaymentBatchSchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  batchType: {
    type: String,
    enum: ['salary', 'reimbursement', 'bonus', 'advance'],
    required: true
  },
  paymentMonth: Number,
  paymentYear: Number,
  totalAmount: { type: Number, required: true },
  totalEmployees: { type: Number, required: true },
  payments: [{
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    amount: Number,
    paymentReference: String,
    status: {
      type: String,
      enum: ['pending', 'processing', 'paid', 'failed'],
      default: 'pending'
    }
  }],
  status: {
    type: String,
    enum: ['draft', 'processing', 'completed', 'cancelled'],
    default: 'draft'
  },
  processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,
  completedAt: Date
}, {
  timestamps: true
});

const SalaryPayment = mongoose.model('SalaryPayment', SalaryPaymentSchema);
const StatutoryDeduction = mongoose.model('StatutoryDeduction', StatutoryDeductionSchema);
const LoanAdvance = mongoose.model('LoanAdvance', LoanAdvanceSchema);
const PaymentBatch = mongoose.model('PaymentBatch', PaymentBatchSchema);

export {
  SalaryPayment,
  StatutoryDeduction,
  LoanAdvance,
  PaymentBatch
};
