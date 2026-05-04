require('dotenv').config({ path: __dirname + '/api/.env' });
const { startServer } = require('./api/src/app');

if (require.main === module) {
  // Start the server if this file is run directly
  startServer();
}