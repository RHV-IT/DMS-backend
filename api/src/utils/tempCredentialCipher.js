const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const secret = process.env.JWT_SECRET || '';
  return crypto.createHash('sha256').update(`${secret}:welcome-credential`).digest();
}

/**
 * Encrypts a plaintext temporary password for transient storage (e.g. User.pendingWelcomeCredential)
 * so it can be recovered ONLY to resend a welcome email, never for any other purpose.
 * Cleared as soon as delivery is confirmed - see emailService.sendUserWelcomeEmail.
 */
function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(':');
}

function decrypt(payload) {
  const [ivHex, authTagHex, dataHex] = String(payload || '').split(':');
  if (!ivHex || !authTagHex || !dataHex) {
    throw new Error('Invalid encrypted credential payload');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
