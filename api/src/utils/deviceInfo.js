const crypto = require('crypto');

/**
 * Device Info Utility
 * Extracts machine and device information from various sources
 */

class DeviceInfoExtractor {
  /**
   * Extract device info from HTTP request
   * @param {Object} req - Express request object
   * @returns {Object} Device and machine information
   */
  static extractFromRequest(req) {
    const headers = req.headers || {};
    const body = req.body || {};
    const userAgent = headers['user-agent'] || '';

    // Extract from custom headers (frontend/scanner agents)
    const machineInfo = {
      machineId: headers['x-machine-id'] || body.machineId || this.generateMachineId(),
      machineName: headers['x-machine-name'] || body.machineName || null,
      hostname: headers['x-hostname'] || body.hostname || null,
      os: headers['x-platform'] || body.os || this.parseOSFromUserAgent(userAgent),
      osVersion: body.osVersion || null,
      deviceManufacturer: body.deviceManufacturer || null,
      deviceModel: body.deviceModel || null,
      localIp: body.localIp || req.ip || req.connection?.remoteAddress,
      publicIp: headers['x-forwarded-for'] || req.ip,
      source: headers['x-source'] || body.source || 'web'
    };

    // Extract device/browser info
    const deviceInfo = {
      browser: this.parseBrowserFromUserAgent(userAgent),
      browserVersion: this.parseBrowserVersionFromUserAgent(userAgent),
      os: machineInfo.os,
      osVersion: machineInfo.osVersion,
      deviceType: this.detectDeviceType(userAgent),
      deviceName: headers['x-device-name'] || null,
      userAgent: userAgent,
      screenResolution: headers['x-screen-resolution'] || null,
      language: headers['accept-language']?.split(',')[0] || 'en',
      platform: headers['x-platform'] || body.platform || this.parsePlatformFromUserAgent(userAgent)
    };

    return {
      machine: machineInfo,
      device: deviceInfo,
      ipAddress: req.ip || req.connection?.remoteAddress,
      location: this.extractLocationInfo(req),
      summary: this.generateSummary(machineInfo, deviceInfo, req.user)
    };
  }

  /**
   * Extract device info from scanner metadata
   * @param {Object} scannerMetadata - Scanner-specific metadata
   * @returns {Object} Device and machine information
   */
  static extractFromScanner(scannerMetadata = {}) {
    return {
      machine: {
        machineId: scannerMetadata.machineId || this.generateMachineId(),
        machineName: scannerMetadata.machineName || null,
        hostname: scannerMetadata.hostname || null,
        os: scannerMetadata.os || null,
        osVersion: scannerMetadata.osVersion || null,
        deviceManufacturer: scannerMetadata.deviceManufacturer || null,
        deviceModel: scannerMetadata.deviceModel || null,
        localIp: scannerMetadata.localIp || null,
        publicIp: null,
        source: 'scanner-agent'
      },
      device: {
        browser: null,
        browserVersion: null,
        os: scannerMetadata.os || null,
        osVersion: scannerMetadata.osVersion || null,
        deviceType: 'scanner',
        deviceName: scannerMetadata.machineName || null,
        userAgent: null,
        screenResolution: null,
        language: null,
        platform: scannerMetadata.os || null
      },
      ipAddress: null,
      location: null,
      summary: null // Will be set by caller
    };
  }

  /**
   * Generate a persistent machine ID
   * @returns {string} Machine ID
   */
  static generateMachineId() {
    const machineData = {
      platform: process.platform,
      hostname: require('os').hostname(),
      cpus: require('os').cpus().length,
      timestamp: Math.floor(Date.now() / (24 * 60 * 60 * 1000)) // Daily rotation
    };

    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(machineData));
    return hash.digest('hex').substring(0, 16).toUpperCase();
  }

  /**
   * Parse OS from User-Agent string
   * @param {string} userAgent
   * @returns {string} OS name
   */
  static parseOSFromUserAgent(userAgent) {
    if (!userAgent) return null;

    const ua = userAgent.toLowerCase();

    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('macintosh') || ua.includes('mac os x')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) return 'iOS';

    return 'Unknown';
  }

  /**
   * Parse browser from User-Agent string
   * @param {string} userAgent
   * @returns {string} Browser name
   */
  static parseBrowserFromUserAgent(userAgent) {
    if (!userAgent) return null;

    const ua = userAgent.toLowerCase();

    if (ua.includes('chrome') && !ua.includes('edg')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edg')) return 'Edge';
    if (ua.includes('opera')) return 'Opera';

    return 'Unknown';
  }

  /**
   * Parse browser version from User-Agent string
   * @param {string} userAgent
   * @returns {string} Browser version
   */
  static parseBrowserVersionFromUserAgent(userAgent) {
    if (!userAgent) return null;

    // Simple regex to extract version numbers
    const versionMatch = userAgent.match(/(?:chrome|firefox|safari|opera|edge)\/(\d+\.\d+)/i);
    return versionMatch ? versionMatch[1] : null;
  }

  /**
   * Detect device type from User-Agent
   * @param {string} userAgent
   * @returns {string} Device type
   */
  static detectDeviceType(userAgent) {
    if (!userAgent) return 'desktop';

    const ua = userAgent.toLowerCase();

    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'mobile';
    if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';

    return 'desktop';
  }

  /**
   * Parse platform from User-Agent
   * @param {string} userAgent
   * @returns {string} Platform
   */
  static parsePlatformFromUserAgent(userAgent) {
    return this.parseOSFromUserAgent(userAgent);
  }

  /**
   * Extract location info from request
   * @param {Object} req - Express request
   * @returns {Object} Location info
   */
  static extractLocationInfo(req) {
    // This would typically use a geo-IP service
    // For now, return basic info if available
    return {
      country: req.headers['cf-ipcountry'] || req.headers['x-country'] || null,
      region: req.headers['x-region'] || null,
      city: req.headers['x-city'] || null,
      timezone: req.headers['x-timezone'] || null,
      isp: req.headers['x-isp'] || null,
      latitude: null,
      longitude: null
    };
  }

  /**
   * Generate human-readable summary
   * @param {Object} machineInfo
   * @param {Object} deviceInfo
   * @param {Object} user - User object
   * @returns {string} Summary string
   */
  static generateSummary(machineInfo, deviceInfo, user = null) {
    const userName = user?.name || user?.email || 'Unknown User';
    const machineName = machineInfo.machineName || machineInfo.hostname || 'Unknown Device';

    let action = 'performed action';
    let device = machineName;

    if (machineInfo.source === 'scanner-agent') {
      device = `${machineName} (Scanner Agent)`;
    } else if (deviceInfo.deviceType === 'mobile') {
      device = `${machineName} (${deviceInfo.browser || 'Mobile'})`;
    } else {
      device = `${machineName} (${deviceInfo.browser || 'Desktop'})`;
    }

    return `${userName} accessed from ${device}`;
  }

  /**
   * Create audit log entry with device info
   * @param {Object} req - Express request
   * @param {Object} options - Additional audit options
   * @returns {Object} Audit log data
   */
  static createAuditEntry(req, options = {}) {
    const deviceInfo = this.extractFromRequest(req);

    return {
      ...deviceInfo,
      userId: req.user?._id,
      userEmail: req.user?.email,
      action: options.action,
      resource: options.resource,
      resourceId: options.resourceId,
      details: options.details,
      sessionId: req.session?.id,
      systemName: options.systemName,
      systemSpec: options.systemSpec,
      timestamp: new Date()
    };
  }
}

module.exports = DeviceInfoExtractor;