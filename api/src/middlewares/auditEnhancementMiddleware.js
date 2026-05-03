const os = require('os');
const { networkInterfaces } = require('os');
const { getLocationFromIP } = require('../utils/geoLocation');

/**
 * Extract machine metadata from request
 */
function extractMachineMetadata(req) {
  const machineData = {};

  // From request headers (sent by scanner agent)
  machineData.machineId = req.headers['x-machine-id'] || req.headers['x-scanner-machine-id'];
  machineData.machineName = req.headers['x-machine-name'];
  machineData.hostname = req.headers['x-hostname'] || os.hostname();
  machineData.localIp = req.headers['x-local-ip'] || getLocalIPAddress();
  machineData.publicIp = getPublicIP(req);

  // OS information
  machineData.os = os.platform();
  machineData.osVersion = os.release();

  return machineData;
}

/**
 * Get local IP address
 */
function getLocalIPAddress() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal and non-ipv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

/**
 * Get public IP from request
 */
function getPublicIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.ip;
}

/**
 * Middleware to enhance audit logs with machine and location data
 */
async function enhanceAuditLog(req, res, next) {
  try {
    // Extract machine metadata
    const machineData = extractMachineMetadata(req);

    // Get location data (async, don't block request)
    const locationData = await getLocationFromIP(machineData.publicIp);

    // Attach to request for use in audit logging
    req.auditEnhancement = {
      machine: machineData,
      location: locationData,
      scanner: {
        source: req.headers['x-scanner-source'] || 'web',
        uploadMethod: req.headers['x-upload-method'] || 'form'
      }
    };

    next();
  } catch (error) {
    console.warn('Audit enhancement failed:', error.message);
    next();
  }
}

module.exports = {
  enhanceAuditLog,
  extractMachineMetadata
};