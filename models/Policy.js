import mongoose from 'mongoose';

const policySchema = new mongoose.Schema({
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  documentUrl: {
    type: String // If you allow uploading PDFs or files
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  mimeType:{
    type:String
  },
});

const Policy = mongoose.model('Policy', policySchema);
export default Policy;
