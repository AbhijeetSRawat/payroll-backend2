import mongoose from "mongoose";

const CTCAnnexureSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      comment: "Reference to the company",
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      comment: "Reference to the employee",
    },
    template: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CTCTemplate",
      comment: "Reference to the CTC template used",
    },
    financialYear: {
      type: String,
      required: true,
      comment: "Financial year for this CTC",
    },
    annualCTC: {
      type: Number,
      required: true,
      comment: "Total annual cost to company",
    },
    // Flexi basket integration
    flexiDeclaration: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FlexiDeclaration",
      comment: "Reference to employee's flexi benefit declaration",
    },
    hasFlexiBenefits: {
      type: Boolean,
      default: false,
      comment: "Whether this CTC includes flexi benefits",
    },
    totalFlexiAmount: {
      type: Number,
      default: 0,
      comment: "Total flexi benefits amount in CTC",
    },
    hraExemption: {
      type: Number,
      default: 0, 
    },
    // Monthly breakdown of salary components
    monthlyBreakup: [
      {
        salaryHead: {
          type: String,
          required: true,
          comment: "Name of the salary component",
        },
        annualAmount: {
          type: Number,
          required: true,
          comment: "Annual amount for this component",
        },
        monthlyAmount: {
          type: Number,
          comment: "Monthly amount for this component",
        },
        calculationBasis: {
          type: String,
          comment: "How this amount was calculated",
        },
        exemptionLimit: {
          type: String,
          comment: "Tax exemption limits and conditions",
        },
        taxableAmount: {
          type: Number,
          default: 0,
          comment: "Taxable portion of this component",
        },
        isFlexiComponent: {
          type: Boolean,
          default: false,
          comment: "Whether this is a flexi benefit component",
        },
        flexiHeadCode: {
          type: String,
          comment: "Reference to flexi benefit head code",
        },
      },
    ],
    // Summary calculations
    summary: {
      fixedSalary: {
        type: Number,
        comment: "Total fixed salary components",
      },
      flexiBenefits: {
        type: Number,
        comment: "Total flexi benefits amount",
      },
      reimbursement: {
        type: Number,
        comment: "Total reimbursement components",
      },
      benefits: {
        type: Number,
        comment: "Total company benefits (PF, Gratuity, etc.)",
      },
      totalGrossEarning: {
        type: Number,
        comment: "Total gross earnings (fixed + flexi + reimbursement)",
      },
      totalDeductions: {
        type: Number,
        comment: "Total deductions (PF, Tax, etc.)",
      },
      netSalary: {
        type: Number,
        comment: "Net take-home salary",
      },
      difference: {
        type: Number,
        comment: "Difference between CTC and calculated total",
      },
    },
    status: {
      type: String,
      enum: ["Draft", "Approved", "Active"],
      default: "Draft",
      comment: "Current status of the CTC annexure",
    },
  },
  {
    timestamps: true,
    comment: "Employee's CTC breakdown with flexi benefits integration",
  }
);

// Compound index to ensure one CTC per employee per financial year
CTCAnnexureSchema.index({ employee: 1, financialYear: 1 }, { unique: true });

const CTCAnnexure = mongoose.model("CTCAnnexure", CTCAnnexureSchema);

export default CTCAnnexure;
