import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractReceiptFromImage, ReceiptExtractionError } from '../_shared/receipt-extraction.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

function respond(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond(405, { error: 'Method not allowed.' });

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return respond(401, { error: 'Sign in before scanning a receipt.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
  if (!supabaseUrl || !anonKey || !geminiApiKey) {
    return respond(500, { error: 'Receipt scanning is not configured. Set the Supabase and Gemini function secrets.' });
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return respond(401, { error: 'Your session is invalid or expired. Sign in again.' });

  let payload: { mimeType?: unknown; imageBase64?: unknown };
  try {
    payload = await request.json();
  } catch {
    return respond(400, { error: 'Expected a JSON body containing an image.' });
  }
  const supportedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic']);
  if (typeof payload.mimeType !== 'string' || !supportedTypes.has(payload.mimeType)) {
    return respond(400, { error: 'Use a JPEG, PNG, WebP or HEIC receipt photo.' });
  }
  if (typeof payload.imageBase64 !== 'string' || payload.imageBase64.length < 100 || payload.imageBase64.length > 14_000_000) {
    return respond(400, { error: 'The receipt image is empty or larger than 10 MB.' });
  }

  try {
    const receipt = await extractReceiptFromImage(payload.mimeType, payload.imageBase64, geminiApiKey);
    return respond(200, receipt);
  } catch (error) {
    if (error instanceof ReceiptExtractionError) return respond(502, { error: error.message });
    throw error;
  }
});
