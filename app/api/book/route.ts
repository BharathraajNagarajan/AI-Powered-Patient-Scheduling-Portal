import { NextRequest, NextResponse } from 'next/server';
import { PatientSession } from '@/lib/session';
import { bookSlot, getSlotById } from '@/lib/doctors';
import { generateBookingId } from '@/lib/session';
import { validateIntakeForm } from '@/lib/validation';
import { ERROR_MESSAGES } from '@/lib/errors';

export async function POST(req: NextRequest) {
  try {
    const { session } = await req.json();

    if (!session) {
      return NextResponse.json({ error: 'Missing session' }, { status: 400 });
    }

    console.log(`[Book] Booking request from ${session.patientName}`);

    // Step 1 — idempotency check
    if (session.bookingStatus === 'confirmed') {
      console.log(`[Book] Already confirmed — booking ID: ${session.bookingId}`);
      return NextResponse.json({
        success: true,
        updatedSession: session,
        message: 'Already confirmed'
      });
    }

    // Step 2 — validate all required fields
    const validation = validateIntakeForm({
      patientName: session.patientName,
      dob: session.dob,
      phone: session.phone,
      email: session.email,
      chiefComplaint: session.chiefComplaint
    });

    if (!validation.valid) {
      console.log(`[Book] Validation failed:`, validation.errors);
      return NextResponse.json({
        success: false,
        error: ERROR_MESSAGES.invalidInput
      }, { status: 400 });
    }

    // Step 3 — check slot exists and is available
    if (!session.selectedSlotId) {
      return NextResponse.json({
        success: false,
        error: 'No slot selected'
      }, { status: 400 });
    }

    const slotInfo = getSlotById(session.selectedSlotId);
    if (!slotInfo) {
      return NextResponse.json({
        success: false,
        error: ERROR_MESSAGES.noSlots
      }, { status: 400 });
    }

    // Step 4 — mark slot as booked (deterministic — app owns state)
    const booked = bookSlot(session.selectedSlotId);
    if (!booked) {
      console.log(`[Book] Slot already taken: ${session.selectedSlotId}`);
      return NextResponse.json({
        success: false,
        error: ERROR_MESSAGES.duplicateBooking
      }, { status: 409 });
    }

    // Step 5 — generate booking ID
    const bookingId = generateBookingId();
    console.log(`[Book] Booking confirmed — ID: ${bookingId}`);

    // Step 6 — update session
    const updatedSession: PatientSession = {
      ...session,
      bookingStatus: 'confirmed',
      bookingId,
      slotStatus: 'booked',
      updatedAt: new Date().toISOString()
    };

    // Step 7 — fire email async (non-blocking)
    sendConfirmationEmail(updatedSession).catch(err => {
      console.error('[Book] Email failed (non-blocking):', err);
    });

    // Step 8 — fire SMS async if opted in (non-blocking)
    if (updatedSession.smsOptIn) {
      sendConfirmationSMS(updatedSession).catch(err => {
        console.error('[Book] SMS failed (non-blocking):', err);
      });
    }

    return NextResponse.json({
      success: true,
      updatedSession,
      bookingId
    });

  } catch (error) {
    console.error('[Book] Error:', error);
    return NextResponse.json({
      success: false,
      error: ERROR_MESSAGES.generalError
    }, { status: 500 });
  }
}

// Non-blocking email helper
async function sendConfirmationEmail(session: PatientSession) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session })
    });
    const data = await response.json();
    console.log(`[Book] Email result:`, data.success ? 'sent' : 'failed');
  } catch (err) {
    console.error('[Book] Email error:', err);
  }
}

// Non-blocking SMS helper
async function sendConfirmationSMS(session: PatientSession) {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session })
    });
    const data = await response.json();
    console.log(`[Book] SMS result:`, data.success ? 'sent' : 'failed');
  } catch (err) {
    console.error('[Book] SMS error:', err);
  }
}