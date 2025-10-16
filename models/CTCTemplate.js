import mongoose from "mongoose";

const SalaryHeadSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    enum: [
      "Basic",
      "HRA",
      "Special City Allowance",
      "Education Allowance",
      "Other Allowance",
      "Leave Travel Assistance",
      "Fuel & Maintenance Reimbursement",
      "Gift Voucher",
      "Telephone Allowance",
      "Technical Book",
      "Meal Allowance",
      "Washing Allowance",
      "Other Reimbursement",
      "Bonus",
      "Company Contribution to PF",
      "Company Contribution to ESIC",
      "Gratuity",
      "Employee Contribution to PF",
      "Employee Contribution to ESIC",
      "Professional Tax",
    ],
  },
  calculationType: {
    type: String,
    required: true,
    enum: ["percentage", "fixed", "slab", "formula"],
  },
  calculationValue: { type: Number }, // Percentage value or fixed amount
  calculationBasis: { type: String }, // e.g., "40% of CTC", "Fixed Amount"
  exemptionLimit: { type: String },
  isTaxable: { type: Boolean, default: true },
  order: { type: Number, required: true },
  isActive: { type: Boolean, default: true },
});

const CTCSlabSchema = new mongoose.Schema({
  slabType: {
    type: String,
    required: true,
    enum: [
      "LTA",
      "Fuel",
      "Gift",
      "Telephone",
      "TechnicalBook",
      "Meal",
      "Washing",
      "OtherReimbursement",
    ],
  },
  salaryMin: { type: Number, required: true },
  salaryMax: { type: Number, required: true },
  value: { type: Number, required: true },
  description: { type: String },
});

const CTCTemplateSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
    },
    templateName: {
      type: String,
      required: true,
      default: "Standard CTC Template",
    },
    salaryHeads: [SalaryHeadSchema],
    slabs: [CTCSlabSchema],
    financialYear: {
      type: String,
      required: true,
      default: () => {
        const year = new Date().getFullYear();
        return `${year}-${year + 1}`;
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const CTCTemplate =
  mongoose.models.CTCTemplate || mongoose.model("CTCTemplate", CTCTemplateSchema);

export default CTCTemplate;
