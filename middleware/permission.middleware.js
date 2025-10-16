import { AppError } from '../utils/errorHandler.js';

export const checkPermission = (requiredPermissions) => {
  return (req, res, next) => {
    const userPermissions = req.user.permissions || [];
    const userRole = req.user.role;
    
    // Admin has all permissions
    if (userRole === 'admin' || userRole === 'superadmin') {
      return next();
    }
    
    // Check if user has any of the required permissions
    const hasPermission = requiredPermissions.some(permission => 
      userPermissions.includes(permission) || userPermissions.includes('admin')
    );
    
    if (!hasPermission) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    
    next();
  };
};

export const checkCompanyAccess = (req, res, next) => {
  const { companyId } = req.user;
  const requestedCompanyId = req.params.companyId || req.body.companyId;

  if (requestedCompanyId && requestedCompanyId.toString() !== companyId.toString()) {
    return next(new AppError('You do not have permission to access this resource', 403));
  }
  next();
};

export const checkEmployeeAccess = (req, res, next) => {
  const { companyId, role, employeeId } = req.user;
  const requestedEmployeeId = req.params.employeeId || req.body.employeeId;

  if (role === 'employee' && requestedEmployeeId && requestedEmployeeId.toString() !== employeeId.toString()) {
    return next(new AppError('You can only access your own employee data', 403));
  }

  // For other roles, verify the employee belongs to their company
  if (requestedEmployeeId && role !== 'superadmin') {
    req.permissionFilter = { _id: requestedEmployeeId, company: companyId };
  }
  next();
};