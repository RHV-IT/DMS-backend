const cors = require("cors");

const allowedOrigins = [
  "http://192.168.0.153:3000",
  "http://docmanager.rhv",
  "http://localhost:3000",
  "https://rhv-dms.vercel.app",
];

const corsOptions = {
  origin: function (origin, callback) {
    // allow non-browser requests (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
    "x-browser",
    "x-device",
    "x-client-type",
    "x-platform", // <--- Added this to fix your specific error
  ],

  exposedHeaders: ["Authorization", "Content-Length", "Content-Type"],

  optionsSuccessStatus: 200,
};

const corsMiddleware = cors(corsOptions);

module.exports = corsMiddleware;
module.exports.corsOptions = corsOptions;
module.exports.allowedOrigins = allowedOrigins;