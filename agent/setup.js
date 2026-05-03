const fs = require('fs');
const path = require('path');
const readline = require('readline');

const CONFIG_PATH = path.join(__dirname, 'config.json');

async function askQuestion(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

async function configure() {
  console.log('\n========================================');
  console.log('Scanner Agent Setup');
  console.log('========================================\n');

  console.log('Configure the agent to connect to your server.\n');

  const serverUrl = await askQuestion('Server URL (e.g. http://192.168.4.213:5000): ') || 'http://localhost:5000';
  const apiUrl = serverUrl.replace(/\/$/, '') + '/api/v1/scanner/pending';

  const config = {
    apiUrl: apiUrl,
    token: null,
    userId: null,
    userEmail: null,
    configuredAt: new Date().toISOString()
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  console.log('\n========================================');
  console.log('Setup Complete!');
  console.log('========================================\n');
  console.log('Config saved to: config.json');
  console.log('API URL:', apiUrl);
  console.log('\nNEXT STEP: Authenticate via Frontend');
  console.log('----------------------------------------');
  console.log('1. Open your DMS frontend (web interface)');
  console.log('2. Log in with your credentials');
  console.log('3. The frontend will automatically send your token to the agent');
  console.log('\nAlternatively, manually call the agent API:');
  console.log('  POST http://localhost:4001/set-token');
  console.log('  Body: { "token": "<JWT_TOKEN>", "userId": "...", "userEmail": "..." }');
  console.log('\nRun: node setup.js status  (to check status)');
  console.log('Run: node scanner-agent.js  (to start the agent)\n');
}

async function showStatus() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('Agent not configured. Run: node setup.js');
    return;
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

  console.log('\n========================================');
  console.log('Scanner Agent Status');
  console.log('========================================\n');
  console.log(`Server: ${config.apiUrl ? new URL(config.apiUrl).origin : 'Not set'}`);
  console.log(`Authenticated: ${config.userEmail ? 'Yes - ' + config.userEmail : 'No'}`);
  console.log(`Configured: ${config.configuredAt}`);

  const processedFilesPath = path.join(__dirname, 'processed-files.json');
  if (fs.existsSync(processedFilesPath)) {
    const data = JSON.parse(fs.readFileSync(processedFilesPath, 'utf8'));
    console.log(`Processed files: ${data.files?.length || 0}`);
  }
  console.log('\n========================================\n');
}

function showHelp() {
  console.log('\nScanner Agent Setup');
  console.log('=================\n');
  console.log('  node setup.js        - Configure agent (no login required)');
  console.log('  node setup.js status  - Show current status');
  console.log('  node setup.js help   - Show this help\n');
}

const main = async () => {
  const args = process.argv.slice(2);

  if (args.includes('status')) {
    await showStatus();
  } else if (args.includes('help') || args.includes('-h')) {
    showHelp();
  } else {
    await configure();
  }
};

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
