import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { PatientSession } from '@/lib/session';
import { officeInfo } from '@/lib/office-info';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const { session }: { session: PatientSession } = await req.json();

    if (!session || !session.email) {
      return NextResponse.json({ success: false, error: 'Missing session or email' }, { status: 400 });
    }

    console.log(`[Email] Sending confirmation to ${session.email}`);

    const { data, error } = await resend.emails.send({
      from: 'Kyron Medical <onboarding@resend.dev>',
      to: [session.email],
      subject: `Appointment Confirmed — ${session.matchedDoctorName} — Booking ${session.bookingId}`,
      html: buildEmailHTML(session)
    });

    if (error) {
      console.error('[Email] Resend error:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    console.log(`[Email] Sent successfully — ID: ${data?.id}`);
    return NextResponse.json({ success: true, emailId: data?.id });

  } catch (error) {
    console.error('[Email] Error:', error);
    return NextResponse.json({ success: false, error: 'Email failed' }, { status: 500 });
  }
}

function buildEmailHTML(session: PatientSession): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Appointment Confirmation</title>
</head>
<body style="margin:0;padding:0;background:#0a1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="display:inline-block;background:linear-gradient(135deg,#0891b2,#38bdf8);padding:12px 24px;border-radius:12px;margin-bottom:16px;">
        <span style="color:white;font-size:22px;font-weight:700;">⚕ Kyron Medical</span>
      </div>
      <h1 style="color:white;font-size:24px;font-weight:700;margin:0;">
        Appointment Confirmed
      </h1>
      <p style="color:rgba(255,255,255,0.5);margin-top:8px;font-size:15px;">
        We look forward to seeing you
      </p>
    </div>

    <!-- Main card -->
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);border-radius:16px;padding:32px;margin-bottom:24px;">

      <!-- Booking ID -->
      <div style="text-align:center;margin-bottom:28px;padding:16px;background:rgba(8,145,178,0.15);border:1px solid rgba(8,145,178,0.3);border-radius:10px;">
        <p style="color:rgba(255,255,255,0.5);font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 4px;">Booking ID</p>
        <p style="color:#38bdf8;font-size:24px;font-weight:700;margin:0;letter-spacing:0.05em;">${session.bookingId}</p>
      </div>

      <!-- Details -->
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <p style="color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Patient</p>
            <p style="color:white;font-size:16px;font-weight:600;margin:0;">${session.patientName}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <p style="color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Doctor</p>
            <p style="color:white;font-size:16px;font-weight:600;margin:0;">${session.matchedDoctorName}</p>
            <p style="color:rgba(255,255,255,0.5);font-size:14px;margin:2px 0 0;">${session.matchedDoctorSpecialty}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <p style="color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Date & Time</p>
            <p style="color:#38bdf8;font-size:16px;font-weight:600;margin:0;">${session.selectedSlotDatetime}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
            <p style="color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Reason for Visit</p>
            <p style="color:white;font-size:15px;margin:0;">${session.chiefComplaint}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:12px 0;">
            <p style="color:rgba(255,255,255,0.4);font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 4px;">Location</p>
            <p style="color:white;font-size:15px;margin:0;">${officeInfo.address}</p>
            <p style="color:rgba(255,255,255,0.5);font-size:14px;margin:4px 0 0;">${officeInfo.parking}</p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Office info -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
      <h3 style="color:white;font-size:15px;font-weight:600;margin:0 0 12px;">Contact Us</h3>
      <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 6px;">📞 ${officeInfo.phone}</p>
      <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0 0 6px;">✉️ ${officeInfo.email}</p>
      <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:0;">🕐 ${officeInfo.hoursFormatted}</p>
    </div>

    <!-- Emergency notice -->
    <div style="text-align:center;padding:16px;">
      <p style="color:rgba(255,255,255,0.25);font-size:12px;line-height:1.6;margin:0;">
        This is an automated confirmation from Kyron Medical's AI Care Portal.<br>
        For emergencies, call <strong style="color:rgba(255,255,255,0.4);">911</strong> immediately.<br>
        This system does not provide medical advice.
      </p>
    </div>

  </div>
</body>
</html>
  `.trim();
}