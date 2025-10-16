import AuditLog from '../models/AuditLog.js';

/**
 * Main function to create audit logs
 * @param {Object} params - Audit log parameters
 */
export const createAuditLog = async (params) => {
  try {
    const {
      userId,
      companyId,
      action,
      module,
      actionType,
      resource = null,
      resourceId = null,
      description = null,
      changes = null,
      metadata = {},
      status = 'success',
      errorMessage = null,
      sessionId = null,
      ipAddress = null,
      userAgent = null
    } = params;

    // Validate required parameters
    if (!userId || !companyId || !action || !module || !actionType) {
      console.error('Missing required parameters for audit log:', params);
      return;
    }

    const auditLog = new AuditLog({
      user: userId,
      company: companyId,
      action,
      module,
      actionType,
      resource,
      resourceId,
      description: description || generateDescription(action, module, actionType, resource),
      changes,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      },
      status,
      errorMessage,
      sessionId,
      ipAddress,
      userAgent,
      timestamp: new Date()
    });

    await auditLog.save();
    
    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`📝 AUDIT LOG: ${action} | ${module} | ${actionType} | User: ${userId}`);
    }

    return auditLog;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error to avoid breaking main functionality
  }
};

/**
 * Generate automatic description based on action and module
 */
export const generateDescription = (action, module, actionType, resource) => {
  const actionMap = {
    create: 'created',
    update: 'updated',
    delete: 'deleted',
    approve: 'approved',
    reject: 'rejected',
    read: 'viewed',
    login: 'logged in',
    logout: 'logged out',
    export: 'exported'
  };

  const actionText = actionMap[actionType] || actionType;
  return `${action} - ${resource ? resource + ' ' : ''}${actionText}`;
};

/**
 * Predefined audit log creators for common actions
 */

// CTC Module Audit Logs
export const CTCAudit = {
  createAnnexure: (userId, companyId, data) => 
    createAuditLog({
      userId,
      companyId,
      action: 'CTC Annexure Created',
      module: 'CTC',
      actionType: 'create',
      resource: 'CTCAnnexure',
      resourceId: data.annexureId,
      description: `CTC annexure created for employee ${data.employee} with annual CTC ${data.annualCTC}`,
      metadata: data
    }),

  updateAnnexure: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'CTC Annexure Updated',
      module: 'CTC',
      actionType: 'update',
      resource: 'CTCAnnexure',
      resourceId: data.annexureId,
      description: `CTC annexure updated for employee ${data.employee}`,
      changes: {
        oldData: data.oldData,
        newData: data.newData,
        changedFields: Object.keys(data.newData || {})
      },
      metadata: data
    }),

  approveAnnexure: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'CTC Annexure Approved',
      module: 'CTC',
      actionType: 'approve',
      resource: 'CTCAnnexure',
      resourceId: data.annexureId,
      description: `CTC annexure approved for employee ${data.employee} by ${data.approvedBy}`,
      metadata: data
    }),

  activateAnnexure: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'CTC Annexure Activated',
      module: 'CTC',
      actionType: 'update',
      resource: 'CTCAnnexure',
      resourceId: data.annexureId,
      description: `CTC annexure activated for employee ${data.employee}, effective from ${data.effectiveFrom}`,
      metadata: data
    })
};

// Flexi Module Audit Logs
export const FlexiAudit = {
  createDeclaration: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Flexi Declaration Created',
      module: 'Flexi',
      actionType: 'create',
      resource: 'FlexiDeclaration',
      resourceId: data.declarationId,
      description: `Flexi benefits declaration created for employee ${data.employee} with total declared amount ${data.totalDeclared}`,
      metadata: data
    }),

  submitDeclaration: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Flexi Declaration Submitted',
      module: 'Flexi',
      actionType: 'update',
      resource: 'FlexiDeclaration',
      resourceId: data.declarationId,
      description: `Flexi benefits declaration submitted for approval by employee ${data.employee}`,
      metadata: data
    }),

  approveDeclaration: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Flexi Declaration Approved',
      module: 'Flexi',
      actionType: 'approve',
      resource: 'FlexiDeclaration',
      resourceId: data.declarationId,
      description: `Flexi benefits declaration approved for employee ${data.employee}`,
      metadata: data
    })
};

