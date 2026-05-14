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
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/user', checkAuth, userRoutes);
app.use("/api/v1/admin", checkAuth, adminRoutes);

// 404 handler
app.use(notFoundMiddleware);
// internal server error handler
app.use(serverErrorMiddleware);

module.exports = app;
