const logger = require('../config/logger');
const AuditLog = require('../models/AuditLog');
const { sendMailWithRetry } = require('../utils/mailer');
const { WELCOME_EMAIL_SUBJECT, buildWelcomeEmailHtml, buildWelcomeEmailText } = require('../templates/welcomeEmail');

async function writeEmailAuditLog({ action, user, createdBy, details }) {
  try {
    await AuditLog.create({
      userId: user._id,
      userEmail: user.email,
      action,
      resource: 'user',
      resourceId: user._id.toString(),
      details: {
        recipient: user.email,
        createdBy: createdBy ? { id: createdBy._id, email: createdBy.email } : undefined,
        timestamp: new Date(),
        ...details
      }
    });
  } catch (auditError) {
    logger.error(`Failed to write ${action} audit log for ${user.email}: ${auditError.message}`);
  }
}

/**
 * Sends the account-onboarding email to a user.
 * Idempotent by default: skips silently if this user already has a recorded send
 * (see welcomeEmailSentAt). Pass force:true to bypass that guard (used by the
 * admin-triggered resend-welcome-email endpoint).
 */
async function sendUserWelcomeEmail({ user, password, role, createdBy, force = false }) {
  const { name, email, department } = user;

  if (user.welcomeEmailSentAt && !force) {
    logger.info(`Email skipped: welcome email already sent to ${email} at ${user.welcomeEmailSentAt.toISOString()}`);
    return { success: true, skipped: true, reason: 'already_sent' };
  }

  logger.info(`Email queued: welcome email for ${email}`);

  const html = buildWelcomeEmailHtml({ name, email, password, department, role });
  const text = buildWelcomeEmailText({ name, email, password, department, role });

  const result = await sendMailWithRetry({
    from: process.env.EMAIL_FROM || `"RHV DMS" <${process.env.SMTP_USER}>`,
    to: email,
    subject: WELCOME_EMAIL_SUBJECT,
    html,
    text
  });

  if (result.success) {
    if (!result.skipped) {
      logger.info(`Email sent: welcome email to ${email} (messageId: ${result.messageId})`);
    }

    user.welcomeEmailSentAt = new Date();
    user.pendingWelcomeCredential = null;
    await user.save();

    await writeEmailAuditLog({
      action: 'email_welcome_sent',
      user,
      createdBy,
      details: { deliveryStatus: result.skipped ? 'skipped_not_configured' : 'sent' }
    });

    return result;
  }

  logger.error(`Email failed: welcome email to ${email} - ${result.error}`);

  await writeEmailAuditLog({
    action: 'email_welcome_failed',
    user,
    createdBy,
    details: { smtpError: result.error }
  });

  return result;
}

module.exports = {
  sendUserWelcomeEmail
};
