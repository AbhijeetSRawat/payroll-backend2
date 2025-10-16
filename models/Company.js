import mongoose from 'mongoose';

const addressSchema = new mongoose.Schema({
  street: { type: String  },
  city: { type: String},
  state: { type: String },
  country: { type: String, default: 'India' },
  pincode: { type: String  },
  landmark: String
}, { _id: false });

const bankSchema = new mongoose.Schema({
  accountNumber: { type: String },
  ifscCode: { type: String },
  accountHolderName: { type: String },
  bankName: { type: String },
  branch: { type: String },
}, { _id: false });

const hrSchema = new mongoose.Schema({
  name: { type: String  },
  email: { type: String },
  phone: { type: String },
  designation: { type: String }
}, { _id: false });

const customFieldSchema = new mongoose.Schema({
  label: { type: String },
  name: { type: String },
  type: { type: String, enum: ['text', 'number', 'date', 'boolean'] },
  required: { type: Boolean, default: false },
  defaultValue: mongoose.Schema.Types.Mixed
}, { _id: false });

const companySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  registrationNumber: { type: String, required: true, unique: true },
  website: String,
  contactEmail: { type: String, required: true },
  contactPhone: { type: String},
  address: { type: addressSchema },
  companyId: { type: String, unique: true },
  thumbnail:{type:String },
  taxDetails: {
    gstNumber: { type: String, required:true},
    panNumber: { type: String,required: true },
    tanNumber: { type: String,required: true }
  },
  bankDetails: { type: bankSchema },
  hrDetails: { type: hrSchema },
  customFields: [customFieldSchema],
   permissions: [{ type: String }],
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { versionKey: false });

companySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Company', companySchema);