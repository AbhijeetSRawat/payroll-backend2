// models/Perk.js
import mongoose from 'mongoose';

const perkSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['vehicle', 'housing', 'medical', 'education', 'travel', 'other']
  },
  ownership: {
    type: String,
    required: true,
    enum: ['company', 'employee']
  },
  engineCapacity: {
    type: String,
    enum: ['1.6 Above', '1.6 Below', 'na']
  },
  usage: {
    type: String,
    required: true,
    enum: ['official', 'personal', 'both']
  },
  driverProvided: {
    type: Boolean,
    default: false
  },
  perkValue: {
    type: String,
    required: true
  },
  specialConditions: {
    type: String,
    default: ''
  },
  taxable: {
    type: Boolean,
    default: false
  },
  calculationMethod: {
    type: String,
    enum: ['fixed', 'actual', 'formula'],
    default: 'fixed'
  },
  fixedAmount: {
    type: Number,
    default: 0
  },
  formula: {
    type: String,
    default: ''
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
perkSchema.index({ company: 1, category: 1 });
perkSchema.index({ company: 1, isActive: 1 });

export default mongoose.model('Perk', perkSchema);