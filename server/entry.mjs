// Edge function entry. Built into one file by tools/build-fn.js together with the engine, so what runs online is what runs solo.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import handler from './handler.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
    const r = await handler.handle(db, user.id, b);
    return json(r.body, r.status);
  } catch (e) {
    return json({ error: 'Server error' }, 500);
  }
});
