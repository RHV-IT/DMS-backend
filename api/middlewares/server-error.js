const serverErrorMiddleware = (err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    data: null,
    message: "Internal Server Error"
  });
  next();
};

module.exports = serverErrorMiddleware;
