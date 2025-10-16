import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const customFieldSchema = new mongoose.Schema({
  label: { type: String },
  name: { type: String },
  type: { type: String, enum: ['text', 'number', 'date', 'boolean'] },
  required: { type: Boolean, default: false },
  defaultValue: mongoose.Schema.Types.Mixed
}, { _id: false });


const profileSchema = new mongoose.Schema({
  firstName: { type: String,  },
  lastName: { type: String, },
  phone: { type: String,  },
  avatar: String,
  designation: String,
  department: String
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true, select: false },
  role: { 
    type: String, 
    required: true,
    enum: ['superadmin', 'admin', 'hr', 'manager', 'employee','newjoiner','subadmin'],
    default: 'employee'
  },
  companyId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company',
  },
  permissions: [{ type: String }], 
  customFields: [customFieldSchema],
  profile: { type: profileSchema  },
  isActive: { type: Boolean, default: true },
  lastLogin: Date,
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  isFirstLogin: { type: Boolean, default: true },
},

 { 
  timestamps: true,
  versionKey: false 
});

// userSchema.pre('save', async function(next) {
//   if (!this.isModified('password')) return next();
  
//   this.password = await bcrypt.hash(this.password, 12);
//   this.passwordChangedAt = Date.now() - 1000;
//   next();
// });

userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

export default mongoose.model('User', userSchema);
