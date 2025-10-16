import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // the name of the counter (like 'companyId')
  sequence_value: { type: Number, default: 1000 }
});

export default mongoose.model('Counter', counterSchema);
