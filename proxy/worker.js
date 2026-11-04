/**
 * StoryMe Gemini proxy (Cloudflare Worker).
 *
 * The browser calls this Worker instead of Google directly, so the Gemini API key
 * never ships in the frontend bundle. The key lives in the Worker secret
 * GEMINI_API_KEY. The Worker only forwards the model calls StoryMe makes.
 */
const UPSTREAM = 'https://generativelanguage.googleapis.com';

// Models the app uses (src/services/gemini.ts). Anything else is rejected.
const ALLOWED_MODELS = new Set([
  'gemini-3-flash-preview',
  'gemini-2.5-flash-image',
  'gemini-2.5-flash-preview-tts',
]);
const ALLOWED_METHODS = new Set(['generateContent']);
const MAX_BODY_BYTES = 200 * 1024;

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-goog-api-key, x-goog-api-client',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(status, message, headers = {}) {
  return new Response(JSON.stringify({ error: { code: status, message } }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    // Browser calls must come from a StoryMe origin. (Origin can be forged outside
    // a browser, so the model allowlist, size cap and rate limit still apply.)
    if (!allowedOrigins(env).includes(origin)) {
      return json(403, 'Origin not allowed');
    }
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json(405, 'Method not allowed', cors);

    // Expected path: /v1beta/models/<model>:<method>
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/(v1beta|v1)\/models\/([\w.-]+):(\w+)$/);
    if (!m || !ALLOWED_MODELS.has(m[2]) || !ALLOWED_METHODS.has(m[3])) {
      return json(404, 'Unsupported endpoint', cors);
    }

    if (!env.GEMINI_API_KEY) return json(500, 'Proxy is missing GEMINI_API_KEY', cors);

    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json(429, 'Too many requests, slow down a little', cors);
    }

    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_BODY_BYTES) return json(413, 'Request too large', cors);

    const upstream = await fetch(`${UPSTREAM}${url.pathname}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body,
    });

    const headers = new Headers(cors);
    headers.set('content-type', upstream.headers.get('content-type') || 'application/json');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
