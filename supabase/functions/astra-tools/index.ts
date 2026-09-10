// ASTRA GPT gateway. The CommonJS ASTRA runtime remains on the compatible Node API layer;
// this Edge Function only authenticates, bounds and forwards the three narrow routes.
const GPT_API_KEY = Deno.env.get('ASTRA_GPT_API_KEY') || Deno.env.get('KB_API_KEY') || '';
const ASTRA_RUNTIME_URL = (Deno.env.get('ASTRA_RUNTIME_URL') || '').replace(/\/$/, '');
const ASTRA_RUNTIME_API_KEY = Deno.env.get('ASTRA_RUNTIME_API_KEY') || '';
const MAX_BODY_BYTES = 256000;
const ROUTES: Record<string, string> = {
  'campaign-360': '/astra/campaign-360',
  'campaign-360-async-start': '/astra/campaign-360/async/start',
  'campaign-360-async-status': '/astra/campaign-360/async/status',
  'campaign-360-async-result': '/astra/campaign-360/async/result',
  'creative-director': '/astra/creative-director',
  'creative-generation': '/astra/creative-generation',
  // [ASTRA-11] deterministic commercial engines — forward-only, no side effects.
  'commercial-funnel-revenue': '/astra/commercial/funnel-revenue',
  'commercial-experiment-intelligence': '/astra/commercial/experiment-intelligence',
  'commercial-business-memory': '/astra/commercial/business-memory',
  'commercial-decision-orchestrator': '/astra/commercial/decision-orchestrator',
};
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST, OPTIONS' };
function json(status: number, body: unknown) { return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } }); }
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(400, { status: 'FAILED', error: { code: 'INVALID_INPUT', message: 'POST required' } });
  if (!GPT_API_KEY || req.headers.get('authorization') !== `Bearer ${GPT_API_KEY}`) return json(401, { status: 'FAILED', error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  const route = ROUTES[new URL(req.url).pathname.split('/').filter(Boolean).pop() || ''];
  if (!route) return json(400, { status: 'FAILED', error: { code: 'INVALID_INPUT', message: 'Unknown tool route' } });
  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return json(422, { status: 'FAILED', error: { code: 'INVALID_INPUT', message: 'Request too large' } });
  if (!ASTRA_RUNTIME_URL || !ASTRA_RUNTIME_API_KEY) return json(503, { status: 'FAILED', error: { code: 'ENVIRONMENT_NOT_AVAILABLE', message: 'ASTRA runtime is not configured' } });
  try {
    const upstream = await fetch(ASTRA_RUNTIME_URL + route, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${ASTRA_RUNTIME_API_KEY}` }, body: raw });
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
  } catch { return json(503, { status: 'FAILED', error: { code: 'ENVIRONMENT_NOT_AVAILABLE', message: 'ASTRA runtime is unavailable' } }); }
});
