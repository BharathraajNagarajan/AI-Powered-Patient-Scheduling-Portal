import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import twilio from "twilio";

const envFile = path.resolve(".env.local");
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
process.env.MOCK_LLM = "false";

interface Row {
  service: string;
  status: "PASS" | "FAIL" | "SKIP";
  latency: string;
  note: string;
}

const rows: Row[] = [];

async function timed<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: string; ms: number }> {
  const start = performance.now();
  try {
    const value = await fn();
    return { value, ms: Math.round(performance.now() - start) };
  } catch (err) {
    const status = (err as { status?: number })?.status;
    const message = err instanceof Error ? err.message : String(err);
    return { error: status ? `${status} ${message}` : message, ms: Math.round(performance.now() - start) };
  }
}

function add(service: string, status: Row["status"], ms: number | null, note: string) {
  rows.push({ service, status, latency: ms === null ? "-" : `${ms} ms`, note });
}

function missing(...names: string[]): string[] {
  return names.filter((n) => !process.env[n]);
}

async function checkOpenAI() {
  const absent = missing("OPENAI_API_KEY");
  if (absent.length) {
    add("OpenAI chat", "FAIL", null, `missing ${absent.join(", ")}`);
    add("OpenAI embeddings", "FAIL", null, `missing ${absent.join(", ")}`);
    return;
  }
  const { generateModelOutput, CHAT_MODEL } = await import("../lib/llm");
  const chat = await timed(() =>
    generateModelOutput({
      systemPrompt: "You are a scheduling assistant. Reply briefly.",
      history: [],
      userMessage: "Say hello.",
      offered: [],
      providerName: null,
      specialty: null,
      hasHeldSlot: false,
      isInitial: false,
    })
  );
  add(
    `OpenAI chat (${CHAT_MODEL})`,
    chat.error ? "FAIL" : "PASS",
    chat.ms,
    chat.error ?? `structured output parsed, intent=${chat.value?.intent}`
  );

  const { EMBEDDING_MODEL } = await import("../lib/matching");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15_000, maxRetries: 0 });
  const embed = await timed(() => client.embeddings.create({ model: EMBEDDING_MODEL, input: "knee pain" }));
  add(
    `OpenAI embeddings (${EMBEDDING_MODEL})`,
    embed.error ? "FAIL" : "PASS",
    embed.ms,
    embed.error ?? `${embed.value?.data[0]?.embedding.length} dimensions`
  );
}

async function checkResend() {
  const absent = missing("RESEND_API_KEY", "CHECK_EMAIL_TO");
  if (absent.length) {
    add("Resend", "FAIL", null, `missing ${absent.join(", ")}`);
    return;
  }
  const { sendBookingEmail, senderAddress } = await import("../lib/notify");
  const result = await timed(() =>
    sendBookingEmail({
      patientName: "Service Check",
      email: process.env.CHECK_EMAIL_TO as string,
      phone: "+14155550123",
      chiefComplaint: "Service check email",
      providerName: "Dr. Anand Subramaniam",
      specialty: "Orthopedics",
      label: "Monday, January 5 at 9:00 AM",
      bookingId: "CHECK-0001",
    })
  );
  const sender = senderAddress().replace(/^.*<(.+)>$/, "$1");
  if (result.error) add("Resend", "FAIL", result.ms, `${result.error} (from ${sender})`);
  else if (!result.value) add("Resend", "FAIL", result.ms, "no message id returned");
  else add("Resend", "PASS", result.ms, `message id ${result.value}, from ${sender}`);
}

async function checkTwilio() {
  const absent = missing("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN");
  if (absent.length) {
    add("Twilio", "SKIP", null, `missing ${absent.join(", ")}`);
    return;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID as string;
  const result = await timed(() => twilio(sid, process.env.TWILIO_AUTH_TOKEN).api.accounts(sid).fetch());
  if (result.error || !result.value) {
    add("Twilio", "FAIL", result.ms, result.error ?? "no account returned");
    return;
  }
  const trial = result.value.type === "Trial";
  const note = `status ${result.value.status}, ${trial ? "TRIAL account: SMS only reaches verified numbers" : "full account"}`;
  add("Twilio", result.value.status === "active" ? "PASS" : "FAIL", result.ms, note);
}

async function vapiGet(resource: string, id: string) {
  const response = await fetch(`https://api.vapi.ai/${resource}/${id}`, {
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as { name?: string; number?: string };
}

async function checkVapi() {
  const checks: Array<[string, string, string]> = [
    ["Vapi assistant", "assistant", "VAPI_ASSISTANT_ID"],
    ["Vapi phone number", "phone-number", "VAPI_PHONE_NUMBER_ID"],
  ];
  for (const [label, resource, envName] of checks) {
    const absent = missing("VAPI_API_KEY", envName);
    if (absent.length) {
      add(label, "FAIL", null, `missing ${absent.join(", ")}`);
      continue;
    }
    const result = await timed(() => vapiGet(resource, process.env[envName] as string));
    add(label, result.error ? "FAIL" : "PASS", result.ms, result.error ?? "found");
  }
}

function printTable() {
  const headers = ["Service", "Status", "Latency", "Note"];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => [r.service, r.status, r.latency, r.note][i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log("");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line([r.service, r.status, r.latency, r.note]));
  console.log("");
}

async function main() {
  await checkOpenAI();
  await checkResend();
  await checkTwilio();
  await checkVapi();
  printTable();
  const critical = rows.some((r) => r.status === "FAIL" && (r.service.startsWith("OpenAI") || r.service === "Resend"));
  process.exit(critical ? 1 : 0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
