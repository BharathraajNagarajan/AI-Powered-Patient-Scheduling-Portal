export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  keywords: string[];
  times: string[];
}

export const doctors: Doctor[] = [
  {
    id: "doc-001",
    name: "Dr. Anand Subramaniam",
    specialty: "Orthopedics",
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
  return `${doctor.specialty}. Conditions treated: ${doctor.keywords.join(", ")}`;
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
