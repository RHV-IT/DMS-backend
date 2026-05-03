const userAgentParser = require('useragent');

function parseUserAgent(userAgentString) {
  try {
    const agent = userAgentParser.parse(userAgentString);
    
    const device = agent.device.toString();
    const isMobile = /mobile|android|iphone|ipad|phone/i.test(device);
    const isTablet = /ipad|tablet/i.test(device);
    
    let deviceType = 'desktop';
    if (isMobile) deviceType = 'mobile';
    else if (isTablet) deviceType = 'tablet';
    else if (/bot|crawler|spider/i.test(userAgentString)) deviceType = 'bot';

    const osParts = agent.os.toString().split(' ');
    const osName = osParts[0] || agent.os.toString();
    const osVersion = osParts.slice(1).join(' ') || 'Unknown';

    return {
      browser: agent.browser.toString(),
      browserVersion: agent.version || '',
      os: osName,
      osVersion: osVersion,
      deviceType: deviceType,
      deviceName: device !== 'Other' ? device : 'Unknown',
      userAgent: userAgentString,
      platform: agent.platform || 'Unknown'
    };
  } catch (error) {
    return {
      browser: 'Unknown',
      browserVersion: '',
      os: 'Unknown',
      osVersion: '',
      deviceType: 'Unknown',
      deviceName: 'Unknown',
      userAgent: userAgentString,
      platform: 'Unknown'
    };
  }
}

module.exports = {
  parseUserAgent
};