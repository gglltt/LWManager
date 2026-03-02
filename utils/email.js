const nodemailer = require("nodemailer");

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("Missing SMTP configuration (SMTP_HOST, SMTP_USER, SMTP_PASS).");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for 587
    auth: { user, pass }
  });
}

async function sendEmail({ to, subject, html }) {
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  if (!from) throw new Error("Missing MAIL_FROM (or SMTP_USER).");

  const transporter = getTransporter();
  await transporter.sendMail({
    from: `LWManager <${from}>`,
    to,
    subject,
    html
  });
}

function baseUrl() {
  // Use RENDER_EXTERNAL_URL in Render, otherwise BASE_URL in local
  return process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || "http://localhost:3000";
}

module.exports = { sendEmail, baseUrl };