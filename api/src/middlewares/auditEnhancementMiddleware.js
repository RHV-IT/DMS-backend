const DeviceInfoExtractor = require('../utils/deviceInfo');
const { getLocationFromIP } = require('../utils/geoLocation');

/**
 * Middleware to enhance requests with comprehensive device and machine information
 * This attaches deviceInfo to all requests for consistent audit logging
 */
async function enhanceAuditLog(req, res, next) {
  try {
    // Extract comprehensive device and machine information
    const deviceInfo = DeviceInfoExtractor.extractFromRequest(req);

    // Try to get additional location data if not already included
    if (!deviceInfo.location?.country && deviceInfo.ipAddress) {
      try {
        const locationData = await getLocationFromIP(deviceInfo.ipAddress);
        if (locationData) {
          deviceInfo.location = { ...deviceInfo.location, ...locationData };
        }
      } catch (geoErr) {
        console.warn('Geo location lookup failed:', geoErr.message);
      }
    }

    // Attach comprehensive device info to request
    req.deviceInfo = deviceInfo;

    next();
  } catch (error) {
    console.warn('Device info extraction failed:', error.message);
    // Continue without device info rather than failing the request
    req.deviceInfo = null;
    next();
  }
}

module.exports = {
  enhanceAuditLog
};