import Groq from 'groq-sdk';
import './env'; // validate required environment variables on startup

// ─── Client ──────────────────────────────────────────────────────────────────

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Types ───────────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ScenarioScript = {
  customerPersona: string;
  customerObjective: string;
  difficulty: 'easy' | 'medium' | 'hard';
  hints?: string[];
  maxTurns?: number;
};

export type ScoreResult = {
  criteriaId: string;
  criteriaName: string;
  score: number;
  justification: string;
};

// ─── System Prompts ──────────────────────────────────────────────────────────

function buildCustomerSystemPrompt(
  scenarioName: string,
  script: ScenarioScript
): string {
  const difficultyGuide = {
    easy: 'Be cooperative, friendly, and accept reasonable solutions on the first attempt.',
    medium:
      'Be mildly frustrated. Ask clarifying questions and require some reassurance before accepting a solution.',
    hard: 'Be very frustrated or upset. Interrupt occasionally, push back on solutions, and only de-escalate if the agent handles the situation exceptionally well.',
  }[script.difficulty];

  return `You are a virtual customer in a call center training simulation. Stay completely in character at all times.

SCENARIO: ${scenarioName}
CUSTOMER PERSONA: ${script.customerPersona}
YOUR OBJECTIVE: ${script.customerObjective}
DIFFICULTY LEVEL: ${script.difficulty.toUpperCase()}

BEHAVIORAL GUIDELINES:
${difficultyGuide}

RULES:
- Never break character or reveal that you are an AI
- Respond naturally as this customer would — including frustration, confusion, or satisfaction
- Keep responses concise (1–4 sentences) — this is a phone call or chat conversation
- If the agent resolves your issue satisfactorily, wrap up the conversation naturally AND append [RESOLVED] on a new line as the very last part of that final message
- If the conversation ends without resolution, end naturally WITHOUT [RESOLVED]
- Do NOT ask "How can I help you?" — you are the customer, not the agent
${script.hints?.length ? `\nSITUATION CUES:\n${script.hints.map(h => `- ${h}`).join('\n')}` : ''}

Begin the conversation by describing your issue or reason for calling.`;
}

// ─── Chat Completion ──────────────────────────────────────────────────────────

/**
 * Generate text (non-streaming) from the Groq API.
 */
export async function generateResponse(messages: ChatMessage[]): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.75,
    max_tokens: 400,
  });
  return completion.choices[0]?.message.content ?? '';
}

/**
 * Generate a streaming response. Returns an async iterable of token strings.
 */
export async function* streamResponse(
  messages: ChatMessage[]
): AsyncGenerator<string> {
  console.log('[AI] Calling GROQ API with model: llama-3.3-70b-versatile');
  console.log('[AI] Messages count:', messages.length);
  console.log('[AI] First message role:', messages[0]?.role);
  console.log('[AI] First message content preview:', messages[0]?.content?.substring(0, 100));

  try {
    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.75,
      max_tokens: 400,
      stream: true,
    });

    console.log('[AI] GROQ API call successful, starting stream');

    let chunkCount = 0;
    let hasYielded = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        chunkCount++;
        hasYielded = true;
        if (chunkCount <= 5) { // Log first few chunks
          console.log('[AI] Received chunk:', chunkCount, delta);
        }
        yield delta;
      }
    }

    console.log('[AI] Stream completed, total chunks:', chunkCount);

    // If no content was yielded, provide a fallback response
    if (!hasYielded) {
      console.warn('[AI] No content yielded from GROQ API, using fallback');
      const fallbackResponse = "I'm sorry, I'm having trouble responding right now. Could you please try again?";
      for (const char of fallbackResponse) {
        yield char;
        // Small delay to simulate streaming
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

  } catch (error) {
    console.error('[AI] GROQ API error:', error);

    // Provide a fallback response instead of throwing
    console.log('[AI] Using fallback response due to API error');
    const fallbackResponse = "I apologize, but I'm experiencing technical difficulties. As a customer, I'm having trouble with my account access. Could you help me resolve this issue?";
    for (const char of fallbackResponse) {
      yield char;
      // Small delay to simulate streaming
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}

// ─── Virtual Customer ─────────────────────────────────────────────────────────

/**
 * Build the initial system prompt for a new simulation session.
 */
export function buildSessionSystemPrompt(
  scenarioName: string,
  scenarioScript: unknown
): string {
  // Parse script JSON if it's a plain object or default empty
  let script: ScenarioScript;
  if (
    scenarioScript &&
    typeof scenarioScript === 'object' &&
    'customerPersona' in scenarioScript
  ) {
    script = scenarioScript as ScenarioScript;
  } else {
    // Default fallback script when no script configured
    script = {
      customerPersona: 'A customer who needs assistance.',
      customerObjective: 'Get help with their issue.',
      difficulty: 'medium',
    };
  }
  return buildCustomerSystemPrompt(scenarioName, script);
}

/**
 * Get the next AI customer message given the conversation history.
 * Stores history as DB messages (caller's responsibility to provide full history).
 */
export async function getNextCustomerMessage(
  systemPrompt: string,
  conversationHistory: Array<{ role: 'CUSTOMER' | 'AGENT'; content: string }>
): Promise<string> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role === 'CUSTOMER' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
  ];

  return generateResponse(messages);
}

