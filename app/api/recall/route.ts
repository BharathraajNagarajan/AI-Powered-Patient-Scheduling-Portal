import { NextRequest, NextResponse } from 'next/server';
import { getConversation, buildRecallGreeting } from '@/lib/memory';

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone) {
      return NextResponse.json({ found: false, error: 'Missing phone number' }, { status: 400 });
    }
    const stored = getConversation(phone);
    if (!stored) {
      return NextResponse.json({ found: false });
    }
    const greeting = buildRecallGreeting(stored);
    return NextResponse.json({
      found: true,
      patientName: stored.patientName,
      greeting,
      lastSession: stored.lastSession,
      callCount: stored.callCount,
      lastUpdated: stored.lastUpdated
    });
  } catch (error) {
    console.error('[Recall] Error:', error);
    return NextResponse.json({ found: false, error: 'Recall failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');
    if (!phone) {
      return NextResponse.json({ found: false }, { status: 400 });
    }
    const stored = getConversation(phone);
    if (!stored) {
      return NextResponse.json({ found: false });
    }
    const greeting = buildRecallGreeting(stored);
    return NextResponse.json({
      found: true,
      patientName: stored.patientName,
      greeting,
      callCount: stored.callCount
    });
  } catch (error) {
    console.error('[Recall] GET Error:', error);
    return NextResponse.json({ found: false }, { status: 500 });
  }
}
