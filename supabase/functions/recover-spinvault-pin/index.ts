import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const jsonResponse = (status: number, body: Record<string, unknown>): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });

const hashIp = async (ip: string, secret: string): Promise<string> => {
  const bytes = new TextEncoder().encode(`${secret}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ipHashSecret = Deno.env.get('RECOVERY_IP_HASH_SECRET');
  if (!supabaseUrl || !serviceRoleKey || !ipHashSecret) {
    return jsonResponse(500, { error: 'PIN recovery is not configured' });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Invalid request body' });
  }
  if (typeof body !== 'object' || body === null) {
    return jsonResponse(400, { error: 'Invalid request body' });
  }

  const payload = body as Record<string, unknown>;
  const username = typeof payload['username'] === 'string' ? payload['username'].trim().toLowerCase() : '';
  const recoveryPin = typeof payload['recoveryPin'] === 'string' ? payload['recoveryPin'] : '';
  const newPin = typeof payload['newPin'] === 'string' ? payload['newPin'] : '';
  if (!/^[a-z0-9_-]{3,32}$/.test(username)
    || !/^[A-Za-z0-9]{8,32}$/.test(recoveryPin)
    || !/^[A-Za-z0-9]{6,32}$/.test(newPin)) {
    return jsonResponse(400, { error: 'Check the username and PIN formats and try again' });
  }

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const remoteAddress = request.headers.get('x-real-ip')?.trim();
  const ip = forwardedFor || remoteAddress;
  if (!ip) {
    return jsonResponse(503, { error: 'Recovery is temporarily unavailable from this connection' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const ipHash = await hashIp(ip, ipHashSecret);
  const { data: allowed, error: limitError } = await supabase.rpc('consume_recovery_attempt', {
    p_username: username,
    p_ip_hash: ipHash
  });
  if (limitError) return jsonResponse(503, { error: 'Recovery is temporarily unavailable' });
  if (allowed !== true) {
    return jsonResponse(429, { error: 'Too many recovery attempts. Try again in 15 minutes.' });
  }

  const { data: recovered, error: recoveryError } = await supabase.rpc('recover_spinvault_pin', {
    p_username: username,
    p_recovery_pin: recoveryPin,
    p_new_pin: newPin
  });
  if (recoveryError) return jsonResponse(503, { error: 'Recovery is temporarily unavailable' });
  if (recovered !== true) {
    return jsonResponse(400, { error: 'Recovery details could not be verified. Check them and try again.' });
  }

  return jsonResponse(200, { success: true });
});
