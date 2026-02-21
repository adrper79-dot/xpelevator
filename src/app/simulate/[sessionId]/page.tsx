'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

interface Message {
  id: string;
  role: 'CUSTOMER' | 'AGENT';
  content: string;
  timestamp: string;
}

interface ScoreItem {
  id: string;
  score: number;
  feedback: string | null;
  criteria: { name: string; description: string | null };
}

interface Session {
  id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  type: 'PHONE' | 'CHAT';
  messages: Message[];
  scores: ScoreItem[];
  scenario: { name: string; description: string | null; type: string };
  jobTitle: { name: string };
}

export default function SimulationPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);

  // Phone call state
  const [phoneNumber, setPhoneNumber] = useState('');
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle');
  const [callError, setCallError] = useState<string | null>(null);
  const [callSeconds, setCallSeconds] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Load session ────────────────────────────────────────────────────────────
  useEffect(() => {
    console.log('[SimulationPage] Loading session:', sessionId);
    fetch(`/api/chat?sessionId=${sessionId}`)
      .then(res => {
        console.log('[SimulationPage] Session fetch response:', res.status);
        if (!res.ok) throw new Error('Session not found');
        return res.json();
      })
      .then((data: Session) => {
        console.log('[SimulationPage] Session loaded:', data);
        setSession(data);
        setMessages(data.messages);
        if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
          setEnded(true);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('[SimulationPage] Session load error:', err);
        setError(err.message);
        setLoading(false);
      });
  }, [sessionId]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // ── Start: trigger first customer message ───────────────────────────────────
  useEffect(() => {
    if (!session || loading || messages.length > 0 || ended) return;
    // Send an empty "[START]" to get the first customer message
    sendMessage('[START]', true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loading]);

  // ── Send Message ────────────────────────────────────────────────────────────
  async function sendMessage(content: string, silent = false) {
    if (sending || !content.trim()) return;
    console.log('[SimulationPage] Sending message:', content.substring(0, 50) + '...');
    setSending(true);
    setStreamingText('');
    setError(null);

    // Add agent message to local state (unless it's the silent [START])
    if (!silent) {
      const optimisticMsg: Message = {
        id: crypto.randomUUID(),
        role: 'AGENT',
        content: content.trim(),
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, optimisticMsg]);
    }
    setInput('');

    try {
      console.log('[SimulationPage] Making API request to /api/chat');
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, content }),
      });

      console.log('[SimulationPage] API response status:', res.status);
      console.log('[SimulationPage] Response headers:', Object.fromEntries(res.headers.entries()));

      if (!res.ok) {
        const errData = await res.json();
        console.error('[SimulationPage] API error response:', errData);
        throw new Error(errData.error ?? 'Failed to send message');
      }

      const contentType = res.headers.get('content-type') ?? '';
      console.log('[SimulationPage] Content-Type:', contentType);

      if (contentType.includes('text/event-stream')) {
        console.log('[SimulationPage] Starting SSE stream processing');
        // ── SSE streaming ──────────────────────────────────────────────────────
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let accumulated = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log('[SimulationPage] SSE stream ended');
            break;
          }

          const text = decoder.decode(value);
          const lines = text.split('\n').filter(l => l.startsWith('data:'));

          for (const line of lines) {
            try {
              const data = JSON.parse(line.slice(5).trim());
              console.log('[SimulationPage] SSE event:', data.type, data.content?.substring(0, 50));

              if (data.type === 'chunk') {
                accumulated += data.content;
                setStreamingText(accumulated);
              } else if (data.type === 'done') {
                // Normal turn — add customer message to state
                const aiMsg: Message = {
                  id: crypto.randomUUID(),
                  role: 'CUSTOMER',
                  content: data.content,
                  timestamp: new Date().toISOString(),
                };
                setMessages(prev => [...prev, aiMsg]);
                setStreamingText('');
              } else if (data.type === 'session_ending') {
                // Customer resolved the issue — show their last message
                const aiMsg: Message = {
                  id: crypto.randomUUID(),
                  role: 'CUSTOMER',
                  content: data.content,
                  timestamp: new Date().toISOString(),
                };
                setMessages(prev => [...prev, aiMsg]);
                setStreamingText('');
              } else if (data.type === 'session_ended') {
                // Session auto-ended naturally — reload full session with scores
                const updated = await fetch(`/api/chat?sessionId=${sessionId}`).then(r => r.json());
                setSession(updated);
                setMessages(updated.messages);
                setEnded(true);
              } else if (data.type === 'error') {
                throw new Error(data.message);
              }
            } catch (parseErr) {
              console.warn('[SimulationPage] Failed to parse SSE line:', line, parseErr);
              // skip malformed SSE line
            }
          }
        }
      } else {
        console.log('[SimulationPage] Non-streaming response');
        // ── Non-streaming (end session response) ───────────────────────────────
        const data = await res.json();
        if (data.ended && data.session) {
          setSession(data.session);
          setMessages(data.session.messages);
          setEnded(true);
        }
      }
    } catch (err: unknown) {
      console.error('[SimulationPage] Send message error:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const endConversation = () => sendMessage('[END]');

  // ── Phone call helpers ────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startCallPolling = useCallback(() => {
    // Poll for new messages every 3 seconds during an active call
    pollRef.current = setInterval(async () => {
      try {
        const data: Session = await fetch(`/api/chat?sessionId=${sessionId}`).then(r => r.json());
        setMessages(data.messages);
        if (data.status === 'COMPLETED' || data.status === 'CANCELLED') {
          setSession(data);
          setCallStatus('ended');
          setEnded(true);
          stopPolling();
        }
      } catch {
        // ignore transient errors
      }
    }, 3000);
  }, [sessionId, stopPolling]);

  // Call timer
  useEffect(() => {
    if (callStatus !== 'connected') return;
    const id = setInterval(() => setCallSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [callStatus]);

  // Stop polling when component unmounts
  useEffect(() => () => stopPolling(), [stopPolling]);

  const initiatePhoneCall = async () => {
    if (!phoneNumber.trim()) return;
    setCallError(null);
    setCallStatus('calling');
    try {
      const res = await fetch('/api/telnyx/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, to: phoneNumber.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Call initiation failed');
      }
      setCallStatus('connected');
      startCallPolling();
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'Failed to start call');
      setCallStatus('idle');
    }
  };

  const hangUp = async () => {
    stopPolling();
    setCallStatus('ended');
    // End the session via the existing [END] mechanism
    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, content: '[END]' }),
    }).catch(() => null);
    const data: Session = await fetch(`/api/chat?sessionId=${sessionId}`).then(r => r.json());
    setSession(data);
    setEnded(true);
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // ── Average score ────────────────────────────────────────────────────────────
  const avgScore = session?.scores?.length
    ? (session.scores.reduce((sum, s) => sum + s.score, 0) / session.scores.length).toFixed(1)
    : null;

  // ─────────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-center">
        <div className="animate-pulse text-slate-400">Loading simulation...</div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <Link href="/simulate" className="text-blue-400 hover:text-blue-300">
            &larr; Back to simulations
          </Link>
        </div>
      </div>
    );
  }

  // ── Completed: show scores ───────────────────────────────────────────────────
  if (ended && session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-6 py-12">
          <div className="text-center mb-10">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-3xl font-bold mb-2">Simulation Complete</h1>
            <p className="text-slate-400">{session.scenario.name}</p>
          </div>

          {avgScore && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8 text-center">
              <div className="text-6xl font-bold text-blue-400 mb-1">{avgScore}</div>
              <div className="text-slate-400 text-sm">Overall Score / 10</div>
            </div>
          )}

          {session.scores.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8">
              <h2 className="text-lg font-semibold mb-4">Score Breakdown</h2>
              <div className="space-y-4">
                {session.scores.map(s => (
                  <div key={s.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{s.criteria.name}</span>
                      <span
                        className={`text-sm font-bold ${
                          s.score >= 8
                            ? 'text-green-400'
                            : s.score >= 6
                            ? 'text-blue-400'
                            : s.score >= 4
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {s.score}/10
                      </span>
                    </div>
                    <div className="w-full bg-slate-700 rounded-full h-1.5 mb-1">
                      <div
                        className={`h-1.5 rounded-full ${
                          s.score >= 8
                            ? 'bg-green-500'
                            : s.score >= 6
                            ? 'bg-blue-500'
                            : s.score >= 4
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${s.score * 10}%` }}
                      />
                    </div>
                    {s.feedback && (
                      <p className="text-xs text-slate-400 mt-1">{s.feedback}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {session.scores.length === 0 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mb-8 text-center text-slate-400">
              No scores recorded for this session.
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <Link
              href="/simulate"
              className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-lg font-medium transition-colors"
            >
              New Simulation
            </Link>
            <Link
              href="/sessions"
              className="border border-slate-600 hover:border-slate-400 text-slate-300 px-6 py-3 rounded-lg font-medium transition-colors"
            >
              View All Sessions
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Active Phone Interface ───────────────────────────────────────────────────
  if (!ended && session?.type === 'PHONE') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-800 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl">📞</span>
                <h1 className="font-semibold">{session.scenario.name}</h1>
              </div>
              <p className="text-sm text-slate-400">{session.jobTitle.name}</p>
            </div>
            {callStatus === 'connected' && (
              <div className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm font-mono text-green-400">{formatDuration(callSeconds)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-3xl mx-auto">
            {/* Phone call UI */}
            {callStatus === 'idle' && (
              <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8 max-w-sm mx-auto text-center">
                <div className="text-5xl mb-6">📞</div>
                <h2 className="text-xl font-semibold mb-2">Ready to Call</h2>
                <p className="text-slate-400 text-sm mb-6">
                  Telnyx will dial your number. You&apos;ll speak to the virtual customer on the phone.
                </p>
                <div className="text-left mb-4">
                  <label className="block text-sm text-slate-400 mb-1">Your phone number (E.164)</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={e => setPhoneNumber(e.target.value)}
                    placeholder="+12125550123"
                    className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                {callError && <p className="text-red-400 text-sm mb-4">{callError}</p>}
                <button
                  onClick={initiatePhoneCall}
                  disabled={!phoneNumber.trim()}
                  className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-600 disabled:text-slate-400 rounded-xl font-semibold transition-colors"
                >
                  Start Call
                </button>
                <p className="text-xs text-slate-500 mt-3">
                  Requires TELNYX_API_KEY + TELNYX_CONNECTION_ID configured.
                </p>
              </div>
            )}

            {callStatus === 'calling' && (
              <div className="text-center py-20">
                <div className="text-5xl mb-6 animate-pulse">📞</div>
                <p className="text-slate-300 text-lg">Dialing {phoneNumber}…</p>
                <p className="text-slate-500 text-sm mt-2">Waiting for answer</p>
              </div>
            )}

            {callStatus === 'connected' && (
              <div>
                <div className="text-center mb-8">
                  <div className="text-4xl mb-2">📞</div>
                  <p className="text-green-400 font-semibold">Call in progress</p>
                  <p className="text-slate-400 text-sm">Live transcript updates every 3 seconds</p>
                </div>

                {/* Transcript */}
                <div className="space-y-4 mb-8">
                  {messages.length === 0 && (
                    <p className="text-center text-slate-500 py-8 animate-pulse">
                      Waiting for conversation to begin…
                    </p>
                  )}
                  {messages.map(msg => (
                    <MessageBubble key={msg.id} message={msg} />
                  ))}
                </div>

                <div className="text-center">
                  <button
                    onClick={hangUp}
                    className="px-8 py-3 bg-red-600 hover:bg-red-500 rounded-full text-white font-semibold transition-colors"
                  >
                    🔴 Hang Up
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Active Chat Interface ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">{session?.type === 'PHONE' ? '📞' : '💬'}</span>
              <h1 className="font-semibold">{session?.scenario.name}</h1>
            </div>
            <p className="text-sm text-slate-400">{session?.jobTitle.name}</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm text-green-400">Live</span>
            <button
              onClick={endConversation}
              disabled={sending || ended}
              className="ml-4 bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-400 px-4 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-50"
            >
              End Session
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.length === 0 && !streamingText && !sending && (
            <div className="text-center text-slate-500 py-8">
              {loading ? (
                <div>
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p>Loading conversation...</p>
                </div>
              ) : (
                <div>
                  <p className="mb-2">Starting conversation...</p>
                  <p className="text-xs text-slate-600">If this takes too long, check the browser console for errors.</p>
                </div>
              )}
            </div>
          )}

          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {/* Streaming customer response */}
          {streamingText && (
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">🤖</span>
              <div className="bg-slate-700/60 border border-slate-600 rounded-2xl rounded-tl-none px-4 py-3 max-w-[80%]">
                <p className="text-white text-sm whitespace-pre-wrap">{streamingText}</p>
                <span className="inline-block w-1 h-4 bg-blue-400 animate-pulse ml-0.5" />
              </div>
            </div>
          )}

          {/* Sending indicator */}
          {sending && !streamingText && (
            <div className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0">🤖</span>
              <div className="bg-slate-700/60 border border-slate-600 rounded-2xl rounded-tl-none px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="text-center text-red-400 text-sm py-2">{error}</div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={sending || ended}
              placeholder="Type your response... (Enter to send, Shift+Enter for new line)"
              rows={2}
              className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder-slate-500 resize-none focus:border-blue-500 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={sending || ended || !input.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 px-5 py-3 rounded-xl font-medium transition-colors flex-shrink-0"
            >
              Send
            </button>
          </form>
          <p className="text-xs text-slate-600 mt-2 text-center">
            You are the employee. Respond to the virtual customer above.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isCustomer = message.role === 'CUSTOMER';
  return (
    <div className={`flex items-start gap-3 ${isCustomer ? '' : 'flex-row-reverse'}`}>
      <span className="text-2xl flex-shrink-0">{isCustomer ? '🤖' : '👤'}</span>
      <div
        className={`rounded-2xl px-4 py-3 max-w-[80%] ${
          isCustomer
            ? 'bg-slate-700/60 border border-slate-600 rounded-tl-none'
            : 'bg-blue-600/30 border border-blue-800/50 rounded-tr-none'
        }`}
      >
        <p className="text-white text-sm whitespace-pre-wrap">{message.content}</p>
        <p className="text-xs text-slate-500 mt-1">
          {isCustomer ? 'Virtual Customer' : 'You'}
        </p>
      </div>
    </div>
  );
}
