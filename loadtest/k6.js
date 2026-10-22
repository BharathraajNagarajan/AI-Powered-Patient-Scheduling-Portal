import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3000";

const bookingsConfirmed = new Counter("bookings_confirmed");
const bookingConflicts = new Counter("booking_conflicts");
const noSlotsAvailable = new Counter("no_slots_available");

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409));

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "5m", target: 500 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<800"],
  },
};

const COMPLAINTS = ["my knee hurts", "chest pain and palpitations", "itchy skin rash", "stomach reflux and bloating"];

function headers() {
  const octet2 = Math.floor(__VU / 250) % 250;
  const octet3 = __VU % 250;
  return {
    "Content-Type": "application/json",
    "X-Forwarded-For": `10.${octet2}.${octet3}.${(__ITER % 250) + 1}`,
  };
}

export default function () {
  const params = { headers: headers() };

  const created = http.post(
    `${BASE_URL}/api/session`,
    JSON.stringify({
      patientName: `Load Tester ${__VU}`,
      dob: "1985-06-15",
      phone: "4155550123",
      email: `load${__VU}@example.com`,
      chiefComplaint: COMPLAINTS[(__VU + __ITER) % COMPLAINTS.length],
      smsOptIn: false,
    }),
    params
  );
  if (!check(created, { "session created": (r) => r.status === 201 })) {
    sleep(5);
    return;
  }
  const sessionId = created.json("sessionId");

  const chat = http.post(`${BASE_URL}/api/chat`, JSON.stringify({ sessionId, initial: true }), params);
  check(chat, { "chat ok": (r) => r.status === 200 });
  const slots = chat.status === 200 ? chat.json("ui.slots") || [] : [];

  if (slots.length === 0) {
    noSlotsAvailable.add(1);
    sleep(5);
    return;
  }

  const pick = slots[Math.floor(Math.random() * slots.length)];
  const selected = http.post(`${BASE_URL}/api/slots/select`, JSON.stringify({ sessionId, slotId: pick.id }), params);
  check(selected, { "slot select handled": (r) => r.status === 200 || r.status === 409 });

  if (selected.status === 200) {
    const booked = http.post(`${BASE_URL}/api/book`, JSON.stringify({ sessionId }), params);
    check(booked, { "book handled": (r) => r.status === 200 || r.status === 409 });
    if (booked.status === 200) bookingsConfirmed.add(1);
    else bookingConflicts.add(1);
  } else {
    bookingConflicts.add(1);
  }

  sleep(6 + Math.random() * 3);
}
