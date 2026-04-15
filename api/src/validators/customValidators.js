const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password) => {
  return password && password.length >= 8;
};

const validateRole = (role) => {
  const validRoles = ['admin', 'hod', 'user'];
  return validRoles.includes(role);
};

const validateDepartment = (department) => {
  return department && department.trim().length > 0;
};

const validateConfidentialityLevel = (level) => {
  const validLevels = ['public', 'internal', 'confidential', 'highly_confidential'];
  return validLevels.includes(level);
};

const validateFileAccess = (access) => {
  const validAccess = ['view', 'download', 'edit'];
  return validAccess.includes(access);
};

const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  return str.trim().replace(/[<>]/g, '');
};

module.exports = {
  validateEmail,
  validatePassword,
  validateRole,
  validateDepartment,
  validateConfidentialityLevel,
  validateFileAccess,
  sanitizeString
};