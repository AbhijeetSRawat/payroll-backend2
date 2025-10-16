// models/TableStructure.js
import mongoose from 'mongoose';

const tableStructureSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  columnNames: [
    {
      type: String,
      required: true
    }
  ],
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

export default mongoose.model('TableStructure', tableStructureSchema);
