const notFoundMiddleware = (req, res, next) => {
  res.status(404).send("not found");
  next();
};

module.exports = notFoundMiddleware;
