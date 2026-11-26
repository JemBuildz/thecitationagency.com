import nodemailer from "nodemailer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function getEnv(key) {
  if (typeof Netlify !== "undefined" && Netlify.env) {
    return Netlify.env.get(key);
  }
  return process.env[key];
}

function cleanHeader(str, maxLen = 120) {
  return String(str ?? "")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function cleanBody(str, maxLen = 2000) {
  return String(str ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export default async (req, context) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request payload." }, 400);
  }

  if (body && String(body.website || "").trim() !== "") {
    return jsonResponse({
      ok: true,
      message: "Thanks! Your message has been received.",
    });
  }

  const name = cleanHeader(body?.name, 120);
  const email = cleanHeader(body?.email, 160);
  const businessName = cleanHeader(body?.businessName, 120);
  const phone = cleanHeader(body?.phone, 40);
  const topic = cleanHeader(body?.topic || "General Inquiry", 80);
  const message = cleanBody(body?.message, 2000);

  if (name.length < 2) {
    return jsonResponse({ error: "Please enter your name." }, 400);
  }
  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ error: "Please enter a valid email address." }, 400);
  }
  if (message.length < 5) {
    return jsonResponse({ error: "Please enter a brief message." }, 400);
  }

  const smtpHost = cleanHeader(getEnv("ZOHO_SMTP_HOST") || "smtp.zoho.com", 120);
  const smtpPort = Number(getEnv("ZOHO_SMTP_PORT") || 465);
  const smtpUser = cleanHeader(getEnv("ZOHO_SMTP_USER"), 160);
  const smtpPass = getEnv("ZOHO_SMTP_PASS");
  const toEmail = cleanHeader(
    getEnv("CONTACT_TO_EMAIL") || smtpUser || "contact@thecitationagency.com",
    160
  );

  if (!smtpUser || !smtpPass) {
    console.error("Contact form error: Missing ZOHO_SMTP_USER or ZOHO_SMTP_PASS env var.");
    return jsonResponse(
      {
        error:
          "Email delivery is not configured yet. Please email contact@thecitationagency.com directly.",
      },
      503
    );
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: Number.isFinite(smtpPort) ? smtpPort : 465,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  const subjectTarget = businessName ? `${businessName} (${name})` : name;
  const subject = `[The Citation Agency] ${topic} — ${subjectTarget}`;
  const submittedAt = new Date().toISOString();
  const senderIp = context?.ip || "unknown";

  const textLines = [
    "New contact form submission from The Citation Agency (thecitationagency.com)",
    "",
    `Topic: ${topic}`,
    `Name: ${name}`,
    `Email: ${email}`,
    businessName ? `Business: ${businessName}` : null,
    phone ? `Phone: ${phone}` : null,
    "",
    "Message:",
    message,
    "",
    `Submitted: ${submittedAt}`,
    `IP: ${senderIp}`,
  ].filter((line) => line !== null);

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #102A43; max-width: 600px;">
      <h2 style="margin: 0 0 12px; font-size: 18px; color: #102A43;">New Inquiry — The Citation Agency</h2>
      <table style="border-collapse: collapse; width: 100%; margin-bottom: 16px; font-size: 14px;">
        <tr><td style="padding: 6px 10px; font-weight: 600; color: #526271; width: 120px;">Topic</td><td style="padding: 6px 10px;">${escapeHtml(topic)}</td></tr>
        <tr><td style="padding: 6px 10px; font-weight: 600; color: #526271;">Name</td><td style="padding: 6px 10px;">${escapeHtml(name)}</td></tr>
        <tr><td style="padding: 6px 10px; font-weight: 600; color: #526271;">Email</td><td style="padding: 6px 10px;"><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
        ${businessName ? `<tr><td style="padding: 6px 10px; font-weight: 600; color: #526271;">Business</td><td style="padding: 6px 10px;">${escapeHtml(businessName)}</td></tr>` : ""}
        ${phone ? `<tr><td style="padding: 6px 10px; font-weight: 600; color: #526271;">Phone</td><td style="padding: 6px 10px;">${escapeHtml(phone)}</td></tr>` : ""}
      </table>
      <div style="padding: 14px; background: #F7F4EE; border: 1px solid #D9E0E5; border-radius: 8px; white-space: pre-wrap; font-size: 14px; line-height: 1.5;">${escapeHtml(message)}</div>
      <p style="margin-top: 14px; font-size: 12px; color: #526271;">Submitted ${escapeHtml(submittedAt)} from thecitationagency.com (IP: ${escapeHtml(senderIp)})</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"The Citation Agency" <${smtpUser}>`,
      to: toEmail,
      replyTo: `"${name.replace(/"/g, "")}" <${email}>`,
      subject,
      text: textLines.join("\n"),
      html: htmlBody,
    });

    return jsonResponse({
      ok: true,
      message:
        "Message sent! The Citation Agency received your inquiry and will reply within 1 business day.",
    });
  } catch (err) {
    console.error("Zoho SMTP send error:", err?.message || err);
    return jsonResponse(
      {
        error:
          "Unable to send message right now. Please email contact@thecitationagency.com directly.",
      },
      500
    );
  }
};