// Payments Module Audit Logs
export const PaymentAudit = {
  processSalary: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Salary Processed',
      module: 'Payment',
      actionType: 'create',
      resource: 'SalaryPayment',
      resourceId: data.salaryId,
      description: `Salary processed for employee ${data.employee} for period ${data.period}, net salary: ${data.netSalary}`,
      metadata: data
    }),

  approveSalary: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Salary Approved',
      module: 'Payment',
      actionType: 'approve',
      resource: 'SalaryPayment',
      resourceId: data.salaryId,
      description: `Salary approved for employee ${data.employee}, net amount: ${data.netSalary}`,
      metadata: data
    }),

  markSalaryPaid: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Salary Paid',
      module: 'Payment',
      actionType: 'update',
      resource: 'SalaryPayment',
      resourceId: data.salaryId,
      description: `Salary marked as paid for employee ${data.employee}, reference: ${data.paymentReference}`,
      metadata: data
    }),

  applyLoan: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Loan/Advance Applied',
      module: 'Payment',
      actionType: 'create',
      resource: 'LoanAdvance',
      resourceId: data.applicationId,
      description: `${data.type} application submitted by employee ${data.employee} for amount ${data.amount}`,
      metadata: data
    })
};

// Reimbursement Module Audit Logs
export const ReimbursementAudit = {
  createClaim: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Reimbursement Claim Created',
      module: 'Reimbursement',
      actionType: 'create',
      resource: 'Reimbursement',
      resourceId: data.claimId,
      description: `Reimbursement claim created for ${data.category} by employee ${data.employee}, amount: ${data.amount}`,
      metadata: data
    }),

  approveClaim: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Reimbursement Claim Approved',
      module: 'Reimbursement',
      actionType: 'approve',
      resource: 'Reimbursement',
      resourceId: data.claimId,
      description: `Reimbursement claim approved for employee ${data.employee} at level ${data.approvalLevel}`,
      metadata: data
    }),

  markPaid: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Reimbursement Paid',
      module: 'Reimbursement',
      actionType: 'update',
      resource: 'Reimbursement',
      resourceId: data.claimId,
      description: `Reimbursement paid to employee ${data.employee}, transaction: ${data.transactionId}`,
      metadata: data
    })
};

// System & User Audit Logs
export const SystemAudit = {
  userLogin: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'User Login',
      module: 'System',
      actionType: 'login',
      description: `User logged into the system`,
      metadata: data,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      sessionId: data.sessionId
    }),

  userLogout: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'User Logout',
      module: 'System',
      actionType: 'logout',
      description: `User logged out of the system`,
      metadata: data,
      sessionId: data.sessionId
    }),

  dataExport: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Data Exported',
      module: data.module || 'System',
      actionType: 'export',
      description: `Data exported from ${data.module} module`,
      metadata: data
    }),

  failedLogin: (userId, companyId, data) =>
    createAuditLog({
      userId,
      companyId,
      action: 'Failed Login Attempt',
      module: 'System',
      actionType: 'login',
      status: 'failure',
      errorMessage: data.errorMessage,
      description: `Failed login attempt for user ${data.username || 'unknown'}`,
      metadata: data,
      ipAddress: data.ipAddress
    })
};

/**
 * Bulk audit log creation for multiple actions
 */
const createBulkAuditLogs = async (logs) => {
  try {
    const auditLogs = logs.map(log => new AuditLog(log));
    await AuditLog.insertMany(auditLogs);
    return auditLogs;
  } catch (error) {
    console.error('Failed to create bulk audit logs:', error);
  }
};

/**
 * Audit log query service
 */
export const getAuditLogs = async (filters = {}, options = {}) => {
  const {
    companyId,
    userId,
    module,
    actionType,
    resource,
    startDate,
    endDate,
    page = 1,
    limit = 50,
    sortBy = '-timestamp'
  } = options;

  const query = { company: companyId };

  // Apply filters
  if (userId) query.user = userId;
  if (module) query.module = module;
  if (actionType) query.actionType = actionType;
  if (resource) query.resource = resource;
  
  // Date range filter
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate('user', 'name email role')
      .populate('company', 'name')
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(query)
  ]);

  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

/**
 * Get audit statistics
 */
export const getAuditStatistics = async (companyId, period = '30d') => {
  const startDate = new Date();
  
  switch (period) {
    case '7d':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case '30d':
      startDate.setDate(startDate.getDate() - 30);
      break;
    case '90d':
      startDate.setDate(startDate.getDate() - 90);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  const stats = await AuditLog.aggregate([
    {
      $match: {
        company: companyId,
        timestamp: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          module: '$module',
          actionType: '$actionType'
        },
        count: { $sum: 1 },
        lastActivity: { $max: '$timestamp' }
      }
    },
    {
      $group: {
        _id: '$_id.module',
        actions: {
          $push: {
            actionType: '$_id.actionType',
            count: '$count'
          }
        },
        totalActions: { $sum: '$count' },
        lastActivity: { $max: '$lastActivity' }
      }
    },
    {
      $sort: { totalActions: -1 }
    }
  ]);

  return stats;
};
