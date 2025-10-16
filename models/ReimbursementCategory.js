import mongoose from "mongoose";

const reimbursementCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

// ✅ Unique index per company (case-insensitive)
reimbursementCategorySchema.index(
  { company: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

export default mongoose.model("ReimbursementCategory", reimbursementCategorySchema);

