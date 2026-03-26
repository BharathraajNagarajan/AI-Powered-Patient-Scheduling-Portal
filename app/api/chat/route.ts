import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { PatientSession } from '@/lib/session';
import { buildSystemPrompt } from '@/lib/prompt';
import { matchDoctor, isUnsupported, getFreeSlots, reserveSlot, doctors } from '@/lib/doctors';
import { ERROR_MESSAGES } from '@/lib/errors';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req: NextRequest) {
  try {
    const { message, session, isInitial } = await req.json();

    if (!message || !session) {
      return NextResponse.json({ error: 'Missing message or session' }, { status: 400 });
    }

    console.log(`[Chat] Message from ${session.patientName}: ${message}`);

    let updatedSession: PatientSession = { ...session };
    let triggerBooking = false;

    // Step 1 — check if unsupported condition
    if (isInitial && isUnsupported(message)) {
      console.log(`[Chat] Unsupported condition detected`);
      return NextResponse.json({
        reply: ERROR_MESSAGES.noSpecialist,
        updatedSession
      });
    }

    // Step 2 — try to match doctor if not already matched
    if (!updatedSession.matchedDoctorId) {
      const matched = matchDoctor(message);
      if (matched) {
        updatedSession.matchedDoctorId = matched.id;
        updatedSession.matchedDoctorName = matched.name;
        updatedSession.matchedDoctorSpecialty = matched.specialty;
        console.log(`[Chat] Matched doctor: ${matched.name}`);
      }
    }

    // Step 3 — build available slots context with CRITICAL instruction
    let slotsContext = '';
    if (updatedSession.matchedDoctorId) {
      const freeSlots = getFreeSlots(updatedSession.matchedDoctorId);
      if (freeSlots.length > 0) {
        slotsContext = `\n\nAVAILABLE SLOTS for ${updatedSession.matchedDoctorName}:\n` +
          freeSlots.map((s, i) => `${i + 1}. ${s.datetime} [SLOT_ID:${s.id}]`).join('\n') +
          `\n\nCRITICAL INSTRUCTION: When the patient selects any slot by number or description, you MUST include this exact text in your response: SLOT_SELECTED:[the_slot_id] where the_slot_id is the actual ID from the list above. Example: if patient picks option 1, include SLOT_SELECTED:[${freeSlots[0].id}] in your reply. Never show the slot ID to the patient. This tag is required for booking to work.`;
      } else {
        slotsContext = `\n\nNo slots currently available for ${updatedSession.matchedDoctorName}.`;
      }
    }

    // Step 4 — build message history for GPT
    const systemPrompt = buildSystemPrompt(updatedSession) + slotsContext;
    const messageHistory = [
      ...session.chatTranscript.map((msg: { role: string; content: string }) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      })),
      { role: 'user' as const, content: message }
    ];

    // Step 5 — call GPT-4o
    let reply = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messageHistory
        ],
        max_tokens: 600,
        temperature: 0.7
      });
      reply = completion.choices[0]?.message?.content || ERROR_MESSAGES.generalError;
    } catch (err) {
      console.error('[Chat] OpenAI error:', err);
      return NextResponse.json({ reply: ERROR_MESSAGES.apiTimeout }, { status: 200 });
    }

    console.log(`[Chat] GPT reply preview: ${reply.substring(0, 150)}`);

    // Step 6 — check if slot was selected via SLOT_SELECTED tag
    const slotMatch = reply.match(/SLOT_SELECTED:\[([^\]]+)\]/);
    if (slotMatch) {
      const slotId = slotMatch[1];
      console.log(`[Chat] Slot tag detected: ${slotId}`);
      const reserved = reserveSlot(slotId);
      if (reserved) {
        updatedSession.selectedSlotId = slotId;
        for (const doctor of doctors) {
          const slot = doctor.slots.find(s => s.id === slotId);
          if (slot) {
            updatedSession.selectedSlotDatetime = slot.datetime;
            updatedSession.slotStatus = 'reserved';
            console.log(`[Chat] Slot reserved: ${updatedSession.selectedSlotDatetime}`);
            break;
          }
        }
      }
      // Remove hidden tag from reply shown to patient
      reply = reply.replace(/SLOT_SELECTED:\[[^\]]+\]/g, '').trim();
    }

    // Step 7 — check if patient confirmed booking
    const confirmationPhrases = [
      'yes', 'confirm', 'book it', 'that works', 'perfect',
      'sounds good', 'go ahead', 'yes please', 'correct', 'sure',
      'absolutely', 'great', 'ok', 'okay', 'yep', 'yup'
    ];
    const isConfirming = confirmationPhrases.some(phrase =>
      message.toLowerCase().trim() === phrase ||
      message.toLowerCase().includes(phrase)
    );

    if (
      isConfirming &&
      updatedSession.selectedSlotId &&
      updatedSession.slotStatus === 'reserved' &&
      updatedSession.bookingStatus !== 'confirmed'
    ) {
      triggerBooking = true;
      console.log(`[Chat] Booking trigger detected — slot: ${updatedSession.selectedSlotId}`);
    }

    // Step 8 — update transcript
    updatedSession.chatTranscript = [
      ...session.chatTranscript,
      { role: 'user', content: message, timestamp: new Date().toISOString() },
      { role: 'assistant', content: reply, timestamp: new Date().toISOString() }
    ];
    updatedSession.updatedAt = new Date().toISOString();

    return NextResponse.json({
      reply,
      updatedSession,
      triggerBooking
    });

  } catch (error: unknown) {
    console.error('[Chat] Error:', error);
    return NextResponse.json({ reply: ERROR_MESSAGES.generalError }, { status: 200 });
  }
}
