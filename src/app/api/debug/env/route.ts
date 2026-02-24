import { NextRequest, NextResponse } from 'next/server';

// Diagnostic endpoint to check environment variables in production
// Access at: /api/debug/env
export async function GET(request: NextRequest) {
  const envCheck = {
    runtime: typeof process !== 'undefined' ? 'node' : 'edge',
    hasProcess: typeof process !== 'undefined',
    hasProcessEnv: typeof process?.env !== 'undefined',
    
    // Check for GROQ_API_KEY
    groqKeyExists: !!process?.env?.GROQ_API_KEY,
    groqKeyPreview: process?.env?.GROQ_API_KEY 
      ? process.env.GROQ_API_KEY.substring(0, 10) + '...' 
      : 'NOT FOUND',
    groqKeyLength: process?.env?.GROQ_API_KEY?.length || 0,
    
    // Check for DATABASE_URL
    dbUrlExists: !!process?.env?.DATABASE_URL,
    dbUrlPreview: process?.env?.DATABASE_URL
      ? process.env.DATABASE_URL.substring(0, 20) + '...'
      : 'NOT FOUND',
    
    // List all environment variable keys (NOT values for security)
    envKeys: process?.env ? Object.keys(process.env).sort() : [],
    
    // Check if this is Cloudflare Workers environment
    isCloudflare: typeof globalThis !== 'undefined' && 'caches' in globalThis,
    
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(envCheck, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
