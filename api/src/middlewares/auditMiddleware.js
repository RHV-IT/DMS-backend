const AuditLog = require('../models/AuditLog');
const { parseUserAgent } = require('../helpers/deviceParser');

const ipInfoCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000;

async function getIpInfo(ip) {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return {
      country: 'Local',
      region: 'Local',
      city: 'Local',
      timezone: 'Local',
      isp: 'Local Network'
    };
  }

  const cached = ipInfoCache.get(ip);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }

  try {
    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,region,city,timezone,isp,query`, {
      timeout: 3000
    });
    
    if (response.ok) {
      const data = await response.json();
      const result = {
        country: data.country || 'Unknown',
        region: data.regionName || 'Unknown',
        city: data.city || 'Unknown',
        timezone: data.timezone || 'Unknown',
        isp: data.isp || 'Unknown'
      };
      
      ipInfoCache.set(ip, { timestamp: Date.now(), data: result });
      return result;
    }
  } catch (error) {
    console.error('IP lookup failed:', error.message);
  }

  return {
    country: 'Unknown',
    region: 'Unknown',
    city: 'Unknown',
    timezone: 'Unknown',
    isp: 'Unknown'
  };
}

async function createAuditLog(req, user, action, resource = null, resourceId = null, details = null) {
  try {
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0]?.trim() 
      || req.headers['x-real-ip'] 
      || req.connection?.remoteAddress 
      || req.socket?.remoteAddress 
      || 'Unknown';

    const userAgentString = req.headers['user-agent'] || '';
    const device = parseUserAgent(userAgentString);
    const location = await getIpInfo(ipAddress);

    const systemName = req.headers['x-system-name'] || req.headers['X-System-Name'] || null;
    const systemSpec = req.headers['x-system-spec'] || req.headers['X-System-Spec'] || null;

    await AuditLog.create({
      userId: user._id,
      userEmail: user.email,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      location,
      device,
      sessionId: req.headers['x-session-id'] || null,
      systemName,
      systemSpec,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Failed to create audit log:', error.message);
  }
}

const auditMiddleware = (action, resource = null) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    res.send = function(body) {
      originalSend.call(this, body);
      
      if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
        const resourceId = req.params.id || req.params.fileId || null;
        createAuditLog(req, req.user, action, resource, resourceId, {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode
        }).catch(console.error);
      }
      
      return this;
    };
    
    next();
  };
};

module.exports = {
  createAuditLog,
  getIpInfo,
  auditMiddleware
};