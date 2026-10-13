export const FIVE_MINUTES_MS = 5 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const HEARTBEAT_WRITE_INTERVAL_MS = 15 * 1000;
export const MAX_TRACK_BODY_BYTES = 16 * 1024;

const MAX_PATH_LENGTH = 256;
const MAX_REFERRER_LENGTH = 512;
const MAX_UTM_LENGTH = 64;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_TYPES = new Set(['page_view', 'heartbeat']);

export type TrackPayload = {
  visitorId: string;
  sessionId: string;
  path: string;
  event: 'page_view' | 'heartbeat';
  timestamp: number;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
};

export type TrafficSource = {
  source: string;
  medium: string;
  referrerDomain: string | null;
};

function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : undefined;
}

export function normalizeAnalyticsPath(path: string): string {
  return path.split(/[?#]/, 1)[0];
}

export function validateTrackPayload(input: unknown): TrackPayload | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (!UUID.test(String(value.visitorId)) || !UUID.test(String(value.sessionId))) return null;
  const path = typeof value.path === 'string'
    ? boundedString(normalizeAnalyticsPath(value.path), MAX_PATH_LENGTH)
    : undefined;
  const event = value.event;
  const timestamp = value.timestamp;
  if (!path || !path.startsWith('/') || typeof event !== 'string' || !EVENT_TYPES.has(event)) return null;
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp < 0) return null;

  const payload: TrackPayload = {
    visitorId: String(value.visitorId), sessionId: String(value.sessionId), path, event: event as TrackPayload['event'], timestamp,
  };
  const referrer = boundedString(value.referrer, MAX_REFERRER_LENGTH);
  const utmSource = boundedString(value.utmSource, MAX_UTM_LENGTH);
  const utmMedium = boundedString(value.utmMedium, MAX_UTM_LENGTH);
  if (referrer) payload.referrer = referrer;
  if (utmSource) payload.utmSource = utmSource;
  if (utmMedium) payload.utmMedium = utmMedium;
  return payload;
}

const SEARCH_ENGINES: Record<string, string> = {
  'google.com': 'google', 'google.co.uk': 'google', 'google.ca': 'google', 'google.com.au': 'google',
  'google.de': 'google', 'google.fr': 'google', 'google.co.in': 'google',
  'bing.com': 'bing', 'duckduckgo.com': 'duckduckgo', 'yahoo.com': 'yahoo', 'yahoo.co.jp': 'yahoo',
};
const SOCIAL: Record<string, string> = {
  'facebook.com': 'facebook', 'instagram.com': 'instagram', 'youtube.com': 'youtube', 'youtu.be': 'youtube',
  'twitter.com': 'twitter', 'x.com': 'twitter', 'linkedin.com': 'linkedin', 'reddit.com': 'reddit',
  'whatsapp.com': 'whatsapp', 'telegram.org': 'telegram', 'pinterest.com': 'pinterest',
};

function domainFromReferrer(referrer?: string): string | null {
  if (!referrer) return null;
  try {
    const parsed = new URL(referrer);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return hostname && hostname.length <= 253 ? hostname : null;
  } catch { return null; }
}

function matchingDomain(domain: string, map: Record<string, string>): string | null {
  for (const [suffix, source] of Object.entries(map)) {
    if (domain === suffix || domain.endsWith(`.${suffix}`)) return source;
  }
  return null;
}

export function normalizeTrafficSource(input: { referrer?: string; utmSource?: string; utmMedium?: string }): TrafficSource {
  const referrerDomain = domainFromReferrer(input.referrer);
  const source = boundedString(input.utmSource, MAX_UTM_LENGTH)?.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, MAX_UTM_LENGTH);
  const medium = boundedString(input.utmMedium, MAX_UTM_LENGTH)?.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, MAX_UTM_LENGTH);
  if (source) return { source, medium: medium || 'unknown', referrerDomain };
  if (!referrerDomain) return { source: 'direct', medium: 'none', referrerDomain: null };
  const search = matchingDomain(referrerDomain, SEARCH_ENGINES);
  if (search) return { source: search, medium: 'organic', referrerDomain };
  const social = matchingDomain(referrerDomain, SOCIAL);
  if (social) return { source: social, medium: 'social', referrerDomain };
  if (['threads.net', 'mastodon.social'].some((domain) => referrerDomain === domain || referrerDomain.endsWith(`.${domain}`))) {
    return { source: 'other-social', medium: 'social', referrerDomain };
  }
  return { source: referrerDomain, medium: 'referral', referrerDomain };
}

export function isExcludedAnalyticsPath(path: string): boolean {
  const normalized = normalizeAnalyticsPath(path).toLowerCase();
  return normalized.startsWith('/api/health') || normalized.startsWith('/admin') || normalized.startsWith('/_astro/') ||
    normalized.startsWith('/assets/') || /\.(?:js|css|map|ico|png|jpe?g|gif|svg|webp|xml|txt|woff2?)$/.test(normalized) ||
    normalized === '/robots.txt' || normalized === '/sitemap.xml' || normalized.includes('crawler') || normalized.includes('bot');
}

export function getAnalyticsCutoff(now: number, windowMs: number): number { return now - windowMs; }
export function isWithinAnalyticsWindow(timestamp: number, now: number, windowMs: number): boolean {
  return timestamp >= getAnalyticsCutoff(now, windowMs) && timestamp <= now;
}
