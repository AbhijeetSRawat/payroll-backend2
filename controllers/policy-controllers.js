import Policy from '../models/Policy.js';
import Company from '../models/Company.js';
import uploadFileToCloudinary from '../utils/fileUploader.js';

export const addCompanyPolicy = async (req, res) => {
  try {
    const { companyId, title, description } = req.body;
    const {policyFile} = req.files;

    const documentUrl = await uploadFileToCloudinary(
      policyFile,
      process.env.FOLDER_NAME
    )
  

    // Check if the company exists
    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const newPolicy = new Policy({
      company: companyId,
      title,
      description,
      documentUrl : documentUrl?.result?.secure_url,
      mimeType : documentUrl?.mimeType,
    });

    await newPolicy.save();

    return res.status(201).json({
      success: true,
      message: 'Policy added successfully',
      data: newPolicy
    });

  } catch (error) {
    console.error('Add Policy Error:', error);
    return res.status(500).json({ success: false, message: 'Server Error', error: error.message });
  }
};


// Update policy by ID
export const updatePolicy = async (req, res) => {
  try {
    const { policyId } = req.params;
    const { title, description } = req.body;
    const {policyFile} = req.files;

     const documentUrl = await uploadFileToCloudinary(
      policyFile,
      process.env.FOLDER_NAME
    )
    console.log(documentUrl)


    const policy = await Policy.findById(policyId);
    if (!policy) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    if (title) policy.title = title;
    if (description) policy.description = description;
    if (documentUrl !== undefined) policy.documentUrl = documentUrl.result.secure_url;
    if (documentUrl.mimeType) policy.mimeType = documentUrl.mimeType;

    await policy.save();

    return res.status(200).json({
      success: true,
      message: 'Policy updated successfully',
      data: policy
    });
  } catch (error) {
    console.error('Update Policy Error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getCompanyPolicies = async (req, res) => {
  try {
    const { companyId } = req.params;

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ success: false, message: 'Company not found' });
    }

    const policies = await Policy.find({ company: companyId }).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: policies
    });
  } catch (error) {
    console.error('Get Policies Error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getPolicyById = async (req, res) => {
  try {
    const { policyId } = req.params;

    const policy = await Policy.findById(policyId);
    if (!policy) {
      return res.status(404).json({ success: false, message: 'Policy not found' });
    }

    return res.status(200).json({
      success: true,
      data: policy
    });
  } catch (error) {
    console.error('Get Single Policy Error:', error);
    return res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const deletePolicy = async (req, res) => {
  const { policyId } = req.params;

  try {
    const policy = await Policy.findByIdAndDelete(policyId);

    if (!policy) {
      return res.status(404).json({ 
        success: false, 
        message: 'Policy not found' 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Policy deleted successfully'
    });
  } catch (error) {
    console.error('Delete Policy Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server Error' 
    });
  }
};
