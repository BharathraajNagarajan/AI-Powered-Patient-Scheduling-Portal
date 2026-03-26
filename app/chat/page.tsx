'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  PatientSession,
  ChatMessage,
  loadSessionFromStorage,
  saveSessionToStorage,
  generateVoiceSummary
} from '@/lib/session';
import { ERROR_MESSAGES } from '@/lib/errors';

type CallStatus = 'idle' | 'calling' | 'connected' | 'failed';

export default function ChatPage() {
  const router = useRouter();
  const [session, setSession] = useState<PatientSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [loadingText, setLoadingText] = useState('AI is thinking...');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDebug, setIsDebug] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsDebug(window.location.search.includes('debug=true'));
    }
  }, []);

  useEffect(() => {
    const stored = loadSessionFromStorage();
    if (!stored) {
      router.push('/');
      return;
    }
    setSession(stored);

    const firstName = stored.patientName.split(' ')[0];
    const greeting: ChatMessage = {
      role: 'assistant',
      content: `Hello ${firstName}! I'm Aria, your care coordinator at Kyron Medical. I can see you're coming in about: "${stored.chiefComplaint}". Let me find the right specialist for you — just a moment!`,
      timestamp: new Date().toISOString()
    };
    setMessages([greeting]);

    setTimeout(() => {
      sendInitialMatch(stored);
    }, 1000);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  async function sendInitialMatch(currentSession: PatientSession) {
    setIsLoading(true);
    setLoadingText('Finding the right specialist for you...');
    try {
      const response = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `My chief complaint is: ${currentSession.chiefComplaint}`,
          session: currentSession,
          isInitial: true
        })
      }, 15000);

      const data = await response.json();

      if (data.reply) {
        addAIMessage(data.reply);
      }

      if (data.updatedSession) {
        setSession(data.updatedSession);
        saveSessionToStorage(data.updatedSession);
      }
    } catch {
      addAIMessage(ERROR_MESSAGES.apiTimeout);
    } finally {
      setIsLoading(false);
    }
  }

  async function sendMessage() {
    if (!input.trim() || isLoading || !session) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input.trim();
    setInput('');
    setIsLoading(true);
    setLoadingText('AI is thinking...');

    try {
      const response = await fetchWithTimeout('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentInput,
          session,
          isInitial: false
        })
      }, 15000);

      const data = await response.json();

      if (data.reply) {
        addAIMessage(data.reply);
      }

      // Always save updated session first
      if (data.updatedSession) {
        setSession(data.updatedSession);
        saveSessionToStorage(data.updatedSession);
      }

      // Then trigger booking if needed — use the updated session
      if (data.triggerBooking && data.updatedSession) {
        await handleBooking(data.updatedSession);
      }

    } catch {
      addAIMessage(ERROR_MESSAGES.apiTimeout);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleBooking(currentSession: PatientSession) {
    setLoadingText('Booking your appointment...');
    try {
      const response = await fetchWithTimeout('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: currentSession })
      }, 15000);

      const data = await response.json();

      if (data.success && data.updatedSession) {
        setSession(data.updatedSession);
        saveSessionToStorage(data.updatedSession);

        setLoadingText('Sending confirmation...');
        const confirmMsg = `Your appointment with ${data.updatedSession.matchedDoctorName} on ${data.updatedSession.selectedSlotDatetime} is confirmed. Your booking ID is ${data.updatedSession.bookingId}. A confirmation email has been sent to ${data.updatedSession.email}.`;
        addAIMessage(confirmMsg);
      } else {
        console.error('[Booking] Failed:', data.error);
        addAIMessage(data.error || ERROR_MESSAGES.generalError);
      }
    } catch (err) {
      console.error('[Booking] Exception:', err);
      addAIMessage(ERROR_MESSAGES.generalError);
    }
  }

  async function handleCallMe() {
    if (!session || callStatus === 'calling') return;
    setCallStatus('calling');

    const voiceSummary = generateVoiceSummary(session);
    const updatedSession = { ...session, voiceSummary };
    setSession(updatedSession);
    saveSessionToStorage(updatedSession);

    addAIMessage("Connecting your call now — your phone will ring in just a moment. I'll pick up right where we left off!");

    try {
      const response = await fetchWithTimeout('/api/initiate-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: updatedSession })
      }, 15000);

      const data = await response.json();

      if (data.success) {
        setCallStatus('connected');
        addAIMessage("Your call has been connected! I'll continue our conversation over the phone.");
      } else {
        setCallStatus('failed');
        addAIMessage(ERROR_MESSAGES.callFailed);
      }
    } catch {
      setCallStatus('failed');
      addAIMessage(ERROR_MESSAGES.callFailed);
    }
  }

  function addAIMessage(content: string) {
    const msg: ChatMessage = {
      role: 'assistant',
      content,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, msg]);
  }

  async function fetchWithTimeout(url: string, options: RequestInit, timeout: number) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch {
      clearTimeout(id);
      throw new Error('Request timed out');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  async function forceBookingSuccess() {
    if (!session) return;
    await handleBooking(session);
  }

  async function forceCallTrigger() {
    await handleCallMe();
  }

  if (!session) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    );
  }

  const firstName = session.patientName.split(' ')[0];

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', maxWidth: '760px', margin: '0 auto', padding: '0 16px' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: '3px', zIndex: 100, padding: '16px 0', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="glass-card" style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #0891b2, #38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>⚕</div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '15px', color: 'white' }}>Kyron Medical</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>AI Care Coordinator · Aria</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Online</span>
            </div>
            <button
              onClick={handleCallMe}
              disabled={callStatus === 'calling'}
              className={`call-button ${callStatus === 'calling' ? 'calling' : callStatus === 'connected' ? 'connected' : ''}`}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              {callStatus === 'idle' && <><span>📞</span> Call me instead</>}
              {callStatus === 'calling' && <><span className="spinner" style={{ width: '14px', height: '14px' }} /> Connecting...</>}
              {callStatus === 'connected' && <><span>✓</span> Call connected</>}
              {callStatus === 'failed' && <><span>📞</span> Try again</>}
            </button>
          </div>
        </div>
        <div style={{ marginTop: '8px', padding: '8px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
            Patient: <span style={{ color: 'rgba(255,255,255,0.7)' }}>{session.patientName}</span>
          </span>
          {session.matchedDoctorName && (
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
              Matched: <span style={{ color: '#38bdf8' }}>{session.matchedDoctorName}</span>
            </span>
          )}
          {session.bookingStatus === 'confirmed' && (
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>
              Booking: <span style={{ color: '#10b981' }}>{session.bookingId}</span>
            </span>
          )}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, padding: '16px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-end' }}>
            {msg.role === 'assistant' && (
              <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #0891b2, #38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', flexShrink: 0 }}>⚕</div>
            )}
            <div className={msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-ai'}>
              <p style={{ fontSize: '15px', lineHeight: '1.6', color: 'rgba(255,255,255,0.92)', margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', marginTop: '4px', marginBottom: 0 }}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'linear-gradient(135deg, #0891b2, #38bdf8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>⚕</div>
            <div className="chat-bubble-ai">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="typing-indicator" style={{ padding: '0' }}>
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
                <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{loadingText}</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{ position: 'sticky', bottom: 0, padding: '16px 0 24px', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        {isDebug && (
          <div style={{ marginBottom: '12px', padding: '12px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'rgba(245,158,11,0.8)', alignSelf: 'center' }}>DEBUG MODE</span>
            <button onClick={forceBookingSuccess} style={{ padding: '4px 12px', background: 'rgba(245,158,11,0.3)', border: '1px solid rgba(245,158,11,0.5)', borderRadius: '6px', color: 'white', fontSize: '12px', cursor: 'pointer' }}>Force Booking</button>
            <button onClick={forceCallTrigger} style={{ padding: '4px 12px', background: 'rgba(16,185,129,0.3)', border: '1px solid rgba(16,185,129,0.5)', borderRadius: '6px', color: 'white', fontSize: '12px', cursor: 'pointer' }}>Force Call</button>
          </div>
        )}
        <div className="glass-card" style={{ padding: '12px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message Aria, ${firstName}...`}
              disabled={isLoading}
              className="glass-input"
              style={{ flex: 1, margin: 0 }}
            />
            <button onClick={sendMessage} disabled={isLoading || !input.trim()} className="glass-button" style={{ padding: '12px 20px', flexShrink: 0 }}>
              {isLoading ? <span className="spinner" style={{ width: '16px', height: '16px' }} /> : '→'}
            </button>
          </div>
          <p style={{ fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px', textAlign: 'center' }}>
            Press Enter to send · Aria does not provide medical advice · Call 911 for emergencies
          </p>
        </div>
      </div>
    </main>
  );
}
