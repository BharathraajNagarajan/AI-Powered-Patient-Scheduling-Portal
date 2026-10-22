import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://127.0.0.1:3100";
const PEAK_VUS = Number(__ENV.PEAK_VUS || 500);
const RAMP = __ENV.RAMP || "5m";
const HOLD = __ENV.HOLD || "0s";
const RAMP_DOWN = __ENV.RAMP_DOWN || "30s";
const SUMMARY_FILE = __ENV.SUMMARY_FILE || "loadtest/results/summary.json";

const ENDPOINTS = ["session", "chat", "select", "book"];

const bookingsConfirmed = new Counter("bookings_confirmed");
const bookingConflicts = new Counter("booking_conflicts");
const conflicts409 = new Counter("http_409");
const noSlotsAvailable = new Counter("no_slots_available");

http.setResponseCallback(http.expectedStatuses({ min: 200, max: 299 }, 409));

const thresholds = {
  http_req_failed: ["rate<0.01"],
  http_req_duration: ["p(95)<800"],
};
for (const endpoint of ENDPOINTS) {
  thresholds[`http_req_duration{endpoint:${endpoint}}`] = ["max>=0"];
  thresholds[`http_req_failed{endpoint:${endpoint}}`] = ["rate>=0"];
}

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: RAMP, target: PEAK_VUS },
        { duration: HOLD, target: PEAK_VUS },
        { duration: RAMP_DOWN, target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  thresholds,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max"],
};

const COMPLAINTS = ["my knee hurts", "chest pain and palpitations", "itchy skin rash", "stomach reflux and bloating"];

function params(endpoint) {
  const octet2 = Math.floor(__VU / 250) % 250;
  const octet3 = __VU % 250;
  return {
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.${octet2}.${octet3}.${(__ITER % 250) + 1}`,
    },
    tags: { endpoint },
  };
}

function post(path, body, endpoint) {
  const response = http.post(`${BASE_URL}${path}`, JSON.stringify(body), params(endpoint));
  if (response.status === 409) conflicts409.add(1);
  return response;
}

export default function () {
  const created = post(
    "/api/session",
    {
      patientName: `Load Tester ${__VU}`,
      dob: "1985-06-15",
      phone: "4155550123",
      email: `load${__VU}@example.com`,
      chiefComplaint: COMPLAINTS[(__VU + __ITER) % COMPLAINTS.length],
      smsOptIn: false,
    },
    "session"
  );
  if (!check(created, { "session created": (r) => r.status === 201 })) {
    sleep(5);
    return;
  }
  const sessionId = created.json("sessionId");

  const chat = post("/api/chat", { sessionId, initial: true }, "chat");
  check(chat, { "chat ok": (r) => r.status === 200 });
  const slots = chat.status === 200 ? chat.json("ui.slots") || [] : [];

  if (slots.length === 0) {
    noSlotsAvailable.add(1);
    sleep(5);
    return;
  }

  const pick = slots[Math.floor(Math.random() * slots.length)];
  const selected = post("/api/slots/select", { sessionId, slotId: pick.id }, "select");
  check(selected, { "slot select handled": (r) => r.status === 200 || r.status === 409 });

  if (selected.status === 200) {
    const booked = post("/api/book", { sessionId }, "book");
    check(booked, { "book handled": (r) => r.status === 200 || r.status === 409 });
    if (booked.status === 200) bookingsConfirmed.add(1);
    else bookingConflicts.add(1);
  } else {
    bookingConflicts.add(1);
  }

  sleep(6 + Math.random() * 3);
}

function ms(value) {
  return value === undefined ? "n/a" : value.toFixed(1);
}

function row(label, name, data) {
  const duration = data.metrics[`http_req_duration${name}`];
  const failed = data.metrics[`http_req_failed${name}`];
  if (!duration) return `${label.padEnd(10)} no data`;
  const v = duration.values;
  const errorRate = failed ? (failed.values.rate * 100).toFixed(2) : "n/a";
  const requests = failed ? failed.values.passes + failed.values.fails : "n/a";
  return `${label.padEnd(10)} ${String(requests).padStart(8)} ${ms(v.med).padStart(9)} ${ms(v["p(95)"]).padStart(9)} ${ms(v["p(99)"]).padStart(9)} ${errorRate.padStart(9)}`;
}

function counter(data, name) {
  return data.metrics[name] ? data.metrics[name].values.count : 0;
}

export function handleSummary(data) {
  const lines = [
    "",
    `Peak VUs: ${data.metrics.vus_max ? data.metrics.vus_max.values.max : "n/a"}`,
    `Total requests: ${counter(data, "http_reqs")}`,
    `Bookings succeeded: ${counter(data, "bookings_confirmed")}`,
    `409 conflicts: ${counter(data, "http_409")}`,
    `Iterations with no slots: ${counter(data, "no_slots_available")}`,
    "",
    `${"endpoint".padEnd(10)} ${"requests".padStart(8)} ${"p50 ms".padStart(9)} ${"p95 ms".padStart(9)} ${"p99 ms".padStart(9)} ${"error %".padStart(9)}`,
    row("all", "", data),
    ...ENDPOINTS.map((endpoint) => row(endpoint, `{endpoint:${endpoint}}`, data)),
    "",
  ];
  return {
    stdout: lines.join("\n"),
    [SUMMARY_FILE]: JSON.stringify(data, null, 2),
  };
}