/**
 * Streaming version — get the next customer message as a stream.
 */
export async function* streamNextCustomerMessage(
  systemPrompt: string,
  conversationHistory: Array<{ role: 'CUSTOMER' | 'AGENT'; content: string }>
): AsyncGenerator<string> {
  console.log('[AI] Starting streamNextCustomerMessage');
  console.log('[AI] System prompt length:', systemPrompt.length);
  console.log('[AI] Conversation history length:', conversationHistory.length);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory.map(m => ({
      role: m.role === 'CUSTOMER' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
  ];

  console.log('[AI] Prepared messages for API:', messages.length);

  try {
    yield* streamResponse(messages);
  } catch (error) {
    console.error('[AI] Error in streamNextCustomerMessage:', error);
    throw error;
  }
}

// ─── Auto-Scoring ─────────────────────────────────────────────────────────────

type ScoringCriterion = {
  id: string;
  name: string;
  description: string | null;
  weight: number;
};

/**
 * Score a completed simulation session transcript against defined criteria.
 * Returns one score per criterion.
 */
export async function scoreSession(
  transcript: Array<{ role: 'CUSTOMER' | 'AGENT'; content: string }>,
  criteria: ScoringCriterion[]
): Promise<ScoreResult[]> {
  if (criteria.length === 0) return [];

  const transcriptText = transcript
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const criteriaList = criteria
    .map((c, i) => `${i + 1}. ${c.name}${c.description ? ` — ${c.description}` : ''}`)
    .join('\n');

  const prompt = `You are evaluating a customer service training session. Score the AGENT's performance.

CONVERSATION TRANSCRIPT:
${transcriptText}

SCORE THE AGENT ON THESE CRITERIA (each 1–10):
${criteriaList}

Rules:
- Score ONLY the agent's messages — not the customer's behaviour
- 1–4 = Poor, 5–6 = Adequate, 7–8 = Good, 9–10 = Excellent
- Be objective and specific in justifications

Respond ONLY with a valid JSON array, no extra text:
[{"criteriaIndex": 1, "score": 7, "justification": "..."}]`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
    max_tokens: 1000,
  });

  const raw = completion.choices[0]?.message.content ?? '[]';

  // Strip markdown code fences if present
  const cleaned = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();

  try {
    const parsed: Array<{ criteriaIndex: number; score: number; justification: string }> =
      JSON.parse(cleaned);

    return parsed
      .filter(p => p.criteriaIndex >= 1 && p.criteriaIndex <= criteria.length)
      .map(p => ({
        criteriaId: criteria[p.criteriaIndex - 1].id,
        criteriaName: criteria[p.criteriaIndex - 1].name,
        score: Math.max(1, Math.min(10, Math.round(p.score))),
        justification: p.justification,
      }));
  } catch {
    console.error('[ai] Failed to parse scoring response:', cleaned);
    return [];
  }
}
