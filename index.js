require('dotenv').config({ path: __dirname + '/api/.env' });
const app = require('./api/src/app');

console.log("Mongo URI exists:", !!process.env.MONGODB_URI);
console.log("Running on Vercel:", !!process.env.VERCEL);
console.log("Current working directory:", process.cwd());

// Start server locally
if (require.main === module && process.env.NODE_ENV !== 'production') {
  app.startServer();
}

module.exports = app;