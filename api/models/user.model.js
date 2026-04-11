const db = require("../database/documentRepository.db");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
require("dotenv").config();
const bcrypt = require("bcrypt");
const ObjectId = require("mongodb").ObjectId;
class User {
  constructor(name, email, password) {
    this.name = name;
    this.email = email;
    this.password = password;
  }

  static generateAuthToken(user) {
    const token = jwt.sign(
      {
        id: user._id,
        name: user.name,
        email: user.email,
        isAdmin: user.isAdmin,
      },
      process.env.JWTSecret,
      {
        expiresIn: "1h",
      },
    );
    return token;
  }

  async alreadyExists() {
    const user = await db
      .getDb()
      .collection("users")
      .findOne({ email: this.email });
    if (!user) {
      return false;
    } else {
      return true;
    }
  }

  async createUser() {
    try {
      const hashedPassword = await bcrypt.hash(this.password, 12);
      const userData = {
        name: this.name,
        email: this.email,
        password: hashedPassword,
      };
      await db.getDb().collection("users").insertOne(userData);
      await this.sendEmail(this.email, this.name, this.password);
      return;
    } catch (error) {
      console.error("Error creating user:", error);
    }
  }

  async sendEmail(userEmail, userName, userPassword) {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.AdminEmail,
        pass: process.env.AppPassword,
      },
      family: 4,
    });

    let mailOptions = {
      from: `"Filehub Admin" ${process.env.AdminEmail}`,
      to: userEmail,
      subject: "Welcome to Filehub",
      text: `Hi ${userName}, your account has been created successfully.
        These are your Login Details: 
        Email: ${userEmail},
        Password: ${userPassword}
      `,
    };
    try {
      let info = await transporter.sendMail(mailOptions);
      console.log("Email sent: " + info.response);
    } catch (err) {
      console.error("Error sending email", err);
    }
  }

  static async sendResetPasswordEmail(user, password) {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.AdminEmail,
        pass: process.env.AppPassword,
      },
      family: 4,
    });
    let mailOptions = {
      from: `"Filehub Admin" ${process.env.AdminEmail}`,
      to: user.email,
      subject: "Password Reset",
      text: `Hi ${user.name}, your password has been reset successfully.
      These are your new login details:
      email: ${user.email}
      password: ${password}
      `,
    };
    try {
      let info = await transporter.sendMail(mailOptions);
      console.log("Email sent: " + info.response);
    } catch (err) {
      console.error("Error sending email", err);
    }
  }

  static async findByEmail(email) {
    const user = await db.getDb().collection("users").findOne({ email: email });
    return user;
  }

  static async comparePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async findById(id) {
    return await db
      .getDb()
      .collection("users")
      .findOne({ _id: new ObjectId(id) });
  }

  static async updateUser(id, name, email, password) {
    const hashedPassword = await bcrypt.hash(password, 12);
    await db
      .getDb()
      .collection("users")
      .updateOne(
        { _id: new ObjectId(id) },
        { $set: { name, email, password: hashedPassword } },
      );
  }

  static async sendUpdateUserEmail(user) {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.AdminEmail,
        pass: process.env.AppPassword,
      },
      family: 4,
    });

    let mailOptions = {
      from: `"Filehub Admin" ${process.env.AdminEmail}`,
      to: user.email,
      subject: "Account Update Successful",
      text: `Hi ${user.name}, Your account was updated successfully
      These are your new details
      Name: ${user.name}
      Email: ${user.email}
      `,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("Email sent: " + info.response);
    } catch (err) {
      console.error("Error sending email: ", err);
    }
  }

  static async sendSuspendEmail(user) {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.AdminEmail,
        pass: process.env.AppPassword,
      },
      family: 4,
    });
    let mailOptions = {
      from: `"Filehub Admin" ${process.env.AdminEmail}`,
      to: user.email,
      subject: "Notice of Suspension",
      text: `
      Hi ${user.name}, Your account has been suspended until further notice.
      Please note you will not be able to login or access your files until restoration of your account
      `,
    };
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("Email Sent successfully", info.response);
    } catch (err) {
      console.err("Error Sending Email: ", err);
    }
  }

  static async suspendUser(id) {
    await db
      .getDb()
      .collection("users")
      .updateOne({ _id: new ObjectId(id) }, { $set: { isSuspended: true } });
  }

  static async restoreUser(id) {
    await db
      .getDb()
      .collection("users")
      .updateOne({ _id: new ObjectId(id) }, { $set: { isSuspended: false } });
  }

  static async sendRestoreEmail(user) {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.AdminEmail,
        pass: process.env.AppPassword,
      },
      family: 4,
    });
    let mailOptions = {
      from: `"Filehub Admin" ${process.env.AdminEmail}`,
      to: user.email,
      subject: "Account Restored",
      text: `
      Hi ${user.name}, Your Account Has been restored.
      You can now log back in and access your files
      `,
    };
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("Email Sent :", info.response);
    } catch (err) {
      console.error("Error Sending Email: ", err);
    }
  }
}

module.exports = User;
