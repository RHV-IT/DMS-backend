const cors = require("cors");

const allowedOrigins = [
  "https://rhv-dms.vercel.app",
  "http://192.168.0.153:3000",
  "http://docmanager.rhv",
  "http://localhost:3000"
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin", "X-Requested-With", "Content-Type", "Accept",
    "Authorization", "x-browser", "x-device", "x-client-type", "x-platform"
  ],
  optionsSuccessStatus: 200
};

module.exports = cors(corsOptions);