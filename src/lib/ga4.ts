export type Ga4Config = {
  propertyId: string;
  clientEmail: string;
  privateKey: string;
};

type TokenResponse = { access_token?: unknown };
type ReportResponse = { rows?: Array<{ metricValues?: Array<{ value?: unknown }> }> };

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REPORT_URL = (propertyId: string) =>
  `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:runRealtimeReport`;
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function textBase64Url(value: string): string {
  return base64Url(new TextEncoder().encode(value));
}

function pemToDer(privateKey: string): ArrayBuffer {
  let normalizedPem = privateKey.trim();
  if (normalizedPem.startsWith('"') && normalizedPem.endsWith('"')) {
    try {
      const parsed = JSON.parse(normalizedPem);
      if (typeof parsed === 'string') normalizedPem = parsed;
    } catch {
      // Continue with the original value; the normal decoder will reject it.
    }
  }
  normalizedPem = normalizedPem
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .trim();
  const encoded = normalizedPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

async function createAssertion(config: Ga4Config, now = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = textBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = textBase64Url(JSON.stringify({
    iss: config.clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(config.privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

function configured(config: Ga4Config): boolean {
  return Boolean(config.propertyId.trim() && config.clientEmail.trim() && config.privateKey.trim());
}

export function createGa4RealtimeClient(fetcher: typeof fetch = fetch) {
  return {
    async getActiveUsers(config: Ga4Config): Promise<number | null> {
      if (!configured(config)) return null;
      try {
        const assertion = await createAssertion(config);
        const tokenResponse = await fetcher(TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
          }),
        });
        if (!tokenResponse.ok) return null;
        const token = await tokenResponse.json() as TokenResponse;
        if (typeof token.access_token !== 'string' || !token.access_token) return null;

        const reportResponse = await fetcher(REPORT_URL(config.propertyId), {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token.access_token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ metrics: [{ name: 'activeUsers' }] }),
        });
        if (!reportResponse.ok) return null;
        const report = await reportResponse.json() as ReportResponse;
        const rawValue = report.rows?.[0]?.metricValues?.[0]?.value;
        const value = rawValue === undefined ? 0 : Number(rawValue);
        return Number.isInteger(value) && value >= 0 ? value : null;
      } catch {
        return null;
      }
    },
  };
}
