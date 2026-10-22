import { Resend } from "resend";
import twilio from "twilio";
import { log } from "./log";
import { officeInfo } from "./office-info";

export interface BookingNotice {
  patientName: string;
  email: string;
  phone: string;
  chiefComplaint: string;
  providerName: string;
  specialty: string;
  label: string;
  bookingId: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const labelStyle =
  "color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;";

function row(label: string, value: string, valueStyle: string, last = false, sub = ""): string {
  const border = last ? "" : "border-bottom:1px solid rgba(255,255,255,0.08);";
  return `<tr><td style="padding:12px 0;${border}">
<p style="${labelStyle}">${escapeHtml(label)}</p>
<p style="${valueStyle}">${escapeHtml(value)}</p>${sub}
</td></tr>`;
}

export function buildEmailHtml(notice: BookingNotice): string {
  const clinic = escapeHtml(officeInfo.name);
  const strong = "color:white;font-size:16px;font-weight:600;margin:0;";
  const specialtyLine = `<p style="color:rgba(255,255,255,0.5);font-size:14px;margin:2px 0 0;">${escapeHtml(notice.specialty)}</p>`;
  const parkingLine = `<p style="color:rgba(255,255,255,0.5);font-size:14px;margin:4px 0 0;">${escapeHtml(officeInfo.parking)}</p>`;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Appointment Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#0a1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<div style="display:inline-block;background:linear-gradient(135deg,#0891b2,#38bdf8);padding:12px 24px;border-radius:12px;margin-bottom:16px;">
<span style="color:white;font-size:22px;font-weight:700;">${clinic}</span>
</div>
<h1 style="color:white;font-size:24px;font-weight:700;margin:0;">Appointment Confirmed</h1>
<p style="color:rgba(255,255,255,0.5);margin-top:8px;font-size:15px;">We look forward to seeing you</p>
</div>
<div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:32px;margin-bottom:24px;">
<div style="text-align:center;margin-bottom:28px;padding:16px;background:rgba(8,145,178,0.15);border:1px solid rgba(8,145,178,0.3);border-radius:10px;">
<p style="color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Booking ID</p>
<p style="color:#38bdf8;font-size:24px;font-weight:700;margin:0;letter-spacing:0.05em;">${escapeHtml(notice.bookingId)}</p>
</div>
<table style="width:100%;border-collapse:collapse;">
${row("Patient", notice.patientName, strong)}
${row("Doctor", notice.providerName, strong, false, specialtyLine)}
${row("Date and time", notice.label, "color:#38bdf8;font-size:16px;font-weight:600;margin:0;")}
${row("Reason for visit", notice.chiefComplaint, "color:white;font-size:15px;margin:0;")}
${row("Location", officeInfo.address, "color:white;font-size:15px;margin:0;", true, parkingLine)}
</table>
</div>
<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
<h3 style="color:white;font-size:15px;font-weight:600;margin:0 0 12px;">Contact Us</h3>
<p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 6px;">Phone: ${escapeHtml(officeInfo.phone)}</p>
<p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 6px;">Email: ${escapeHtml(officeInfo.email)}</p>
<p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0;">Hours: ${escapeHtml(officeInfo.hoursFormatted)}</p>
</div>
<div style="text-align:center;padding:16px;">
<p style="color:rgba(255,255,255,0.25);font-size:12px;line-height:1.6;margin:0;">
This is an automated confirmation from the ${clinic} AI-Powered Patient Scheduling Portal.<br>
For emergencies, call <strong style="color:rgba(255,255,255,0.4);">911</strong> immediately.<br>
This system does not provide medical advice.
</p>
</div>
</div>
</body>
</html>`;
}

export function buildSmsBody(notice: BookingNotice): string {
  return `${officeInfo.name}: Appt confirmed with ${notice.providerName} on ${notice.label}. Booking ID: ${notice.bookingId}. Call ${officeInfo.phone} for help.`;
}

export function senderAddress(): string {
  return process.env.RESEND_FROM || `${officeInfo.name} <onboarding@resend.dev>`;
}

export async function sendBookingEmail(notice: BookingNotice): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log("warn", "email_skipped", { reason: "RESEND_API_KEY not set" });
    return null;
  }
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from: senderAddress(),
    to: [notice.email],
    subject: `Appointment Confirmed - ${notice.providerName} - Booking ${notice.bookingId}`,
    html: buildEmailHtml(notice),
  });
  if (error) throw new Error(error.message);
  log("info", "email_sent", { emailId: data?.id, email: notice.email });
  return data?.id ?? null;
}

export async function sendBookingSms(notice: BookingNotice): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) {
    log("warn", "sms_skipped", { reason: "Twilio credentials not set" });
    return;
  }
  const message = await twilio(sid, token).messages.create({
    body: buildSmsBody(notice),
    from,
    to: notice.phone,
  });
  log("info", "sms_sent", { messageSid: message.sid, phone: notice.phone });
}
