const User = require("../models/user.model");
const Uploads = require("../models/uploads.model");
const jwt = require("jsonwebtoken");

const get = (req, res) => {
  if (req.session && req.session.user) {
    res.redirect("/dashboard");
    return;
  }
  res.redirect("/api/login");
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
    return res.status(400).json({
      success: false,
      message: "Request body not found"
    });
  }
  const email = req.body.email;
  const password = req.body.password;
  const user = await User.findByEmail(email);
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "Invalid credentials"
    });
  }
  if (user.isSuspended) {
    return res.status(401).json({
      success: false,
      message: "Account has been suspended"
    });
  }

  try {
    const passwordMatch = await User.comparePassword(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    const accessToken = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    const refreshToken = jwt.sign(
      {
        id: user._id,
      },
      process.env.JWT_REFRESH_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role || "user",
          department: user.department || "",
          status: user.status || "active",
          confidentialityLevel: user.confidentialityLevel || "",
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred. Please try again."
    });
  }
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

const getMe = (req, res) => {
  if (req.user) {
    return res.status(200).json({
      success: true,
      data: {
        _id: req.user.id,
        name: req.user.name,
        email: req.user.email
      }
    });
  }
  return res.status(401).json({
    success: false,
    message: "Unauthorized"
  });
};

const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({
      success: false,
      message: "Refresh token required"
    });
  }

  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const accessToken = jwt.sign(
      {
        id: decoded.id,
        email: decoded.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        accessToken
      }
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid refresh token"
    });
  }
};

const logout = (req, res) => {
  // In a stateless JWT setup, logout is handled client-side by removing tokens
  return res.status(200).json({
    success: true,
    message: "Logout successful"
  });
};

module.exports = {
  get,
  getLogin,
  login,
  getDashboard,
  logout,
  getMe,
  refreshToken,
};
