import Company from '../models/Company.js';
import { generateRandomPassword } from '../utils/helper.js';
import { createUser } from './user.service.js';
import { sendWelcomeEmail } from './email.service.js';

export const createCompany = async (companyData) => {
  const newCompany = await Company.create(companyData);
  return newCompany;
};

export const getCompanyById = async (companyId) => {
  return Company.findById(companyId);
};

export const updateCompany = async (companyId, updateData) => {
  return Company.findByIdAndUpdate(companyId, updateData, { new: true });
};

export const deleteCompany = async (companyId) => {
  return Company.findByIdAndUpdate(companyId, { isActive: false }, { new: true });
};

export const registerCompanyWithAdmin = async (companyData) => {
  const newCompany = await createCompany(companyData);
  
  const password = generateRandomPassword();
  const adminUser = await createUser({
    email: companyData.contactEmail,
    password,
    role: 'admin',
    companyId: newCompany._id,
    profile: {
      firstName: companyData.hrDetails.name.split(' ')[0],
      lastName: companyData.hrDetails.name.split(' ')[1] || '',
      phone: companyData.hrDetails.phone
    }
  });

  await sendWelcomeEmail(companyData.contactEmail, companyData.name, password);

  return { company: newCompany, adminUser };
};