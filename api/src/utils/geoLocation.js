const axios = require('axios');

/**
 * Get location information from IP address
 * Uses ipapi.co for free geolocation
 */
async function getLocationFromIP(ipAddress) {
  try {
    // Skip private/local IPs
    if (!ipAddress ||
        ipAddress === '127.0.0.1' ||
        ipAddress === '::1' ||
        ipAddress.startsWith('192.168.') ||
        ipAddress.startsWith('10.') ||
        ipAddress.startsWith('172.')) {
      return null;
    }

    const response = await axios.get(`http://ipapi.co/${ipAddress}/json/`, {
      timeout: 5000 // 5 second timeout
    });

    if (response.data && !response.data.error) {
      return {
        country: response.data.country_name,
        region: response.data.region,
        city: response.data.city,
        timezone: response.data.timezone,
        isp: response.data.org,
        latitude: response.data.latitude,
        longitude: response.data.longitude
      };
    }
  } catch (error) {
    console.warn('Location lookup failed:', error.message);
  }

  return null;
}

module.exports = {
  getLocationFromIP
};