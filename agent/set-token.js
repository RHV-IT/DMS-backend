const axios = require('axios');

async function setToken(options) {
  const { token, userId, userEmail, apiUrl } = options;

  if (!token) {
    console.error('ERROR: token is required');
    console.log('Usage: node set-token.js --token <JWT_TOKEN> --userId <USER_ID> --userEmail <EMAIL>');
    process.exit(1);
  }

  try {
    const response = await axios.post('http://localhost:4001/set-token', {
      token,
      userId: userId || '',
      userEmail: userEmail || '',
      apiUrl: apiUrl || 'http://192.168.4.213:5000/api/v1/scanner/pending'
    });

    if (response.data?.success) {
      console.log('SUCCESS: Token set for user:', response.data.userId);
      console.log('The agent is now authenticated.');
    } else {
      console.error('ERROR:', response.data?.message || 'Unknown error');
      process.exit(1);
    }
  } catch (err) {
    console.error('ERROR:', err.response?.data?.message || err.message);
    console.log('\nMake sure the agent is running (scanner-agent.js)');
    process.exit(1);
  }
}

// Parse command line args
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  const key = args[i].replace(/^--?/, '');
  if (args[i + 1] && !args[i + 1].startsWith('-')) {
    options[key] = args[i + 1];
    i++;
  }
}

// Also check environment variables as fallback
if (!options.token && process.env.TOKEN) options.token = process.env.TOKEN;
if (!options.userId && process.env.USER_ID) options.userId = process.env.USER_ID;
if (!options.userEmail && process.env.USER_EMAIL) options.userEmail = process.env.USER_EMAIL;
if (!options.apiUrl && process.env.API_URL) options.apiUrl = process.env.API_URL;

setToken(options);
