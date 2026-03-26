'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { validateIntakeForm, sanitizeInput } from '@/lib/validation';
import { createSession, saveSessionToStorage } from '@/lib/session';

export default function IntakePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    patientName: '',
    dob: '',
    phone: '',
    email: '',
    chiefComplaint: '',
    smsOptIn: false
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const sanitized = {
      patientName: sanitizeInput(formData.patientName),
      dob: formData.dob,
      phone: sanitizeInput(formData.phone),
      email: sanitizeInput(formData.email),
      chiefComplaint: sanitizeInput(formData.chiefComplaint),
      smsOptIn: formData.smsOptIn
    };
    const { valid, errors: validationErrors } = validateIntakeForm(sanitized);
    if (!valid) {
      setErrors(validationErrors);
      return;
    }
    setIsSubmitting(true);
    const session = createSession(sanitized);
    saveSessionToStorage(session);
    router.push('/chat');
  }

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      paddingTop: '40px'
    }}>
      {/* Header */}
      <div className="slide-up" style={{ textAlign: 'center', marginBottom: '32px' }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px'
        }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #0891b2, #38bdf8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px'
          }}>⚕</div>
          <span style={{
            fontSize: '22px',
            fontWeight: '700',
            background: 'linear-gradient(135deg, #38bdf8, #ffffff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>Kyron Medical</span>
        </div>
        <h1 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: 'white',
          marginBottom: '8px',
          lineHeight: '1.3'
        }}>
          Welcome to Your Care Portal
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '15px' }}>
          Tell us about yourself and we'll connect you with the right care
        </p>
      </div>

      {/* Form Card */}
      <div className="glass-card slide-up" style={{
        width: '100%',
        maxWidth: '480px',
        padding: '32px'
      }}>
        <form onSubmit={handleSubmit}>
          {/* Full Name */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>Full Name</label>
            <input
              type="text"
              name="patientName"
              placeholder="Enter your full name"
              value={formData.patientName}
              onChange={handleChange}
              className={`glass-input ${errors.patientName ? 'error' : ''}`}
            />
            {errors.patientName && <p className="error-text">{errors.patientName}</p>}
          </div>

          {/* DOB */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>Date of Birth</label>
            <input
              type="date"
              name="dob"
              value={formData.dob}
              onChange={handleChange}
              className={`glass-input ${errors.dob ? 'error' : ''}`}
              style={{ colorScheme: 'dark' }}
            />
            {errors.dob && <p className="error-text">{errors.dob}</p>}
          </div>

          {/* Phone */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>Phone Number</label>
            <input
              type="tel"
              name="phone"
              placeholder="+1 (555) 000-0000"
              value={formData.phone}
              onChange={handleChange}
              className={`glass-input ${errors.phone ? 'error' : ''}`}
            />
            {errors.phone && <p className="error-text">{errors.phone}</p>}
          </div>

          {/* Email */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>Email Address</label>
            <input
              type="email"
              name="email"
              placeholder="your@email.com"
              value={formData.email}
              onChange={handleChange}
              className={`glass-input ${errors.email ? 'error' : ''}`}
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>

          {/* Chief Complaint */}
          <div style={{ marginBottom: '20px' }}>
            <label style={{
              display: 'block',
              color: 'rgba(255,255,255,0.8)',
              fontSize: '13px',
              fontWeight: '600',
              marginBottom: '6px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}>Reason for Visit</label>
            <textarea
              name="chiefComplaint"
              placeholder="Briefly describe what brings you in today..."
              value={formData.chiefComplaint}
              onChange={handleChange}
              rows={3}
              className={`glass-input ${errors.chiefComplaint ? 'error' : ''}`}
              style={{ resize: 'none', lineHeight: '1.5' }}
            />
            {errors.chiefComplaint && <p className="error-text">{errors.chiefComplaint}</p>}
          </div>

          {/* SMS Opt-in */}
          <div style={{
            marginBottom: '28px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '14px',
            background: 'rgba(255,255,255,0.04)',
            borderRadius: '10px',
            border: '1px solid rgba(255,255,255,0.08)'
          }}>
            <input
              type="checkbox"
              name="smsOptIn"
              id="smsOptIn"
              checked={formData.smsOptIn}
              onChange={handleChange}
              style={{
                width: '18px',
                height: '18px',
                marginTop: '2px',
                accentColor: '#0891b2',
                cursor: 'pointer',
                flexShrink: 0
              }}
            />
            <label htmlFor="smsOptIn" style={{
              color: 'rgba(255,255,255,0.7)',
              fontSize: '13px',
              lineHeight: '1.5',
              cursor: 'pointer'
            }}>
              Send me a text confirmation when my appointment is booked
              <span style={{ color: 'rgba(255,255,255,0.4)', display: 'block', fontSize: '12px', marginTop: '2px' }}>
                Standard message rates may apply. Reply STOP to opt out.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="glass-button"
            style={{ width: '100%', padding: '14px' }}
          >
            {isSubmitting ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span className="spinner" />
                Setting up your consultation...
              </span>
            ) : (
              'Begin Consultation →'
            )}
          </button>
        </form>
      </div>

      {/* Safety Disclaimer */}
      <div style={{ marginTop: '24px', maxWidth: '480px', width: '100%' }}>
        <p className="safety-disclaimer">
          🔒 Not for medical emergencies · Does not provide medical advice<br />
          If you are experiencing a medical emergency, call <strong style={{ color: 'rgba(255,255,255,0.5)' }}>911</strong> immediately
        </p>
      </div>
    </main>
  );
}