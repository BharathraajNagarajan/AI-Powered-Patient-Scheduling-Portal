import { v4 as uuidv4 } from 'uuid';

export interface TimeSlot {
  id: string;
  date: string;
  time: string;
  datetime: string;
  status: 'free' | 'reserved' | 'booked';
}

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  keywords: string[];
  slots: TimeSlot[];
}

function generateSlots(startDays: number, endDays: number, times: string[]): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const today = new Date();
  for (let i = startDays; i <= endDays; i += 3) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const dateStr = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    for (const time of times) {
      slots.push({
        id: uuidv4(),
        date: `${dayName}, ${dateStr}`,
        time,
        datetime: `${dayName}, ${dateStr} at ${time}`,
        status: 'free'
      });
    }
  }
  return slots;
}

export const doctors: Doctor[] = [
  {
    id: 'doc-001',
    name: 'Dr. Anand Subramaniam',
    specialty: 'Orthopedics',
    keywords: [
      'knee', 'joint', 'bone', 'back', 'spine', 'hip', 'shoulder',
      'fracture', 'ligament', 'tendon', 'arthritis', 'orthopedic',
      'muscle pain', 'wrist', 'ankle', 'foot pain', 'neck pain'
    ],
    slots: generateSlots(2, 60, ['9:00 AM', '11:00 AM', '2:00 PM'])
  },
  {
    id: 'doc-002',
    name: 'Dr. Mei-Lin Cho',
    specialty: 'Cardiology',
    keywords: [
      'heart', 'chest', 'chest pain', 'palpitations', 'blood pressure',
      'circulation', 'heartbeat', 'cardiac', 'cardiovascular', 'shortness of breath',
      'irregular heartbeat', 'hypertension', 'cholesterol', 'heart rate'
    ],
    slots: generateSlots(2, 60, ['10:00 AM', '1:00 PM', '3:00 PM'])
  },
  {
    id: 'doc-003',
    name: 'Dr. Camila Reyes',
    specialty: 'Dermatology',
    keywords: [
      'skin', 'rash', 'acne', 'eczema', 'mole', 'psoriasis', 'itching',
      'hives', 'dermatology', 'redness', 'bumps', 'lesion', 'hair loss',
      'nail', 'sunburn', 'allergic reaction', 'dry skin', 'skin infection'
    ],
    slots: generateSlots(2, 60, ['9:30 AM', '11:30 AM', '3:30 PM'])
  },
  {
    id: 'doc-004',
    name: 'Dr. James Whitfield',
    specialty: 'Gastroenterology',
    keywords: [
      'stomach', 'digestive', 'bowel', 'acid', 'reflux', 'nausea',
      'bloating', 'IBS', 'constipation', 'diarrhea', 'abdominal pain',
      'heartburn', 'colon', 'liver', 'gastro', 'indigestion', 'vomiting'
    ],
    slots: generateSlots(2, 60, ['10:30 AM', '12:00 PM', '4:00 PM'])
  }
];

export const UNSUPPORTED_CONDITIONS = [
  'eye', 'vision', 'ophthalmology', 'dental', 'teeth', 'tooth',
  'psychiatric', 'mental health', 'anxiety', 'depression', 'psychology',
  'emergency', 'ear', 'hearing', 'nose', 'throat', 'ENT'
];

export function matchDoctor(complaint: string): Doctor | null {
  const lower = complaint.toLowerCase();
  for (const doctor of doctors) {
    for (const keyword of doctor.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return doctor;
      }
    }
  }
  return null;
}

export function isUnsupported(complaint: string): boolean {
  const lower = complaint.toLowerCase();
  return UNSUPPORTED_CONDITIONS.some(condition =>
    lower.includes(condition.toLowerCase())
  );
}

export function getSlotById(slotId: string): { doctor: Doctor; slot: TimeSlot } | null {
  for (const doctor of doctors) {
    const slot = doctor.slots.find(s => s.id === slotId);
    if (slot) return { doctor, slot };
  }
  return null;
}

export function reserveSlot(slotId: string): boolean {
  for (const doctor of doctors) {
    const slot = doctor.slots.find(s => s.id === slotId);
    if (slot && slot.status === 'free') {
      slot.status = 'reserved';
      return true;
    }
  }
  return false;
}

export function bookSlot(slotId: string): boolean {
  for (const doctor of doctors) {
    const slot = doctor.slots.find(s => s.id === slotId);
    if (slot && (slot.status === 'reserved' || slot.status === 'free')) {
      slot.status = 'booked';
      return true;
    }
  }
  return false;
}

export function getFreeSlots(doctorId: string): TimeSlot[] {
  const doctor = doctors.find(d => d.id === doctorId);
  if (!doctor) return [];
  return doctor.slots.filter(s => s.status === 'free').slice(0, 6);
}