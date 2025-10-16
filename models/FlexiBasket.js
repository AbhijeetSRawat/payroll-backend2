import mongoose from "mongoose";

// Schema for individual flexi benefit options (like HRA, LTA, Fuel, etc.)
const FlexiOptionSchema = new mongoose.Schema({
  headCode: {
    type: String,
    required: true,
    unique: true,
    comment:
      "Unique code for each flexi benefit head (e.g., 'HRA', 'LTA', 'FUEL')",
  },
  name: {
    type: String,
    required: true,
    comment: "Display name of the flexi benefit (e.g., 'House Rent Allowance')",
  },
  description: {
    type: String,
    comment: "Detailed description of what this benefit covers",
  },
  optionType: {
    type: String,
    enum: ["unit", "amount", "percentage"],
    required: true,
    comment:
      "How this benefit is calculated: unit-based, fixed amount, or percentage",
  },
  unitValue: {
    type: Number,
    comment: "Value per unit (for unit-based options)",
  },
  minLimit: {
    type: Number,
    comment: "Minimum amount that can be declared for this benefit",
  },
  maxLimit: {
    type: Number,
    comment: "Maximum amount that can be declared for this benefit",
  },
  calculationBasis: {
    type: String,
    comment: "How to calculate limits (e.g., '40% of Basic', 'Fixed Amount')",
  },
  taxBenefit: {
    type: String,
    comment: "Details about tax exemptions and conditions",
  },
  conditions: {
    type: String,
    comment: "Any specific conditions or requirements",
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: "Whether this benefit option is currently available",
  },
  order: {
    type: Number,
    required: true,
    comment: "Display order in the flexi basket form",
  },
});

// Schema for company's flexi basket template
const FlexiBasketSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      comment: "Reference to the company that owns this flexi basket",
    },
    name: {
      type: String,
      required: true,
      default: "Flexi Benefits Basket",
      comment: "Name of this flexi benefits basket",
    },
    totalFlexiAmount: {
      type: Number,
      required: true,
      default: 0,
      comment:
        "Total flexi amount available for distribution among benefits",
    },
    calculationBasis: {
      type: String,
      required: true,
      default: "Basic Salary",
      comment:
        "Basis for calculating total flexi amount (e.g., 'Basic Salary', 'Fixed Amount')",
    },
    calculationPercentage: {
      type: Number,
      default: 0,
      comment:
        "Percentage of calculation basis to determine total flexi amount",
    },
    options: [FlexiOptionSchema],
    financialYear: {
      type: String,
      required: true,
      comment:
        "Financial year this flexi basket applies to (e.g., '2024-2025')",
    },
    isActive: {
      type: Boolean,
      default: true,
      comment: "Whether this flexi basket template is currently active",
    },
  },
  {
    timestamps: true,
    comment: "Master template for company's flexi benefits basket",
  }
);

// Schema for employee's flexi benefit declarations
const FlexiDeclarationSchema = new mongoose.Schema(
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
      comment: "Reference to the employee making the declaration",
    },
    flexiBasket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FlexiBasket",
      required: true,
      comment: "Reference to the flexi basket template being used",
    },
    financialYear: {
      type: String,
      required: true,
      comment: "Financial year for this declaration",
    },
    // Flexi compensation details
    basicSalary: {
      type: Number,
      required: true,
      comment: "Employee's basic salary for flexi calculations",
    },
    totalFlexiAmount: {
      type: Number,
      required: true,
      comment: "Total flexi amount available to this employee",
    },
    statutoryBonus: {
      type: Number,
      default: 0,
      comment: "Any statutory bonus amount",
    },
    // Individual benefit declarations
    declarations: [
      {
        headCode: {
          type: String,
          required: true,
          comment: "Code of the benefit head being declared",
        },
        optionType: {
          type: String,
          required: true,
          comment: "Type of option (unit/amount/percentage)",
        },
        declaredUnits: {
          type: Number,
          default: 0,
          comment: "Number of units declared (for unit-based options)",
        },
        declaredAmount: {
          type: Number,
          required: true,
          comment: "Annual amount declared for this benefit",
        },
        monthlyAmount: {
          type: Number,
          required: true,
          comment: "Monthly equivalent of the declared amount",
        },
        limitPerMonth: {
          type: Number,
          required: true,
          comment: "Maximum allowed limit per month for this benefit",
        },
        limitAsPerCTC: {
          type: Number,
          required: true,
          comment: "Limit as per CTC slab rules",
        },
        taxBenefitAmount: {
          type: Number,
          default: 0,
          comment: "Amount eligible for tax benefits",
        },
        isWithinLimit: {
          type: Boolean,
          default: true,
          comment: "Whether declaration is within allowed limits",
        },
        remark: {
          type: String,
          comment: "Any remarks or notes for this declaration",
        },
      },
    ],
    // Summary calculations
    totalDeclaredAmount: {
      type: Number,
      default: 0,
      comment: "Sum of all declared amounts",
    },
    remainingBalance: {
      type: Number,
      required: true,
      comment:
        "Remaining flexi amount after all declarations",
    },
    totalTaxBenefit: {
      type: Number,
      default: 0,
      comment:
        "Total tax benefit amount across all declarations",
    },
    status: {
      type: String,
      enum: ["Draft", "Submitted", "Approved", "Rejected"],
      default: "Draft",
      comment: "Current status of the declaration",
    },
    submittedAt: {
      type: Date,
      comment: "When the declaration was submitted",
    },
    approvedAt: {
      type: Date,
      comment: "When the declaration was approved",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      comment: "User who approved this declaration",
    },
  },
  {
    timestamps: true,
    comment:
      "Employee's flexi benefit declarations for a financial year",
  }
);

// Ensure only one declaration per employee per financial year
FlexiDeclarationSchema.index(
  { employee: 1, financialYear: 1 },
  { unique: true }
);

const FlexiBasket = mongoose.model("FlexiBasket", FlexiBasketSchema);
const FlexiDeclaration = mongoose.model(
  "FlexiDeclaration",
  FlexiDeclarationSchema
);

export { FlexiBasket, FlexiDeclaration };
