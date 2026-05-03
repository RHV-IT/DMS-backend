const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function sendEmail(to, subject, html) {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.log('Email not configured. Skipping send.');
      return { success: true, skipped: true };
    }

    const info = await transporter.sendMail({
      from: `"DMS System" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
      to,
      subject,
      html
    });

    console.log('Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send error:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendWelcomeEmail(user) {
  const subject = 'Welcome to DMS - Your Account Details';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to DMS!</h2>
      <p>Hello <strong>${user.name}</strong>,</p>
      <p>Your account has been created successfully. Here are your login details:</p>
      <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Email:</strong> ${user.email}</p>
        <p><strong>Password:</strong> ${user.password}</p>
      </div>
      <p>Please login and change your password after first login.</p>
      <p>Login URL: <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}">${process.env.CLIENT_URL || 'http://localhost:5173'}</a></p>
      <p style="color: #666; font-size: 12px; margin-top: 30px;">
        This is an automated message. Please do not reply.
      </p>
    </div>
  `;

  return sendEmail(user.email, subject, html);
}

module.exports = {
  sendEmail,
  sendWelcomeEmail
};