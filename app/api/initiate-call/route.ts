import { NextRequest, NextResponse } from 'next/server';
import { PatientSession, generateVoiceSummary } from '@/lib/session';
import { saveConversation } from '@/lib/memory';
import { ERROR_MESSAGES } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const { session }: { session: PatientSession } = await req.json();

    if (!session || !session.phone) {
      return NextResponse.json({ success: false, error: 'Missing session or phone' }, { status: 400 });
    }

    console.log(`[Call] Initiating call to ${session.phone} for ${session.patientName}`);

    // Step 1 — generate voice summary
    const voiceSummary = generateVoiceSummary(session);
    console.log(`[Call] Voice summary: ${voiceSummary}`);

    // Step 2 — save to memory for returning caller
    saveConversation(session.phone, session);

    // Step 3 — build first message based on booking status
    const firstName = session.patientName.split(' ')[0];
    let firstMessage = '';

    if (session.bookingStatus === 'confirmed') {
      firstMessage = `Hi ${firstName}, this is Aria calling from Kyron Medical. I'm continuing from our web chat — your appointment with ${session.matchedDoctorName} on ${session.selectedSlotDatetime} is confirmed. Your booking ID is ${session.bookingId}. Is there anything else I can help you with today?`;
    } else if (session.matchedDoctorName) {
      firstMessage = `Hi ${firstName}, this is Aria calling from Kyron Medical. I'm continuing from our chat — we were working on scheduling an appointment with ${session.matchedDoctorName} for your ${session.chiefComplaint}. Shall we continue?`;
    } else {
      firstMessage = `Hi ${firstName}, this is Aria calling from Kyron Medical. I'm continuing from our web chat about your ${session.chiefComplaint}. How can I help you today?`;
    }

    // Step 4 — call Vapi using saved assistant ID
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let vapiResponse;
    try {
      vapiResponse = await fetch('https://api.vapi.ai/call/phone', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
          assistantId: process.env.VAPI_ASSISTANT_ID,
          assistantOverrides: {
            firstMessage,
            variableValues: {
              patientName: session.patientName,
              chiefComplaint: session.chiefComplaint,
              doctorName: session.matchedDoctorName || '',
              specialty: session.matchedDoctorSpecialty || '',
              slotDatetime: session.selectedSlotDatetime || '',
              bookingId: session.bookingId || '',
              bookingStatus: session.bookingStatus,
              voiceSummary
            }
          },
          customer: {
            number: formatPhone(session.phone),
            name: session.patientName
          }
        }),
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!vapiResponse.ok) {
      const errorData = await vapiResponse.json().catch(() => ({}));
      console.error('[Call] Vapi error:', errorData);
      return NextResponse.json({
        success: false,
        error: ERROR_MESSAGES.callFailed
      }, { status: 500 });
    }

    const callData = await vapiResponse.json();
    console.log(`[Call] Vapi call initiated — ID: ${callData.id}`);

    return NextResponse.json({
      success: true,
      callId: callData.id,
      message: 'Call initiated successfully'
    });

  } catch (error) {
    console.error('[Call] Error:', error);
    return NextResponse.json({
      success: false,
      error: ERROR_MESSAGES.callFailed
    }, { status: 500 });
  }
}

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (!phone.startsWith('+')) return `+${digits}`;
  return phone;
}
