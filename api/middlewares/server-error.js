const serverErrorMiddleware = (err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).send("Internal Server Error");
  next();
};

module.exports = serverErrorMiddleware;
