// Edge function entry. Built into one file by tools/build-fn.js together with the engine, so what runs online is what runs solo.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import handler from './handler.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// ---------- Apple push (APNs), only when the four secrets are set ----------
// APNS_KEY: the .p8 key text; APNS_KEY_ID; APNS_TEAM_ID; APNS_TOPIC: the bundle id (com.playshiphead.app).
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let apnsJwt = null, apnsAt = 0, apnsKey = null;
async function apnsToken() {
  if (apnsJwt && Date.now() - apnsAt < 50 * 60 * 1000) return apnsJwt; // Apple wants a new token at most hourly, at least every 20 min apart
  if (!apnsKey) {
    const pem = Deno.env.get('APNS_KEY').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
    apnsKey = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  }
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: 'ES256', kid: Deno.env.get('APNS_KEY_ID') }) + '.' + enc({ iss: Deno.env.get('APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, apnsKey, new TextEncoder().encode(head));
  apnsJwt = head + '.' + b64url(sig);
  apnsAt = Date.now();
  return apnsJwt;
}
const pushReady = () => ['APNS_KEY', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_TOPIC'].every(k => Deno.env.get(k));
function makeNotify(db) {
  if (!pushReady()) return null;
  return async (tokens, msg) => {
    const jwt = await apnsToken();
    const host = Deno.env.get('APNS_SANDBOX') ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const body = JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: 'default' }, code: msg.code });
    const dead = [];
    await Promise.all(tokens.map(async t => {
      const r = await fetch('https://' + host + '/3/device/' + t, { method: 'POST', body, headers: { authorization: 'bearer ' + jwt, 'apns-topic': Deno.env.get('APNS_TOPIC'), 'apns-push-type': 'alert', 'apns-priority': '10' } });
      if (r.status === 410 || r.status === 400) dead.push(t); // uninstalled or bad token
    }));
    if (dead.length) await db.from('shed_push').delete().in('token', dead);
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), anon = Deno.env.get('SUPABASE_ANON_KEY');
    const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Please sign in' }, 401);
    const db = createClient(url, service, { auth: { persistSession: false } });
    let b;
    try { b = await req.json(); } catch (e) { return json({ error: 'Bad request' }, 400); }
    // first address in x-forwarded-for is the caller as seen by Supabase's edge
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 64);
    const r = await handler.handle(db, user.id, b, ip, { notify: makeNotify(db) });
    return json(r.body, r.status);
  } catch (e) {
    return json({ error: 'Server error' }, 500);
  }
});
