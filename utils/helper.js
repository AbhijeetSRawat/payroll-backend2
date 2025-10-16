import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export const hashPassword = async (password) => {
  return await bcrypt.hash(password, 12);
};

export const comparePasswords = async (candidatePassword, userPassword) => {
  return await bcrypt.compare(candidatePassword, userPassword);
};

export const generateRandomPassword = () => {
  return crypto.randomBytes(2).toString('hex');
};

export const generateEmployeeId = async (count, companyId) => {
 
  return `${companyId}_${(count + 1).toString().padStart(4, '0')}`;
};

export const calculateLeaveDays = (startDate, endDate) => {
  const diffTime = Math.abs(new Date(endDate) - new Date(startDate));
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive of both dates
};

export const createPasswordResetToken = () => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  const passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return { resetToken, passwordResetToken, passwordResetExpires };
};


// Configure nodemailer transporter


const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendAdminCredentials = async (email, loginEmail, tempPassword, companyId) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "MASU Admin Account Credentials",
    text: `
🎉 Your admin account has been created!

🔐 Login Email: ${loginEmail}
🔑 Temporary Password: ${tempPassword}
🏢 Company ID: ${companyId}

Please login and change your password immediately.
    `.trim(),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Admin credentials sent to HR:", email);
  } catch (error) {
    console.error("Error sending admin credentials:", error);
  }
};

export const sendOtpEmail = async (email, subject) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "MASU Password Reset OTP",
    text: `
🔐 You requested to reset your password.

    ${subject}
    `.trim(),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("OTP sent to user:", email);
  } catch (error) {
    console.error("Error sending OTP email:", error);
  }
};

export const sendSubAdminCredentials = async (email, loginEmail, message, companyId) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "MASU Subadmin Account Credentials",
    text: `
👋 Your subadmin account has been successfully created!

🔐 Login Email: ${loginEmail}
🔑 Reset Link: ${message}
🏢 Company ID: ${companyId}

Please login as soon as possible and change your password for security.

Welcome aboard!
    `.trim(),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Subadmin credentials sent to:", email);
  } catch (error) {
    console.error("Error sending subadmin credentials:", error);
  }
};

export const sendPasswordResetEmail = async (email, role, tempPassword, companyId) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "MASU Password Reset",
    text: `
🔐 Hello ${role},

Your password has been reset.

📧 Login Email: ${email}
🔑 Temporary Password: ${tempPassword}
🏢 Company ID: ${companyId}

⚠️ Please login immediately and change your password for security.
    `.trim(),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${role}:`, email);
  } catch (error) {
    console.error(`Error sending password reset email to ${role}:`, error);
  }
};

export const sendWelcome = async (email, role, loginEmail, message, companyId) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `MASU ${role} Account Credentials`,
    text: `
👋 Your ${role} account has been successfully created!

🔐 Login Email: ${loginEmail}
🔑 Reset Link: ${message}
🏢 Company ID: ${companyId}

Please login as soon as possible and change your password for security.

Welcome aboard!
    `.trim(),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`${role} credentials sent to:`, email);
  } catch (error) {
    console.error(`Error sending ${role} credentials:`, error);
  }
};
