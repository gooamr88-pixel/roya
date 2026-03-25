// ═══════════════════════════════════════════════
// Email Service — Professional HTML Templates
// ═══════════════════════════════════════════════
const nodemailer = require('nodemailer');
const config = require('../config');
const { escapeHtml } = require('../utils/helpers');
const logger = require('../utils/logger');

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  secure: config.email.port === 465,
  auth: {
    user: config.email.user,
    pass: config.email.pass,
  },
});

// ══════════════════════════════════════════
//  SHARED TEMPLATE COMPONENTS
// ══════════════════════════════════════════
const BRAND_COLOR = '#1a365d'; // Deep professional blue
const ACCENT_COLOR = '#d4af37'; // Roya gold
const LOGO_URL = ''; // Placeholder — replace with actual hosted logo URL

function baseLayout(content, direction = 'ltr') {
  return `
<!DOCTYPE html>
<html lang="${direction === 'rtl' ? 'ar' : 'en'}" dir="${direction}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roya Platform</title>
</head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;direction:${direction};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg, ${BRAND_COLOR} 0%, #2d4a7a 100%);padding:32px 40px;text-align:center;">
            ${LOGO_URL
      ? `<img src="${LOGO_URL}" alt="Roya" style="height:48px;margin-bottom:12px;">`
      : `<div style="font-size:28px;font-weight:800;color:#ffffff;letter-spacing:2px;">ROYA</div>`
    }
            <div style="color:${ACCENT_COLOR};font-size:12px;letter-spacing:3px;text-transform:uppercase;margin-top:6px;">Professional Business Solutions</div>
          </td>
        </tr>

        <!-- CONTENT -->
        <tr>
          <td style="padding:40px;">
            ${content}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f8f9fb;padding:28px 40px;border-top:1px solid #e8ecf1;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center;">
                  <div style="margin-bottom:12px;">
                    <a href="#" style="display:inline-block;width:32px;height:32px;background:${BRAND_COLOR};color:#fff;border-radius:50%;text-align:center;line-height:32px;text-decoration:none;margin:0 4px;font-size:14px;">𝕏</a>
                    <a href="#" style="display:inline-block;width:32px;height:32px;background:${BRAND_COLOR};color:#fff;border-radius:50%;text-align:center;line-height:32px;text-decoration:none;margin:0 4px;font-size:14px;">in</a>
                    <a href="#" style="display:inline-block;width:32px;height:32px;background:${BRAND_COLOR};color:#fff;border-radius:50%;text-align:center;line-height:32px;text-decoration:none;margin:0 4px;font-size:14px;">ig</a>
                  </div>
                  <p style="margin:0;font-size:12px;color:#8895a7;">© ${new Date().getFullYear()} Roya Platform. All rights reserved.</p>
                  <p style="margin:6px 0 0;font-size:11px;color:#a0aec0;">Badr City, Cairo Governorate, Egypt | support@roya.com</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ══════════════════════════════════════════
//  OTP VERIFICATION EMAIL
// ══════════════════════════════════════════
const sendOTP = async (to, name, otp) => {
  try {
    // FIX (CRITICAL-1): Escape user-supplied `name` to prevent XSS
    const safeName = escapeHtml(name);
    const safeOtp = escapeHtml(otp);

    const content = `
      <div style="text-align:center;margin-bottom:28px;">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg, ${BRAND_COLOR}, #2d4a7a);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:28px;">🔐</span>
        </div>
        <h1 style="margin:0;font-size:24px;color:#1a202c;font-weight:700;">Verify Your Email</h1>
        <p style="margin:8px 0 0;font-size:15px;color:#64748b;">Hello <strong>${safeName || 'there'}</strong>, enter the code below to verify your account.</p>
      </div>

      <div style="background:#f0f4ff;border:2px dashed ${BRAND_COLOR};border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#64748b;margin-bottom:8px;">Your Verification Code</div>
        <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:${BRAND_COLOR};font-family:monospace;">${safeOtp}</div>
      </div>

      <div style="text-align:center;margin:24px 0;">
        <p style="font-size:13px;color:#94a3b8;margin:0;">This code expires in <strong>10 minutes</strong>.</p>
        <p style="font-size:13px;color:#94a3b8;margin:4px 0 0;">If you didn't request this, you can safely ignore this email.</p>
      </div>

      <div style="text-align:center;margin-top:28px;">
        <div style="display:inline-block;border-top:1px solid #e2e8f0;padding-top:16px;">
          <p style="font-size:12px;color:#a0aec0;margin:0;">Need help? Contact us at <a href="mailto:support@roya.com" style="color:${BRAND_COLOR};text-decoration:none;">support@roya.com</a></p>
        </div>
      </div>
    `;

    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: '🔐 Roya — Email Verification Code',
      html: baseLayout(content),
    });
    return true;
  } catch (err) {
    logger.error('Email send error', { error: err.message });
    // FIX (BUG-2): Throw the error so the caller knows sending failed,
    // instead of silently returning null and telling the user "OTP sent"
    throw err;
  }
};

// ══════════════════════════════════════════
//  PASSWORD RESET EMAIL
// ══════════════════════════════════════════
const sendPasswordReset = async (to, name, otp) => {
  try {
    const safeName = escapeHtml(name);
    const safeOtp = escapeHtml(otp);

    const content = `
      <div style="text-align:center;margin-bottom:28px;">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg, #e53e3e, #c53030);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:28px;">🔑</span>
        </div>
        <h1 style="margin:0;font-size:24px;color:#1a202c;font-weight:700;">Reset Your Password</h1>
        <p style="margin:8px 0 0;font-size:15px;color:#64748b;">Hello <strong>${safeName || 'there'}</strong>, we received a request to reset your password.</p>
      </div>

      <div style="background:#f0f4ff;border:2px dashed ${BRAND_COLOR};border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#64748b;margin-bottom:8px;">Your Reset Code</div>
        <div style="font-size:36px;font-weight:800;letter-spacing:12px;color:${BRAND_COLOR};font-family:monospace;">${safeOtp}</div>
      </div>

      <div style="background:#fff5f5;border-left:4px solid #e53e3e;border-radius:6px;padding:14px 18px;margin:24px 0;">
        <p style="margin:0;font-size:13px;color:#c53030;">⚠️ This code expires in <strong>10 minutes</strong>. If you didn't request a reset, please ignore this email and your password will remain unchanged.</p>
      </div>
    `;

    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: '🔑 Roya — Password Reset Request',
      html: baseLayout(content),
    });
    return true;
  } catch (err) {
    logger.error('Email send error', { error: err.message });
    throw err;
  }
};

// ══════════════════════════════════════════
//  INVOICE EMAIL
// ══════════════════════════════════════════
const sendInvoice = async (to, name, invoiceNumber, pdfBuffer) => {
  try {
    const safeName = escapeHtml(name);
    const safeInvoice = escapeHtml(invoiceNumber);

    const content = `
      <div style="text-align:center;margin-bottom:28px;">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg, #38a169, #2f855a);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:28px;">📄</span>
        </div>
        <h1 style="margin:0;font-size:24px;color:#1a202c;font-weight:700;">Invoice Ready</h1>
        <p style="margin:8px 0 0;font-size:15px;color:#64748b;">Hello <strong>${safeName || 'there'}</strong>, your invoice <strong>#${safeInvoice}</strong> is attached.</p>
      </div>

      <div style="background:#f0fff4;border:1px solid #c6f6d5;border-radius:10px;padding:20px;text-align:center;margin:24px 0;">
        <div style="font-size:13px;color:#38a169;font-weight:600;">✓ Invoice #${safeInvoice}</div>
        <p style="font-size:12px;color:#68d391;margin:4px 0 0;">Please find your invoice attached as a PDF document.</p>
      </div>

      <div style="text-align:center;">
        <p style="font-size:13px;color:#94a3b8;">Thank you for choosing <strong style="color:${BRAND_COLOR};">Roya Platform</strong>.</p>
      </div>
    `;

    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: `📄 Roya — Invoice #${safeInvoice}`,
      html: baseLayout(content),
      attachments: pdfBuffer ? [{
        filename: `invoice-${invoiceNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }] : [],
    });
    return true;
  } catch (err) {
    logger.error('Email send error', { error: err.message });
    return null;
  }
};

// ══════════════════════════════════════════
//  ADMIN REPLY TO CONTACT — RTL SUPPORT
// ══════════════════════════════════════════
const sendContactReply = async ({ to, name, originalSubject, originalMessage, replyMessage }) => {
  try {
    // FIX (CRITICAL-1): Escape all user-supplied values
    const safeName = escapeHtml(name);
    const safeSubject = escapeHtml(originalSubject);
    const safeOriginal = escapeHtml(originalMessage);
    const safeReply = escapeHtml(replyMessage);

    // Detect if reply is likely Arabic (contains Arabic characters)
    const isArabic = /[\u0600-\u06FF]/.test(replyMessage);
    const dir = isArabic ? 'rtl' : 'ltr';
    const textAlign = isArabic ? 'right' : 'left';

    const content = `
      <div style="text-align:center;margin-bottom:28px;">
        <h1 style="margin:0;font-size:22px;color:#1a202c;font-weight:700;">Official Response from Roya</h1>
        <p style="margin:8px 0 0;font-size:15px;color:#64748b;">Regarding: <em>${safeSubject}</em></p>
      </div>

      <!-- ADMIN REPLY -->
      <div style="background:#f0f4ff;border-left:4px solid ${BRAND_COLOR};border-radius:8px;padding:20px 24px;margin:20px 0;direction:${dir};text-align:${textAlign};">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:${BRAND_COLOR};font-weight:700;margin-bottom:10px;">📩 Official Response</div>
        <p style="margin:0;font-size:15px;line-height:1.7;color:#2d3748;">${safeReply.replace(/\n/g, '<br>')}</p>
      </div>

      <!-- ORIGINAL MESSAGE -->
      <div style="background:#f7fafc;border:1px solid #e2e8f0;border-radius:8px;padding:18px 22px;margin:20px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#94a3b8;font-weight:600;margin-bottom:8px;">💬 Your Original Message</div>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#718096;font-style:italic;">${safeOriginal.replace(/\n/g, '<br>')}</p>
      </div>

      <div style="text-align:center;margin-top:28px;">
        <p style="font-size:13px;color:#64748b;">Dear <strong>${safeName}</strong>, thank you for reaching out to us.</p>
        <p style="font-size:12px;color:#a0aec0;margin-top:4px;">If you have further questions, simply reply to this email.</p>
      </div>
    `;

    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: `📩 Re: ${safeSubject} — Roya Platform`,
      html: baseLayout(content, dir),
      replyTo: config.email.from,
    });
    return true;
  } catch (err) {
    logger.error('Email send error', { error: err.message });
    return null;
  }
};

// ══════════════════════════════════════════
//  ORDER CANCELLATION / DELETION EMAIL
// ══════════════════════════════════════════
const sendOrderCancellation = async (to, name, invoiceNumber, serviceTitle, reason) => {
  try {
    const safeName = escapeHtml(name);
    const safeInvoice = escapeHtml(invoiceNumber);
    const safeService = escapeHtml(serviceTitle);
    const safeReason = escapeHtml(reason);

    const content = `
      <div style="text-align:center;margin-bottom:28px;">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg, #e53e3e, #c53030);margin:0 auto 16px;display:flex;align-items:center;justify-content:center;">
          <span style="font-size:28px;">⚠️</span>
        </div>
        <h1 style="margin:0;font-size:24px;color:#1a202c;font-weight:700;">Order Removed</h1>
        <p style="margin:8px 0 0;font-size:15px;color:#64748b;">Hello <strong>${safeName || 'there'}</strong>, your order has been removed by an administrator.</p>
      </div>

      <div style="background:#fff5f5;border:1px solid #fed7d7;border-radius:10px;padding:20px;margin:24px 0;">
        <table style="width:100%;font-size:14px;color:#2d3748;">
          <tr><td style="padding:6px 0;color:#718096;">Invoice:</td><td style="padding:6px 0;font-weight:600;">#${safeInvoice}</td></tr>
          <tr><td style="padding:6px 0;color:#718096;">Service:</td><td style="padding:6px 0;font-weight:600;">${safeService}</td></tr>
        </table>
      </div>

      ${safeReason ? `
      <div style="background:#f7fafc;border-left:4px solid #e53e3e;border-radius:6px;padding:14px 18px;margin:24px 0;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#e53e3e;font-weight:700;margin-bottom:6px;">Reason</div>
        <p style="margin:0;font-size:14px;color:#4a5568;">${safeReason}</p>
      </div>` : ''}

      <div style="text-align:center;margin-top:28px;">
        <p style="font-size:13px;color:#64748b;">If you have any questions, please contact us at <a href="mailto:support@roya.com" style="color:${BRAND_COLOR};text-decoration:none;">support@roya.com</a></p>
      </div>
    `;

    await transporter.sendMail({
      from: config.email.from,
      to,
      subject: `⚠️ Roya — Order #${safeInvoice} Removed`,
      html: baseLayout(content),
    });
    return true;
  } catch (err) {
    logger.error('Email send error', { error: err.message });
    return null;
  }
};

module.exports = { sendOTP, sendPasswordReset, sendInvoice, sendContactReply, sendOrderCancellation };
