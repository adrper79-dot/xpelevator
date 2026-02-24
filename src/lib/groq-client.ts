/**
 * Groq API client using native fetch() - compatible with Cloudflare Workers
 * Replaces groq-sdk which requires Node.js http.Agent (not available in Workers)
 */

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GroqChatCompletionOptions {
  model: string;
  messages: GroqMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

export interface GroqStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  system_fingerprint?: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    logprobs?: null;
    finish_reason?: string | null;
  }>;
}

export interface GroqChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    logprobs?: null;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  system_fingerprint?: string;
}

/**
 * Groq API client compatible with Cloudflare Workers
 */
export class GroqClient {
  private apiKey: string;
  private baseURL = 'https://api.groq.com/openai/v1';

  constructor(options: { apiKey: string }) {
    this.apiKey = options.apiKey;
  }

  /**
   * Create a chat completion
   */
  async createChatCompletion(
    options: GroqChatCompletionOptions
  ): Promise<GroqChatCompletion> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Groq API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    return response.json();
  }

  /**
   * Create a streaming chat completion
   */
  async *createStreamingChatCompletion(
    options: GroqChatCompletionOptions
  ): AsyncGenerator<GroqStreamChunk> {
    const response = await fetch(`${this.baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature,
        max_tokens: options.max_tokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Groq API streaming error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6); // Remove 'data: ' prefix
          try {
            const chunk: GroqStreamChunk = JSON.parse(jsonStr);
            yield chunk;
          } catch (e) {
            console.error('[Groq] Failed to parse SSE chunk:', jsonStr, e);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
