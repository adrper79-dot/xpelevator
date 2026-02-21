export const runtime = 'edge';
import { NextResponse } from 'next/server';
import { generateResponse } from '@/lib/ai';

// Test endpoint to verify GROQ API is working
export async function GET() {
  try {
    console.log('[Test API] Testing GROQ API connection');

    const testMessages = [
      { role: 'system' as const, content: 'You are a helpful assistant. Respond with exactly one sentence.' },
      { role: 'user' as const, content: 'Hello, can you help me?' }
    ];

    const response = await generateResponse(testMessages);

    console.log('[Test API] GROQ API test successful, response length:', response.length);

    return NextResponse.json({
      success: true,
      message: 'GROQ API is working',
      response: response.substring(0, 100) + '...',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Test API] GROQ API test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}