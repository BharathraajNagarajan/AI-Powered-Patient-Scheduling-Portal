import { NextRequest, NextResponse } from 'next/server';
import { getConversation, buildRecallGreeting } from '@/lib/memory';

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();

    if (!phone) {
      return NextResponse.json({ found: false, error: 'Missing phone number' }, { status: 400 });
    }

    console.log(`[Recall] Looking up conversation for ${phone}`);

    const stored = getConversation(phone);

    if (!stored) {
      console.log(`[Recall] No previous conversation found`);
      return NextResponse.json({ found: false });
    }

    const greeting = buildRecallGreeting(stored);
    console.log(`[Recall] Found conversation for ${stored.patientName} — greeting generated`);

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
```

Press **Ctrl + S** to save.

---

Tell me when saved. That completes all API routes. Here is the full Phase 5 status:

| Route | Status |
|---|---|
| `/api/chat` | ✅ Done |
| `/api/book` | ✅ Done |
| `/api/send-email` | ✅ Done |
| `/api/send-sms` | ✅ Done |
| `/api/initiate-call` | ✅ Done — with fallback |
| `/api/recall` | ✅ Done |

**Phase 5 complete.** Now we add one small thing to `.env.local` then run the app locally for the first time. Type this in terminal:
```
code .env.local
```

Add this one line at the bottom:
```
NEXT_PUBLIC_APP_URL=http://localhost:3000