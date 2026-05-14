require('dotenv').config({ path: __dirname + '/api/.env' });
const app = require('./api/app');

console.log("Mongo URI exists:", !!process.env.MONGODB_URI);
console.log("Running on Vercel:", !!process.env.VERCEL);
console.log("Current working directory:", process.cwd());

// Start server locally
if (process.env.VERCEL !== "1") {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;