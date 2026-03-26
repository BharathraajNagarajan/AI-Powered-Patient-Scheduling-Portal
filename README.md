# Kyron Medical — Patient AI Scheduling Portal

> Built for Kyron Medical SWE Interview Round — March 2026

## Overview

A patient-facing web application that allows users to schedule medical appointments through an intelligent AI chat interface. Patients are guided through intake, matched to the right specialist, offered available time slots, and receive confirmation via email and SMS. The app includes a seamless handoff from web chat to voice AI — the same AI picks up the phone call with full context from the conversation.

## Live Demo

🌐 **[https://kyron-patient-portal.com](https://kyron-patient-portal.com)**

## Features

### Core (Layer A)
- **AI patient intake** — collects name, DOB, phone, email, reason for visit
- **Semantic doctor matching** — matches complaint to the right specialist automatically
- **Flexible scheduling** — handles natural language ("do you have a Tuesday?")
- **Appointment booking** — deterministic booking logic with duplicate prevention
- **Email confirmation** — beautiful HTML email with booking details via Resend
- **Voice call handoff** — "Call me instead" button triggers Vapi call with full chat context retained
- **Safety guardrails** — AI refuses medical advice, redirects emergencies to 911
- **Liquid glass UI** — Kyron Medical colors, animations, cutting-edge feel
- **Input validation** — frontend + backend validation on all fields
- **localStorage persistence** — session survives page refresh

### Bonus (Layer B)
- **Returning caller memory** — AI remembers previous conversations when patient calls back
- **SMS confirmation** — opt-in text confirmation via Twilio (toll-free verification pending)
- **Prescription refill workflow** — AI handles refill requests conversationally
- **Debug panel** — hidden at `?debug=true` for demo safety

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 16 + Tailwind CSS | Fast, full-stack, React-based |
| AI Brain | OpenAI GPT-4o | Best instruction-following for structured medical workflows |
| Voice AI | Vapi.ai | End-to-end voice platform — no custom voice stack needed |
| Email | Resend | Simple API, beautiful HTML emails, reliable delivery |
| SMS | Twilio | Industry standard for SMS — opt-in confirmation |
| Hosting | AWS EC2 t3.micro | Required by Kyron — free tier, Ubuntu 22.04 |
| Web Server | Nginx + PM2 | Reverse proxy + 24/7 process management |
| SSL | Let's Encrypt (Certbot) | Free HTTPS — auto-renewing certificate |
| Domain | Namecheap | kyron-patient-portal.com |

## Architecture
```
Patient Browser
      ↓ HTTPS
Nginx (port 443)
      ↓ proxy
Next.js App (port 3000) ← PM2 keeps running 24/7
      ↓
┌─────────────────────────────────┐
│  App Code owns booking state    │
│  GPT-4o owns conversation tone  │
└─────────────────────────────────┘
      ↓              ↓          ↓
  OpenAI API    Vapi.ai    Resend/Twilio
```

**Key architectural decision:** App code handles all booking logic deterministically (slot lookup, reservation, duplicate prevention). GPT-4o handles only natural language understanding and response tone. This separation prevents LLM hallucinations from affecting booking state.

## 4 Doctors (Hard-coded for demo)

| Doctor | Specialty | Treats |
|---|---|---|
| Dr. Anand Subramaniam | Orthopedics | Knee, joint, bone, back, spine, hip, shoulder |
| Dr. Mei-Lin Cho | Cardiology | Heart, chest, blood pressure, palpitations |
| Dr. Camila Reyes | Dermatology | Skin, rash, acne, eczema, psoriasis |
| Dr. James Whitfield | Gastroenterology | Stomach, digestive, bowel, acid reflux, IBS |

## Setup & Run Locally
```bash
# Clone the repo
git clone https://github.com/BharathraajNagarajan/kyron-medical.git
cd kyron-medical

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
# Fill in your API keys

# Run locally
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Variables
```
OPENAI_API_KEY=
VAPI_API_KEY=
VAPI_PUBLIC_KEY=
VAPI_PHONE_NUMBER_ID=
VAPI_ASSISTANT_ID=
RESEND_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
NEXT_PUBLIC_VAPI_PUBLIC_KEY=
NEXT_PUBLIC_APP_URL=
```

## Demo Scenarios

| Scenario | Input | Expected Output |
|---|---|---|
| A — Booking | "my knee has been hurting" | Orthopedic matched → slots offered → book → email |
| B — Unsupported | "my eye hurts" | "We don't treat that condition" |
| C — Safety | "what medication should I take?" | Refuses, redirects to doctor |
| D — Voice | Click "Call me instead" | Phone rings, AI continues with full context |

## Known Limitations

- Provider schedules are hardcoded for demo purposes — no live calendar integration
- No persistent production database — conversation memory uses file-based JSON store
- No PHI (Protected Health Information) compliance — not for real patient use
- Voice memory is session-based — not a distributed persistent store
- No EHR (Electronic Health Record) integration
- Twilio SMS requires toll-free number verification — pending carrier approval
- No patient authentication layer

## Future Improvements

- Live calendar integration with physician scheduling systems
- HIPAA-compliant data storage and encryption
- EHR integration (Epic, Cerner)
- Multi-practice support
- Patient authentication and medical history
- Real-time slot availability sync
- Multi-language support

## Built By

Bharathraaj Nagarajan — [bharathraajnagarajan@gmail.com](mailto:bharathraajnagarajan@gmail.com)
