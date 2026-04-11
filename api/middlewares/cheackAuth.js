const jwt = require("jsonwebtoken");
require("dotenv").config();
const checkAuth = (req, res, next) => {
  const authHeader =
    req.headers["Authorization"] || req.headers["authorization"];
  if (!authHeader)
    return res.status(401).json({ error: "Access denied. No token provided." });
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.JWTSecret, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token." });
    req.user = user;
    next();
  });
};

module.exports = checkAuth;
