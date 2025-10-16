import mongoose from 'mongoose';

const payrollSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    input_snapshot: { type: Object, required: true },
    gross_salary: { type: Number, required: true },
    pf_employee: { type: Number, required: true },
    pf_employer: {
      eps: { type: Number, required: true },
      epf: { type: Number, required: true },
    },
     month: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 12 
  },
  year: { 
    type: Number, 
    required: true 
  },
    esic: {
      employee: { type: Number, required: true },
      employer: { type: Number, required: true },
    },
    hra_exemption: { type: Number, required: true },
    taxable_income_old: { type: Number, required: true },
    taxable_income_new: { type: Number, required: true },
    tax_old: { type: Number, required: true },
    tax_new: { type: Number, required: true },
    cess_old: { type: Number, required: true },
    cess_new: { type: Number, required: true },
    total_tax_old: { type: Number, required: true },
    total_tax_new: { type: Number, required: true },
    recommendation: { type: String, required: true },
    net_take_home: { type: Number, required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Payroll', payrollSchema);
