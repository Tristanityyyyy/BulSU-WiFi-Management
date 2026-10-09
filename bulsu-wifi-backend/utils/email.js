const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const logoPath = path.resolve(__dirname, '../../bulsu-wifi-frontend/public/bulsu-logo.png');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildApprovalHtml({ fullName, role, accountId, temporaryPassword }, includeLogo) {
  const logo = includeLogo
    ? '<img src="cid:bulsuLogo" width="78" height="78" alt="Bulacan State University seal" style="display:block;width:78px;height:78px;border:0;">'
    : '<div style="font-size:12px;font-weight:bold;color:#c90065;text-align:center;">BULSU<br>MENeses<br>CAMPUS</div>';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Wi-Fi Account Approved</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f3f8;font-family:Arial,Helvetica,sans-serif;color:#172b4d;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:720px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:18px 28px;background-color:#f4b6d2;border-bottom:4px solid #cc0068;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="padding-right:18px;vertical-align:middle;">${logo}</td>
            <td style="vertical-align:middle;">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;line-height:1.2;color:#142b50;">BULACAN STATE UNIVERSITY</div>
              <div style="font-size:14px;letter-spacing:2px;color:#33435d;">MENESES CAMPUS</div>
              <div style="margin-top:8px;padding-top:7px;border-top:2px solid #d00068;font-size:13px;letter-spacing:1px;color:#243955;">&#9679;&nbsp; WI-FI MANAGEMENT SYSTEM</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:34px 32px 24px;">
        <div style="text-align:center;">
          <div style="margin:0 auto 8px;width:58px;height:58px;border-radius:50%;background-color:#cc0068;color:#ffffff;font-size:38px;line-height:58px;font-weight:bold;">&#10003;</div>
          <h1 style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.2;color:#142b50;">Wi-Fi Account Approved</h1>
        </div>
        <p style="margin:0 0 16px;font-size:21px;line-height:1.4;font-weight:bold;color:#172b4d;">Hello, ${escapeHtml(fullName)}!</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#43536b;">Your BulSU Wi-Fi account registration has been approved. You may now connect to the university Wi-Fi network.</p>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;border:1px solid #f0dce8;border-radius:10px;background-color:#fff8fc;">
          <tr>
            <td style="padding:18px 20px 10px;font-size:16px;font-weight:bold;letter-spacing:.5px;color:#172b4d;">&#9679;&nbsp; ACCOUNT INFORMATION</td>
          </tr>
          <tr>
            <td style="padding:0 20px 18px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#ffffff;border:1px solid #f2e8ee;border-radius:7px;">
                <tr>
                  <td style="padding:13px 16px;border-bottom:1px solid #eee8ed;font-size:14px;color:#627087;">Role</td>
                  <td style="padding:13px 16px;border-bottom:1px solid #eee8ed;font-size:15px;font-weight:bold;color:#172b4d;">${escapeHtml(role.charAt(0).toUpperCase() + role.slice(1))}</td>
                </tr>
                <tr>
                  <td style="padding:13px 16px;border-bottom:1px solid #eee8ed;font-size:14px;color:#627087;">Login ID</td>
                  <td style="padding:13px 16px;border-bottom:1px solid #eee8ed;font-size:15px;font-weight:bold;color:#172b4d;">${escapeHtml(accountId)}</td>
                </tr>
                <tr>
                  <td style="padding:13px 16px;font-size:14px;color:#627087;">Temporary Password</td>
                  <td style="padding:13px 16px;font-size:15px;font-weight:bold;color:#172b4d;word-break:break-all;">${escapeHtml(temporaryPassword)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;border-radius:8px;background-color:#fff0f7;">
          <tr>
            <td width="58" style="padding:15px 10px 15px 18px;text-align:center;font-size:28px;color:#c90065;">&#10003;</td>
            <td style="padding:15px 18px 15px 0;border-left:2px solid #db6a9f;font-size:14px;line-height:1.6;color:#43536b;">For your security, please change your temporary password after your first login.</td>
          </tr>
        </table>
        <p style="margin:0 0 26px;font-size:14px;line-height:1.6;color:#596980;">If you did not request this account, please contact the BulSU Wi-Fi Administrator.</p>
        <div style="border-top:2px solid #e7a1c1;padding-top:15px;text-align:center;">
          <div style="font-size:14px;font-weight:bold;color:#172b4d;">Bulacan State University &ndash; Meneses Campus</div>
          <div style="margin-top:5px;font-size:13px;color:#6a778b;">BulSU Wi-Fi Management System</div>
        </div>
      </td>
    </tr>
    <tr>
      <td height="22" style="height:22px;background-color:#f4b6d2;border-top:4px solid #cc0068;"></td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendRegistrationApproval({ email, fullName, role, accountId, temporaryPassword }) {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = (process.env.SMTP_PASSWORD || '').replace(/\s+/g, '');
  if (!host) throw new Error('SMTP_HOST is not configured.');
  if (Boolean(user) !== Boolean(password))
    throw new Error('Configure both SMTP_USER and SMTP_PASSWORD, or neither for an unauthenticated relay.');
  const from = process.env.SMTP_FROM || user;
  if (!from) throw new Error('SMTP_FROM is required when SMTP authentication is not configured.');

  const port = Number(process.env.SMTP_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    ...(user ? { auth: { user, pass: password } } : {}),
  });

  const hasLogo = fs.existsSync(logoPath);
  await transporter.sendMail({
    from,
    to: email,
    subject: 'BulSU Wi-Fi account approved',
    text: [
      `Hello ${fullName},`,
      '',
      'Your BulSU Wi-Fi account registration has been approved.',
      '',
      `Role: ${role}`,
      `Login ID: ${accountId}`,
      `Temporary password: ${temporaryPassword}`,
      '',
      'Please change your password when you first log in. Keep this message private.',
      '',
      'Bulacan State University Wi-Fi',
    ].join('\n'),
    html: buildApprovalHtml({ fullName, role, accountId, temporaryPassword }, hasLogo),
    ...(hasLogo ? {
      attachments: [{
        filename: 'bulsu-logo.png',
        path: logoPath,
        cid: 'bulsuLogo',
      }],
    } : {}),
  });
}

module.exports = { sendRegistrationApproval };