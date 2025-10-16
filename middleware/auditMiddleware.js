import { createAuditLog, SystemAudit } from '../services/auditService.js';

/**
 * Middleware to automatically log HTTP requests
 */
export const auditMiddleware = (req, res, next) => {
  // Skip logging for certain paths
  const excludedPaths = ['/health', '/metrics', '/favicon.ico'];
  if (excludedPaths.includes(req.path)) {
    return next();
  }

  const startTime = Date.now();

  // Store original response methods
  const originalSend = res.send;
  const originalJson = res.json;

  // Capture response data
  let responseBody;

  res.send = function(body) {
    responseBody = body;
    return originalSend.call(this, body);
  };

  res.json = function(body) {
    responseBody = body;
    return originalJson.call(this, body);
  };

  // Log when response finishes
  res.on('finish', async () => {
    try {
      const duration = Date.now() - startTime;
      
      // Only log significant actions (not GET requests for static data)
      if (shouldLogRequest(req)) {
        await createAuditLog({
          userId: req?.user?._id,
          companyId: req.user?.company,
          action: `${req.method} ${req.path}`,
          module: getModuleFromPath(req.path),
          actionType: getActionTypeFromMethod(req.method),
          resource: getResourceFromPath(req.path),
          resourceId: getResourceIdFromParams(req.params),
          description: `API ${req.method} request to ${req.path}`,
          status: res.statusCode < 400 ? 'success' : 'failure',
          metadata: {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            query: Object.keys(req.query).length > 0 ? req.query : undefined,
            params: Object.keys(req.params).length > 0 ? req.params : undefined,
            responseSize: responseBody ? JSON.stringify(responseBody).length : 0
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent'),
          sessionId: req?.session?.id
        });
      }
    } catch (error) {
      console.error('Audit middleware error:', error);
      // Don't break the response
    }
  });

  next();
};

/**
 * Determine if request should be logged
 */
const shouldLogRequest = (req) => {
  // Don't log OPTIONS requests
  if (req.method === 'OPTIONS') return false;
  
  // Don't log GET requests for common paths (to reduce noise)
  if (req.method === 'GET') {
    const noisyPaths = ['/api/ctc', '/api/flexi', '/api/payments'];
    return !noisyPaths.some(path => req.path.startsWith(path));
  }
  
  return true;
};

/**
 * Extract module from request path
 */
const getModuleFromPath = (path) => {
  if (path.includes('/ctc')) return 'CTC';
  if (path.includes('/flexi')) return 'Flexi';
  if (path.includes('/payments')) return 'Payment';
  if (path.includes('/reimbursement')) return 'Reimbursement';
  if (path.includes('/employee')) return 'Employee';
  if (path.includes('/auth')) return 'System';
  return 'System';
};

/**
 * Map HTTP method to action type
 */
const getActionTypeFromMethod = (method) => {
  const methodMap = {
    'GET': 'read',
    'POST': 'create',
    'PUT': 'update',
    'PATCH': 'update',
    'DELETE': 'delete'
  };
  return methodMap[method] || 'read';
};

/**
 * Extract resource from path
 */
const getResourceFromPath = (path) => {
  const parts = path.split('/').filter(part => part);
  if (parts.length >= 3) {
    return parts[2]; // e.g., /api/ctc/annexure -> annexure
  }
  return null;
};

/**
 * Extract resource ID from request parameters
 */
const getResourceIdFromParams = (params) => {
  return params.id || params.employeeId || params.annexureId || null;
};

/**
 * Middleware to log user login attempts
 */
export const loginAuditMiddleware = async (req, res, next) => {
  const originalSend = res.send;
  
  res.send = async function(body) {
    try {
      const isLoginRoute = req.path.includes('/auth/login');
      const isSuccess = res.statusCode === 200 || res.statusCode === 201;
      
      if (isLoginRoute) {
        const response = typeof body === 'string' ? JSON.parse(body) : body;
        
        if (isSuccess && response.user) {
          // Successful login
          await SystemAudit.userLogin(response.user._id, response.user.company, {
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            sessionId: req.session?.id
          });
        } else if (!isSuccess) {
          // Failed login
          await SystemAudit.failedLogin(null, null, {
            username: req.body.email,
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            errorMessage: body.message || 'Invalid credentials'
          });
        }
      }
    } catch (error) {
      console.error('Login audit error:', error);
    }
    
    return originalSend.call(this, body);
  };
  
  next();
};

