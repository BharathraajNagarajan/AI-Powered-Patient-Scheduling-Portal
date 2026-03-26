import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { PatientSession } from '@/lib/session';
import { officeInfo } from '@/lib/office-info';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

export async function POST(req: NextRequest) {
  try {
    const { session }: { session: PatientSession } = await req.json();

    if (!session || !session.phone) {
      return NextResponse.json({ success: false, error: 'Missing session or phone' }, { status: 400 });
    }

    if (!session.smsOptIn) {
      console.log(`[SMS] Patient did not opt in — skipping`);
      return NextResponse.json({ success: true, skipped: true });
    }

    console.log(`[SMS] Sending confirmation to ${session.phone}`);

    const messageBody = buildSMSBody(session);

    const message = await client.messages.create({
      body: messageBody,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: session.phone
    });

    console.log(`[SMS] Sent successfully — SID: ${message.sid}`);
    return NextResponse.json({ success: true, messageSid: message.sid });

  } catch (error) {
    console.error('[SMS] Error:', error);
    return NextResponse.json({ success: false, error: 'SMS failed' }, { status: 500 });
  }
}

function buildSMSBody(session: PatientSession): string {
  return `Kyron Medical — Appointment Confirmed!

Patient: ${session.patientName}
Doctor: ${session.matchedDoctorName} (${session.matchedDoctorSpecialty})
When: ${session.selectedSlotDatetime}
Booking ID: ${session.bookingId}

Location: ${officeInfo.address}
Questions? Call us: ${officeInfo.phone}

Reply STOP to opt out.`.trim();
}