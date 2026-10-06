const nodemailer = require('nodemailer');

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
  });
}

module.exports = { sendRegistrationApproval };