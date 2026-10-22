# AI-Powered Patient Scheduling Portal

A web app where a patient fills in a short intake form, chats with an AI receptionist, is matched to a specialist, picks an appointment time, and receives a confirmation by email and optional text message. At any point the patient can ask for a phone call, and a voice assistant continues the same conversation. The server owns all scheduling state in SQLite. The language model only writes replies and suggests an intent. Application code decides whether anything changes.

## Background

Started as a 48-hour take-home for Kyron Medical's engineering interview in March 2026, then extended independently into a production-style deployment.

## Live demo

https://kyron-patient-portal.com

The demo clinic is fictional (Harbor Health Clinic) and the four doctors are sample data.

## Features

- Three-step intake form (About you, Contact, Reason for visit) with per-step validation on the client and the server.
- Chat with an AI receptionist (GPT-4o) that answers office questions, handles refill requests, and refuses medical advice.
- Specialist matching by embedding similarity (text-embedding-3-small), with a keyword fallback.
- Clickable time slots grouped by day, with a 10 minute hold on the chosen slot and an explicit Confirm button.
- Atomic booking with a unique constraint as the final guard against double booking.
- Confirmation email (Resend) and optional text message (Twilio).
- Phone handoff (Vapi) with context from the chat, limited to once per 2 minutes and 3 times per session.
- Returning caller recall: the voice assistant can look up the last conversation for a phone number.
- Rate limiting per IP and route, structured JSON logs with masked personal data, and a health endpoint.
- A mock mode (`MOCK_LLM=true`) that needs no OpenAI key, used by the tests and the load test.

## Architecture

```
Browser
   |
   v
Nginx (TLS, rate limiting, gzip, security headers)
   |
   v
PM2 cluster (Next.js, one worker per CPU core)
   |
   +--> SQLite (WAL mode, shared by all workers)
   +--> OpenAI GPT-4o and embeddings
   +--> Vapi (outbound calls, recall webhook)
   +--> Resend (email)
   +--> Twilio (SMS)
```

## Key design decisions

**The LLM proposes and the code decides.** GPT-4o returns structured output: a reply, an intent (`select_slot`, `confirm_booking`, `change_slot`, `ask_info`, `refill`, `other`), and a slot number. The model sees free slots as a numbered list and never sees slot ids. The server maps the number to a real slot, checks that it belongs to the matched provider and is free, then reserves it. A booking happens only when the intent is `confirm_booking` and the session holds an unexpired reservation. Replies that report a hold or a booking are written by the server, so the model cannot claim something that did not happen.

**Atomic slot reservation with expiry.** Reserving is a single `UPDATE` that succeeds only if the slot is free or its previous hold has expired. A hold lasts 10 minutes. Choosing another slot releases the previous one. Booking runs in one transaction that checks the hold, marks the slot booked, and inserts a row into `bookings`, where unique constraints on `session_id` and `slot_id` are the last line of defense. A conflict returns HTTP 409, and confirming twice is idempotent.

**Server-owned session.** The browser stores only a session id. Patient details, the matched provider, the selected slot, the booking status, and the transcript live in SQLite. Requests carry the session id and nothing else, so a client cannot forge a booking status or a slot.

**Semantic matching with keyword fallback.** Provider profiles and the patient's complaint are embedded and compared by cosine similarity. The top match is accepted only if its score is at least 0.35. Conditions the clinic does not treat, or a top score below the threshold, produce no match. If the embedding call fails, the app falls back to keyword matching and logs which path ran. Provider vectors are cached in SQLite by model and text hash.

**MOCK_LLM for testing.** With `MOCK_LLM=true` the chat returns deterministic replies and matching uses keywords only. Tests and load tests run without an OpenAI key and without cost.

## Running locally

Requirements: Node.js 22 or newer.

