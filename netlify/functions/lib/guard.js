// Shared front door for both functions.
//
// Read this before trusting it: none of this is authentication. A determined
// person can set an Origin header. This is here to stop drive-by traffic and
// to cap what a runaway can cost, and to make sure the two functions cannot
// drift apart in what they allow. The actual gate today is Netlify's site
// password; the actual gate tomorrow is a real login.

const WINDOW_MS = 60 * 1000;
const PER_MINUTE = Number(process.env.RATE_PER_MINUTE || 20);

// Module scope, so this survives warm invocations and resets on a cold one.
// Netlify may run several instances, so treat every limit here as a brake,
// never as a lock.
const hits = new Map();

const header = (event, name) => {
  const h = event.headers || {};
  return h[name] || h[name.toLowerCase()] || h[name.toUpperCase()] || '';
};

// Which origins may drive these functions. Unset means "this site only",
// derived from the request host so localhost and deploy previews work too.
function allowedOrigins(event) {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',').map(s => s.trim()).filter(Boolean);
  if (configured.length) return configured;
  const host = header(event, 'host');
  return host ? [`https://${host}`, `http://${host}`] : [];
}

// Browsers send Origin on POST/DELETE but not on a same-origin GET, so fall
// back to Referer for those. A request with neither is not a browser.
function fromOurSite(event) {
  const list = allowedOrigins(event);
  if (!list.length) return false;
  const origin = header(event, 'origin');
  if (origin) return list.includes(origin);
  const referer = header(event, 'referer');
  if (referer) return list.some(o => referer.startsWith(o + '/') || referer === o);
  // A same-origin GET sends no Origin, and this site sets Referrer-Policy, so
  // there is no Referer either — the app's own reads arrived with neither and
  // were refused. The app marks its calls with a header instead. Another site
  // cannot add a custom header without a CORS preflight, and these functions
  // answer OPTIONS with 405, so it stays shut to them.
  if (header(event, 'x-ministry-map')) return true;
  return false;
}

function underRateLimit(event) {
  const ip = header(event, 'x-nf-client-connection-ip')
          || header(event, 'client-ip')
          || (header(event, 'x-forwarded-for').split(',')[0] || '').trim()
          || 'unknown';
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();          // crude, but unbounded is worse
  return recent.length <= PER_MINUTE;
}

// Returns a response to send back, or null to continue.
function refuse(event) {
  if (!fromOurSite(event)) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Not allowed from here' }) };
  }
  if (!underRateLimit(event)) {
    return { statusCode: 429, headers: { 'Retry-After': '60' },
             body: JSON.stringify({ error: 'Too many requests, wait a minute' }) };
  }
  return null;
}

module.exports = { refuse, header };
