interface ApiRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  status(code: number): ApiResponse;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

function environmentValue(name: string): string | undefined {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env?.[name];
}

function headerValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function constantTimeEqual(left: string, right: string): boolean {
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

export default async function handler(request: ApiRequest, response: ApiResponse): Promise<void> {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    response.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const secret = environmentValue('INBOUND_EMAIL_WEBHOOK_SECRET');
  const providedSecret = headerValue(request.headers['x-inbound-email-secret']);
  if (!secret) {
    response.status(500).json({ error: 'Inbound email processing is not configured.' });
    return;
  }
  if (!providedSecret || !constantTimeEqual(secret, providedSecret)) {
    response.status(401).json({ error: 'Invalid inbound email webhook credentials.' });
    return;
  }

  const supabaseUrl = environmentValue('SUPABASE_URL');
  if (!supabaseUrl) {
    response.status(500).json({ error: 'Inbound email processing is not configured.' });
    return;
  }
  if (!request.body || typeof request.body !== 'object') {
    response.status(400).json({ error: 'Expected a JSON email payload.' });
    return;
  }
  const contentLength = Number(headerValue(request.headers['content-length']));
  if (Number.isFinite(contentLength) && contentLength > 15_000_000) {
    response.status(413).json({ error: 'Receipt email payloads must be 10 MB or smaller.' });
    return;
  }

  const edgeResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/inbound-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-inbound-email-secret': providedSecret
    },
    body: JSON.stringify(request.body)
  });
  const responseText = await edgeResponse.text();
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    response.status(502).json({ error: 'Inbound email service returned an invalid response.' });
    return;
  }
  response.status(edgeResponse.status).json(responseBody);
}
