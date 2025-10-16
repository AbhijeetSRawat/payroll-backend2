import asyncHandler from 'express-async-handler';
import { getAuditLogs, getAuditStatistics } from '../services/auditService.js';

// @desc    Get audit logs with filtering
// @route   GET /api/audit/logs
// @access  Private/Admin
export const getAuditLogsController = asyncHandler(async (req, res) => {
  const {
    userId,
    module,
    actionType,
    resource,
    startDate,
    endDate,
    page = 1,
    limit = 50
  } = req.query;

  const result = await getAuditLogs({}, {
    companyId: req.user.company,
    userId,
    module,
    actionType,
    resource,
    startDate,
    endDate,
    page: parseInt(page),
    limit: parseInt(limit)
  });

  res.json({
    success: true,
    data: result.logs,
    pagination: result.pagination
  });
});

// @desc    Get audit statistics
// @route   GET /api/audit/statistics
// @access  Private/Admin
export const getAuditStatisticsController = asyncHandler(async (req, res) => {
  const { period = '30d' } = req.query;

  const statistics = await getAuditStatistics(req.user.company, period);

  res.json({
    success: true,
    data: statistics
  });
});

// @desc    Search audit logs
// @route   GET /api/audit/search
// @access  Private/Admin
export const searchAuditLogs = asyncHandler(async (req, res) => {
  const { q: searchTerm, page = 1, limit = 50 } = req.query;

  if (!searchTerm || searchTerm.length < 3) {
    res.status(400);
    throw new Error('Search term must be at least 3 characters long');
  }

  const query = {
    company: req.user.company,
    $or: [
      { action: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } },
      { 'metadata.employee': { $regex: searchTerm, $options: 'i' } }
    ]
  };

  const skip = (page - 1) * limit;

  const [logs, total] = await Promise.all([
    AuditLog.find(query)
      .populate('user', 'name email')
      .sort('-timestamp')
      .skip(skip)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(query)
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});

// @desc    Export audit logs
// @route   GET /api/audit/export
// @access  Private/Admin
export const exportAuditLogs = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = 'json' } = req.query;

  const query = { company: req.user.company };
  
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  const logs = await AuditLog.find(query)
    .populate('user', 'name email role')
    .sort('-timestamp')
    .lean();

  // Log the export action
  await SystemAudit.dataExport(req.user._id, req.user.company, {
    module: 'Audit',
    format,
    recordCount: logs.length,
    dateRange: { startDate, endDate }
  });

  if (format === 'csv') {
    // Convert to CSV format
    const csvData = convertToCSV(logs);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
    return res.send(csvData);
  }

  // Default JSON format
  res.json({
    success: true,
    data: logs,
    exportInfo: {
      exportedAt: new Date(),
      totalRecords: logs.length,
      exportedBy: req.user.name
    }
  });
});

// Helper function to convert logs to CSV
const convertToCSV = (logs) => {
  const headers = ['Timestamp', 'User', 'Action', 'Module', 'Resource', 'Description', 'Status'];
  
  const csvRows = [
    headers.join(','),
    ...logs.map(log => [
      new Date(log.timestamp).toISOString(),
      `"${log.user?.name || 'System'}"`,
      `"${log.action}"`,
      `"${log.module}"`,
      `"${log.resource || 'N/A'}"`,
      `"${log.description?.replace(/"/g, '""') || ''}"`,
      `"${log.status}"`
    ].join(','))
  ];

  return csvRows.join('\n');
};

