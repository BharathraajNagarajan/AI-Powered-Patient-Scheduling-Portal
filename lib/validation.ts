export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  if (name.trim().length < 2) {
    return { valid: false, error: 'Please enter your full name' };
  }
  if (name.trim().length > 100) {
    return { valid: false, error: 'Name is too long' };
  }
  return { valid: true };
}

export function validateDOB(dob: string): ValidationResult {
  if (!dob || dob.trim().length === 0) {
    return { valid: false, error: 'Date of birth is required' };
  }
  const date = new Date(dob);
  if (isNaN(date.getTime())) {
    return { valid: false, error: 'Please enter a valid date of birth' };
  }
  const today = new Date();
  if (date >= today) {
    return { valid: false, error: 'Date of birth must be in the past' };
  }
  const age = today.getFullYear() - date.getFullYear();
  if (age > 120) {
    return { valid: false, error: 'Please enter a valid date of birth' };
  }
  return { valid: true };
}

export function validatePhone(phone: string): ValidationResult {
  if (!phone || phone.trim().length === 0) {
    return { valid: false, error: 'Phone number is required' };
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) {
    return { valid: false, error: 'Please enter a valid phone number' };
  }
  if (digits.length > 15) {
    return { valid: false, error: 'Phone number is too long' };
  }
  return { valid: true };
}

export function validateEmail(email: string): ValidationResult {
  if (!email || email.trim().length === 0) {
    return { valid: false, error: 'Email address is required' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) {
    return { valid: false, error: 'Please enter a valid email address' };
  }
  if (email.length > 254) {
    return { valid: false, error: 'Email address is too long' };
  }
  return { valid: true };
}

export function validateComplaint(complaint: string): ValidationResult {
  if (!complaint || complaint.trim().length === 0) {
    return { valid: false, error: 'Please describe your reason for visit' };
  }
  if (complaint.trim().length < 3) {
    return { valid: false, error: 'Please provide more detail about your reason for visit' };
  }
  if (complaint.trim().length > 500) {
    return { valid: false, error: 'Description is too long — please keep it under 500 characters' };
  }
  return { valid: true };
}

export function validateIntakeForm(data: {
  patientName: string;
  dob: string;
  phone: string;
  email: string;
  chiefComplaint: string;
}): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const nameResult = validateName(data.patientName);
  if (!nameResult.valid) errors.patientName = nameResult.error!;

  const dobResult = validateDOB(data.dob);
  if (!dobResult.valid) errors.dob = dobResult.error!;

  const phoneResult = validatePhone(data.phone);
  if (!phoneResult.valid) errors.phone = phoneResult.error!;

  const emailResult = validateEmail(data.email);
  if (!emailResult.valid) errors.email = emailResult.error!;

  const complaintResult = validateComplaint(data.chiefComplaint);
  if (!complaintResult.valid) errors.chiefComplaint = complaintResult.error!;

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, '') // remove angle brackets
    .replace(/javascript:/gi, '') // remove js injection
    .replace(/on\w+=/gi, ''); // remove event handlers
}