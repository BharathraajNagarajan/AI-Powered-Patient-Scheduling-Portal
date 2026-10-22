export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  focus: string;
  profile: string;
  keywords: string[];
  times: string[];
}

export const doctors: Doctor[] = [
  {
    id: "doc-001",
    name: "Dr. Anand Subramaniam",
    specialty: "Orthopedics",
    focus: "your muscles, bones or joints",
    profile:
      "Joint, bone, muscle, back, neck, knee, hip, shoulder, ankle and wrist pain. Sprains, twisted ankle, stiffness, sports injuries, lifting injuries, fractures, arthritis.",
    keywords: [
      "knee", "joint", "bone", "back", "spine", "hip", "shoulder",
      "fracture", "ligament", "tendon", "arthritis", "orthopedic",
      "muscle pain", "wrist", "ankle", "foot pain", "neck pain",
    ],
    times: ["9:00 AM", "11:00 AM", "2:00 PM"],
  },
  {
    id: "doc-002",
    name: "Dr. Mei-Lin Cho",
    specialty: "Cardiology",
    focus: "your heart, chest or blood pressure",
    profile:
      "Heart racing, pounding or skipping heartbeat, palpitations, chest pressure or tightness with exertion, high blood pressure readings, shortness of breath on stairs, cholesterol.",
    keywords: [
      "heart", "chest", "chest pain", "palpitations", "blood pressure",
      "circulation", "heartbeat", "cardiac", "cardiovascular", "shortness of breath",
      "irregular heartbeat", "hypertension", "cholesterol", "heart rate",
    ],
    times: ["10:00 AM", "1:00 PM", "3:00 PM"],
  },
  {
    id: "doc-003",
    name: "Dr. Camila Reyes",
    specialty: "Dermatology",
    focus: "your skin, hair or nails",
    profile:
      "Rashes, itchy or red patches, acne and breakouts, moles that change shape or color, eczema, psoriasis, hives, hair loss, nail problems, skin infections, sunburn.",
    keywords: [
      "skin", "rash", "acne", "eczema", "mole", "psoriasis", "itching",
      "hives", "dermatology", "redness", "bumps", "lesion", "hair loss",
      "nail", "sunburn", "allergic reaction", "dry skin", "skin infection",
    ],
    times: ["9:30 AM", "11:30 AM", "3:30 PM"],
  },
  {
    id: "doc-004",
    name: "Dr. James Whitfield",
    specialty: "Gastroenterology",
    focus: "your stomach or digestion",
    profile:
      "Heartburn, burning in the chest or throat after eating, acid reflux, bloating, cramps, stomach pain, nausea, vomiting, diarrhea, constipation, indigestion, liver and bowel problems.",
    keywords: [
      "stomach", "digestive", "bowel", "acid", "reflux", "nausea",
      "bloating", "IBS", "constipation", "diarrhea", "abdominal pain",
      "heartburn", "colon", "liver", "gastro", "indigestion", "vomiting",
    ],
    times: ["10:30 AM", "12:00 PM", "4:00 PM"],
  },
];

export const UNSUPPORTED_CONDITIONS = [
  "eye", "vision", "ophthalmology", "dental", "teeth", "tooth",
  "psychiatric", "mental health", "anxiety", "depression", "psychology",
  "emergency", "ear", "hearing", "nose", "throat", "ENT", "toothache", "anxious",
];

export function providerProfile(doctor: Doctor): string {
  return `${doctor.specialty}. ${doctor.profile}`;
}

function containsTerm(text: string, term: string): boolean {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`).test(text);
}

export function matchDoctor(complaint: string): Doctor | null {
  const lower = complaint.toLowerCase();
  return doctors.find((d) => d.keywords.some((k) => containsTerm(lower, k))) ?? null;
}

export function isUnsupported(complaint: string): boolean {
  const lower = complaint.toLowerCase();
  return UNSUPPORTED_CONDITIONS.some((c) => containsTerm(lower, c));
}

export function getDoctor(id: string): Doctor | null {
  return doctors.find((d) => d.id === id) ?? null;
}
