function baseUrl() {
  // Render sets RENDER_EXTERNAL_URL; local can use BASE_URL; fallback to localhost
  return process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL || "http://localhost:3000";
}

function getRequiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function toBasicAuthHeader(apiKey, secretKey) {
  const token = Buffer.from(`${apiKey}:${secretKey}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function sendEmail({ to, subject, html }) {
  const apiKey = getRequiredEnv("MAILJET_API_KEY");
  const secretKey = getRequiredEnv("MAILJET_SECRET_KEY");

  // Must be a verified sender in Mailjet (single sender address or domain)
  const fromEmail = getRequiredEnv("MAIL_FROM");
  const fromName = process.env.MAIL_FROM_NAME || "LWManager";

  if (!to || !subject || !html) {
    throw new Error("sendEmail: missing required fields (to, subject, html).");
  }

  // Mailjet Send API v3.1 expects: { Messages: [ { From: {Email, Name}, To: [{Email}], Subject, HTMLPart } ] }
  // Docs: https://api.mailjet.com/v3.1/send
  const payload = {
    Messages: [
      {
        From: {
          Email: fromEmail,
          Name: fromName
        },
        To: [
          {
            Email: to
          }
        ],
        Subject: subject,
        HTMLPart: html
      }
    ]
  };

  const res = await fetch("https://api.mailjet.com/v3.1/send", {
    method: "POST",
    headers: {
      Authorization: toBasicAuthHeader(apiKey, secretKey),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const text = await res.text();

  if (!res.ok) {
    // Keep it readable: return status + response payload
    throw new Error(`Mailjet send failed (${res.status}): ${text}`);
  }

  // Optional: you can parse JSON if you want, but not required
  // const data = JSON.parse(text);
  return;
}

module.exports = { sendEmail, baseUrl };