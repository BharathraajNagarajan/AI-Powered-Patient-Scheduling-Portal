import { officeInfo } from "./office-info";

const TZ = officeInfo.timezone;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function formatSlotLabel(startsAtIso: string): string {
  const date = new Date(startsAtIso);
  const label = `${dateFormatter.format(date)} at ${timeFormatter.format(date)}`;
  return label.replace(/[\u202f\u00a0]/g, " ");
}

function zoneParts(ms: number) {
  const parts: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(new Date(ms))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return parts;
}

function zoneOffsetMs(ms: number): number {
  const p = zoneParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

export function zonedToUtcIso(year: number, month: number, day: number, hour: number, minute: number): string {
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  let utc = wall - zoneOffsetMs(wall);
  utc = wall - zoneOffsetMs(utc);
  return new Date(utc).toISOString();
}

export function clinicToday(now: Date = new Date()): { year: number; month: number; day: number } {
  const p = zoneParts(now.getTime());
  return { year: p.year, month: p.month, day: p.day };
}

export function parseClockTime(value: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(value.trim());
  if (!match) throw new Error(`Invalid time: ${value}`);
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return { hour, minute: Number(match[2]) };
}