```
git clone <repository url>
cd ai-patient-scheduling-portal
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. To run without any API keys, set `MOCK_LLM=true` in `.env.local`.

The SQLite database is created at `${DATA_DIR}/portal.db` (default `./data`) on first request. Slots for the next 60 weekdays are generated automatically and topped up on later starts.

Environment variables:

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Chat and embeddings |
| `VAPI_API_KEY` | Outbound calls |
| `VAPI_PHONE_NUMBER_ID` | Vapi number used to dial the patient |
| `VAPI_ASSISTANT_ID` | Vapi assistant used for the call |
| `VAPI_WEBHOOK_SECRET` | Shared secret for `/api/recall`; Vapi must send it in the `x-vapi-secret` header |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | Vapi public key |
| `RESEND_API_KEY` | Confirmation email |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` | Confirmation text message |
| `DATA_DIR` | Directory for the SQLite file (default `./data`) |
| `MOCK_LLM` | `true` for deterministic fake chat and keyword matching |
| `HOST`, `PORT` | Address the production server binds to (defaults `127.0.0.1` and `3000`) |
| `SLOT_HORIZON_DAYS` | Days of slots to generate (default 60) |

## Testing

```
npm test
```

Vitest runs against a temporary database per test. The suite covers input validation, reservation expiry, 20 parallel booking attempts on one slot (exactly one succeeds), mapping from structured model output to state changes (bad slot numbers and confirmation without a hold are rejected), cosine similarity and the match threshold, retry behavior, and the rate limiter.

## Matching calibration

With `OPENAI_API_KEY` in `.env.local`, `npm run calibrate` scores a labeled set of complaints (`tests/fixtures/matching-cases.json`) against every provider, sweeps the threshold, and prints the best value. Add `-- --apply` to write it into `lib/matching.ts`. `npm run test:live` runs the same cases as tests against the real API; plain `npm test` stays offline.

## Load testing

`loadtest/k6.js` ramps to 500 virtual users over 5 minutes against a separate instance started with `npm run loadtest:server` (mock model, port 3100, fresh database). `npm run verify:integrity` checks the database afterward. See [loadtest/README.md](loadtest/README.md) for how to run it locally and on the server.

| Date | Target | Peak VUs | http_req_failed | p95 latency | Notes |
|------|--------|----------|-----------------|-------------|-------|
|      |        |          |                 |             |       |

## Deployment

Target: Ubuntu 22.04 with a domain pointing at the server.

1. Bootstrap the machine once: `sudo bash deploy/setup.sh`. It adds a 2 GB swapfile, installs Node 22, build tools, Nginx, Certbot, and PM2, registers PM2 to start on boot, and opens ports 22, 80, and 443.
2. Clone the repository as the app user and create `.env` from `.env.example`.
3. Run `bash deploy/deploy.sh`. It pulls, installs, builds, starts or reloads the PM2 cluster (`ecosystem.config.js`), and checks `/api/health`.
4. Get a certificate with `sudo certbot certonly --nginx -d <your domain>`, copy `deploy/nginx.conf` to `/etc/nginx/sites-available/`, replace the domain, enable it, and run `sudo nginx -t && sudo systemctl reload nginx`.

The app listens on 127.0.0.1 only, so just Nginx can reach it. Nginx overwrites `X-Forwarded-For` with the client address, which the application uses for rate limiting, so clients cannot spoof it. Logs go to `./logs`.

## Known limitations

- SQLite works on a single machine. PM2 cluster mode shares one database file safely, but horizontal scale across machines needs Postgres and Redis.
- Not HIPAA compliant. The app stores patient details without encryption at rest and has no audit trail. Do not use it with real patient data.
- The providers and their schedules are demo data. There is no calendar or EHR integration.
- There is no patient authentication. The session id acts as a bearer token, so anyone who has it can view and continue that session.
- Semantic matching has not been tuned on real complaints. The 0.35 threshold is a starting value.
- SMS delivery depends on Twilio number verification.

Built by Bharathraaj Nagarajan.
