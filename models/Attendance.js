import mongoose from "mongoose";

const attendanceSchema = new mongoose.Schema({
  employee: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Employee', 
    required: true 
  },
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: true 
  },
  date: { 
    type: Date, 
    required: true 
  },
  shift: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Shift' 
  },
  inTime: { 
    type: String
  },
  outTime: { 
    type: String
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'half_day', 'late', 'early_departure', 'regularized', 'holiday', 'week_off'],
    default: 'absent'
  },
  regularized: { 
    type: Boolean, 
    default: false 
  },
  regularizationRequest: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'AttendanceRegularization' 
  },
  totalHours: { 
    type: Number, 
    default: 0 
  },
  overtime: { 
    type: Number, 
    default: 0 
  },
  lateMinutes: { 
    type: Number, 
    default: 0 
  },
  earlyDepartureMinutes: { 
    type: Number, 
    default: 0 
  },
  notes: { 
    type: String, 
    trim: true 
  }
}, { timestamps: true });

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ company: 1, date: 1 });
attendanceSchema.index({ status: 1, date: 1 });

export default mongoose.model('Attendance', attendanceSchema);