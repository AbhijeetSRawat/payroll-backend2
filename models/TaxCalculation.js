import mongoose from 'mongoose';

// Tax computation using existing data references
const TaxComputationSchema = new mongoose.Schema({
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
  taxDeclaration: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxDeclaration'
  },
  financialYear: {
    type: String,
    required: true
  },
  // Calculated values (not storing duplicate data)
  calculationSummary: {
    grossSalary: { type: Number, default: 0 },
    totalExemptions: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    netTaxableIncome: { type: Number, default: 0 },
    // Tax regimes
    oldRegimeTax: { type: Number, default: 0 },
    newRegimeTax: { type: Number, default: 0 },
    recommendedRegime: {
      type: String,
      enum: ['old', 'new'],
      default: 'old'
    },
    finalTaxLiability: { type: Number, default: 0 }
  },
  // Monthly breakdown
  monthlyBreakup: [{
    month: Number,
    year: Number,
    basic: Number,
    hra: Number,
    otherComponents: Number,
    exemptions: Number,
    taxableIncome: Number,
    tds: Number
  }],
  // Status
  status: {
    type: String,
    enum: ['draft', 'calculated', 'approved', 'locked'],
    default: 'draft'
  },
  // Audit
  calculatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  calculatedAt: Date,
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approvedAt: Date
}, {
  timestamps: true
});

// Tax declaration (extends existing employee data)
const TaxDeclarationSchema = new mongoose.Schema({
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
  financialYear: {
    type: String,
    required: true
  },
  // House Property (additional info not in employee model)
  houseProperty: {
    hasSelfOccupied: { type: Boolean, default: false },
    hasLetOut: { type: Boolean, default: false },
    properties: [{
      type: { type: String, enum: ['self_occupied', 'let_out'] },
      annualValue: { type: Number, default: 0 },
      municipalTaxes: { type: Number, default: 0 },
      interestPaid: { type: Number, default: 0 }
    }]
  },
  // Other Income Sources
  otherIncome: {
    interestIncome: { type: Number, default: 0 },
    familyPension: { type: Number, default: 0 },
    otherSources: { type: Number, default: 0 }
  },
  // Investment Declarations (Section 80)
  investments: {
    // 80C Investments
    section80C: {
      lifeInsurance: { type: Number, default: 0 },
      elss: { type: Number, default: 0 },
      tuitionFees: { type: Number, default: 0 },
      principalRepayment: { type: Number, default: 0 },
      nsc: { type: Number, default: 0 },
      ppf: { type: Number, default: 0 },
      others: { type: Number, default: 0 }
    },
    // 80D - Medical Insurance
    section80D: {
      self: { type: Number, default: 0 },
      parents: { type: Number, default: 0 },
      seniorCitizen: { type: Boolean, default: false }
    },
    // 80CCD - NPS
    section80CCD: {
      employeeContribution: { type: Number, default: 0 },
      additionalContribution: { type: Number, default: 0 }
    },
    // Other Sections
    section80E: { type: Number, default: 0 }, // Education Loan
    section80G: { type: Number, default: 0 }  // Donations
  },
  // Status
  status: {
    type: String,
    enum: ['draft', 'submitted', 'verified', 'approved'],
    default: 'draft'
  },
  submittedAt: Date,
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date
}, {
  timestamps: true
});

const TaxComputation = mongoose.model('TaxComputation', TaxComputationSchema);
const TaxDeclaration = mongoose.model('TaxDeclaration', TaxDeclarationSchema);

export { TaxComputation, TaxDeclaration };