 import mongoose from 'mongoose';



// Define the schema for a shift
const shiftSchema = new mongoose.Schema({
  // Reference to the associated company
  company: { 
    type: mongoose.Schema.Types.ObjectId,  // Stores MongoDB ObjectId referencing a Company document
    ref: 'Company',                        // Sets up a relationship with the Company model
    required: true                         // Ensures a shift must belong to a company
  },

  // Name of the shift (e.g., "Morning Shift")
  name: { 
    type: String, 
    required: true 
  },

  // Start time of the shift (e.g., "09:00")
  startTime: { 
    type: String, 
    required: true 
  },

  // End time of the shift (e.g., "17:00")
  endTime: { 
    type: String, 
    required: true 
  },

  // Allowed grace period (in minutes) before marking someone late
  gracePeriod: { 
    type: Number, 
    default: 15,      // Default grace period is 15 minutes
    min: 0,           // Cannot be negative
    max: 120          // Max allowed grace period is 2 hours
  },

  // Number of hours worked below which it is considered a half-day
  halfDayThreshold: {
    type: Number,
    default: 4,       // Default half-day threshold is 4 hours
    min: 1,           // Minimum 1 hour
    max: 8            // Maximum 8 hours
  },

  // Whether the shift is currently active
  isActive: { 
    type: Boolean, 
    default: true     // By default, shifts are active
  },

  // Indicates if the shift is a night shift
  isNightShift: { 
    type: Boolean, 
    default: false    // By default, not a night shift
  },

  // Break duration (in minutes) included in the shift
  breakDuration: { 
    type: Number, 
    default: 60,      // Default break is 1 hour
    min: 0            // Cannot be negative
  }
}, { 
  timestamps: true    // Automatically adds createdAt and updatedAt fields
});

// Create a compound index to ensure unique shift names within the same company
shiftSchema.index(
  { company: 1, name: 1 },  // Combines company ID and shift name
  { unique: true }          // Ensures no duplicate shift names per company
);

export default mongoose.model('Shift', shiftSchema);
