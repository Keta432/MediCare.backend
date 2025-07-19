const mongoose = require('mongoose');

// Validate MongoDB ObjectId
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Validate required fields
const validateRequired = (obj, fields) => {
  const missingFields = fields.filter(field => !obj[field]);
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  return true;
};

// Validate report type
const validateReportType = (type) => {
  const validTypes = ['lab', 'diagnosis', 'prescription', 'invoice'];
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid report type. Must be one of: ${validTypes.join(', ')}`);
  }
  return true;
};

// Validate report status
const validateReportStatus = (status) => {
  const validStatuses = ['pending', 'completed', 'processing'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid report status. Must be one of: ${validStatuses.join(', ')}`);
  }
  return true;
};

// Validate date format
const validateDate = (date) => {
  const dateObj = new Date(date);
  if (dateObj.toString() === 'Invalid Date') {
    throw new Error('Invalid date format');
  }
  return true;
};

// Validate report number format
const validateReportNumber = (reportNumber) => {
  // Report number format: REP-YYYYMMDD-XXXX where X is any digit
  const reportNumberRegex = /^REP-\d{8}-\d{4}$/;
  if (!reportNumberRegex.test(reportNumber)) {
    throw new Error('Invalid report number format. Expected format: REP-YYYYMMDD-XXXX');
  }
  return true;
};

module.exports = {
  isValidObjectId,
  validateRequired,
  validateReportType,
  validateReportStatus,
  validateDate,
  validateReportNumber
}; 