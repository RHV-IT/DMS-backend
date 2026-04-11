const User = require("../models/user.model");
const db = require("../database/documentRepository.db");
const getUsers = async (req, res) => {
  const users = await db.getDb().collection("users").find().toArray();
  const newUsers = users.map((user) => {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      isSuspended: user.isSuspended,
    };
  });
  res.status(200).json({ users: newUsers });
};

const getCreateUser = (req, res) => {
  res.status(200).json({ error: null });
};

const createUser = async (req, res) => {
  const name = req.body.name;
  const email = req.body.email;
  const password = req.body.password;
  // const confirmPassword = req.body.confirmpassword;
  const user = new User(name, email, password);
  const exists = await user.alreadyExists();
  if (exists) {
    res.status(409).json({ error: "User with that email already exists" });
    return;
  }
  // if (password !== confirmPassword) {
  //   res.status(400).json({ error: "Passwords do not match" });
  //   return;
  // }
  await user.createUser();
  res.status(201).json({ message: "User created successfully" });
};

const getUpdateUser = async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  res.status(200).json({ user });
};

const updateUser = async (req, res, next) => {
  const { id } = req.params;
  const { name, email } = req.body;
  try {
    await User.updateUser(id, name, email);
    const user = await User.findById(id);
    await User.sendUpdateUserEmail(user);
  } catch (err) {
    next(err);
  }

  res.status(200).json({ message: "User updated successfully" });
};

const getResetUser = async (req, res, next) => {
  let user;
  try {
    const { id } = req.params;
    user = await User.findById(id);
  } catch (err) {
    next(err);
  }
  if (!user) {
    res.status(404).json({
      error: "User not found",
      user: {
        _id: "",
        email: "",
      },
    });
    return;
  }
  res.status(200).json({ user });
};

const resetUser = async (req, res) => {
  const { id } = req.params;
  const { name, email, password, confirmpassword } = req.body;
  const user = await User.findById(id);
  if (password !== confirmpassword) {
    res.status(400).json({ error: "Passwords do not match", user });
    return;
  }
  await User.updateUser(id, name, email, password);
  await User.sendUpdateUserEmail(user);
  await User.sendResetPasswordEmail(user, password);
  res.status(200).json({ message: "Password reset successfully" });
};

const suspendUser = async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  await User.suspendUser(id);
  await User.sendSuspendEmail(user);
  res.status(200).json({ message: "User suspended successfully" });
};

const restoreUser = async (req, res) => {
  const { id } = req.params;
  const user = await User.findById(id);
  await User.restoreUser(id);
  await User.sendRestoreEmail(user);
  res.status(200).json({ message: "User restored successfully" });
};

module.exports = {
  getUsers,
  getCreateUser,
  createUser,
  getUpdateUser,
  updateUser,
  getResetUser,
  resetUser,
  suspendUser,
  restoreUser,
};
