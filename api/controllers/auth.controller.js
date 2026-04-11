const User = require("../models/user.model");
const Uploads = require("../models/uploads.model");

const get = (req, res) => {
  if (req.session.user) {
    res.redirect("/dashboard");
    return;
  }
  res.redirect("/login");
};

const getLogin = (req, res) => {
  if (req.session.user) {
    res.redirect("/dashboard");
    return;
  }
  res.render("user/login", { error: null });
};

const login = async (req, res) => {
  if (!req.body) {
    res.status(404).json({ message: "body not found" });
    return;
  }
  const email = req.body.email;
  const password = req.body.password;
  const user = await User.findByEmail(email);
  if (!user) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }
  if (user.isSuspended) {
    res.status(401).json({ error: "This account has been suspended" });
    return;
  }
  let token;
  try {
    const passwordMatch = await User.comparePassword(password, user.password);
    if (!passwordMatch) {
      res.status(401).json({ error: "Invalid username or password" });
      return;
    }
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).json({ error: "An error occurred. Please try again." });
    return;
  }
  token = User.generateAuthToken(user);

  if (user.isAdmin) {
    res.status(200).json({
      token,
      user: { name: user.name, email: user.email, isAdmin: user.isAdmin },
    });
    return;
  }
  res.status(200).json({
    token,
    user: { name: user.name, email: user.email, isAdmin: user.isAdmin },
  });
};

const getDashboard = async (req, res) => {
  if (!req.session.user) {
    res.redirect("/login");
    return;
  }
  if (req.user && req.user.isAdmin) {
    res.redirect("/admin/dashboard");
    return;
  }
  const files = await Uploads.getRecentFiles(req.user.id);
  res.status(200).json({ user: req.user.name, files });
};

const getLogout = (req, res) => {
  req.session.destroy();
  res.redirect("/login");
};

module.exports = {
  get,
  getLogin,
  login,
  getDashboard,
  getLogout,
};
