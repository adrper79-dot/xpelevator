/**
 * http.Agent polyfill for Cloudflare Workers
 * 
 * groq-sdk tries to access http.Agent.maxCachedSessions which doesn't exist
 * in Cloudflare Workers. This polyfill provides a minimal stub to prevent errors.
 */

// Only apply polyfill if we're in Cloudflare Workers (non-Node environment)
if (typeof global !== 'undefined' && !global.process?.versions?.node) {
  // @ts-ignore  
  if (!global.http) {
    // @ts-ignore
    global.http = {};
  }
  
  // @ts-ignore
  if (!global.http.Agent) {
    class Agent {
      maxCachedSessions = 100;
      constructor() {}
    }
    
    // @ts-ignore
    global.http.Agent = Agent;
  }
  
  // @ts-ignore
  if (!global.https) {
    // @ts-ignore
    global.https = { Agent: global.http.Agent };
  }
}

export {};
