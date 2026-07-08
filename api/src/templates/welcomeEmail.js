const BRAND_BLUE = '#2f5fdb';
const BRAND_NAVY = '#0b1a33';
const BRAND_RED = '#e53935';

const WELCOME_EMAIL_SUBJECT = "Welcome to Redeemer's Health Village Document Management System";

function formatRole(role) {
  if (!role) return 'User';
  const normalized = String(role).trim().toLowerCase();
  if (normalized === 'hod') return 'Head of Department';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function getLoginUrl() {
  return process.env.FRONTEND_URL || 'http://192.168.0.153:3000';
}

function buildWelcomeEmailHtml({ name, email, password, department, role }) {
  const loginUrl = getLoginUrl();
  const displayRole = formatRole(role);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${WELCOME_EMAIL_SUBJECT}</title>
<!--[if mso]>
<style>table { border-collapse: collapse; }</style>
<![endif]-->
<style>
  body, table, td, a { font-family: 'Segoe UI', Arial, sans-serif; }
  @media (prefers-color-scheme: dark) {
    .email-bg { background-color: #0f1420 !important; }
    .email-card { background-color: #161d2e !important; }
    .email-text { color: #e6e9f0 !important; }
    .email-muted { color: #9aa4bb !important; }
    .details-card { background-color: #1c2438 !important; border-left-color: ${BRAND_BLUE} !important; }
    .support-card { background-color: #1c2438 !important; }
    .security-card { background-color: #2a1a1a !important; }
  }
</style>
</head>
<body class="email-bg" style="margin:0; padding:0; background-color:#f2f5fa;">
  <div class="email-bg" style="background-color:#f2f5fa; padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto;">
      <tr>
        <td class="email-card" style="background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(11,26,51,0.08);">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background-color:${BRAND_NAVY}; padding:32px 40px; text-align:center;">
                <span style="font-size:34px; font-weight:800; letter-spacing:1px; color:${BRAND_BLUE};">RHV</span><span style="font-size:26px; font-weight:800; color:${BRAND_RED}; vertical-align:top;">&#43;</span>
                <div style="margin-top:6px; font-size:12px; letter-spacing:2px; color:#c3cde0; text-transform:uppercase;">Document Management System</div>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px 8px 40px;">
                <h1 class="email-text" style="margin:0 0 16px 0; font-size:20px; color:${BRAND_NAVY};">Welcome to RHV DMS</h1>
                <p class="email-text" style="margin:0 0 12px 0; font-size:14px; line-height:1.6; color:#333333;">Dear <strong>${name}</strong>,</p>
                <p class="email-text" style="margin:0 0 12px 0; font-size:14px; line-height:1.6; color:#333333;">Your account has been created successfully. You can now securely access the Redeemer's Health Village Document Management System.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="details-card" style="background-color:#eef3ff; border-left:4px solid ${BRAND_BLUE}; border-radius:6px;">
                  <tr>
                    <td style="padding:20px 24px;">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                        <tr><td class="email-muted" style="padding:6px 0; font-size:12px; color:#5b6b85; text-transform:uppercase; letter-spacing:0.5px;">Name</td></tr>
                        <tr><td class="email-text" style="padding:0 0 12px 0; font-size:14px; color:${BRAND_NAVY}; font-weight:600;">${name}</td></tr>
                        <tr><td class="email-muted" style="padding:6px 0; font-size:12px; color:#5b6b85; text-transform:uppercase; letter-spacing:0.5px;">Department</td></tr>
                        <tr><td class="email-text" style="padding:0 0 12px 0; font-size:14px; color:${BRAND_NAVY}; font-weight:600;">${department || 'N/A'}</td></tr>
                        <tr><td class="email-muted" style="padding:6px 0; font-size:12px; color:#5b6b85; text-transform:uppercase; letter-spacing:0.5px;">Role</td></tr>
                        <tr><td class="email-text" style="padding:0 0 12px 0; font-size:14px; color:${BRAND_NAVY}; font-weight:600;">${displayRole}</td></tr>
                        <tr><td class="email-muted" style="padding:6px 0; font-size:12px; color:#5b6b85; text-transform:uppercase; letter-spacing:0.5px;">Login Email</td></tr>
                        <tr><td class="email-text" style="padding:0 0 12px 0; font-size:14px; color:${BRAND_NAVY}; font-weight:600;">${email}</td></tr>
                        <tr><td class="email-muted" style="padding:6px 0; font-size:12px; color:#5b6b85; text-transform:uppercase; letter-spacing:0.5px;">Temporary Password</td></tr>
                        <tr><td class="email-text" style="padding:0; font-size:15px; color:${BRAND_NAVY}; font-weight:700; font-family:'Consolas', monospace;">${password}</td></tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 8px 40px; text-align:center;">
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td bgcolor="${BRAND_BLUE}" style="border-radius:6px; background-color:${BRAND_BLUE};">
                      <a href="${loginUrl}" style="display:inline-block; padding:14px 32px; font-size:14px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:6px;">Open RHV DMS</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 40px 8px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="security-card" style="background-color:#fff5f5; border-left:4px solid ${BRAND_RED}; border-radius:6px;">
                  <tr>
                    <td class="email-text" style="padding:16px 20px; font-size:13px; line-height:1.6; color:#7a2e2e;">
                      <strong>Security notice:</strong> For security purposes, change your password immediately after your first login. Never share your credentials.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 40px 8px 40px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="support-card" style="background-color:#f5f7fb; border-radius:6px;">
                  <tr>
                    <td class="email-text" style="padding:16px 20px; font-size:13px; line-height:1.6; color:#333333;">
                      <strong>Need Help?</strong><br>Please contact the Information Technology Department.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 40px 32px 40px; text-align:center; border-top:1px solid #eef0f4;">
                <p class="email-muted" style="margin:16px 0 4px 0; font-size:13px; color:#5b6b85; font-weight:600;">Redeemer's Health Village</p>
                <p class="email-muted" style="margin:0 0 12px 0; font-size:12px; color:#8a95a8;">Document Management System</p>
                <p class="email-muted" style="margin:0; font-size:11px; color:#a8b1c2;">Automated Email &middot; Do Not Reply</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
}

function buildWelcomeEmailText({ name, email, password, department, role }) {
  const loginUrl = getLoginUrl();
  const displayRole = formatRole(role);

  return [
    'Welcome to RHV DMS',
    '',
    `Dear ${name},`,
    '',
    "Your account has been created successfully. You can now securely access the Redeemer's Health Village Document Management System.",
    '',
    '--- Login Details ---',
    `Name: ${name}`,
    `Department: ${department || 'N/A'}`,
    `Role: ${displayRole}`,
    `Login Email: ${email}`,
    `Temporary Password: ${password}`,
    '',
    `Open RHV DMS: ${loginUrl}`,
    '',
    'Security notice: For security purposes, change your password immediately after your first login. Never share your credentials.',
    '',
    'Need Help? Please contact the Information Technology Department.',
    '',
    "Redeemer's Health Village",
    'Document Management System',
    'Automated Email - Do Not Reply'
  ].join('\n');
}

module.exports = {
  WELCOME_EMAIL_SUBJECT,
  buildWelcomeEmailHtml,
  buildWelcomeEmailText
};
