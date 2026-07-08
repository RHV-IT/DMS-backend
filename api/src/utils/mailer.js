const nodemailer = require('nodemailer');
const logger = require('../config/logger');

const SMTP_TIMEOUT_MS = 8000;
const RETRY_DELAYS_MS = [500, 1500];

let transporter = null;
let verifyPromise = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS
    });
  }
  return transporter;
}

function isConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function ensureVerified() {
  if (!isConfigured()) {
    return Promise.resolve(false);
  }

  if (!verifyPromise) {
    verifyPromise = getTransporter()
      .verify()
      .then(() => {
        logger.info('SMTP Ready');
        return true;
      })
      .catch((error) => {
        logger.error(`SMTP Configuration Error: ${error.message}`);
        return false;
      });
  }

  return verifyPromise;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendMailWithRetry(mailOptions) {
  if (!isConfigured()) {
    logger.info(`Email not configured. Skipping send to ${mailOptions.to}.`);
    return { success: true, skipped: true };
  }

  await ensureVerified();
  const tx = getTransporter();
  const totalAttempts = RETRY_DELAYS_MS.length + 1;
  let lastError;

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    try {
      const info = await tx.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      lastError = error;
      logger.error(`SMTP Error (attempt ${attempt + 1}/${totalAttempts}) sending to ${mailOptions.to}: ${error.message}`);
      if (attempt < RETRY_DELAYS_MS.length) {
        await delay(RETRY_DELAYS_MS[attempt]);
      }
    }
  }

  return { success: false, error: lastError ? lastError.message : 'Unknown SMTP error' };
}

/**
 * Performs a fresh, uncached SMTP verify() for the /system/email-health diagnostic endpoint.
 * Unlike ensureVerified() (memoized for the hot send path), this always re-checks live status.
 */
async function checkHealth() {
  const host = process.env.SMTP_HOST || null;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : null;
  const secure = Number(process.env.SMTP_PORT) === 465;
  const configured = isConfigured();

  if (!configured) {
    return { configured, ready: false, host, port, secure, checkedAt: new Date().toISOString() };
  }

  try {
    await getTransporter().verify();
    logger.info('SMTP Ready');
    return { configured, ready: true, host, port, secure, checkedAt: new Date().toISOString() };
  } catch (error) {
    logger.error(`SMTP Configuration Error: ${error.message}`);
    return { configured, ready: false, host, port, secure, error: error.message, checkedAt: new Date().toISOString() };
  }
}

module.exports = {
  getTransporter,
  isConfigured,
  ensureVerified,
  sendMailWithRetry,
  checkHealth
};
