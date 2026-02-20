/**
 * Telnyx REST API helper — thin wrapper around fetch.
 * Works in both Node.js and Cloudflare edge runtime.
 *
 * Requires environment variables:
 *   TELNYX_API_KEY       — from https://portal.telnyx.com/#/app/api-keys
 *   TELNYX_CONNECTION_ID — Call Control Application ID
 *   TELNYX_WEBHOOK_URL   — public HTTPS URL for Telnyx to send call events
 *
 * Telnyx Call Control docs: https://developers.telnyx.com/docs/call-control
 */

const TELNYX_BASE = 'https://api.telnyx.com/v2';

function telnyxHeaders() {
  const key = process.env.TELNYX_API_KEY;
  if (!key) throw new Error('TELNYX_API_KEY is not set');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`,
  };
}

/** Initiate an outbound call via Telnyx Call Control. */
export async function initiateCall(params: {
  to: string;        // E.164 destination number, e.g. "+12125550100"
  from: string;      // Your Telnyx number in E.164
  clientState: string; // Base64-encoded state to thread through webhooks
}) {
  const res = await fetch(`${TELNYX_BASE}/calls`, {
    method: 'POST',
    headers: telnyxHeaders(),
    body: JSON.stringify({
      connection_id: process.env.TELNYX_CONNECTION_ID,
      to: params.to,
      from: params.from,
      webhook_url: process.env.TELNYX_WEBHOOK_URL,
      client_state: params.clientState,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx call initiation failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ data: { call_control_id: string; call_leg_id: string } }>;
}

/** Speak text on an active call (text-to-speech). */
export async function callSpeak(callControlId: string, payload: {
  payload: string;        // The text to speak
  language?: string;      // e.g. "en-US"
  voice?: string;         // e.g. "female"
  clientState?: string;
}) {
  const res = await fetch(`${TELNYX_BASE}/calls/${callControlId}/actions/speak`, {
    method: 'POST',
    headers: telnyxHeaders(),
    body: JSON.stringify({
      payload: payload.payload,
      language: payload.language ?? 'en-US',
      voice: payload.voice ?? 'female',
      client_state: payload.clientState,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx speak failed: ${res.status} ${text}`);
  }
  return res.json();
}

/** Gather speech input from the caller (Speech-to-Text). */
export async function callGather(callControlId: string, payload: {
  timeout?: number;       // Silence timeout in ms
  speechTimeout?: number; // Max speech duration in ms
  clientState?: string;
}) {
  const res = await fetch(`${TELNYX_BASE}/calls/${callControlId}/actions/gather_using_speak`, {
    method: 'POST',
    headers: telnyxHeaders(),
    body: JSON.stringify({
      payload: '',             // No initial TTS — just listen
      language: 'en-US',
      voice: 'female',
      valid_digits: '',
      timeout_millis: payload.timeout ?? 5000,
      speech_timeout_millis: payload.speechTimeout ?? 8000,
      client_state: payload.clientState,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx gather failed: ${res.status} ${text}`);
  }
  return res.json();
}

/** Hang up a call. */
export async function callHangup(callControlId: string) {
  const res = await fetch(`${TELNYX_BASE}/calls/${callControlId}/actions/hangup`, {
    method: 'POST',
    headers: telnyxHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telnyx hangup failed: ${res.status} ${text}`);
  }
  return res.json();
}

/** Encode arbitrary data as base64 for Telnyx client_state. */
export function encodeClientState(data: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

/** Decode Telnyx client_state back to an object. */
export function decodeClientState<T = Record<string, unknown>>(encoded: string): T {
  return JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as T;
}
