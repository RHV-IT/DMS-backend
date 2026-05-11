// dependencies
const express = require("express");
const checkAuth = require("./middlewares/cheackAuth");
require("dotenv").config();
const corsConfig = require("./src/config/cors");
//middlewares
const notFoundMiddleware = require("./middlewares/not-found");
const serverErrorMiddleware = require("./middlewares/server-error");
//session configuration
//routes
const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const userRoutes = require("./routes/user.routes");
//database connection
const db = require("./database/documentRepository.db");
const app = express();

app.use(corsConfig);
app.options('*', corsConfig);
app.use(express.json({ limit: "50mb" }));

// middleware to parse incoming request bodies
app.use(express.urlencoded({ extended: false }));

// routes
app.use(authRoutes);
app.use(checkAuth);
app.use(userRoutes);
app.use("/api/admin", adminRoutes);

// 404 handler
app.use(notFoundMiddleware);
// internal server error handler
app.use(serverErrorMiddleware);

// Replace with your actual Render URL
const API_URL = "https://document-repository-react.onrender.com/api/health";

const startKeepAlive = () => {
  // 600000ms = 10 minutes
  setInterval(async () => {
    try {
      const response = await fetch(API_URL);
      if (response.ok) {
        console.log(`Keep-alive success: ${response.status}`);
      }
    } catch (error) {
      console.error("Keep-alive failed:", error.message);
    }
  }, 600000);
};

// Start the loop
startKeepAlive();

const PORT = process.env.PORT || 5000;

db.connect()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log("connected to database and started the server");
    });
  })
  .catch((err) => {
    console.error("Failed to connect to database", err);
  });
