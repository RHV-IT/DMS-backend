require('dotenv').config({ path: __dirname + '/api/.env' });
module.exports = require('./api/src/app');